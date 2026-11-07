
from pathlib import Path
import json

import torch
import timm
from torch import nn
from torchvision.models import efficientnet_b0


# ==========================================
# PATH CONFIGURATION
# ==========================================

PROJECT_ROOT = Path(__file__).resolve().parents[4]

MODEL_DIR = (
    PROJECT_ROOT
    / "modeling"
    / "semRAUT-dea_modeling"
    / "testing model with camera"
)

# Head Motion
MODEL_PATH = MODEL_DIR / "models" / "efficientnet_b0_headmotion.pth"
CLASS_MAPPING_PATH = MODEL_DIR / "class" / "class_mapping_headmotion.json"

# Eye Tracking
EYE_TRACKING_MODEL_PATH = (
    MODEL_DIR / "models" / "efficientnet_b0_best_eyes_tracking.pth"
)

# Facial Expression
FACIAL_EXPRESSION_MODEL_PATH = (
    MODEL_DIR / "models" / "tf_efficientnetv2_s_rafdb_expression.pth"
)


# ==========================================
# DEVICE
# ==========================================

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ==========================================
# HEAD MOTION MODEL
# ==========================================

def load_head_motion_model():

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model head motion tidak ditemukan: {MODEL_PATH}"
        )

    if not CLASS_MAPPING_PATH.exists():
        raise FileNotFoundError(
            f"Class mapping tidak ditemukan: {CLASS_MAPPING_PATH}"
        )

    with open(CLASS_MAPPING_PATH, "r", encoding="utf-8") as file:
        data = json.load(file)

    class_names = data["class_names"]

    model = timm.create_model(
        "efficientnet_b0",
        pretrained=False,
        num_classes=len(class_names)
    )

    state_dict = torch.load(
        MODEL_PATH,
        map_location=DEVICE,
        weights_only=True
    )

    model.load_state_dict(state_dict, strict=True)

    model = model.to(DEVICE)
    model.eval()

    print("[INFO] Head motion model berhasil dimuat.")

    return model, class_names


head_motion_model, head_motion_classes = load_head_motion_model()


# ==========================================
# EYE TRACKING MODEL
# ==========================================

def load_eye_tracking_model():

    if not EYE_TRACKING_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Eye tracking model tidak ditemukan: {EYE_TRACKING_MODEL_PATH}"
        )

    model = efficientnet_b0(weights=None)

    model.classifier[1] = nn.Linear(
        model.classifier[1].in_features,
        5
    )

    state_dict = torch.load(
        EYE_TRACKING_MODEL_PATH,
        map_location=DEVICE,
        weights_only=True
    )

    model.load_state_dict(state_dict, strict=True)

    model = model.to(DEVICE)
    model.eval()

    print("[INFO] Eye tracking model berhasil dimuat.")

    return model


eye_tracking_model = load_eye_tracking_model()


# ==========================================
# FACIAL EXPRESSION MODEL
# ==========================================

FACIAL_EXPRESSION_CLASSES = [
    "surprise",
    "fear",
    "disgust",
    "happy",
    "sad",
    "angry",
    "neutral"
]


def load_facial_expression_model():

    if not FACIAL_EXPRESSION_MODEL_PATH.exists():
        raise FileNotFoundError(
            "Model facial expression tidak ditemukan: "
            f"{FACIAL_EXPRESSION_MODEL_PATH}"
        )

    model = timm.create_model(
        "tf_efficientnetv2_s",
        pretrained=False,
        num_classes=len(FACIAL_EXPRESSION_CLASSES)
    )

    state_dict = torch.load(
        FACIAL_EXPRESSION_MODEL_PATH,
        map_location=DEVICE,
        weights_only=True
    )

    model.load_state_dict(state_dict, strict=True)

    model = model.to(DEVICE)
    model.eval()

    print("[INFO] Facial expression model berhasil dimuat.")

    return model


facial_expression_model = load_facial_expression_model()
