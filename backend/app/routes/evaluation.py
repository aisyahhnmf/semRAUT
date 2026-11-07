
import json
import re

from fastapi import APIRouter, HTTPException, Depends
from groq import Groq

from app.config import GROQ_API_KEY, GROQ_MODEL
from app.database import supabase
from app.auth import get_current_participant, ensure_session_owner


router = APIRouter(
    prefix="/api",
    tags=["LLM Evaluation"]
)


# ==========================================
# HELPER FUNCTIONS
# ==========================================

def normalize_name(value):
    """
    Menyamakan format nama kriteria agar tidak sensitif
    terhadap perbedaan kapitalisasi dan spasi.
    """
    if not isinstance(value, str):
        return ""

    value = value.strip().casefold()
    value = re.sub(r"\s+", " ", value)

    return value


def parse_groq_json(content):
    """
    Membaca JSON dari respons Groq.
    Mendukung JSON biasa maupun JSON yang dibungkus
    menggunakan Markdown code fence.
    """
    if not content or not content.strip():
        raise ValueError("Respons Groq kosong.")

    content = content.strip()

    # Menghapus Markdown code fence.
    content = re.sub(
        r"^```(?:json)?\s*",
        "",
        content,
        flags=re.IGNORECASE
    )

    content = re.sub(r"\s*```$", "", content)

    # Mencari awal objek JSON.
    start = content.find("{")

    if start == -1:
        raise ValueError(
            "Respons Groq tidak mengandung objek JSON: "
            f"{content[:1000]}"
        )

    # Mengambil satu objek JSON.
    try:
        result, _ = json.JSONDecoder().raw_decode(
            content[start:]
        )

    except json.JSONDecodeError as error:
        raise ValueError(
            f"Respons Groq bukan JSON valid: {error}. "
            f"Respons: {content[:1500]}"
        )

    if not isinstance(result, dict):
        raise ValueError(
            "Hasil evaluasi Groq harus berupa JSON object."
        )

    return result


def extract_scores(result):
    """
    Mengambil daftar skor dari beberapa kemungkinan
    struktur JSON hasil Groq.
    """

    possible_keys = [
        "scores",
        "criterion_scores",
        "criteria_scores",
        "rubric_scores",
        "evaluations"
    ]

    for key in possible_keys:
        value = result.get(key)

        if isinstance(value, list):
            return value

        if isinstance(value, dict):
            scores = []

            for name, item in value.items():
                if isinstance(item, dict):
                    item = item.copy()
                    item.setdefault("criterion_name", name)
                    scores.append(item)

            if scores:
                return scores

    for value in result.values():
        if isinstance(value, dict):
            nested_scores = extract_scores(value)

            if nested_scores:
                return nested_scores

    return []


# ==========================================
# GROQ EVALUATION FUNCTION
# ==========================================

def evaluate_answer(
    role,
    question,
    answer_text,
    criteria
):
    """
    Mengevaluasi satu jawaban wawancara menggunakan
    dua tahap:

    1. Menghasilkan feedback umum.
    2. Menghasilkan skor untuk lima kriteria rubrik.
    """

    if not GROQ_API_KEY:
        raise ValueError(
            "GROQ_API_KEY belum dikonfigurasi di file .env."
        )

    client = Groq(api_key=GROQ_API_KEY)

    # ==========================================
    # MENYIAPKAN KRITERIA
    # ==========================================

    criteria_prompt = [
        {
            "criterion_name": item["criterion_name"],
            "max_score": float(item["max_score"]),
            "weight": float(item["weight"])
        }
        for item in criteria
    ]

    criteria_names = [
        item["criterion_name"]
        for item in criteria
    ]

    interview_context = f"""
ROLE:
{role}

PERTANYAAN:
{question.get("question_text", "")}

KOMPETENSI:
{question.get("competency", "")}

JAWABAN KANDIDAT:
{answer_text}
"""

    criteria_context = json.dumps(
        criteria_prompt,
        ensure_ascii=False,
        indent=2
    )

    # ==========================================
    # 1. EVALUASI UMUM
    # ==========================================

    feedback_prompt = f"""
Kamu adalah evaluator wawancara profesional untuk semRAUT.

Evaluasi jawaban kandidat berikut:

{interview_context}

Berikan evaluasi dalam Bahasa Indonesia yang natural,
objektif, dan profesional.

Kembalikan satu objek JSON valid dengan struktur:

{{
    "overall_feedback": "Ringkasan evaluasi jawaban",
    "strengths": [
        "Kekuatan jawaban"
    ],
    "improvements": [
        "Hal yang perlu diperbaiki"
    ]
}}

Ketentuan:
- overall_feedback harus berupa string.
- strengths harus berupa array string.
- improvements harus berupa array string.
- Jangan mengembalikan skor atau kriteria rubrik.
- Jangan menambahkan teks di luar objek JSON.
"""

    feedback_response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Kamu adalah evaluator wawancara "
                    "yang objektif dan profesional. "
                    "Kembalikan hanya satu objek JSON valid."
                )
            },
            {
                "role": "user",
                "content": feedback_prompt
            }
        ],
        temperature=0.1,
        max_completion_tokens=1500
    )

    feedback_content = (
        feedback_response.choices[0].message.content
    )

    feedback_result = parse_groq_json(
        feedback_content
    )

    # Validasi struktur feedback.
    overall_feedback = feedback_result.get(
        "overall_feedback", ""
    )

    strengths = feedback_result.get(
        "strengths", []
    )

    improvements = feedback_result.get(
        "improvements", []
    )

    if not isinstance(overall_feedback, str):
        overall_feedback = str(overall_feedback)

    if not isinstance(strengths, list):
        strengths = []

    if not isinstance(improvements, list):
        improvements = []

    strengths = [
        str(item) for item in strengths
    ]

    improvements = [
        str(item) for item in improvements
    ]

    # ==========================================
    # 2. EVALUASI LIMA KRITERIA RUBRIK
    # ==========================================

    score_prompt = f"""
Kamu adalah evaluator penilaian wawancara kerja.

Tugasmu HANYA memberikan skor berdasarkan lima kriteria
rubrik yang tersedia.

INFORMASI WAWANCARA:

{interview_context}

LIMA KRITERIA RUBRIK:

{criteria_context}

NAMA KRITERIA YANG WAJIB DIGUNAKAN:

{json.dumps(criteria_names, ensure_ascii=False)}

ATURAN PENILAIAN:

- Setiap kriteria harus dinilai tepat satu kali.
- Skor harus berupa INTEGER dari 0 sampai 4.
- 0 = Tidak ada bukti yang mendukung.
- 1 = Sangat kurang.
- 2 = Cukup, tetapi masih memiliki kekurangan.
- 3 = Baik.
- 4 = Sangat baik.
- Gunakan bukti yang benar-benar terdapat dalam jawaban.
- Jangan mengarang pengalaman kandidat.
- Berikan feedback yang spesifik.
- Jangan memberikan skor tinggi hanya karena jawaban panjang.
- Jangan menambahkan kriteria baru.
- Jangan menghilangkan kriteria apa pun.

PERHATIAN:

Kamu WAJIB mengembalikan kelima nama kriteria berikut
secara persis, masing-masing satu kali:

{json.dumps(criteria_names, ensure_ascii=False)}

FORMAT OUTPUT WAJIB:

{{
    "scores": [
        {{
            "criterion_name": "Nama kriteria persis",
            "score": 3,
            "feedback": "Feedback spesifik",
            "evidence": "Bukti dari jawaban kandidat",
            "reason": "Alasan pemberian skor"
        }}
    ]
}}

Ketentuan:
- scores harus berisi tepat lima objek.
- criterion_name harus sama persis dengan nama kriteria.
- score harus berupa integer antara 0 sampai 4.
- feedback, evidence, dan reason harus berupa string.
- Jangan mengembalikan overall_feedback, strengths,
  atau improvements.
- Jangan menambahkan teks di luar objek JSON.
"""

    score_response = client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Kamu adalah mesin penilaian rubrik. "
                    "Kamu harus mengembalikan kelima skor "
                    "dalam satu objek JSON valid. "
                    "Jangan menghilangkan kriteria."
                )
            },
            {
                "role": "user",
                "content": score_prompt
            }
        ],
        temperature=0.1,
        max_completion_tokens=3000
    )

    score_content = (
        score_response.choices[0].message.content
    )

    score_result = parse_groq_json(
        score_content
    )

    # ==========================================
    # 3. AMBIL DAN VALIDASI SKOR
    # ==========================================

    returned_scores = extract_scores(
        score_result
    )

    if not returned_scores:
        raise ValueError(
            "Groq belum menghasilkan daftar skor rubrik. "
            f"Field tersedia: {list(score_result.keys())}. "
            f"Respons: {score_content[:1500]}"
        )

    criteria_map = {
        normalize_name(item["criterion_name"]): item["id"]
        for item in criteria
    }

    validated_scores = []
    processed_criteria = set()

    for item in returned_scores:

        if not isinstance(item, dict):
            continue

        criterion_name = (
            item.get("criterion_name")
            or item.get("criteria_name")
            or item.get("criterion")
            or item.get("name")
        )

        normalized_name = normalize_name(
            criterion_name
        )

        if normalized_name not in criteria_map:
            continue

        if normalized_name in processed_criteria:
            raise ValueError(
                f"Kriteria duplikat dari Groq: {criterion_name}"
            )

        score = item.get("score")

        if (
            isinstance(score, str)
            and score.strip().isdigit()
        ):
            score = int(score.strip())

        if (
            not isinstance(score, int)
            or isinstance(score, bool)
            or score < 0
            or score > 4
        ):
            raise ValueError(
                f"Skor tidak valid untuk "
                f"{criterion_name}: {score}"
            )

        validated_scores.append({
            "criterion_id": criteria_map[normalized_name],
            "score": score,
            "feedback": str(item.get("feedback") or ""),
            "evidence": str(item.get("evidence") or ""),
            "reason": str(item.get("reason") or "")
        })

        processed_criteria.add(normalized_name)

    # ==========================================
    # 4. PASTIKAN LIMA KRITERIA LENGKAP
    # ==========================================

    expected_criteria = set(
        criteria_map.keys()
    )

    missing_criteria = (
        expected_criteria - processed_criteria
    )

    if missing_criteria:
        missing_names = [
            item["criterion_name"]
            for item in criteria
            if normalize_name(item["criterion_name"])
            in missing_criteria
        ]

        raise ValueError(
            "Evaluasi belum mencakup seluruh kriteria. "
            f"Kriteria yang belum dinilai: {missing_names}. "
            f"Respons skor Groq: {score_content[:1500]}"
        )

    if len(validated_scores) != 5:
        raise ValueError(
            "Jumlah skor rubrik harus tepat lima."
        )

    # ==========================================
    # 5. GABUNGKAN HASIL EVALUASI
    # ==========================================

    return {
        "overall_feedback": overall_feedback,
        "strengths": strengths,
        "improvements": improvements,
        "scores": validated_scores
    }


# ==========================================
# EVALUATE INTERVIEW SESSION
# ==========================================

@router.post("/sessions/{session_id}/evaluate")
def evaluate_session(
    session_id: str,
    include_synthetic: bool = False,
    participant=Depends(get_current_participant),
):

    try:

        if not GROQ_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="GROQ_API_KEY belum dikonfigurasi."
            )

        # ======================================
        # 1. AMBIL DATA SESI
        # ======================================

        session_response = (
            supabase.table("interview_sessions")
            .select("*")
            .eq("id", session_id)
            .execute()
        )

        session_data = session_response.data or []

        if not session_data:
            raise HTTPException(
                status_code=404,
                detail="Sesi wawancara tidak ditemukan."
            )

        session = session_data[0]
        ensure_session_owner(session_id, participant["id"])

        # ======================================
        # 2. AMBIL PERTANYAAN
        # ======================================

        questions_response = (
            supabase.table("session_questions")
            .select("*")
            .eq("session_id", session_id)
            .order("question_order")
            .execute()
        )

        questions = questions_response.data or []

        if not questions:
            raise HTTPException(
                status_code=404,
                detail="Pertanyaan wawancara tidak ditemukan."
            )

        question_ids = [
            question["id"]
            for question in questions
        ]

        # ======================================
        # 3. AMBIL JAWABAN
        # ======================================

        answers_response = (
            supabase.table("answers")
            .select("*")
            .in_("session_question_id", question_ids)
            .execute()
        )

        answers = answers_response.data or []

        if not answers:
            raise HTTPException(
                status_code=404,
                detail="Belum ada jawaban untuk sesi ini."
            )

        # ======================================
        # 4. AMBIL KRITERIA RUBRIK
        # ======================================

        criteria_response = (
            supabase.table("rubric_criteria")
            .select("*")
            .execute()
        )

        criteria = criteria_response.data or []

        if len(criteria) != 5:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Sistem semRAUT membutuhkan "
                    "tepat lima kriteria rubrik."
                )
            )

        question_map = {
            item["id"]: item
            for item in questions
        }

        results = []
        skipped = []

        # ======================================
        # 5. EVALUASI SETIAP JAWABAN
        # ======================================

        for answer in answers:

            answer_id = answer["id"]

            question = question_map.get(
                answer["session_question_id"]
            )

            if not question:
                continue

            answer_is_synthetic = bool(
                answer.get("is_synthetic", False)
            )

            # Lewati jawaban sintetis jika tidak diizinkan.
            if (
                answer_is_synthetic
                and not include_synthetic
            ):
                skipped.append({
                    "answer_id": answer_id,
                    "reason": "Jawaban merupakan data sintetis."
                })
                continue

            # Transcript menjadi sumber utama.
            answer_text = (
                answer.get("transcript")
                or answer.get("answer_text")
                or ""
            ).strip()

            if not answer_text:
                skipped.append({
                    "answer_id": answer_id,
                    "reason": "Transkrip jawaban kosong."
                })
                continue

            # ==================================
            # 6. PANGGIL GROQ
            # ==================================

            evaluation = evaluate_answer(
                role=session.get("role", ""),
                question=question,
                answer_text=answer_text,
                criteria=criteria
            )

            # ==================================
            # 7. SIMPAN HASIL EVALUASI
            # ==================================

            (
                supabase.table("llm_evaluations")
                .upsert(
                    {
                        "session_id": session_id,
                        "answer_id": answer_id,
                        "model_name": GROQ_MODEL,
                        "overall_feedback": evaluation.get(
                            "overall_feedback", ""
                        ),
                        "strengths": evaluation.get(
                            "strengths", []
                        ),
                        "improvements": evaluation.get(
                            "improvements", []
                        ),
                        "is_synthetic": answer_is_synthetic
                    },
                    on_conflict="answer_id"
                )
                .execute()
            )

            # ==================================
            # 8. AMBIL ID EVALUASI
            # ==================================

            saved_response = (
                supabase.table("llm_evaluations")
                .select("id")
                .eq("answer_id", answer_id)
                .execute()
            )

            saved_data = saved_response.data or []

            if not saved_data:
                raise ValueError(
                    f"Gagal mengambil ID evaluasi "
                    f"untuk jawaban {answer_id}."
                )

            evaluation_id = saved_data[0]["id"]

            # ==================================
            # 9. HAPUS SKOR LLM LAMA
            # ==================================

            (
                supabase.table("llm_evaluation_scores")
                .delete()
                .eq("evaluation_id", evaluation_id)
                .execute()
            )

            # ==================================
            # 10. SIMPAN SKOR RUBRIK
            # ==================================

            score_records = []

            for item in evaluation["scores"]:

                score_records.append({
                    "evaluation_id": evaluation_id,
                    "criterion_id": item["criterion_id"],
                    "score": item["score"],
                    "feedback": item.get("feedback", ""),
                    "evidence": item.get("evidence", ""),
                    "reason": item.get("reason", "")
                })

            (
                supabase.table("llm_evaluation_scores")
                .insert(score_records)
                .execute()
            )

            results.append({
                "answer_id": answer_id,
                "evaluation_id": evaluation_id,
                "is_synthetic": answer_is_synthetic,
                "overall_feedback": evaluation.get(
                    "overall_feedback"
                ),
                "strengths": evaluation.get("strengths", []),
                "improvements": evaluation.get("improvements", []),
                "scores": score_records
            })

        # ======================================
        # 11. RESPONSE
        # ======================================

        return {
            "success": True,
            "message": "Evaluasi Groq selesai diproses.",
            "session_id": session_id,
            "model": GROQ_MODEL,
            "evaluated": len(results),
            "skipped": skipped,
            "data": results
        }

    except HTTPException:
        raise

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Gagal melakukan evaluasi: {str(e)}"
        )
