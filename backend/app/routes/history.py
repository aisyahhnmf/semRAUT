
import traceback

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from app.database import supabase
from app.auth import get_current_participant

router = APIRouter(prefix="/api", tags=["Interview History"])


# =====================================================
# HELPER
# =====================================================

def safe_float(value, default=0.0):
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def parse_datetime(value):
    """
    Mengubah string timestamp atau datetime menjadi
    datetime timezone-aware.
    """
    if not value:
        return None

    try:
        if isinstance(value, datetime):
            parsed = value
        else:
            parsed = datetime.fromisoformat(
                str(value).replace("Z", "+00:00")
            )

        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)

        return parsed

    except (TypeError, ValueError):
        return None


# =====================================================
# PERHITUNGAN DURASI SESI
# =====================================================

def calculate_duration_seconds(session, fallback_end=None):
    """
    Menghitung durasi sesi dalam detik.

    Prioritas:
    1. duration_seconds yang sudah tersimpan.
    2. Timestamp mulai sampai timestamp selesai.
    3. Timestamp mulai sampai jawaban terakhir.

    Jika tidak ada timestamp yang cukup, return None.
    """

    # Gunakan durasi tersimpan jika tersedia.
    stored_duration = session.get("duration_seconds")

    if stored_duration is not None:
        try:
            return max(0, int(float(stored_duration)))
        except (TypeError, ValueError):
            pass

    # Waktu mulai.
    start_time = parse_datetime(
        session.get("started_at") or session.get("created_at")
    )

    if not start_time:
        return None

    # Cari waktu selesai dari beberapa kemungkinan nama kolom.
    end_time = None

    end_time_columns = [
        "ended_at",
        "completed_at",
        "finished_at",
        "end_time"
    ]

    for column in end_time_columns:
        end_time = parse_datetime(session.get(column))

        if end_time:
            break

    # Jika tidak ada waktu selesai,
    # gunakan waktu jawaban terakhir.
    if not end_time:
        end_time = parse_datetime(fallback_end)

    if not end_time:
        return None

    duration = (end_time - start_time).total_seconds()

    return max(0, int(duration))


def build_cv_summary(observations):
    indicators = ["head_motion", "gaze", "expression"]
    summary = {}

    for indicator in indicators:
        rows = [
            item for item in observations
            if item.get("indicator_type") == indicator
        ]

        valid_rows = [
            item for item in rows
            if item.get("is_valid") is True
        ]

        confidences = [
            safe_float(item.get("confidence"))
            for item in valid_rows
            if item.get("confidence") is not None
        ]

        labels = {}

        for item in valid_rows:
            label = item.get("predicted_label")

            if label:
                labels[label] = labels.get(label, 0) + 1

        summary[indicator] = {
            "total": len(rows),
            "valid": len(valid_rows),
            "invalid": len(rows) - len(valid_rows),
            "labels": labels,
            "average_confidence": (
                round(sum(confidences) / len(confidences), 4)
                if confidences else None
            ),
            "status": "available" if valid_rows else "unavailable"
        }

    return summary


# =====================================================
# PERHITUNGAN PERFORMA
# =====================================================

def calculate_performance(scores, criteria_map):
    total_weight = 0
    weighted_score = 0

    for item in scores:
        criterion = criteria_map.get(
            item.get("criterion_id")
        ) or {}

        weight = safe_float(
            item.get("weight_percent"),
            safe_float(criterion.get("weight")) * 100
        )

        score = safe_float(item.get("score"))

        if weight <= 0:
            continue

        total_weight += weight
        weighted_score += (weight / 100) * score

    if total_weight <= 0:
        return None

    return round(
        (weighted_score / (total_weight / 100)) / 4 * 100,
        2
    )


# =====================================================
# MENGAMBIL PERFORMA SATU SESI
# =====================================================

def get_session_performance(session, criteria_map):
    session_id = session["id"]

    print(f"[PERFORMANCE] Mengambil sesi: {session_id}")

    result = {
        "session_id": session_id,
        "attempt_number": session.get("attempt_number") or 1,
        "started_at": session.get("started_at"),
        "last_answer_at": None,
        "score": None,
        "total_questions": 0,
        "evaluated_questions": 0
    }

    # 1. PERTANYAAN
    questions_response = (
        supabase.table("session_questions")
        .select("id")
        .eq("session_id", session_id)
        .execute()
    )

    questions = questions_response.data or []
    question_ids = [item["id"] for item in questions]

    result["total_questions"] = len(question_ids)

    if not question_ids:
        return result

    # 2. JAWABAN
    answers_response = (
        supabase.table("answers")
        .select("*")
        .in_("session_question_id", question_ids)
        .execute()
    )

    answers = answers_response.data or []

    # Ambil waktu jawaban terakhir untuk perhitungan durasi.
    answer_timestamps = [
        item.get("created_at")
        for item in answers
        if item.get("created_at")
    ]

    if answer_timestamps:
        parsed_timestamps = [
            parse_datetime(value)
            for value in answer_timestamps
        ]

        parsed_timestamps = [
            value for value in parsed_timestamps
            if value is not None
        ]

        if parsed_timestamps:
            result["last_answer_at"] = max(
                parsed_timestamps
            ).isoformat()

    answer_ids = [item["id"] for item in answers]

    if not answer_ids:
        return result

    # 3. RUBRIC SCORES
    rubric_response = (
        supabase.table("rubric_scores")
        .select("*")
        .in_("answer_id", answer_ids)
        .execute()
    )

    rubric_scores = rubric_response.data or []

    # 4. EVALUASI LLM
    llm_response = (
        supabase.table("llm_evaluations")
        .select("*")
        .in_("answer_id", answer_ids)
        .execute()
    )

    llm_evaluations = llm_response.data or []

    evaluation_ids = [
        item["id"] for item in llm_evaluations
    ]

    llm_scores = []

    if evaluation_ids:
        llm_scores_response = (
            supabase.table("llm_evaluation_scores")
            .select("*")
            .in_("evaluation_id", evaluation_ids)
            .execute()
        )

        llm_scores = llm_scores_response.data or []

    # 5. MAP EVALUASI
    evaluation_by_answer = {
        item["answer_id"]: item
        for item in llm_evaluations
    }

    scores_by_evaluation = {}

    for item in llm_scores:
        scores_by_evaluation.setdefault(
            item["evaluation_id"], []
        ).append(item)

    rubric_by_answer = {}

    for item in rubric_scores:
        rubric_by_answer.setdefault(
            item["answer_id"], []
        ).append(item)

    # 6. HITUNG SKOR
    all_scores = []
    evaluated_questions = 0

    for answer in answers:
        answer_id = answer["id"]
        evaluation = evaluation_by_answer.get(answer_id)

        current_scores = []

        if evaluation:
            current_scores = scores_by_evaluation.get(
                evaluation["id"], []
            )

        if not current_scores:
            current_scores = rubric_by_answer.get(
                answer_id, []
            )

        if current_scores:
            evaluated_questions += 1

            for item in current_scores:
                criterion = criteria_map.get(
                    item.get("criterion_id")
                ) or {}

                all_scores.append({
                    **item,
                    "weight_percent": (
                        safe_float(criterion.get("weight")) * 100
                    )
                })

    result["evaluated_questions"] = evaluated_questions

    result["score"] = calculate_performance(
        all_scores,
        criteria_map
    )

    print(
        f"[PERFORMANCE] Sesi {session_id}: "
        f"score={result['score']}, "
        f"evaluated={evaluated_questions}/{len(question_ids)}, "
        f"last_answer_at={result['last_answer_at']}"
    )

    return result


# =====================================================
# METRIK COMPUTER VISION UNTUK RIWAYAT
# =====================================================

def get_session_cv_metrics(session_id):
    response = (
        supabase.table("cv_observations")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    )

    observations = response.data or []

    summary = build_cv_summary(observations)

    # Gaze: persentase observasi gaze yang valid.
    gaze_data = summary["gaze"]

    gaze_percentage = None

    if gaze_data["total"] > 0:
        gaze_percentage = round(
            gaze_data["valid"] / gaze_data["total"] * 100,
            2
        )

    # Head motion: hitung label arah kepala valid
    # yang bukan label netral.
    neutral_labels = {
        "normal",
        "neutral",
        "center",
        "centre",
        "forward",
        "straight",
        "front",
        "none",
        "no_movement",
        "no movement"
    }

    head_motion_events = 0

    for item in observations:
        if (
            item.get("indicator_type") != "head_motion"
            or item.get("is_valid") is not True
        ):
            continue

        label = str(
            item.get("predicted_label") or ""
        ).strip().lower()

        if label and label not in neutral_labels:
            head_motion_events += 1

    return {
        "gaze_percentage": gaze_percentage,
        "head_motion_count": head_motion_events,
        "cv_summary": summary,
        "total_cv_observations": len(observations)
    }


# =====================================================
# RIWAYAT PERFORMA
# =====================================================

def get_performance_history(session, criteria_map):
    participant_id = session.get("participant_id")
    role = session.get("role")

    if not participant_id:
        return []

    query = (
        supabase.table("interview_sessions")
        .select("*")
        .eq("participant_id", participant_id)
    )

    if role:
        query = query.eq("role", role)

    history_response = (
        query
        .order("started_at", desc=False)
        .execute()
    )

    history_sessions = history_response.data or []

    performance_history = []

    for history_session in history_sessions:
        try:
            performance = get_session_performance(
                history_session,
                criteria_map
            )

            performance["duration_seconds"] = (
                calculate_duration_seconds(
                    history_session,
                    performance.get("last_answer_at")
                )
            )

            performance_history.append(performance)

        except Exception as error:
            print(
                "[PERFORMANCE HISTORY ERROR] "
                f"Sesi {history_session.get('id')}: {error}"
            )
            traceback.print_exc()

    current_session_id = session["id"]

    existing_ids = {
        item["session_id"]
        for item in performance_history
    }

    if current_session_id not in existing_ids:
        try:
            current_performance = get_session_performance(
                session,
                criteria_map
            )

            current_performance["duration_seconds"] = (
                calculate_duration_seconds(
                    session,
                    current_performance.get("last_answer_at")
                )
            )

            performance_history.append(current_performance)

        except Exception as error:
            print(
                "[PERFORMANCE HISTORY ERROR] "
                f"Sesi aktif {current_session_id}: {error}"
            )
            traceback.print_exc()

    performance_history.sort(
        key=lambda item: (
            item.get("attempt_number") or 0,
            item.get("started_at") or ""
        )
    )

    return performance_history


# =====================================================
# GET /api/sessions
# =====================================================

@router.get("/sessions")
def get_sessions(
    participant=Depends(get_current_participant)
):
    try:
        print(
            f"\n[HISTORY] Mengambil sesi participant: "
            f"{participant['id']}"
        )

        # 1. AMBIL SEMUA SESI
        sessions_response = (
            supabase.table("interview_sessions")
            .select("*")
            .eq("participant_id", participant["id"])
            .order("started_at", desc=True)
            .execute()
        )

        sessions = sessions_response.data or []

        # 2. AMBIL DATA PARTICIPANT
        participants_response = (
            supabase.table("participants")
            .select("id, name, external_id")
            .eq("id", participant["id"])
            .execute()
        )

        participant_map = {
            item["id"]: item
            for item in (participants_response.data or [])
        }

        # 3. AMBIL KRITERIA RUBRIK
        criteria_response = (
            supabase.table("rubric_criteria")
            .select("*")
            .execute()
        )

        criteria_map = {
            item["id"]: item
            for item in (criteria_response.data or [])
        }

        results = []

        # 4. PROSES SETIAP SESI
        for session in sessions:
            session_id = session["id"]

            try:
                # Performa rubrik dan waktu jawaban terakhir.
                performance = get_session_performance(
                    session,
                    criteria_map
                )

                # Metrik Computer Vision.
                cv_metrics = get_session_cv_metrics(
                    session_id
                )

                participant_data = participant_map.get(
                    session.get("participant_id")
                )

                # Hitung durasi sesi.
                duration_seconds = calculate_duration_seconds(
                    session,
                    performance.get("last_answer_at")
                )

                results.append({
                    **session,

                    "participant": participant_data,

                    # Durasi sesi dalam detik.
                    "duration_seconds": duration_seconds,

                    # Metrik utama untuk grafik frontend.
                    "rubric_score": performance.get("score"),

                    "gaze_percentage": (
                        cv_metrics.get("gaze_percentage")
                    ),

                    "head_motion_count": (
                        cv_metrics.get("head_motion_count")
                    ),

                    # Detail performa.
                    "performance": performance,

                    # Detail CV.
                    "cv_summary": cv_metrics.get("cv_summary"),

                    "total_cv_observations": (
                        cv_metrics.get("total_cv_observations")
                    )
                })

                print(
                    f"[HISTORY] Sesi {session_id}: "
                    f"duration={duration_seconds}, "
                    f"rubric={performance.get('score')}, "
                    f"gaze={cv_metrics.get('gaze_percentage')}, "
                    f"head_motion={cv_metrics.get('head_motion_count')}"
                )

            except Exception as error:
                print(
                    f"[HISTORY SESSION ERROR] {session_id}: {error}"
                )
                traceback.print_exc()

                # Jangan hilangkan sesi dari daftar
                # jika pengambilan metrik gagal.
                results.append({
                    **session,

                    "participant": participant_map.get(
                        session.get("participant_id")
                    ),

                    "duration_seconds": calculate_duration_seconds(
                        session
                    ),

                    "rubric_score": None,
                    "gaze_percentage": None,
                    "head_motion_count": None,
                    "performance": None,
                    "cv_summary": None,
                    "total_cv_observations": 0
                })

        return {
            "success": True,
            "total": len(results),
            "data": results
        }

    except Exception as error:
        print("[GET SESSIONS ERROR]")
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengambil daftar sesi: {str(error)}"
        )


# =====================================================
# GET /api/sessions/{session_id}
# =====================================================

@router.get("/sessions/{session_id}")
def get_session_detail(
    session_id: str,
    participant=Depends(get_current_participant),
):
    try:
        print(f"\n[REPORT] Mengambil detail sesi: {session_id}")

        # 1. DATA SESI
        session_response = (
            supabase.table("interview_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("participant_id", participant["id"])
            .maybe_single()
            .execute()
        )

        session_data = session_response.data

        if not session_data:
            raise HTTPException(
                status_code=404,
                detail="Sesi wawancara tidak ditemukan."
            )

        participant_id = session_data.get("participant_id")

        # 2. PERTANYAAN
        questions_response = (
            supabase.table("session_questions")
            .select("*")
            .eq("session_id", session_id)
            .order("question_order")
            .execute()
        )

        question_data = questions_response.data or []
        question_ids = [q["id"] for q in question_data]

        # 3. PESERTA
        participant_data = None

        if participant_id:
            participant_response = (
                supabase.table("participants")
                .select("*")
                .eq("id", participant_id)
                .maybe_single()
                .execute()
            )

            participant_data = participant_response.data

        # 4. JAWABAN
        answers_data = []

        if question_ids:
            answers_response = (
                supabase.table("answers")
                .select("*")
                .in_("session_question_id", question_ids)
                .execute()
            )

            answers_data = answers_response.data or []

        answer_ids = [a["id"] for a in answers_data]

        # 5. RUBRIC SCORES
        rubric_data = []

        if answer_ids:
            rubric_response = (
                supabase.table("rubric_scores")
                .select("*")
                .in_("answer_id", answer_ids)
                .execute()
            )

            rubric_data = rubric_response.data or []

        # 6. EVALUASI LLM
        llm_evaluations_data = []

        if answer_ids:
            llm_response = (
                supabase.table("llm_evaluations")
                .select("*")
                .in_("answer_id", answer_ids)
                .execute()
            )

            llm_evaluations_data = llm_response.data or []

        evaluation_ids = [
            item["id"]
            for item in llm_evaluations_data
        ]

        # 7. DETAIL SKOR LLM
        llm_scores_data = []

        if evaluation_ids:
            llm_scores_response = (
                supabase.table("llm_evaluation_scores")
                .select("*")
                .in_("evaluation_id", evaluation_ids)
                .execute()
            )

            llm_scores_data = llm_scores_response.data or []

        # 8. KRITERIA
        criteria_response = (
            supabase.table("rubric_criteria")
            .select("*")
            .execute()
        )

        criteria_map = {
            item["id"]: item
            for item in (criteria_response.data or [])
        }

        # 9. COMPUTER VISION
        cv_observations_data = []

        if question_ids:
            cv_response = (
                supabase.table("cv_observations")
                .select("*")
                .eq("session_id", session_id)
                .in_("session_question_id", question_ids)
                .order("timestamp_seconds")
                .execute()
            )

            cv_observations_data = cv_response.data or []

        # 10. MAP JAWABAN
        answer_map = {
            item["session_question_id"]: item
            for item in answers_data
        }

        # 11. MAP RUBRIK
        rubric_map = {}

        for item in rubric_data:
            answer_id = item["answer_id"]

            criterion = criteria_map.get(
                item.get("criterion_id")
            )

            weight = safe_float(
                (criterion or {}).get("weight")
            )

            rubric_map.setdefault(answer_id, []).append({
                **item,
                "weight_percent": weight * 100,
                "criterion": criterion
            })

        # 12. MAP SKOR LLM
        llm_score_map = {}

        for item in llm_scores_data:
            evaluation_id = item["evaluation_id"]

            criterion = criteria_map.get(
                item.get("criterion_id")
            )

            weight = safe_float(
                (criterion or {}).get("weight")
            )

            llm_score_map.setdefault(
                evaluation_id, []
            ).append({
                **item,
                "weight_percent": weight * 100,
                "criterion": criterion
            })

        # 13. MAP EVALUASI LLM
        llm_evaluation_map = {}

        for evaluation in llm_evaluations_data:
            evaluation_id = evaluation["id"]

            llm_evaluation_map[evaluation["answer_id"]] = {
                **evaluation,
                "scores": llm_score_map.get(
                    evaluation_id, []
                )
            }

        # 14. MAP OBSERVASI CV
        cv_observation_map = {}

        for item in cv_observations_data:
            question_id = item.get("session_question_id")

            cv_observation_map.setdefault(
                question_id, []
            ).append(item)

        # 15. GABUNGKAN DATA PERTANYAAN
        detailed_questions = []

        for question in question_data:
            question_id = question["id"]
            answer = answer_map.get(question_id)

            answer_id = answer["id"] if answer else None

            old_scores = (
                rubric_map.get(answer_id, [])
                if answer_id else []
            )

            llm_evaluation = (
                llm_evaluation_map.get(answer_id)
                if answer_id else None
            )

            llm_scores = (
                llm_evaluation.get("scores", [])
                if llm_evaluation else []
            )

            use_llm_scores = bool(llm_scores)

            active_scores = (
                llm_scores if use_llm_scores else old_scores
            )

            total_weight = sum(
                safe_float(item.get("weight_percent")) / 100
                for item in active_scores
            )

            weighted_score = sum(
                safe_float(item.get("score"))
                * (safe_float(item.get("weight_percent")) / 100)
                for item in active_scores
            )

            if use_llm_scores:
                all_synthetic = llm_evaluation.get(
                    "is_synthetic"
                )
            elif old_scores:
                all_synthetic = all(
                    item.get("is_synthetic") is True
                    for item in old_scores
                )
            else:
                all_synthetic = None

            review_status = list({
                item["review_status"]
                for item in old_scores
                if item.get("review_status")
            })

            cv_observations = cv_observation_map.get(
                question_id, []
            )

            cv_summary = build_cv_summary(
                cv_observations
            )

            cv_by_indicator = {
                "head_motion": [],
                "gaze": [],
                "expression": []
            }

            for observation in cv_observations:
                indicator = observation.get("indicator_type")

                if indicator in cv_by_indicator:
                    cv_by_indicator[indicator].append(
                        observation
                    )

            detailed_questions.append({
                **question,
                "answer": answer,
                "rubric_scores": old_scores,
                "llm_evaluation": llm_evaluation,
                "active_rubric_scores": active_scores,

                "rubric_summary": {
                    "total_criteria": len(active_scores),
                    "total_weight": round(total_weight, 4),
                    "weighted_score": round(weighted_score, 2),

                    "weighted_percentage": (
                        round(
                            (weighted_score / (total_weight * 4)) * 100,
                            2
                        )
                        if total_weight > 0 else None
                    ),

                    "all_synthetic": all_synthetic,
                    "review_status": review_status,

                    "evaluation_source": (
                        "llm" if use_llm_scores
                        else "rubric" if old_scores
                        else None
                    )
                },

                "cv_observations": cv_observations,
                "cv_summary": cv_summary,
                "cv_by_indicator": cv_by_indicator,

                "cv_status": (
                    "completed" if cv_observations
                    else "unavailable"
                ),

                "cv_observation_count": len(
                    cv_observations
                )
            })

        # 16. RINGKASAN CV SESI
        total_cv_observations = len(
            cv_observations_data
        )

        session_cv_summary = build_cv_summary(
            cv_observations_data
        )

        # 17. DURASI SESI
        answer_timestamps = [
            item.get("created_at")
            for item in answers_data
            if item.get("created_at")
        ]

        parsed_answer_timestamps = [
            parse_datetime(value)
            for value in answer_timestamps
        ]

        parsed_answer_timestamps = [
            value for value in parsed_answer_timestamps
            if value is not None
        ]

        last_answer_at = (
            max(parsed_answer_timestamps).isoformat()
            if parsed_answer_timestamps else None
        )

        duration_seconds = calculate_duration_seconds(
            session_data,
            last_answer_at
        )

        # 18. RIWAYAT PERFORMA
        performance_history = []

        try:
            performance_history = get_performance_history(
                session_data,
                criteria_map
            )

        except Exception as history_error:
            print(
                "[PERFORMANCE HISTORY ERROR] "
                f"{history_error}"
            )
            traceback.print_exc()

        # 19. RESPONSE
        return {
            "success": True,

            "data": {
                "session": {
                    **session_data,
                    "duration_seconds": duration_seconds
                },

                "participant": participant_data,
                "questions": detailed_questions,

                "computer_vision": {
                    "status": session_data.get(
                        "cv_feature_status",
                        "unknown"
                    ),
                    "total_observations": total_cv_observations,
                    "summary": session_cv_summary
                },

                "performance_history": performance_history
            }
        }

    except HTTPException:
        raise

    except Exception as e:
        print(
            f"\n[ERROR DETAIL SESSION] {session_id}"
        )

        print(f"Jenis error: {type(e).__name__}")
        print(f"Pesan error: {str(e)}")

        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengambil detail sesi: {str(e)}"
        )
