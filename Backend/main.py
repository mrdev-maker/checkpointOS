from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="CheckpointOS Backend")

# Allow Live Server cross-origin calls
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
    document: UploadFile = File(...),
    live_face: str = Form(...)
):
    # Simulated multi-modal response for frontend validation
    return {
        "riskScore": 12,
        "tamperDetected": False,
        "icaoValid": True,
        "elaHeatmap": "",
        "comparisons": [
            {"field": "Passport Number", "viz": "L9823411", "mrz": "L9823411", "match": True},
            {"field": "Date of Birth", "viz": "1994-08-12", "mrz": "1994-08-12", "match": True},
            {"field": "Nationality", "viz": "IND", "mrz": "IND", "match": True},
            {"field": "Biometric Match", "viz": "Doc Photo", "mrz": "Live Feed", "match": True}
        ]
    }

@app.post("/api/v1/decision")
async def record_decision(payload: DecisionPayload):
    print(f"[AUDIT LOG] Officer Decision: {payload.decision}")
    return {"status": "logged", "decision": payload.decision}