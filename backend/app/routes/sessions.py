
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from app.database import supabase
from app.auth import get_current_participant


router = APIRouter(
    prefix="/api",
    tags=["Interview Sessions"]
)


# Konversi role slug dari frontend ke nama role di database
ROLE_MAP = {
    "data-analyst": "Data Analyst",
    "data-engineer": "Data Engineer",
    "data-scientist": "Data Scientist",
}


# Struktur setiap pertanyaan yang dikirim frontend
class QuestionInput(BaseModel):
    external_id: str
    question_text: str
    competency_id: str | None = None
    competency: str | None = None
    question_type: str | None = None


# Struktur request pembuatan session
class CreateSessionRequest(BaseModel):
    role: str
    pid: str | None = None
    attempt: int = Field(ge=1)
    questions: list[QuestionInput] = Field(min_length=1)


@router.post("/sessions")
def create_session(
    payload: CreateSessionRequest,
    participant=Depends(get_current_participant),
):

    # 1. Validasi role
    role = ROLE_MAP.get(payload.role, payload.role)

    if role not in ROLE_MAP.values():
        raise HTTPException(
            status_code=400,
            detail="Role tidak valid."
        )

    # 3. Periksa ID pertanyaan duplikat
    external_ids = [
        question.external_id
        for question in payload.questions
    ]

    if len(external_ids) != len(set(external_ids)):
        raise HTTPException(
            status_code=400,
            detail="Terdapat ID pertanyaan yang duplikat."
        )

    # 4. Ambil data pertanyaan dari question_bank
    try:
        question_result = (
            supabase.table("question_bank")
            .select(
                "id, external_id, role, question_text, "
                "competency_id, competency, question_type"
            )
            .in_("external_id", external_ids)
            .eq("is_active", True)
            .execute()
        )

        question_map = {
            question["external_id"]: question
            for question in (question_result.data or [])
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gagal mengambil data pertanyaan: {str(e)}"
        )

    # 5. Pastikan seluruh pertanyaan ditemukan
    if len(question_map) != len(external_ids):
        raise HTTPException(
            status_code=400,
            detail="Ada pertanyaan yang tidak ditemukan atau tidak aktif."
        )

    # 6. Pastikan semua pertanyaan sesuai dengan role
    for external_id in external_ids:
        question = question_map[external_id]

        if question["role"] != role:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Pertanyaan {external_id} "
                    f"tidak sesuai dengan role {role}."
                )
            )

    # 7. Buat external ID unik untuk session
    session_external_id = f"{participant.get('external_id') or participant['id']}-{uuid4().hex}"

    session_id = None

    try:
        # 8. Simpan interview session
        session_data = {
            "external_id": session_external_id,
            "participant_id": participant["id"],
            "role": role,
            "session_name": f"{role} - Percobaan {payload.attempt}",
            "status": "pending",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "attempt_number": payload.attempt,
            "is_synthetic": False,
        }

        session_result = (
            supabase.table("interview_sessions")
            .insert(session_data)
            .execute()
        )

        if not session_result.data:
            raise RuntimeError(
                "Gagal membuat interview session."
            )

        session = session_result.data[0]
        session_id = session["id"]

        # 9. Siapkan pertanyaan sesuai urutan frontend
        session_questions = []

        for index, external_id in enumerate(external_ids, start=1):

            question = question_map[external_id]

            session_questions.append({
                "external_id": f"SQ-{uuid4().hex}",
                "session_id": session_id,
                "question_id": question["id"],
                "question_order": index,
                "question_text": question["question_text"],
                "competency_id": question.get("competency_id"),
                "competency": question.get("competency"),
                "question_type": question.get("question_type"),
                "is_synthetic": False,
            })

        # 10. Simpan seluruh pertanyaan sesi
        question_session_result = (
            supabase.table("session_questions")
            .insert(session_questions)
            .execute()
        )

        saved_questions = question_session_result.data or []

        if len(saved_questions) != len(session_questions):
            raise RuntimeError(
                "Jumlah pertanyaan yang tersimpan tidak sesuai."
            )

        # 11. Kembalikan ID session dan pertanyaan
        return {
            "session_id": session_id,
            "participant_id": participant["id"],
            "role": role,
            "attempt": payload.attempt,
            "questions": [
                {
                    "external_id": row["external_id"],
                    "session_question_id": row["id"],
                    "question_id": row["question_id"],
                    "question_order": row["question_order"],
                }
                for row in saved_questions
            ],
        }

    except HTTPException:
        raise

    except Exception as e:

        # Bersihkan data jika proses pembuatan session gagal
        if session_id:
            try:
                (
                    supabase.table("session_questions")
                    .delete()
                    .eq("session_id", session_id)
                    .execute()
                )

                (
                    supabase.table("interview_sessions")
                    .delete()
                    .eq("id", session_id)
                    .execute()
                )

            except Exception:
                pass

        raise HTTPException(
            status_code=500,
            detail=f"Gagal membuat sesi interview: {str(e)}"
        )
