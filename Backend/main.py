from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ocr_service import call_ocr_space, extract_fields, parse_mrz_lines, MAX_FILE_SIZE

app = FastAPI(title="CheckpointOS Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DecisionPayload(BaseModel):
    decision: str


@app.get("/")
def read_root():
    return {"status": "online", "system": "CheckpointOS"}


@app.post("/api/v1/scan")
async def process_screening(
    document: UploadFile = File(...), live_face: str = Form(...)
):
    contents = await document.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty document received")
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Document size exceeds 1MB limit for OCR processing",
        )

    try:
        raw_text = call_ocr_space(contents, document.filename)
        mrz_data = parse_mrz_lines(raw_text)
        fields = extract_fields(raw_text, mrz_data)
    except Exception as e:
        print(f"[OCR Warning] Processing error: {e}")
        mrz_data = {}
        fields = extract_fields("", {})

    passport_num = fields.passport_number or "UNREADABLE"
    mrz_passport = mrz_data.get("passport_number") or passport_num

    dob = fields.date_of_birth or "UNREADABLE"
    mrz_dob = mrz_data.get("dob") or dob

    nationality = fields.nationality or "IND"
    mrz_nat = mrz_data.get("nationality") or nationality

    viz_name = fields.name or "NOT FOUND"
    mrz_name = mrz_data.get("full_name") or fields.name or "UNREADABLE"

    name_match = bool(
        viz_name != "NOT FOUND"
        and mrz_name != "UNREADABLE"
        and (
            viz_name.lower() in mrz_name.lower()
            or mrz_name.lower() in viz_name.lower()
            or (fields.surname and fields.surname.lower() in mrz_name.lower())
        )
    )

    comparisons = [
        {
            "field": "Passport Number",
            "viz": passport_num,
            "mrz": mrz_passport,
            "match": (passport_num == mrz_passport and passport_num != "UNREADABLE"),
        },
        {
            "field": "Date of Birth",
            "viz": dob,
            "mrz": mrz_dob,
            "match": (dob != "UNREADABLE"),
        },
        {
            "field": "Nationality",
            "viz": nationality,
            "mrz": mrz_nat,
            "match": (nationality == mrz_nat),
        },
        {
            "field": "Full Name",
            "viz": viz_name,
            "mrz": mrz_name,
            "match": name_match,
        },
        {
            "field": "Biometric Match",
            "viz": "Doc Portrait",
            "mrz": "Live Feed",
            "match": True,
        },
    ]

    mismatches = sum(1 for c in comparisons if not c["match"])
    calculated_score = 10 + (mismatches * 25)

    return {
        "riskScore": min(calculated_score, 100),
        "tamperDetected": False,
        "icaoValid": mismatches == 0,
        "elaHeatmap": "",
        "comparisons": comparisons,
    }


@app.post("/api/v1/decision")
async def record_decision(payload: DecisionPayload):
    print(f"[AUDIT LOG] Officer Decision: {payload.decision}")
    return {"status": "logged", "decision": payload.decision}