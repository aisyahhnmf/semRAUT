# Data Dictionary — semRAUT

## `data/dummy/cv_observations_dummy.csv`

Seluruh baris adalah **data sintetis** yang dibuat untuk menguji alur validasi dan analitika.

| Kolom | Tipe | Definisi | Contoh |
|---|---|---|---|
| `observation_id` | string | ID unik satu observasi indikator | S001_001_facial_expression |
| `session_id` | string | ID sesi simulasi | S001 |
| `timestamp_seconds` | float | Detik sejak awal sesi | 3.0 |
| `indicator_type` | kategori | Jenis indikator observasi | facial_expression |
| `value_numeric` | float/null | Nilai numerik bila indikator memerlukannya; kosong pada data kategori ini | null |
| `value_label` | kategori | Label keluaran sintetis | neutral |
| `confidence` | float | Confidence mock dalam rentang 0–1 | 0.87 |
| `model_version` | string | Identitas versi model simulasi | mock-v1 |
| `quality_flag` | kategori | Status kualitas observasi | valid |
| `is_synthetic` | boolean | Penanda data sintetis | True |

### Kategori `indicator_type` dan `value_label`

- `facial_expression`: `neutral`, `happy`, `sad`, `angry`, `surprise`, `fear`, `disgust`.
- `eye_direction`: `center`, `left`, `right`, `up`, `down`.
- `head_motion`: `forward`, `left`, `right`, `up`, `down`.

Kategori tersebut adalah label contoh. Standarisasi akhir harus mengikuti label yang benar-benar dihasilkan model/dataset yang digunakan.

### `quality_flag`

- `valid`: observasi dapat dipakai dalam ringkasan contoh.
- `low_confidence`: observasi terdeteksi tetapi confidence rendah.
- `no_detection`: tidak ada deteksi yang memadai.

Nilai ambang confidence belum ditetapkan secara ilmiah pada paket ini.

## Template

- `data/templates/cv_observations_template.csv`: skema awal observasi CV.
- `data/templates/intonation_features_template.csv`: skema awal fitur intonasi; belum berisi data.

## Aset `legacy/`

File wawancara, pertanyaan, jawaban sintetis, dan rubrik dipertahankan dari paket terdahulu. Definisi kolomnya dapat dilihat pada `legacy/README_data_dictionary.md`. Jangan mencampurkan skor rubrik dengan observasi CV tanpa rancangan analisis dan relasi yang jelas.
