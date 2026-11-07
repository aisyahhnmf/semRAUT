
from fastapi import APIRouter, HTTPException, Depends
from app.database import supabase
from app.auth import get_current_participant

router = APIRouter(
    prefix="/api",
    tags=["Master Data"]
)


# ==========================================
# 1. GET ALL PARTICIPANTS
# ==========================================
@router.get("/participants")
def get_participants(participant=Depends(get_current_participant)):
    try:
        response = (
            supabase.table("participants")
            .select("id, external_id, name, email, created_at")
            .eq("id", participant["id"])
            .order("name")
            .execute()
        )

        return {
            "success": True,
            "total": len(response.data),
            "data": response.data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 2. GET QUESTIONS
# ==========================================
@router.get("/questions")
def get_questions(role: str = None):
    try:
        query = (
            supabase.table("question_bank")
            .select("*")
            .eq("is_active", True)
        )

        if role:
            query = query.ilike("role", role.strip())

        response = query.order("category").execute()

        return {
            "success": True,
            "total": len(response.data),
            "data": response.data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 3. GET RUBRIC CRITERIA
# ==========================================
@router.get("/rubric-criteria")
def get_rubric_criteria():
    try:
        response = (
            supabase.table("rubric_criteria")
            .select("*")
            .execute()
        )

        return {
            "success": True,
            "total": len(response.data),
            "data": response.data
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 4. GET ROLES WITH QUESTIONS
# ==========================================
@router.get("/roles")
def get_roles():
    try:
        role_config = {
            "Data Analyst": {
                "id": "data-analyst",
                "bidang": "Data & Analytics",
                "deskripsi": (
                    "Mengolah data menjadi insight "
                    "untuk mendukung pengambilan keputusan."
                )
            },
            "Data Engineer": {
                "id": "data-engineer",
                "bidang": "Data Engineering",
                "deskripsi": (
                    "Merancang dan mengelola pipeline "
                    "serta infrastruktur data."
                )
            },
            "Data Scientist": {
                "id": "data-scientist",
                "bidang": "Data Science & AI",
                "deskripsi": (
                    "Menggunakan statistik dan machine learning "
                    "untuk menghasilkan prediksi dan insight."
                )
            }
        }

        response = (
            supabase.table("question_bank")
            .select(
                "external_id, role, question_text, category, "
                "competency, question_type, expected_evidence, "
                "followup_focus"
            )
            .eq("is_active", True)
            .order("category")
            .execute()
        )

        grouped_roles = {
            role_name: []
            for role_name in role_config
        }

        for question in response.data:
            role_name = question.get("role")

            if role_name not in grouped_roles:
                continue

            grouped_roles[role_name].append({
                "id": question.get("external_id"),
                "teks": question.get("question_text"),
                "kompetensi": (
                    question.get("competency")
                    or question.get("category")
                ),
                "kategori": question.get("category"),
                "jenis": question.get("question_type"),
                "expected_evidence": question.get("expected_evidence"),
                "followup_focus": question.get("followup_focus"),
                "kriteria": []
            })

        roles = []

        for role_name, config in role_config.items():
            roles.append({
                **config,
                "nama": role_name,
                "soal": grouped_roles[role_name]
            })

        return {
            "success": True,
            "total": len(roles),
            "data": roles
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
