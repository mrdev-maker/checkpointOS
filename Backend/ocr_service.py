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
        return ""

    raw_text = parsed_results[0].get("ParsedText", "")
    return raw_text


def parse_mrz_lines(raw_text: str) -> dict:
    mrz_data = {
        "passport_number": None,
        "dob": None,
        "nationality": None,
        "surname": None,
        "given_name": None,
        "full_name": None,
    }

    raw_lines = [l.strip().replace(" ", "") for l in raw_text.splitlines() if l.strip()]

    line1 = None
    line2 = None

    for line in raw_lines:
        clean = re.sub(r"[^A-Z0-9<]", "", line.upper())
        if clean.startswith("P<") or (len(clean) >= 35 and "<" in clean and "IND" in clean):
            line1 = clean
        elif len(clean) >= 35 and re.search(r"^[A-Z0-9]{8,10}", clean):
            line2 = clean

    # Parse Line 1: P<INDTHAPLIYAL<<GARIMA<<<<<<<<<<<<<<<<<<<<<
    if line1:
        try:
            name_portion = line1[5:] if line1.startswith("P") else line1
            parts = [p.replace("<", " ").strip() for p in name_portion.split("<<") if p.strip()]

            if len(parts) >= 2:
                mrz_data["surname"] = parts[0]
                mrz_data["given_name"] = parts[1].split("<")[0].strip()
                mrz_data["full_name"] = f"{mrz_data['given_name']} {mrz_data['surname']}".strip()
            elif len(parts) == 1:
                mrz_data["surname"] = parts[0]
                mrz_data["full_name"] = parts[0]
        except Exception as e:
            print(f"[MRZ Line 1 Parse Error]: {e}")

    # Parse Line 2: SP003369<2IND9407015F...
    if line2:
        try:
            raw_pass = line2[0:9].replace("<", "")
            mrz_data["passport_number"] = raw_pass

            # Parse DOB (YYMMDD) at index 13:19
            dob_yy = line2[13:15]
            dob_mm = line2[15:17]
            dob_dd = line2[17:19]
            year_prefix = "19" if int(dob_yy) > 30 else "20"
            mrz_data["dob"] = f"{dob_dd}/{dob_mm}/{year_prefix}{dob_yy}"
            mrz_data["nationality"] = "IND"
        except Exception as e:
            print(f"[MRZ Line 2 Parse Error]: {e}")

    return mrz_data


def extract_fields(raw_text: str, mrz_data: dict) -> ExtractedFields:
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    full_text = "\n".join(lines)

    # 1. Dates
    date_pattern = r"\b(\d{2}[/.\-]\d{2}[/.\-]\d{4})\b"
    dates_found = re.findall(date_pattern, full_text)
    dob, issue, expiry = None, None, None
    if len(dates_found) == 1:
        dob = dates_found[0]
    elif len(dates_found) == 2:
        dob, expiry = dates_found
    elif len(dates_found) >= 3:
        dob, issue, expiry = dates_found[0], dates_found[1], dates_found[-1]

    if not dob and mrz_data.get("dob"):
        dob = mrz_data["dob"]

    # 2. Passport Number
    passport_number = mrz_data.get("passport_number")
    if not passport_number:
        doc_match = re.search(r"\b[A-Z]{1,2}[0-9]{7,8}\b", full_text)
        if doc_match:
            passport_number = doc_match.group(0)

    # 3. Visual Zone Name Extraction (handles bilingual labels & OCR shifts)
    surname = None
    given_names = None
    junk_tokens = {
        "REPUBLIC", "INDIA", "INDIAN", "PASSPORT", "GOVERNMENT",
        "SURNAME", "GIVEN", "NAME", "NAMES", "UNION", "OF"
    }

    for i, line in enumerate(lines):
        clean_line = line.lower()
        if any(term in clean_line for term in ["surname", "upnam", "sur name"]):
            for offset in (0, 1, 2):
                if i + offset < len(lines):
                    cand = re.sub(r"[^A-Z\s]", "", lines[i + offset].upper()).strip()
                    tokens = [w for w in cand.split() if w not in junk_tokens and len(w) > 2]
                    if tokens:
                        surname = " ".join(tokens)
                        break

        if any(term in clean_line for term in ["given", "diya gaya"]):
            for offset in (0, 1, 2):
                if i + offset < len(lines):
                    cand = re.sub(r"[^A-Z\s]", "", lines[i + offset].upper()).strip()
                    tokens = [w for w in cand.split() if w not in junk_tokens and len(w) > 2]
                    if tokens:
                        given_names = " ".join(tokens)
                        break

    final_surname = surname or mrz_data.get("surname")
    final_given = given_names or mrz_data.get("given_name")

    if final_given and final_surname:
        full_name = f"{final_given} {final_surname}".strip()
    elif mrz_data.get("full_name"):
        full_name = mrz_data["full_name"]
    else:
        full_name = None

    return ExtractedFields(
        surname=final_surname,
        given_names=final_given,
        name=full_name,
        date_of_birth=dob,
        issue_date=issue,
        expiry_date=expiry,
        passport_number=passport_number,
        nationality=mrz_data.get("nationality") or "IND",
    )