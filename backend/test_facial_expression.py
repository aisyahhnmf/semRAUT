
import cv2

from app.services.cv.facial_expression import predict_facial_expression


def main():

    camera = cv2.VideoCapture(0)

    if not camera.isOpened():
        print("[ERROR] Webcam tidak dapat dibuka.")
        return

    print("[INFO] Facial expression testing dimulai.")
    print("[INFO] Tekan Q untuk keluar.")

    while True:

        ret, frame = camera.read()

        if not ret:
            print("[ERROR] Gagal membaca frame.")
            break

        result = predict_facial_expression(frame)

        if result["is_valid"]:

            label = result["predicted_label"]
            confidence = result["confidence"]

            text = f"{label}: {confidence * 100:.2f}%"

            box = result["face_box"]

            x = box["x"]
            y = box["y"]
            w = box["width"]
            h = box["height"]

            cv2.rectangle(
                frame,
                (x, y),
                (x + w, y + h),
                (0, 255, 0),
                2
            )

            cv2.putText(
                frame,
                text,
                (x, max(y - 10, 20)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2
            )

        else:

            cv2.putText(
                frame,
                "Face not detected",
                (20, 40),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 255),
                2
            )

        cv2.imshow("semRAUT - Facial Expression", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    camera.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
