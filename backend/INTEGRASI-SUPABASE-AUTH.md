# Integrasi Supabase Auth semRAUT

## 1. Database

Jalankan file `sql/001_supabase_auth_participants.sql` satu kali melalui Supabase Dashboard > SQL Editor.

Kolom `participants.auth_user_id` menghubungkan participant dengan `auth.users.id`.
Sesi baru akan menyimpan `participant_id` dari participant milik akun yang sedang login.

## 2. Environment backend

Pastikan file `.env` lokal memiliki:

```env
SUPABASE_URL=https://PROJECT-REF.supabase.co
SUPABASE_SECRET_KEY=YOUR_SECRET_OR_SERVICE_ROLE_KEY
GROQ_API_KEY=YOUR_GROQ_API_KEY
GROQ_MODEL=openai/gpt-oss-20b
GROQ_STT_MODEL=whisper-large-v3
API_HOST=127.0.0.1
API_PORT=8000
```

`SUPABASE_SERVICE_ROLE_KEY` juga diterima sebagai nama alternatif oleh `config.py`.
Jangan pernah memasukkan secret/service-role key ke frontend.

## 3. Frontend

Pada `web/assets/js/core/auth.js`, isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` dengan Project URL dan anon/publishable key dari Supabase.

Halaman daftar meminta nama lengkap, email, dan password. Nama disimpan sebagai `user_metadata.full_name` pada Supabase Auth.

## 4. Perilaku backend

- Request ke sesi, riwayat, evaluasi, dan job memerlukan `Authorization: Bearer <access_token>`.
- Backend memverifikasi token melalui Supabase Auth.
- Backend membuat atau menghubungkan baris `participants` berdasarkan `auth_user_id`.
- Jika ada baris lama dengan email yang sama persis, backend dapat menghubungkannya ke akun Auth tersebut.
- Pembuatan sesi menyimpan `participant_id`.
- Riwayat, detail laporan, evaluasi, dan job dibatasi pada participant yang sedang login.

## 5. Catatan data lama

Sesi lama yang `participant_id`-nya NULL tidak akan otomatis digabungkan ke akun baru. Jangan menghubungkannya hanya berdasarkan awalan `external_id` atau PID browser. Verifikasi pemiliknya terlebih dahulu.

## 6. Menjalankan backend

Dari folder backend:

```powershell
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

Pastikan `GET /health` merespons sehat sebelum menguji login dan membuat sesi.
