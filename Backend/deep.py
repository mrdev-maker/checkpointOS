from deepface import DeepFace
import matplotlib.pyplot as plt
import cv2
backends= ["opencv", "ssd", "dlib", "mtcnn", "retinaface", "mediapipe"]
Deepface = DeepFace.extract_faces("Images/1000115871.jpg", detector_backend='opencv')
face_img = Deepface[0]["face"]
resized_face = cv2.resize(face_img, (224, 224))
#plt.imshow(resized_face)
#plt.show()
cap = cv2.VideoCapture(0)

print("Look at the camera and press 'SPACE' to capture your face...")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Show the live feed
    cv2.imshow("Checkpoint Camera - Press SPACE to Verify", frame)

    # Wait for the user to hit SPACE (key code 32)
    key = cv2.waitKey(1)
    if key == 32:
        cv2.imwrite("Images/live_webcam_photo.jpg", frame)
        break

# 2. Run the Verification
# DeepFace automatically finds the face, crops it, and runs the AI model
result = DeepFace.verify(
    img1_path = "Images/Dev.jpeg", 
    img2_path = "Images/live_webcam_photo.jpg", 
    model_name = "ArcFace",          # ArcFace is the industry standard for SIH-level accuracy
    detector_backend = "opencv", 
    distance_metric = "cosine",        # The backend you just proved works!
    enforce_detection = True         # Throws an error if no face is found
)

# 3. Output the Results for your SIH Dashboard
print(f"Are they the same person? {result['verified']}")
print(f"Mathematical Distance: {result['distance']}")
print(f"Strict Rejection Threshold: {result['threshold']}")