"""Starter analitika semRAUT; jalankan di folder yang berisi CSV. Data sintetis saja."""
import pandas as pd
import matplotlib.pyplot as plt

sessions = pd.read_csv("interview_sessions.csv")
answers = pd.read_csv("answers.csv")
scores = pd.read_csv("rubric_scores.csv")

print("Jumlah sesi:", len(sessions))
print("Jumlah jawaban:", len(answers))
print("Jumlah baris skor:", len(scores))
print("\nMissingness:")
print(scores.isna().mean().sort_values(ascending=False))

summary = scores.groupby(["role","criterion_id"])["score_0_to_4"].mean().reset_index()
print(summary)
pivot = summary.pivot(index="criterion_id", columns="role", values="score_0_to_4")
pivot.plot(kind="bar")
plt.title("SYNTHETIC DEMO ONLY - Mean score by role and criterion")
plt.ylabel("Synthetic mean score (0-4)")
plt.tight_layout()
plt.show()

scores["weighted_points"] = scores["score_0_to_4"] * scores["weight_percent"]
per_answer = scores.groupby(["session_id","question_id"]).agg(
    weighted_points=("weighted_points","sum"), total_weight=("weight_percent","sum")).reset_index()
per_answer["score_100"] = per_answer["weighted_points"]/(4*per_answer["total_weight"])*100
print(per_answer.head())

# HDBSCAN opsional hanya setelah fitur numerik tervalidasi dan data cukup:
# from sklearn.preprocessing import StandardScaler
# import hdbscan
# X = StandardScaler().fit_transform(session_level_features)
# labels = hdbscan.HDBSCAN(min_cluster_size=5, min_samples=3).fit_predict(X)
# Evaluasi noise proportion, stabilitas, dan interpretabilitas sebelum menyimpulkan.
