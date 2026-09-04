from base64 import b64encode
from io import BytesIO

from PIL import Image, ImageChops, ImageEnhance, ImageStat


def analyze_ela(image_bytes: bytes, quality: int = 90) -> dict:
    """Create an ELA heatmap and a simple compression-inconsistency score."""

    original = Image.open(BytesIO(image_bytes)).convert("RGB")

    recompressed_buffer = BytesIO()
    original.save(recompressed_buffer, format="JPEG", quality=quality)
    recompressed = Image.open(BytesIO(recompressed_buffer.getvalue())).convert("RGB")

    difference = ImageChops.difference(original, recompressed)

    extrema = difference.getextrema()
    max_difference = max(channel_max for _, channel_max in extrema)
    scale = 1 if max_difference == 0 else 255 / max_difference

    heatmap = ImageEnhance.Brightness(difference).enhance(scale)

    score = round(sum(ImageStat.Stat(difference).mean) / 3, 2)

    output = BytesIO()
    heatmap.save(output, format="PNG")
    heatmap_data_url = (
        "data:image/png;base64,"
        + b64encode(output.getvalue()).decode("utf-8")
    )

    return {
        "elaScore": score,
        "tamperDetected": score >= 12,
        "heatmapDataUrl": heatmap_data_url,
    }