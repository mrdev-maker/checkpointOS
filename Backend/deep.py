from deepface import DeepFace
import cv2
import numpy as np

def verify_faces(doc_image_array, live_image_array):
    """
    Receives two OpenCV image arrays from main.py, compares them, 
    and returns the verification results.
    """
    try:
        # DeepFace automatically finds the face, crops it, and runs the ArcFace model
        result = DeepFace.verify(
            img1_path = doc_image_array,      # Accepts NumPy array instead of file path
            img2_path = live_image_array,     # Accepts NumPy array instead of file path
            model_name = "ArcFace",           
            detector_backend = "opencv", 
            distance_metric = "cosine",        
            enforce_detection = True          # Throws an error if no face is found
        )
        
        # Output the Results for your SIH Dashboard via FastAPI
        return {
            "verified": result['verified'],
            "distance": result['distance'],
            "threshold": result['threshold']
        }
        
    except ValueError:
        # Handles cases where enforce_detection triggers because a face wasn't found
        return {"verified": False, "distance": 1.0, "threshold": 0.0}

# Private testing block that remains invisible to main.py
if __name__ == "__main__":
    test_doc = "Images/Dev.jpeg"
    test_live = "Images/live_webcam_photo.jpg"
    
    # Simulate the backend passing arrays in memory
    doc_array = cv2.imread(test_doc)
    live_array = cv2.imread(test_live)
    
    if doc_array is not None and live_array is not None:
        output = verify_faces(doc_array, live_array)
        print(f"Are they the same person? {output['verified']}")
        print(f"Mathematical Distance: {output['distance']}")
        print(f"Strict Rejection Threshold: {output['threshold']}")