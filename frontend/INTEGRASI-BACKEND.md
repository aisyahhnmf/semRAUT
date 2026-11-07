# Integrasi frontend semRAUT dengan backend

Frontend ini sudah dikonfigurasi untuk memakai FastAPI, bukan mock.

1. Jalankan backend FastAPI pada `http://127.0.0.1:8000`.
2. Pastikan backend menyediakan `GET /api/roles` yang membaca `question_bank` Supabase.
3. Jalankan folder `web` melalui VS Code Live Server (misalnya `http://127.0.0.1:5500`).
4. Buka halaman pilih posisi. Daftar posisi dan pertanyaan akan dimuat dari API.

`web/data/roles.json` masih disimpan sebagai arsip data demo, tetapi tidak lagi digunakan oleh `core/data.js`.
