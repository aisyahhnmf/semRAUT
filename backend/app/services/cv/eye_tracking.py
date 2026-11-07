
import cv2
import torch

from PIL import Image
from torchvision import transforms

from .model_loader import (
    eye_tracking_model,
    DEVICE,
)


# ==========================================
# CLASS LABELS
# ==========================================

EYE_TRACKING_CLASSES = [
    "center",
    "down",
    "left",
    "right",
    "up"
]


# ==========================================
# EYE DETECTION
# ==========================================

eye_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_eye.xml"
)


# ==========================================
# IMAGE PREPROCESSING
# ==========================================

predict_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])


# ==========================================
# EYE TRACKING PREDICTION
# ==========================================

def predict_eye_tracking(frame):

    if frame is None:
        raise ValueError("Frame gambar tidak boleh kosong.")

    # Convert BGR to grayscale
    gray = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2GRAY
    )

    # Detect eyes
    eyes = eye_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30)
    )

    if len(eyes) == 0:
        return {
            "indicator_type": "eye_tracking",
            "predicted_label": None,
            "confidence": None,
            "is_valid": False,
            "quality_flag": "eye_not_detected"
        }

    # Select the first detected eye,
    # following the teammate's original implementation
    ex, ey, ew, eh = eyes[0]

    eye_crop = frame[
        ey:ey + eh,
        ex:ex + ew
    ]

    # Convert BGR to RGB
    eye_image = Image.fromarray(
        cv2.cvtColor(
            eye_crop,
            cv2.COLOR_BGR2RGB
        )
    )

    # Preprocessing
    input_tensor = predict_transform(
        eye_image
    ).unsqueeze(0).to(DEVICE)

    # Model inference
    with torch.inference_mode():

        outputs = eye_tracking_model(
            input_tensor
        )

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, prediction = torch.max(
            probabilities,
            dim=1
        )

    class_id = prediction.item()

    predicted_label = EYE_TRACKING_CLASSES[class_id]
    confidence_score = confidence.item()

    return {
        "indicator_type": "eye_tracking",
        "predicted_label": predicted_label,
        "confidence": round(confidence_score, 4),
        "is_valid": True,
        "quality_flag": None
    }
