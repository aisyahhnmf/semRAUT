
import cv2
import torch

from torchvision import transforms

from .model_loader import (
    head_motion_model,
    head_motion_classes,
    DEVICE,
)


# ==========================================
# IMAGE PREPROCESSING
# ==========================================

transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        [0.485, 0.456, 0.406],
        [0.229, 0.224, 0.225]
    )
])


# ==========================================
# HEAD MOTION PREDICTION
# ==========================================

def predict_head_motion(frame):
    """
    Memprediksi arah gerakan kepala dari satu frame gambar.

    Args:
        frame: Gambar format OpenCV (BGR).

    Returns:
        Dictionary berisi label prediksi,
        confidence, dan probabilitas setiap kelas.
    """

    if frame is None:
        raise ValueError("Frame gambar tidak boleh kosong.")

    # Convert BGR to RGB
    rgb_frame = cv2.cvtColor(
        frame,
        cv2.COLOR_BGR2RGB
    )

    # Preprocessing
    input_tensor = transform(rgb_frame)
    input_tensor = input_tensor.unsqueeze(0).to(DEVICE)

    # Model inference
    with torch.inference_mode():
        outputs = head_motion_model(input_tensor)

        probabilities = torch.softmax(
            outputs,
            dim=1
        )

        confidence, prediction = torch.max(
            probabilities,
            dim=1
        )

    class_id = prediction.item()

    predicted_label = head_motion_classes[class_id]
    confidence_score = confidence.item()

    class_probabilities = {
        label: round(probability.item(), 4)
        for label, probability in zip(
            head_motion_classes,
            probabilities[0]
        )
    }

    return {
        "indicator_type": "head_motion",
        "predicted_label": predicted_label,
        "confidence": round(confidence_score, 4),
        "probabilities": class_probabilities
    }
