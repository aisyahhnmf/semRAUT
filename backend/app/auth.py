
import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.database import supabase


logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


# =====================================================
# HELPER
# =====================================================

def get_response_data(response):
    """Mengambil data dari response Supabase secara aman."""

    data = getattr(response, "data", None)

    if data is None and isinstance(response, dict):
        data = response.get("data")

    return data


def get_first_row(data):
    """Mengambil satu baris dari hasil query Supabase."""

    if isinstance(data, list):
        return data[0] if data else None

    if isinstance(data, dict):
        return data

    return None


def get_user_value(user, key, default=None):
    """Membaca atribut user dari object maupun dictionary."""

    if isinstance(user, dict):
        return user.get(key, default)

    return getattr(user, key, default)


# =====================================================
# AUTHENTICATION
# =====================================================

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    """Memverifikasi access token Supabase Auth."""

    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token login diperlukan. Silakan login kembali.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        response = supabase.auth.get_user(
            credentials.credentials
        )

        user = getattr(response, "user", None)

        if user is None and isinstance(response, dict):
            user = response.get("user")

        if user is None:
            raise ValueError("User tidak ditemukan dari access token.")

        return user

    except Exception as error:
        logger.warning(
            "Supabase authentication gagal: %s",
            error
        )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token tidak valid atau sudah kedaluwarsa. Silakan login kembali.",
            headers={"WWW-Authenticate": "Bearer"},
        )


# =====================================================
# PARTICIPANT PROFILE
# =====================================================

def get_current_participant(
    user=Depends(get_current_user)
):
    """
    Mengambil atau membuat profil peserta berdasarkan
    akun Supabase Auth yang sedang login.
    """

    user_id = str(
        get_user_value(user, "id", "") or ""
    )

    email = str(
        get_user_value(user, "email", "") or ""
    ).strip().lower()

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Identitas akun tidak valid."
        )

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Akun harus memiliki alamat email."
        )

    # -------------------------------------------------
    # EMAIL VERIFICATION
    # -------------------------------------------------

    email_confirmed_at = get_user_value(
        user,
        "email_confirmed_at"
    )

    if not email_confirmed_at:
        raise HTTPException(
            status_code=403,
            detail="Verifikasi email terlebih dahulu sebelum menggunakan semRAUT."
        )

    # -------------------------------------------------
    # USER METADATA
    # -------------------------------------------------

    metadata = get_user_value(
        user,
        "user_metadata",
        {}
    ) or {}

    if not isinstance(metadata, dict):
        metadata = {}

    display_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or email.split("@")[0]
    )

    display_name = str(display_name).strip()

    if not display_name:
        display_name = email.split("@")[0]

    # -------------------------------------------------
    # PARTICIPANT TABLE
    # -------------------------------------------------

    columns = "id, auth_user_id, external_id, name, email"

    try:

        # =============================================
        # 1. CARI BERDASARKAN AUTH USER ID
        # =============================================

        existing_response = (
            supabase.table("participants")
            .select(columns)
            .eq("auth_user_id", user_id)
            .limit(1)
            .execute()
        )

        existing = get_first_row(
            get_response_data(existing_response)
        )

        if existing:
            return existing

        # =============================================
        # 2. CARI PROFIL LAMA BERDASARKAN EMAIL
        # =============================================

        email_response = (
            supabase.table("participants")
            .select(columns)
            .eq("email", email)
            .limit(1)
            .execute()
        )

        existing_email = get_first_row(
            get_response_data(email_response)
        )

        if existing_email:

            linked_uid = existing_email.get(
                "auth_user_id"
            )

            # Profil sudah terhubung ke akun lain.
            if linked_uid and str(linked_uid) != user_id:
                raise HTTPException(
                    status_code=409,
                    detail="Email peserta sudah terhubung dengan akun lain."
                )

            # Hubungkan profil lama ke akun yang sedang login.
            update_response = (
                supabase.table("participants")
                .update({
                    "auth_user_id": user_id
                })
                .eq("id", existing_email["id"])
                .execute()
            )

            updated = get_first_row(
                get_response_data(update_response)
            )

            if updated:
                return updated

            # Jika response update tidak mengembalikan data,
            # ambil kembali profil dari database.
            retry_response = (
                supabase.table("participants")
                .select(columns)
                .eq("auth_user_id", user_id)
                .limit(1)
                .execute()
            )

            linked = get_first_row(
                get_response_data(retry_response)
            )

            if linked:
                return linked

            raise RuntimeError(
                "Profil lama ditemukan, tetapi gagal menghubungkan auth_user_id."
            )

        # =============================================
        # 3. BUAT PROFIL BARU
        # =============================================

        participant_payload = {
            "auth_user_id": user_id,
            "external_id": user_id,
            "name": display_name,
            "email": email,
        }

        created_response = (
            supabase.table("participants")
            .insert(participant_payload)
            .execute()
        )

        created = get_first_row(
            get_response_data(created_response)
        )

        if created:
            return created

        # =============================================
        # 4. CEK ULANG JIKA REQUEST BERSAMAAN
        # =============================================

        retry_response = (
            supabase.table("participants")
            .select(columns)
            .eq("auth_user_id", user_id)
            .limit(1)
            .execute()
        )

        retry = get_first_row(
            get_response_data(retry_response)
        )

        if retry:
            return retry

        raise RuntimeError(
            "Supabase tidak mengembalikan data participant setelah insert."
        )

    except HTTPException:
        raise

    except Exception as error:

        logger.exception(
            "[AUTH PARTICIPANT ERROR] Gagal menyiapkan profil peserta. "
            "User ID: %s, Email: %s, Error: %s",
            user_id,
            email,
            error
        )

        # Cek ulang untuk mengatasi dua request pertama
        # yang mungkin membuat profil secara bersamaan.
        try:
            retry_response = (
                supabase.table("participants")
                .select(columns)
                .eq("auth_user_id", user_id)
                .limit(1)
                .execute()
            )

            retry = get_first_row(
                get_response_data(retry_response)
            )

            if retry:
                return retry

        except Exception:
            logger.exception(
                "[AUTH PARTICIPANT RETRY ERROR]"
            )

        raise HTTPException(
            status_code=500,
            detail=(
                "Gagal menyiapkan profil peserta. "
                "Periksa log backend untuk detail kesalahan database."
            )
        )


# =====================================================
# SESSION OWNERSHIP
# =====================================================

def ensure_session_owner(
    session_id: str,
    participant_id: str
):
    """Memastikan sesi dimiliki peserta yang sedang login."""

    try:
        response = (
            supabase.table("interview_sessions")
            .select("id, participant_id, role, status")
            .eq("id", session_id)
            .eq("participant_id", participant_id)
            .limit(1)
            .execute()
        )

        session = get_first_row(
            get_response_data(response)
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Sesi tidak ditemukan atau bukan milik akun ini."
            )

        return session

    except HTTPException:
        raise

    except Exception as error:
        logger.exception(
            "Gagal memeriksa kepemilikan sesi %s: %s",
            session_id,
            error
        )

        raise HTTPException(
            status_code=500,
            detail="Gagal memeriksa kepemilikan sesi."
        )
