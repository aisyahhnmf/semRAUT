
import cv2
import torch

from PIL import Image
from torchvision import transforms

from .model_loader import (
    facial_expression_model,
    FACIAL_EXPRESSION_CLASSES,
    DEVICE
)


# ==========================================
# FACE DETECTOR
# ==========================================

CASCADE_PATH = (
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

face_detector = cv2.CascadeClassifier(CASCADE_PATH)

if face_detector.empty():
    raise RuntimeError("Haar Cascade face detector gagal dimuat.")


# ==========================================
# PREPROCESSING
# ==========================================

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])


# ==========================================
# FACIAL EXPRESSION PREDICTION
# ==========================================

def predict_facial_expression(frame):

    if frame is None or frame.size == 0:
        return {
            "indicator_type": "facial_expression",
            "is_valid": False,
            "quality_flag": "invalid_frame",
            "predicted_label": None,
            "confidence": None,
            "probabilities": None
        }

    # Convert BGR to grayscale for face detection
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    faces = face_detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(50, 50)
    )

    # No face detected
    if len(faces) == 0:
        return {
            "indicator_type": "facial_expression",
            "is_valid": False,
            "quality_flag": "face_not_detected",
            "predicted_label": None,
            "confidence": None,
            "probabilities": None
        }

    # Select the largest detected face
    x, y, w, h = max(
        faces,
        key=lambda face: face[2] * face[3]
    )

    # Crop face
    face_crop = frame[y:y + h, x:x + w]

    if face_crop.size == 0:
        return {
            "indicator_type": "facial_expression",
            "is_valid": False,
            "quality_flag": "invalid_face_crop",
            "predicted_label": None,
            "confidence": None,
            "probabilities": None
        }

    # BGR to RGB
    face_rgb = cv2.cvtColor(
        face_crop,
        cv2.COLOR_BGR2RGB
    )

    # Convert to PIL and preprocess
    face_image = Image.fromarray(face_rgb)

    input_tensor = preprocess(face_image).unsqueeze(0)
    input_tensor = input_tensor.to(DEVICE)

    # Model inference
    with torch.inference_mode():

        outputs = facial_expression_model(input_tensor)

        probabilities = torch.softmax(outputs, dim=1)

        confidence, predicted_index = torch.max(
            probabilities,
            dim=1
        )

    predicted_index = predicted_index.item()
    confidence = confidence.item()

    probability_values = probabilities[0].cpu().tolist()

    probability_dict = {
        class_name: float(probability)
        for class_name, probability in zip(
            FACIAL_EXPRESSION_CLASSES,
            probability_values
        )
    }

    return {
        "indicator_type": "facial_expression",
        "is_valid": True,
        "quality_flag": None,
        "predicted_label": FACIAL_EXPRESSION_CLASSES[predicted_index],
        "confidence": float(confidence),
        "probabilities": probability_dict,
        "face_box": {
            "x": int(x),
            "y": int(y),
            "width": int(w),
            "height": int(h)
        }
    }
