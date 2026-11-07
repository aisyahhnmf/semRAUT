import cv2
import torch
import torchvision.transforms as transforms
import timm
import json

# 1. Load mapping kelas
with open('class/class_mapping_headmotion.json', 'r') as f:
    data = json.load(f)
    class_names = data['class_names']

# 2. Setup device & load model
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = timm.create_model('efficientnet_b0', pretrained=False, num_classes=len(class_names))
model.load_state_dict(torch.load('models/efficientnet_b0_headmotion.pth', map_location=device))
model = model.to(device)
model.eval()

# 3. Definisikan transform (harus sama persis dengan saat training/test)
transform = transforms.Compose([
    transforms.ToPILImage(),
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# 4. Buka Webcam (0 adalah kamera bawaan laptop)
cap = cv2.VideoCapture(0)

print("[INFO] Membuka webcam. Tekan 'q' untuk keluar.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Konversi BGR (OpenCV) ke RGB
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Preprocessing tensor
    input_tensor = transform(rgb_frame).unsqueeze(0).to(device)

    # Prediksi model
    with torch.no_grad():
        outputs = model(input_tensor)
        probabilities = torch.nn.functional.softmax(outputs, dim=1)
        conf, pred = torch.max(probabilities, 1)
        
        class_id = pred.item()
        confidence = conf.item() * 100
        predicted_class = class_names[class_id]

    # Tampilkan teks hasil prediksi ke layar webcam
    text = f"{predicted_class} ({confidence:.2f}%)"
    cv2.putText(frame, text, (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2, cv2.LINE_AA)

    cv2.imshow('Head-Motion Detection - Webcam', frame)

    # Tekan 'q' untuk berhenti
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()