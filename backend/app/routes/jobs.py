import json
import logging
import os
import shutil
import subprocess
import tempfile
import uuid

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2

from groq import Groq

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
    Depends,
)

from app.database import supabase
from app.auth import get_current_participant, ensure_session_owner
from app.config import GROQ_API_KEY, GROQ_STT_MODEL

from app.services.cv.head_motion import predict_head_motion
from app.services.cv.eye_tracking import predict_eye_tracking
from app.services.cv.facial_expression import predict_facial_expression


router = APIRouter(
    prefix="/api",
    tags=["CV Video Jobs"]
)

logger = logging.getLogger(__name__)


# =====================================================
# CONFIGURATION
# =====================================================

# Bisa diatur melalui environment variable FFMPEG_PATH.
# Jika tidak diatur, sistem akan mencari ffmpeg dari PATH.
FFMPEG_PATH = os.getenv("FFMPEG_PATH") or shutil.which("ffmpeg") or "ffmpeg"

SAMPLE_INTERVAL_SECONDS = 1.0

JOBS: dict[str, dict[str, Any]] = {}

groq_client = None


# =====================================================
# HELPER
# =====================================================

def update_job(
    job_id: str,
    *,
    status: str | None = None,
    progres: float | None = None,
    pesan: str | None = None,
    hasil: dict | None = None,
):
    job = JOBS.get(job_id)

    if not job:
        return

    if status is not None:
        job["status"] = status

    if progres is not None:
        job["progres"] = progres

    if pesan is not None:
        job["pesan"] = pesan

    if hasil is not None:
        job["hasil"] = hasil


def json_safe(value):
    """
    Mengubah nilai NumPy/OpenCV menjadi tipe data
    yang dapat disimpan sebagai JSON.
    """

    if hasattr(value, "tolist"):
        return json_safe(value.tolist())

    if hasattr(value, "item"):
        return json_safe(value.item())

    if isinstance(value, dict):
        return {
            str(key): json_safe(val)
            for key, val in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            json_safe(item)
            for item in value
        ]

    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return None

    return value


def get_groq_client():
    """Membuat Groq client ketika STT pertama kali digunakan."""

    global groq_client

    if groq_client is None:
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY belum dikonfigurasi.")

        groq_client = Groq(api_key=GROQ_API_KEY)

    return groq_client


def update_session_cv_status(session_id: str, status: str):
    """Memperbarui status Computer Vision pada interview_sessions."""

    try:
        supabase.table("interview_sessions").update({
            "cv_feature_status": status
        }).eq("id", session_id).execute()

    except Exception:
        logger.exception(
            "Gagal memperbarui cv_feature_status untuk session %s",
            session_id
        )


def get_prediction_value(result: dict, *keys, default=None):
    if not isinstance(result, dict):
        return default

    for key in keys:
        if key in result:
            return result[key]

    return default


def normalize_prediction_result(result: dict) -> dict:
    """
    Memastikan hasil model memiliki format dictionary.
    """

    if not isinstance(result, dict):
        raise ValueError(
            "Hasil prediksi model harus berupa dictionary."
        )

    label = get_prediction_value(
        result,
        "predicted_label",
        "label",
        "prediction"
    )

    if label is None:
        raise ValueError(
            "Model tidak menghasilkan predicted_label."
        )

    return result


# =====================================================
# SPEECH TO TEXT
# =====================================================

def extract_audio(video_path: str) -> str:
    """
    Mengekstrak audio dari video menggunakan FFmpeg.
    Audio dikonversi menjadi MP3 mono 16 kHz.
    """

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=".mp3"
    ) as temp_audio:
        audio_path = temp_audio.name

    try:
        command = [
            FFMPEG_PATH,
            "-y",
            "-loglevel", "error",
            "-i", video_path,
            "-map", "0:a:0",
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-b:a", "64k",
            audio_path
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=180
        )

        if result.returncode != 0:
            raise RuntimeError(
                result.stderr.strip()
                or "FFmpeg gagal mengekstrak audio."
            )

        if (
            not Path(audio_path).exists()
            or Path(audio_path).stat().st_size == 0
        ):
            raise RuntimeError(
                "File audio hasil ekstraksi kosong."
            )

        return audio_path

    except Exception:
        Path(audio_path).unlink(missing_ok=True)
        raise


def transcribe_audio(video_path: str) -> str:
    """
    Mengekstrak audio dari video lalu mentranskripsikannya
    menggunakan Groq Whisper.
    """

    audio_path = None

    try:
        audio_path = extract_audio(video_path)

        client = get_groq_client()

        with open(audio_path, "rb") as audio_file:
            response = client.audio.transcriptions.create(
                file=(
                    Path(audio_path).name,
                    audio_file.read()
                ),
                model=GROQ_STT_MODEL,
                language="id",
                response_format="json"
            )

        transcript_text = (response.text or "").strip()

        if not transcript_text:
            raise ValueError(
                "Whisper tidak menghasilkan transkrip."
            )

        return transcript_text

    finally:
        if audio_path:
            Path(audio_path).unlink(missing_ok=True)


def save_transcript(
    session_question_id: str,
    transcript: str,
    duration_seconds: float | None = None
):
    """Menyimpan transkrip ke tabel answers."""

    payload = {
        "session_question_id": session_question_id,
        "answer_text": transcript,
        "transcript": transcript,
        "transcript_status": "completed",
        "transcript_source": "groq_whisper"
    }

    if duration_seconds is not None:
        payload["answer_duration_seconds"] = duration_seconds

    supabase.table("answers").upsert(
        payload,
        on_conflict="session_question_id"
    ).execute()


def save_transcript_failure(session_question_id: str):
    """
    Mencatat kegagalan STT tanpa menghapus transkrip
    lama yang mungkin sudah tersimpan.
    """

    payload = {
        "session_question_id": session_question_id,
        "transcript_status": "failed",
        "transcript_source": "groq_whisper"
    }

    try:
        supabase.table("answers").upsert(
            payload,
            on_conflict="session_question_id"
        ).execute()

    except Exception:
        logger.exception(
            "Gagal menyimpan status STT untuk pertanyaan %s",
            session_question_id
        )


# =====================================================
# COMPUTER VISION - OBSERVATION BUILDER
# =====================================================

def build_observation(
    *,
    session_id: str,
    session_question_id: str,
    indicator_type: str,
    timestamp_seconds: float,
    frame_index: int,
    result: dict,
    model_name: str,
    model_version: str,
):
    """
    Mengubah hasil prediksi model menjadi format
    yang sesuai dengan tabel cv_observations.
    """

    result = normalize_prediction_result(result)

    predicted_label = get_prediction_value(
        result,
        "predicted_label",
        "label",
        "prediction"
    )

    confidence = get_prediction_value(
        result,
        "confidence"
    )

    is_valid = result.get("is_valid", True)

    if is_valid is None:
        is_valid = True

    metadata = {
        "probabilities": result.get("probabilities")
    }

    if indicator_type == "expression":
        metadata["face_box"] = result.get("face_box")

    return {
        "session_id": session_id,
        "session_question_id": session_question_id,
        "indicator_type": indicator_type,
        "timestamp_seconds": round(timestamp_seconds, 3),
        "frame_index": frame_index,
        "predicted_label": str(predicted_label),
        "confidence": json_safe(confidence),
        "model_name": model_name,
        "model_version": model_version,
        "is_valid": bool(is_valid),
        "quality_flag": result.get("quality_flag"),
        "is_synthetic": False,
        "metadata": json_safe(metadata)
    }


# =====================================================
# VIDEO PROCESSING - COMPUTER VISION
# =====================================================

def process_video(
    video_path: str,
    session_id: str,
    session_question_id: str,
    question_order: int,
):
    """
    Membaca video dan menjalankan tiga model CV.

    Satu frame diambil setiap SAMPLE_INTERVAL_SECONDS.

    Hasil:
    - Head Motion
    - Gaze / Eye Tracking
    - Facial Expression
    """

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        raise ValueError("Video tidak dapat dibuka.")

    fps = cap.get(cv2.CAP_PROP_FPS)

    if not fps or fps <= 0:
        fps = 25.0

    total_frames = int(
        cap.get(cv2.CAP_PROP_FRAME_COUNT)
    )

    duration = (
        total_frames / fps
        if total_frames > 0
        else 0
    )

    frame_step = max(
        1,
        int(fps * SAMPLE_INTERVAL_SECONDS)
    )

    observations = []

    frame_index = 0
    sampled_count = 0

    indicator_success = {
        "head_motion": 0,
        "gaze": 0,
        "expression": 0
    }

    indicator_failed = {
        "head_motion": 0,
        "gaze": 0,
        "expression": 0
    }

    try:
        while True:
            success, frame = cap.read()

            if not success:
                break

            if frame_index % frame_step != 0:
                frame_index += 1
                continue

            timestamp_seconds = frame_index / fps

            sampled_count += 1

            # -----------------------------------------
            # 1. HEAD MOTION
            # -----------------------------------------

            try:
                head_result = predict_head_motion(frame)

                observation = build_observation(
                    session_id=session_id,
                    session_question_id=session_question_id,
                    indicator_type="head_motion",
                    timestamp_seconds=timestamp_seconds,
                    frame_index=frame_index,
                    result=head_result,
                    model_name="EfficientNet-B0",
                    model_version="head_motion"
                )

                observations.append(observation)
                indicator_success["head_motion"] += 1

            except Exception:
                indicator_failed["head_motion"] += 1

                logger.exception(
                    "Head Motion gagal pada frame %s",
                    frame_index
                )

            # -----------------------------------------
            # 2. EYE TRACKING / GAZE
            # -----------------------------------------

            try:
                eye_result = predict_eye_tracking(frame)

                observation = build_observation(
                    session_id=session_id,
                    session_question_id=session_question_id,
                    indicator_type="gaze",
                    timestamp_seconds=timestamp_seconds,
                    frame_index=frame_index,
                    result=eye_result,
                    model_name="EfficientNet-B0",
                    model_version="eye_tracking"
                )

                observations.append(observation)
                indicator_success["gaze"] += 1

            except Exception:
                indicator_failed["gaze"] += 1

                logger.exception(
                    "Eye Tracking gagal pada frame %s",
                    frame_index
                )

            # -----------------------------------------
            # 3. FACIAL EXPRESSION
            # -----------------------------------------

            try:
                expression_result = predict_facial_expression(frame)

                observation = build_observation(
                    session_id=session_id,
                    session_question_id=session_question_id,
                    indicator_type="expression",
                    timestamp_seconds=timestamp_seconds,
                    frame_index=frame_index,
                    result=expression_result,
                    model_name="EfficientNetV2-S",
                    model_version="facial_expression"
                )

                observations.append(observation)
                indicator_success["expression"] += 1

            except Exception:
                indicator_failed["expression"] += 1

                logger.exception(
                    "Facial Expression gagal pada frame %s",
                    frame_index
                )

            frame_index += 1

    finally:
        cap.release()

    return {
        "observations": observations,
        "sampled_frames": sampled_count,
        "duration_seconds": round(duration, 2),
        "indicator_success": indicator_success,
        "indicator_failed": indicator_failed
    }


# =====================================================
# BACKGROUND JOB
# =====================================================

def run_job(
    job_id: str,
    session_id: str,
    questions: list[dict],
    video_paths: list[str],
):
    total_questions = len(video_paths)

    all_observations = []
    question_results = []

    processed_questions = 0
    failed_questions = 0

    stt_success_questions = 0
    stt_failed_questions = 0

    update_session_cv_status(
        session_id,
        "processing"
    )

    try:
        for i, video_path in enumerate(video_paths):

            question = questions[i]

            question_id = question["session_question_id"]
            question_order = question["question_order"]

            update_job(
                job_id,
                status="proses",
                progres=i / total_questions,
                pesan=(
                    f"Memproses pertanyaan "
                    f"{i + 1} dari {total_questions}"
                )
            )

            question_result = {
                "question_order": question_order,
                "session_question_id": question_id,
                "question_text": question["question_text"],
                "cv_status": "failed",
                "stt_status": "failed",
                "transcript": None,
                "observation_count": 0,
                "sampled_frames": 0,
                "duration_seconds": 0
            }

            # =========================================
            # 1. COMPUTER VISION
            # =========================================

            try:
                cv_result = process_video(
                    video_path=video_path,
                    session_id=session_id,
                    session_question_id=question_id,
                    question_order=question_order
                )

                observations = cv_result["observations"]

                if observations:
                    insert_response = (
                        supabase.table("cv_observations")
                        .insert(observations)
                        .execute()
                    )

                    all_observations.extend(observations)

                    question_result["cv_status"] = "completed"

                    processed_questions += 1

                else:
                    question_result["cv_status"] = "failed"
                    failed_questions += 1

                question_result.update({
                    "sampled_frames": cv_result["sampled_frames"],
                    "duration_seconds": cv_result["duration_seconds"],
                    "observation_count": len(observations),
                    "indicator_success": cv_result["indicator_success"],
                    "indicator_failed": cv_result["indicator_failed"]
                })

            except Exception as e:
                logger.exception(
                    "CV gagal pada pertanyaan %s",
                    question_order
                )

                failed_questions += 1

                question_result["cv_status"] = "failed"
                question_result["cv_error"] = str(e)

            # =========================================
            # 2. SPEECH TO TEXT
            # =========================================

            try:
                transcript = transcribe_audio(video_path)

                duration_seconds = question_result.get(
                    "duration_seconds"
                )

                save_transcript(
                    session_question_id=question_id,
                    transcript=transcript,
                    duration_seconds=duration_seconds
                )

                stt_success_questions += 1

                question_result["stt_status"] = "completed"
                question_result["transcript"] = transcript

                logger.info(
                    "STT berhasil untuk pertanyaan %s",
                    question_order
                )

            except Exception as e:
                logger.exception(
                    "STT gagal pada pertanyaan %s",
                    question_order
                )

                stt_failed_questions += 1

                question_result["stt_status"] = "failed"
                question_result["stt_error"] = str(e)

                save_transcript_failure(question_id)

            question_results.append(question_result)

            update_job(
                job_id,
                progres=(i + 1) / total_questions,
                pesan=(
                    f"Selesai memproses pertanyaan "
                    f"{i + 1} dari {total_questions}"
                )
            )

        # =============================================
        # 3. STATUS COMPUTER VISION
        # =============================================

        if processed_questions == total_questions:
            cv_final_status = "completed"

        elif processed_questions > 0:
            cv_final_status = "partial"

        else:
            cv_final_status = "failed"

        update_session_cv_status(
            session_id,
            cv_final_status
        )

        # =============================================
        # 4. HASIL JOB
        # =============================================

        hasil = {
            "session_id": session_id,
            "pertanyaan": question_results,
            "total_questions": total_questions,
            "processed_questions": processed_questions,
            "failed_questions": failed_questions,
            "stt_success_questions": stt_success_questions,
            "stt_failed_questions": stt_failed_questions,
            "total_observations": len(all_observations),
            "cv_status": cv_final_status
        }

        update_job(
            job_id,
            status="selesai",
            progres=1.0,
            pesan="Pemrosesan video, analisis CV, dan STT selesai.",
            hasil=hasil
        )

    except Exception as e:
        logger.exception(
            "Job gagal: %s",
            job_id
        )

        update_session_cv_status(
            session_id,
            "failed"
        )

        update_job(
            job_id,
            status="gagal",
            pesan=(
                "Terjadi kesalahan saat memproses job: "
                f"{str(e)}"
            )
        )

    finally:
        # Hapus seluruh file video sementara.

        for path in video_paths:
            try:
                Path(path).unlink(missing_ok=True)

            except Exception:
                logger.exception(
                    "Gagal menghapus file sementara: %s",
                    path
                )


# =====================================================
# POST /api/jobs
# =====================================================

@router.post("/jobs")
async def create_job(
    background_tasks: BackgroundTasks,
    meta: str = Form(...),
    videos: list[UploadFile] = File(...),
    participant=Depends(get_current_participant),
):
    # ---------------------------------------------
    # 1. VALIDASI METADATA
    # ---------------------------------------------

    try:
        metadata = json.loads(meta)

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Format metadata JSON tidak valid."
        )

    session_id = metadata.get("session_id")
    questions = metadata.get("questions")

    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="session_id wajib diisi."
        )

    if not isinstance(questions, list) or not questions:
        raise HTTPException(
            status_code=400,
            detail="Data pertanyaan tidak valid."
        )

    if len(questions) != len(videos):
        raise HTTPException(
            status_code=400,
            detail="Jumlah video harus sama dengan jumlah pertanyaan."
        )

    # ---------------------------------------------
    # 2. VALIDASI SESSION
    # ---------------------------------------------

    session_response = (
        supabase.table("interview_sessions")
        .select("id,status,participant_id")
        .eq("id", session_id)
        .eq("participant_id", participant["id"])
        .limit(1)
        .execute()
    )

    if not session_response.data:
        raise HTTPException(
            status_code=404,
            detail="Session tidak ditemukan."
        )

    # ---------------------------------------------
    # 3. VALIDASI SESSION QUESTIONS
    # ---------------------------------------------

    session_question_ids = [
        q.get("session_question_id")
        for q in questions
    ]

    if any(not value for value in session_question_ids):
        raise HTTPException(
            status_code=400,
            detail="Session question ID tidak lengkap."
        )

    if len(set(session_question_ids)) != len(session_question_ids):
        raise HTTPException(
            status_code=400,
            detail="Ada session_question_id yang duplikat."
        )

    question_response = (
        supabase.table("session_questions")
        .select("id,session_id,question_order")
        .eq("session_id", session_id)
        .in_("id", session_question_ids)
        .execute()
    )

    valid_questions = {
        row["id"]: row
        for row in (question_response.data or [])
    }

    if len(valid_questions) != len(session_question_ids):
        raise HTTPException(
            status_code=400,
            detail="Ada pertanyaan yang tidak sesuai dengan session."
        )

    # Pastikan urutan pertanyaan sesuai database.

    for question in questions:

        db_question = valid_questions.get(
            question["session_question_id"]
        )

        if (
            not db_question
            or db_question["question_order"] != question.get("question_order")
        ):
            raise HTTPException(
                status_code=400,
                detail="Urutan pertanyaan tidak sesuai dengan database."
            )

        if not question.get("question_text"):
            raise HTTPException(
                status_code=400,
                detail="Teks pertanyaan tidak boleh kosong."
            )

    # ---------------------------------------------
    # 4. SIMPAN VIDEO SEMENTARA
    # ---------------------------------------------

    video_paths = []

    try:
        for video in videos:

            content = await video.read()

            if not content:
                raise HTTPException(
                    status_code=400,
                    detail=f"Video {video.filename} kosong."
                )

            suffix = (
                Path(video.filename or "video.webm").suffix
                or ".webm"
            )

            with tempfile.NamedTemporaryFile(
                delete=False,
                suffix=suffix
            ) as temp_file:

                temp_file.write(content)
                video_paths.append(temp_file.name)

    except Exception:
        for path in video_paths:
            Path(path).unlink(missing_ok=True)

        raise

    finally:
        for video in videos:
            await video.close()

    # ---------------------------------------------
    # 5. BUAT JOB
    # ---------------------------------------------

    job_id = str(uuid.uuid4())

    JOBS[job_id] = {
        "id": job_id,
        "session_id": session_id,
        "participant_id": participant["id"],
        "status": "proses",
        "progres": 0.0,
        "pesan": "Video diterima. Menunggu analisis CV dan STT.",
        "hasil": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    # ---------------------------------------------
    # 6. JALANKAN BACKGROUND TASK
    # ---------------------------------------------

    background_tasks.add_task(
        run_job,
        job_id,
        session_id,
        questions,
        video_paths
    )

    return {
        "id": job_id,
        "session_id": session_id,
        "status": "proses",
        "pesan": "Video berhasil diterima dan sedang diproses."
    }


# =====================================================
# GET /api/jobs/{job_id}
# =====================================================

@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    participant=Depends(get_current_participant),
):

    job = JOBS.get(job_id)

    if not job or job.get("participant_id") != participant["id"]:
        raise HTTPException(
            status_code=404,
            detail="Job tidak ditemukan atau bukan milik akun ini."
        )

    return {
        "id": job["id"],
        "session_id": job["session_id"],
        "status": job["status"],
        "progres": job["progres"],
        "pesan": job["pesan"],
        "hasil": job["hasil"]
    }