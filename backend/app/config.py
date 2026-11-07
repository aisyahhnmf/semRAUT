
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")

# ==========================================
# SUPABASE CONFIGURATION
# ==========================================
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = (
    os.getenv("SUPABASE_SECRET_KEY")
    or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# ==========================================
# GROQ CONFIGURATION
# ==========================================
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

# Model untuk evaluasi jawaban wawancara
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)

# Model untuk Speech-to-Text
GROQ_STT_MODEL = os.getenv(
    "GROQ_STT_MODEL",
    "whisper-large-v3"
)

# ==========================================
# API CONFIGURATION
# ==========================================
API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", 8000))

# ==========================================
# VALIDATION
# ==========================================
if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    raise ValueError(
        "Supabase configuration belum lengkap. Periksa file .env"
    )

if not GROQ_API_KEY:
    raise ValueError(
        "Groq API Key belum dikonfigurasi. Periksa file .env"
    )
