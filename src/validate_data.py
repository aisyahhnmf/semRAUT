"""Validasi skema dan kualitas dasar data observasi semRAUT."""
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "data" / "dummy" / "cv_observations_dummy.csv"
df = pd.read_csv(PATH)
errors=[]
required=["observation_id","session_id","timestamp_seconds","indicator_type",
          "value_label","confidence","model_version","quality_flag","is_synthetic"]
for c in required:
    if c not in df.columns: errors.append(f"Kolom wajib hilang: {c}")
if not errors:
    if df.observation_id.isna().any(): errors.append("observation_id kosong")
    if df.observation_id.duplicated().any(): errors.append("observation_id duplikat")
    if df.session_id.isna().any(): errors.append("session_id kosong")
    if (df.timestamp_seconds.dropna()<0).any(): errors.append("timestamp_seconds negatif")
    if ((df.confidence.dropna()<0)|(df.confidence.dropna()>1)).any(): errors.append("confidence di luar 0-1")
    if not df.is_synthetic.fillna(False).astype(bool).all(): errors.append("Ada baris yang tidak ditandai sintetis")
    allowed={"facial_expression","eye_direction","head_motion"}
    if not set(df.indicator_type.dropna()).issubset(allowed): errors.append("indicator_type tidak dikenal")
    if df[["indicator_type","value_label"]].isna().any().any(): errors.append("indikator/label kosong")
    valid_labels={
        "facial_expression":{"neutral","happy","sad","angry","surprise","fear","disgust"},
        "eye_direction":{"center","left","right","up","down"},
        "head_motion":{"forward","left","right","up","down"}
    }
    for typ, part in df.groupby("indicator_type"):
        bad=set(part.value_label.dropna())-valid_labels.get(typ,set())
        if bad: errors.append(f"Label tidak valid untuk {typ}: {sorted(bad)}")
if errors:
    print("VALIDASI GAGAL:")
    for e in errors: print("-",e)
    raise SystemExit(1)
print(f"VALIDASI LULUS: {len(df)} baris; {df.session_id.nunique()} sesi.")
print("Catatan: lolos validasi skema bukan berarti prediksi model valid secara ilmiah.")
