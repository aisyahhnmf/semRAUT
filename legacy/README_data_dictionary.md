# semRAUT dummy data & templates
Semua data di paket ini SINTETIS. Tidak berasal dari pengguna, bukan hasil STT aktual, bukan output LLM aktual, bukan prediksi CV, dan bukan hasil penelitian.

## Isi paket
- question_bank.csv: bank kompetensi awal untuk Data Analyst, Data Engineer, Data Scientist.
- interview_sessions.csv: 18 sesi sintetis.
- session_questions.csv: pertanyaan yang ditautkan ke sesi.
- answers.csv: contoh transkrip sintetis.
- rubric_definition.csv: rubrik terpadu 5 dimensi dan descriptor skor 0-4.
- rubric_scores.csv: skor sintetis untuk menguji pipeline dan dashboard.
- cv_observations_template.csv: template kosong karena fitur CV masih locked.
- intonation_features_template.csv: template kosong karena fitur intonasi masih locked.
- prompt_question_generator.txt: prompt awal generator pertanyaan adaptif.
- prompt_answer_evaluator.txt: prompt awal evaluator jawaban.
- analytics_starter.py: contoh awal analisis menggunakan pandas/matplotlib.

## Relasi
interview_sessions.session_id -> session_questions.session_id
session_questions.question_id -> answers.question_id
answers.answer_id -> rubric_scores.answer_id

## Formula skor berbobot
score_100 = sum(weight_percent * score_0_to_4) / (4 * sum(weight_percent))
Gunakan hanya untuk dimensi yang berlaku dan tersedia; jangan mengubah skor hilang menjadi nol.

## Wajib diperhatikan
- Bobot rubrik adalah rancangan awal dan belum divalidasi.
- Semua baris dummy ditandai is_synthetic=True.
- Jangan melaporkan hasil dummy sebagai temuan nyata atau akurasi model.
- Untuk evaluasi LLM, bandingkan dengan anotasi manusia dan sisihkan data evaluasi.
- Untuk clustering, periksa kecukupan data, ukuran cluster, noise, stabilitas, dan interpretabilitas.
- Batasi penyimpanan audio/video mentah, terapkan persetujuan, retensi, dan kontrol akses.
