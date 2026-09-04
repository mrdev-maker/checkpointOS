import re
import requests
from fastapi import HTTPException
from pydantic import BaseModel

OCR_SPACE_API_KEY = "K83274496588957"
OCR_SPACE_URL = "https://api.ocr.space/parse/image"
MAX_FILE_SIZE = 1 * 1024 * 1024


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
        "nationality": "IND",
        "surname": None,
        "given_name": None,
        "full_name": None,
    }

    raw_lines = [
        re.sub(r"[^A-Z0-9<]", "", l.upper().strip())
        for l in raw_text.splitlines()
        if l.strip()
    ]

    line1 = None
    line2 = None

    for line in raw_lines:
        if len(line) < 28:
            continue
        if line.startswith("P") and "<<" in line and not any(c.isdigit() for c in line[:10]):
            line1 = line
        elif any(c.isdigit() for c in line[:9]) and len(line) >= 28:
            line2 = line

    # Parse Line 1: P<INDD<SOUZA<<LIONEL<PRAKASH<<<<<<<<<<<<<
    if line1:
        try:
            name_section = re.sub(r"^P<?[A-Z]{3}", "", line1).rstrip("<")
            parts = name_section.split("<<")

            if len(parts) >= 2:
                mrz_data["surname"] = parts[0].replace("<", " ").strip()
                mrz_data["given_name"] = parts[1].replace("<", " ").strip()
                mrz_data["full_name"] = f"{mrz_data['given_name']} {mrz_data['surname']}".strip()
            elif len(parts) == 1 and parts[0]:
                mrz_data["surname"] = parts[0].replace("<", " ").strip()
                mrz_data["full_name"] = mrz_data["surname"]
        except Exception as e:
            print(f"[MRZ Line 1 Error]: {e}")

    # Parse Line 2: S0525338<8IND7911093M2803180...
    if line2:
        try:
            raw_pass = line2[:9].split("<")[0].strip()
            mrz_data["passport_number"] = raw_pass

            # Strict MRZ DOB: Index 13 to 19 (YYMMDD)
            if len(line2) >= 19:
                dob_raw = line2[13:19]
                if dob_raw.isdigit():
                    yy = int(dob_raw[0:2])
                    mm = dob_raw[2:4]
                    dd = dob_raw[4:6]
                    century = "19" if yy > 35 else "20"
                    mrz_data["dob"] = f"{dd}/{mm}/{century}{yy:02d}"

            if not mrz_data["dob"]:
                match_dob = re.search(r"IND(\d{6})", line2)
                if match_dob:
                    dob_raw = match_dob.group(1)
                    yy = int(dob_raw[0:2])
                    mm = dob_raw[2:4]
                    dd = dob_raw[4:6]
                    century = "19" if yy > 35 else "20"
                    mrz_data["dob"] = f"{dd}/{mm}/{century}{yy:02d}"
        except Exception as e:
            print(f"[MRZ Line 2 Error]: {e}")

    return mrz_data


def extract_fields(raw_text: str, mrz_data: dict) -> ExtractedFields:
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    full_text = "\n".join(lines)

    # 1. Dates: Search all standard dates in document
    date_pattern = r"\b(\d{2}[/.\-]\d{2}[/.\-]\d{4})\b"
    dates_found = [re.sub(r"[.\-]", "/", d) for d in re.findall(date_pattern, full_text)]

    dob = None
    # If MRZ parsed a valid DOB, verify if it exists anywhere in visual text
    if mrz_data.get("dob") and mrz_data["dob"] in dates_found:
        dob = mrz_data["dob"]
    elif dates_found:
        # Avoid picking up recent issue dates (e.g. 2018-2026) as DOB if person was born earlier
        dob = dates_found[0]
    
    # Fall back to MRZ DOB if visual was blocked by watermark
    if not dob or (mrz_data.get("dob") and dob != mrz_data.get("dob") and int(dob[-4:]) > 2005):
        dob = mrz_data.get("dob") or dob

    # 2. Passport Number
    passport_number = None
    pass_match = re.search(r"\b([A-Z]{1,2})\s?([0-9]{7,8})\b", full_text)
    if pass_match:
        passport_number = f"{pass_match.group(1)}{pass_match.group(2)}"
    else:
        passport_number = mrz_data.get("passport_number")

    # 3. Visual Name Recovery with MRZ Corroboration
    mrz_tokens = set(re.findall(r"\b[A-Z]+\b", (mrz_data.get("full_name") or "").upper()))

    surname_cands = []
    given_cands = []
    junk_tokens = {
        "REPUBLIC", "INDIA", "INDIAN", "PASSPORT", "GOVERNMENT",
        "SURNAME", "GIVEN", "NAME", "NAMES", "UNION", "OF", "TYPE", "CODE",
        "FEARAF", "MALE", "FEMALE"
    }

    for i, line in enumerate(lines):
        clean_line = line.lower()
        if any(term in clean_line for term in ["surname", "upnam"]):
            for offset in (0, 1, 2):
                if i + offset < len(lines):
                    cand = re.sub(r"[^A-Z\s]", "", lines[i + offset].upper()).strip()
                    tokens = [w for w in cand.split() if w not in junk_tokens]
                    if tokens and (not mrz_tokens or any(t in mrz_tokens for t in tokens)):
                        surname_cands.append(" ".join(tokens))
                        break

        if any(term in clean_line for term in ["given name", "diya gaya", "given"]):
            for offset in (0, 1, 2):
                if i + offset < len(lines):
                    cand = re.sub(r"[^A-Z\s]", "", lines[i + offset].upper()).strip()
                    tokens = [w for w in cand.split() if w not in junk_tokens]
                    if tokens and (not mrz_tokens or any(t in mrz_tokens for t in tokens)):
                        given_cands.append(" ".join(tokens))
                        break

    final_surname = surname_cands[0] if surname_cands else mrz_data.get("surname")
    final_given = given_cands[0] if given_cands else mrz_data.get("given_name")

    if final_given and final_surname:
        full_name = f"{final_given} {final_surname}".strip()
    else:
        full_name = mrz_data.get("full_name")

    return ExtractedFields(
        surname=final_surname,
        given_names=final_given,
        name=full_name,
        date_of_birth=dob,
        passport_number=passport_number,
        nationality="IND",
    )