
import cv2

from app.services.cv.head_motion import predict_head_motion


# Membuka webcam
camera = cv2.VideoCapture(0)

if not camera.isOpened():
    raise RuntimeError("Webcam tidak dapat dibuka.")

print("[INFO] Head motion testing dimulai. Tekan Q untuk keluar.")

while True:
    success, frame = camera.read()

    if not success:
        print("[ERROR] Gagal membaca frame.")
        break

    # Prediksi head motion
    result = predict_head_motion(frame)

    label = result["predicted_label"]
    confidence = result["confidence"] * 100

    text = f"{label} ({confidence:.2f}%)"

    cv2.putText(
        frame,
        text,
        (30, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (0, 255, 0),
        2,
        cv2.LINE_AA
    )

    cv2.imshow("semRAUT - Head Motion Testing", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()
