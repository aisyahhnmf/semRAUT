
import cv2

from app.services.cv.eye_tracking import predict_eye_tracking


camera = cv2.VideoCapture(0)

if not camera.isOpened():
    raise RuntimeError("Webcam tidak dapat dibuka.")

print("[INFO] Eye tracking testing dimulai. Tekan Q untuk keluar.")

while True:

    success, frame = camera.read()

    if not success:
        print("[ERROR] Gagal membaca frame.")
        break

    result = predict_eye_tracking(frame)

    if result["is_valid"]:
        label = result["predicted_label"]
        confidence = result["confidence"] * 100

        text = f"{label.upper()} ({confidence:.2f}%)"
    else:
        text = "Eye not detected"

    cv2.putText(
        frame,
        text,
        (30, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (0, 255, 0),
        2,
        cv2.LINE_AA
    )

    cv2.imshow(
        "semRAUT - Eye Tracking Testing",
        frame
    )

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

camera.release()
cv2.destroyAllWindows()
