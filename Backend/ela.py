from base64 import b64encode
from io import BytesIO
import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageStat


def analyze_ela(image_bytes: bytes, quality: int = 90) -> dict:
    """Creates an ELA heatmap and evaluates both global and localized compression anomalies."""
    try:
        original = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {
            "elaScore": 0.0,
            "tamperDetected": False,
            "heatmapDataUrl": "",
        }

    # 1. Recompress in memory at specified quality
    recompressed_buffer = BytesIO()
    original.save(recompressed_buffer, format="JPEG", quality=quality)
    recompressed_buffer.seek(0)
    recompressed = Image.open(recompressed_buffer).convert("RGB")

    # 2. Compute pixel difference
    difference = ImageChops.difference(original, recompressed)

    # 3. Dynamic contrast scaling for the visual heatmap
    extrema = difference.getextrema()
    max_diff = max(channel_max for _, channel_max in extrema)
    scale = 255.0 / max_diff if max_diff > 0 else 1.0
    
    # Cap excessive scale amplification on clean images to prevent pure visual noise
    scale = min(scale, 15.0)
    heatmap = ImageEnhance.Brightness(difference).enhance(scale)

    # 4. Statistical analysis: global mean + peak localized variance
    stat = ImageStat.Stat(difference)
    global_mean = round(sum(stat.mean) / 3, 2)

    # Convert difference to numpy array to detect localized tampering clusters
    diff_arr = np.array(difference, dtype=np.float32)
    gray_diff = np.mean(diff_arr, axis=2)
    
    # 98th percentile isolates localized modified text/photo patches from background noise
    local_peak = float(np.percentile(gray_diff, 98))

    # Flag if localized divergence or overall discrepancy is high
    tamper_detected = bool(local_peak >= 32.0 or global_mean >= 14.0)

    # 5. Export Heatmap to Data URL
    output = BytesIO()
    heatmap.save(output, format="PNG")
    heatmap_data_url = (
        "data:image/png;base64," + b64encode(output.getvalue()).decode("utf-8")
    )

    return {
        "elaScore": global_mean,
        "localAnomalyScore": round(local_peak, 2),
        "tamperDetected": tamper_detected,
        "heatmapDataUrl": heatmap_data_url,
    }