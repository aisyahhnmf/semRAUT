"""Analitika data observasi semRAUT. Semua input contoh pada data/dummy bersifat sintetis."""
from pathlib import Path
import pandas as pd
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "dummy" / "cv_observations_dummy.csv"
OUT = ROOT / "reports" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(DATA)
required = {"observation_id","session_id","timestamp_seconds","indicator_type",
            "value_label","confidence","model_version","quality_flag","is_synthetic"}
missing_cols = required - set(df.columns)
if missing_cols:
    raise ValueError(f"Kolom wajib tidak ditemukan: {sorted(missing_cols)}")

print("=== RINGKASAN DATA ===")
print(f"Baris observasi: {len(df)}")
print(f"Sesi unik: {df.session_id.nunique()}")
print("Distribusi indikator:")
print(df.indicator_type.value_counts(dropna=False))
print("\\nMissing value:")
print(df.isna().mean().sort_values(ascending=False))

print("\\n=== DISTRIBUSI LABEL ===")
label_counts = (df.groupby(["indicator_type","value_label"], dropna=False)
                  .size().rename("count").reset_index())
print(label_counts.to_string(index=False))
label_counts.to_csv(ROOT / "reports" / "label_distribution.csv", index=False)

print("\\n=== KUALITAS DATA ===")
quality = df.groupby(["indicator_type","quality_flag"]).size().rename("count").reset_index()
print(quality.to_string(index=False))
quality.to_csv(ROOT / "reports" / "quality_summary.csv", index=False)

print("\\n=== CONFIDENCE ===")
conf = df.groupby("indicator_type").confidence.agg(["count","mean","median","std","min","max"])
print(conf.round(3))
conf.to_csv(ROOT / "reports" / "confidence_summary.csv")

# Label distribution chart per indicator
for indicator, part in df.groupby("indicator_type"):
    counts = part.value_label.value_counts().sort_values(ascending=False)
    ax = counts.plot(kind="bar", figsize=(8,4), title=f"SYNTHETIC DEMO — {indicator}")
    ax.set_xlabel("Predicted label (synthetic)")
    ax.set_ylabel("Observation count")
    plt.tight_layout()
    plt.savefig(OUT / f"{indicator}_distribution.png", dpi=150)
    plt.close()

# Confidence chart
ax = df.boxplot(column="confidence", by="indicator_type", figsize=(8,4))
plt.suptitle("SYNTHETIC DEMO — Confidence by indicator")
plt.title("")
plt.ylabel("Confidence")
plt.tight_layout()
plt.savefig(OUT / "confidence_by_indicator.png", dpi=150)
plt.close()

# Simple temporal profile: label frequencies by 10-second bins
valid = df[df.quality_flag.eq("valid")].copy()
valid["time_bin_10s"] = (valid.timestamp_seconds // 10 * 10).astype(int)
temporal = (valid.groupby(["indicator_type","time_bin_10s","value_label"])
                 .size().rename("count").reset_index())
temporal.to_csv(ROOT / "reports" / "temporal_label_counts.csv", index=False)
print("\\nFile ringkasan dan grafik tersimpan di reports/.")

print("\\nCATATAN: seluruh data merupakan data sintetis. Confidence mock bukan performa model.")
