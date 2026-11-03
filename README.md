# semRAUT — Data Dummy & Starter Analitika

Paket ini disiapkan sebagai fondasi repositori **semRAUT: Sistem Monitoring dan Analisis Pola Ekspresi Wajah**. Fokus analitika adalah pengolahan observasi ekspresi wajah, arah mata, dan gerakan kepala.

> **PENTING:** seluruh isi `data/dummy/` adalah data sintetis untuk menguji pipeline. Bukan rekaman manusia, bukan anotasi ground truth, bukan keluaran model CV sungguhan, dan bukan bukti performa sistem.

## Struktur

```text
.
├── data/
│   ├── dummy/
│   │   └── cv_observations_dummy.csv
│   └── templates/
│       ├── cv_observations_template.csv
│       └── intonation_features_template.csv
├── docs/
│   └── data_dictionary.md
├── legacy/
│   └── aset simulasi wawancara versi awal
├── reports/
│   └── figures/
├── src/
│   ├── analytics.py
│   └── validate_data.py
├── .gitignore
└── requirements.txt
```

## Menjalankan

Disarankan Python 3.10 atau lebih baru.

```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
python src/validate_data.py
python src/analytics.py
```

Ringkasan CSV dan grafik akan dibuat di folder `reports/`.

## Analisis yang disediakan

- Exploratory Data Analysis: jumlah baris, sesi, distribusi indikator, missingness.
- Statistik deskriptif: distribusi label dan statistik confidence.
- Pemeriksaan kualitas: status observasi `valid`, `low_confidence`, dan `no_detection`.
- Analisis temporal sederhana: frekuensi label per interval 10 detik.
- Visualisasi distribusi label dan confidence.

## Batas interpretasi

- Confidence adalah skor keyakinan keluaran model dalam skema contoh; bukan probabilitas terkalibrasi atau ukuran kebenaran.
- Label ekspresi, arah mata, dan gerakan kepala hanya indikator observasional. Jangan menyimpulkan kejujuran, kepribadian, kondisi psikologis, atau kelayakan seseorang dari indikator tersebut.
- Accuracy, precision, recall, F1, dan confusion matrix belum dihitung karena paket dummy ini tidak menyertakan ground truth.
- HDBSCAN belum dijalankan. Clustering hanya dipertimbangkan setelah tersedia data numerik yang memadai dan lolos pemeriksaan kualitas.
- Data sintetis tidak boleh disajikan sebagai hasil eksperimen atau hasil sistem aktual.

## Aset versi awal

Folder `legacy/` mempertahankan file simulasi wawancara, pertanyaan, transkrip sintetis, dan rubrik dari paket sebelumnya agar tidak hilang. Aset tersebut bukan dataset utama analitika observasi visual semRAUT. Template CV dan intonasi berada di `data/templates/`.

## Dataset eksternal

Dataset RAF-DB, eye-tracking, dan head-motion yang digunakan dalam pengembangan harus dikelola terpisah sesuai syarat lisensi masing-masing. Jangan mengunggah ulang dataset mentah ke repositori tanpa memastikan izin redistribusi dan atribusi.
