import re
import requests
from fastapi import HTTPException
from pydantic import BaseModel

# Configuration for OCR.space engine
OCR_SPACE_API_KEY = "K83274496588957"
OCR_SPACE_URL = "https://api.ocr.space/parse/image"
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1 MB API limit


class ExtractedFields(BaseModel):
    surname: str | None = None
    given_names: str | None = None
    name: str | None = None
    date_of_birth: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    passport_number: str | None = None
    nationality: str | None = None
    gender: str | None = None
    place_of_birth: str | None = None
    place_of_issue: str | None = None


def call_ocr_space(file_bytes: bytes, filename: str) -> str:
    response = requests.post(
        OCR_SPACE_URL,
        files={"file": (filename, file_bytes)},
        data={
            "apikey": OCR_SPACE_API_KEY,
            "language": "eng",
            "OCREngine": 2,
            "scale": True,
            "detectOrientation": True,
        },
        timeout=30,
    )
    result = response.json()

    if result.get("IsErroredOnProcessing"):
        raise HTTPException(
            status_code=502,
            detail=f"OCR.space error: {result.get('ErrorMessage')}",
        )

    parsed_results = result.get("ParsedResults")
    if not parsed_results:
        raise HTTPException(status_code=422, detail="No text detected in image")

    return parsed_results[0]["ParsedText"]


def find_label_index(lines: list[str], keywords: list[str]) -> int | None:
    for i, line in enumerate(lines):
        lower = line.lower()
        if any(kw in lower for kw in keywords):
            return i
    return None


def extract_value_after_label(
    lines: list[str], label_idx: int, lookahead: int = 2
) -> str | None:
    junk_words = {
        "REPUBLIC",
        "INDIA",
        "INDIAN",
        "GOVERNMENT",
        "PASSPORT",
        "MINISTRY",
        "AFFAIRS",
        "AUTHORITY",
    }
    for offset in range(0, lookahead + 1):
        idx = label_idx + offset
        if idx >= len(lines):
            break
        candidate = lines[idx]
        matches = re.findall(r"[A-Z]{3,}(?:[\s,]+[A-Z]{3,})*", candidate)
        matches = [m.strip() for m in matches if m.strip() not in junk_words]
        if matches:
            return max(matches, key=len)
    return None


def extract_fields(raw_text: str) -> ExtractedFields:
    lines = [l.strip() for l in raw_text.split("\n") if l.strip()]
    full_text = "\n".join(lines)

    date_pattern = r"\b(\d{2}[/.\-]\d{2}[/.\-]\d{4})\b"
    dates_found = re.findall(date_pattern, full_text)
    dob, issue, expiry = None, None, None
    if len(dates_found) == 1:
        dob = dates_found[0]
    elif len(dates_found) == 2:
        dob, expiry = dates_found
    elif len(dates_found) >= 3:
        dob, issue, expiry = dates_found[0], dates_found[1], dates_found[-1]

    passport_number = None
    doc_match = re.search(r"\b[A-Z]{1,2}[0-9]{6,9}\b", full_text)
    if doc_match:
        passport_number = doc_match.group()

    nationality = None
    nat_match = re.search(r"\b(IND|USA|GBR|CAN|AUS|PAK|CHN|NPL|BGD)\b", full_text)
    if nat_match:
        nationality = nat_match.group()
    elif re.search(r"\bINDIAN\b", full_text, re.IGNORECASE):
        nationality = "IND"

    gender = None
    gender_match = re.search(r"\bSex\b\D{0,5}([MF])\b", full_text, re.IGNORECASE)
    if gender_match:
        gender = gender_match.group(1).upper()
    else:
        loose = re.search(r"(?<![A-Z])[MF](?![A-Z])", full_text)
        if loose:
            gender = loose.group()

    surname = None
    surname_idx = find_label_index(lines, ["surname", "sumame", "sur name"])
    if surname_idx is not None:
        surname = extract_value_after_label(lines, surname_idx)

    given_names = None
    given_idx = find_label_index(lines, ["given nam", "given name"])
    if given_idx is not None:
        given_names = extract_value_after_label(lines, given_idx)

    full_name = f"{surname or ''} {given_names or ''}".strip() or None

    place_of_birth = None
    pob_idx = find_label_index(lines, ["place of birth"])
    if pob_idx is not None:
        place_of_birth = extract_value_after_label(lines, pob_idx)

    place_of_issue = None
    poi_idx = find_label_index(lines, ["place of issue"])
    if poi_idx is not None:
        place_of_issue = extract_value_after_label(lines, poi_idx)

    return ExtractedFields(
        surname=surname,
        given_names=given_names,
        name=full_name,
        date_of_birth=dob,
        issue_date=issue,
        expiry_date=expiry,
        passport_number=passport_number,
        nationality=nationality,
        gender=gender,
        place_of_birth=place_of_birth,
        place_of_issue=place_of_issue,
    )


def parse_mrz_lines(raw_text: str) -> dict:
    lines = [
        re.sub(r"[^A-Z0-9<]", "", line.upper())
        for line in raw_text.split("\n")
        if len(re.sub(r"[^A-Z0-9<]", "", line)) >= 30
    ]

    mrz_data = {"passport_number": None, "dob": None, "nationality": None}
    for line in lines:
        if len(line) == 44:
            if line.startswith("P"):
                mrz_data["nationality"] = line[2:5].replace("<", "")
            else:
                mrz_data["passport_number"] = line[0:9].replace("<", "")
                mrz_data["dob"] = line[13:19]
    return mrz_data