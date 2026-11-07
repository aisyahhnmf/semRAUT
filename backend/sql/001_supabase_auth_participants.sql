-- Jalankan satu kali di Supabase SQL Editor.
-- Menautkan satu baris participants dengan satu akun Supabase Auth.

ALTER TABLE public.participants
ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE
REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_participants_auth_user_id
ON public.participants(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_participant_role
ON public.interview_sessions(participant_id, role);

-- Tidak menghubungkan sesi lama yang participant_id-nya NULL secara otomatis.
-- Hubungkan data lama hanya setelah pemiliknya dapat diverifikasi.
