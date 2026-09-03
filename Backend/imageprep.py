# 
import cv2
import numpy as np
import os

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def four_point_transform(image, pts):
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped
def extract_universal_mrz(input_source):
    """
    Accepts either an image path (str) or a pre-loaded BGR image (np.ndarray).
    Returns a cleaned, normalized binary NumPy array of the MRZ region.
    """
    if isinstance(input_source, str):
        if not os.path.exists(input_source):
            raise FileNotFoundError(f"File '{input_source}' not found.")
        image = cv2.imread(input_source)
        if image is None:
            raise ValueError(f"Could not decode image at '{input_source}'.")
    elif isinstance(input_source, np.ndarray):
        image = input_source.copy()
    else:
        raise TypeError("Input must be a valid file path string or numpy ndarray.")
# def extract_universal_mrz(image_path):
#     if not os.path.exists(image_path):
#         return f"Error: File '{image_path}' not found."
        
#     image = cv2.imread(image_path)
#     if image is None:
#         return f"Error: OpenCV could not read '{image_path}'. Check file format."
    
    orig = image.copy()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 75, 200)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    
    document_contour = None
    image_area = image.shape[0] * image.shape[1]

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4 and cv2.contourArea(c) > (image_area * 0.2):
            document_contour = approx
            break

    if document_contour is not None:
        flat_document = four_point_transform(orig, document_contour.reshape(4, 2))
    else:
        flat_document = orig.copy()

    # 5. Extract MRZ Zone (Strictly bottom 20% to avoid portrait interference)
    gray_flat = cv2.cvtColor(flat_document, cv2.COLOR_BGR2GRAY)
    h, w = gray_flat.shape
    mrz_region = gray_flat[int(h * 0.80):h, 0:w]

    # 6. Dynamic Resolution Scaling (The Universal Fix)
    # OCR engines perform best when text height is uniform (~40px per character).
    # We force the entire MRZ block to be exactly 200 pixels tall regardless of the input.
    mrz_h, mrz_w = mrz_region.shape
    scale_factor = 200.0 / float(mrz_h)
    target_width = int(mrz_w * scale_factor)
    
    optimized_mrz = cv2.resize(mrz_region, (target_width, 200), interpolation=cv2.INTER_CUBIC)

    # 7. Otsu's Thresholding
    _, clean_mrz = cv2.threshold(optimized_mrz, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    # cv2.imshow(f"Output: {image_path}", clean_mrz)
    # cv2.waitKey(0)
    # cv2.destroyAllWindows()
    
    return clean_mrz
if __name__ == "__main__":
    test_img = "passport.webp"
    if os.path.exists(test_img):
        result = extract_universal_mrz(test_img)
        cv2.imshow("Test MRZ Output", result)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

# Execute the pipeline on both formats
# mrz_low_res = extract_universal_mrz("passport1.jpg")
# mrz_high_res = extract_universal_mrz("passport.webp")  
# from datetime import datetime

# # Example MRZ Line 2 from your Taiwan Passport screenshot
# mrz_line_2 = "8888008505TWN8801018F1812291<<<<<<<<<<<<<<00"

# # 1. Extract the Raw Strings (YYMMDD)
# raw_dob = mrz_line_2[13:19]       # '880101'
# raw_expiry = mrz_line_2[21:27]    # '181229'

# # 2. Convert to Readable Date Formats
# # Note: '181229' becomes Year: 2018, Month: 12, Day: 29
# formatted_dob = datetime.strptime(raw_dob, "%y%m%d").strftime("%Y-%m-%d")
# formatted_expiry = datetime.strptime(raw_expiry, "%y%m%d").strftime("%Y-%m-%d")

# # 3. Check if the Passport is Expired
# current_date = datetime.now()
# expiry_date_obj = datetime.strptime(raw_expiry, "%y%m%d")

# is_expired = current_date > expiry_date_obj

# print(f"DOB: {formatted_dob}")
# print(f"Expiry: {formatted_expiry}")
# print(f"Is Passport Expired?: {is_expired}")
#mrz_high_res = extract_universal_mrz("passport.webp")