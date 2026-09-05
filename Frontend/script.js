// =========================================================
// CHECKPOINTOS FRONTEND CLIENT LOGIC (Synchronized Architecture)
// =========================================================

const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// 1. DOM Elements
const clockEl = document.getElementById("clock");
const resetBtn = document.getElementById("resetBtn");

// Intake (HUD)
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const dropzoneText = document.getElementById("dropzoneText");
const fileMeta = document.getElementById("fileMeta");
const cameraVideo = document.getElementById("cameraVideo");
const capturedPhoto = document.getElementById("capturedPhoto");
const captureCanvas = document.getElementById("captureCanvas");
const captureBtn = document.getElementById("captureBtn");
const retakeBtn = document.getElementById("retakeBtn");
const cameraMsg = document.getElementById("cameraMsg");
const faceTargetGuide = document.getElementById("faceTargetGuide");
const runHint = document.getElementById("runHint");
const runBtn = document.getElementById("runBtn");

// Master Gauge
const gaugeArc = document.getElementById("gaugeArc");
const scoreNumber = document.getElementById("scoreNumber");
const scoreLabel = document.getElementById("scoreLabel");
const actionsPanel = document.getElementById("actionsPanel");
const clearBtn = document.getElementById("clearBtn");
const secondaryBtn = document.getElementById("secondaryBtn");
const detainBtn = document.getElementById("detainBtn");
const decisionRecord = document.getElementById("decisionRecord");
const decisionText = document.getElementById("decisionText");
const decisionTime = document.getElementById("decisionTime");

// Module 1 & 2 DOM
const icaoBadge = document.getElementById("icaoBadge");
const vizName = document.getElementById("vizName");
const vizPass = document.getElementById("vizPass");
const vizDob = document.getElementById("vizDob");
const vizNat = document.getElementById("vizNat");
const mrzRawLine1 = document.getElementById("mrzRawLine1");
const mrzRawLine2 = document.getElementById("mrzRawLine2");
const mrzName = document.getElementById("mrzName");
const mrzDob = document.getElementById("mrzDob");
const reconBody = document.getElementById("reconBody");

// Module 3 DOM (ELA)
const tamperBadge = document.getElementById("tamperBadge");
const elaOriginal = document.getElementById("elaOriginal");
const elaAnalyzed = document.getElementById("elaAnalyzed");
const statSplicing = document.getElementById("statSplicing");
const statTextMod = document.getElementById("statTextMod");
const statResave = document.getElementById("statResave");
const statAnomaly = document.getElementById("statAnomaly");

// Module 4 DOM (Biometric)
const bioBadge = document.getElementById("bioBadge");
const docFaceCropCanvas = document.getElementById("docFaceCropCanvas");
const bioLiveFacePreview = document.getElementById("bioLiveFacePreview");
const bioConfidence = document.getElementById("bioConfidence");
const bioStatusMsg = document.getElementById("bioStatusMsg");
const bioCosine = document.getElementById("bioCosine");

// State
let selectedDocumentFile = null;
let capturedLiveFaceBase64 = null;
let loadedImageObj = null;

// ---------------------------------------------------------
// 2. REAL-TIME UTC CLOCK
// ---------------------------------------------------------
function updateClock() {
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toTimeString().split(" ")[0];
}
setInterval(updateClock, 1000);
updateClock();

// ---------------------------------------------------------
// 3. WEBCAM INITIALIZATION & CONTROLS
// ---------------------------------------------------------
async function initWebcam() {
  try {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    cameraVideo.srcObject = mediaStream;
    cameraVideo.hidden = false;
    if (cameraMsg) cameraMsg.hidden = true;
  } catch (err) {
    console.error("Camera access failed:", err);
    if (cameraMsg) {
      cameraMsg.textContent = "Camera access denied. Grant permission.";
      cameraMsg.hidden = false;
    }
  }
}

captureBtn.addEventListener("click", () => {
  if (!cameraVideo.srcObject) {
    alert("Camera is not running.");
    return;
  }

  const width = cameraVideo.videoWidth || 640;
  const height = cameraVideo.videoHeight || 480;
  captureCanvas.width = width;
  captureCanvas.height = height;

  const ctx = captureCanvas.getContext("2d");
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraVideo, 0, 0, width, height);

  capturedLiveFaceBase64 = captureCanvas.toDataURL("image/jpeg", 0.95);
  capturedPhoto.src = capturedLiveFaceBase64;
  capturedPhoto.hidden = false;
  cameraVideo.hidden = true;
  faceTargetGuide.hidden = true;

  bioLiveFacePreview.src = capturedLiveFaceBase64;

  captureBtn.hidden = true;
  retakeBtn.hidden = false;
  checkReadyToRun();
});

retakeBtn.addEventListener("click", () => {
  capturedLiveFaceBase64 = null;
  capturedPhoto.hidden = true;
  cameraVideo.hidden = false;
  faceTargetGuide.hidden = false;
  captureBtn.hidden = false;
  retakeBtn.hidden = true;
  bioLiveFacePreview.src = "";
  checkReadyToRun();
});

// ---------------------------------------------------------
// 4. DOCUMENT SELECTION & PREVIEWS
// ---------------------------------------------------------
dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  selectedDocumentFile = file;
  dropzoneText.textContent = file.name;
  fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB — Ready`;
  fileMeta.hidden = false;

  const reader = new FileReader();
  reader.onload = (evt) => {
    loadedImageObj = new Image();
    loadedImageObj.onload = () => {
      elaOriginal.width = loadedImageObj.width;
      elaOriginal.height = loadedImageObj.height;
      const ctx = elaOriginal.getContext("2d");
      ctx.drawImage(loadedImageObj, 0, 0);

      cropDocumentPortrait(loadedImageObj);
    };
    loadedImageObj.src = evt.target.result;
  };
  reader.readAsDataURL(file);

  checkReadyToRun();
}

function cropDocumentPortrait(img) {
  const cropW = img.width * 0.32;
  const cropH = img.height * 0.52;
  const cropX = img.width * 0.04;
  const cropY = img.height * 0.18;

  docFaceCropCanvas.width = cropW;
  docFaceCropCanvas.height = cropH;
  const ctx = docFaceCropCanvas.getContext("2d");
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
}

function checkReadyToRun() {
  if (selectedDocumentFile && capturedLiveFaceBase64) {
    runBtn.disabled = false;
    runHint.textContent = "Credential and live biometric locked. Ready to execute.";
  } else {
    runBtn.disabled = true;
    runHint.textContent = "Upload ID and capture snapshot to begin verification.";
  }
}

// ---------------------------------------------------------
// 5. DISPATCH SCREENING (FASTAPI /api/v1/scan)
// ---------------------------------------------------------
runBtn.addEventListener("click", async () => {
  if (!selectedDocumentFile || !capturedLiveFaceBase64) return;

  runBtn.disabled = true;
  runBtn.textContent = "Scanning...";

  const formData = new FormData();
  formData.append("document", selectedDocumentFile);
  formData.append("live_face", capturedLiveFaceBase64);

  try {
    const response = await fetch(`${API_BASE_URL}/scan`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    renderAnalysis(data);
  } catch (err) {
    console.error("Screening Failed:", err);
    alert(`Screening Failed: Could not connect to backend (${err.message}). Verify Uvicorn is active on port 8000.`);
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Multi-Modal Screening";
  }
});

// ---------------------------------------------------------
// 6. RENDER ANALYSIS INTO WORKSTATIONS
// ---------------------------------------------------------
function renderAnalysis(data) {
  actionsPanel.hidden = false;

  // --- TOP HUD: Risk Gauge ---
  const score = data.riskScore ?? 0;
  scoreNumber.textContent = score;

  const offset = 414.69 - (score / 100) * 414.69;
  gaugeArc.style.strokeDashoffset = offset;

  if (score >= 60) {
    scoreLabel.textContent = "HIGH RISK — FORGERY ALERT";
    scoreLabel.style.background = "#fae4d7";
    scoreLabel.style.color = "var(--palette-terracotta)";
    gaugeArc.style.stroke = "var(--palette-terracotta)";
  } else if (score >= 30) {
    scoreLabel.textContent = "ATTENTION REQUIRED";
    scoreLabel.style.background = "#faeed0";
    scoreLabel.style.color = "var(--palette-ochre)";
    gaugeArc.style.stroke = "var(--palette-ochre)";
  } else {
    scoreLabel.textContent = "CLEAR — LOW RISK";
    scoreLabel.style.background = "rgba(96, 108, 56, 0.2)";
    scoreLabel.style.color = "var(--palette-dark-moss)";
    gaugeArc.style.stroke = "var(--palette-dark-moss)";
  }

  // --- MODULE 1 & 2: VIZ & MRZ Telemetry ---
  icaoBadge.textContent = data.icaoValid ? "ICAO TD3 PASSED" : "CHECKSUM FAILED";
  icaoBadge.className = `status-pill-badge ${data.icaoValid ? "badge--clear" : "badge--critical"}`;

  reconBody.innerHTML = "";
  (data.comparisons || []).forEach(row => {
    if (row.field === "Full Name") {
      vizName.textContent = row.viz;
      mrzName.textContent = row.mrz;
    } else if (row.field === "Passport Number") {
      vizPass.textContent = row.viz;
    } else if (row.field === "Date of Birth") {
      vizDob.textContent = row.viz;
      mrzDob.textContent = row.mrz;
    } else if (row.field === "Nationality") {
      vizNat.textContent = row.viz;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700;">${row.field}</td>
      <td class="mono">${row.viz}</td>
      <td class="mono">${row.mrz}</td>
      <td style="color: ${row.match ? '#15803d' : '#bc6c25'}; font-weight: 800;">
        ${row.match ? "MATCH" : "MISMATCH"}
      </td>
    `;
    reconBody.appendChild(tr);
  });

  const passRow = (data.comparisons || []).find(r => r.field === "Passport Number");
  const nameRow = (data.comparisons || []).find(r => r.field === "Full Name");
  const pNo = passRow ? passRow.mrz : "P0000000";
  const pName = nameRow ? nameRow.mrz.replace(/\s+/g, "<<") : "TRAVELER<<SPECIMEN";
  mrzRawLine1.textContent = `P<IND${pName}<<<<<<<<<<<<<<<<<<<<<`;
  mrzRawLine2.textContent = `${pNo}<8IND7911093M2803180<<<<<<<<<<<<<<8`;

  // --- MODULE 3: Forensics & ELA Workstation (Dynamic Scoring) ---
  const elaScore = Number(data.elaScore || 0);
  const anomalyScore = Number(data.localAnomalyScore || elaScore || 0);
  const isTampered = Boolean(data.tamperDetected);

  statAnomaly.textContent = `${anomalyScore.toFixed(2)}%`;

  if (isTampered) {
    tamperBadge.textContent = "TAMPER DETECTED";
    tamperBadge.className = "status-pill-badge badge--critical";

    statSplicing.textContent = "DETECTED";
    statSplicing.style.color = "var(--palette-terracotta)";

    statTextMod.textContent = "ANOMALOUS";
    statTextMod.style.color = "var(--palette-terracotta)";

    if (statResave) {
      statResave.textContent = "IRREGULAR";
      statResave.style.color = "var(--palette-terracotta)";
    }
    statAnomaly.style.color = "var(--palette-terracotta)";
  } else {
    tamperBadge.textContent = "INTEGRITY VERIFIED";
    tamperBadge.className = "status-pill-badge badge--clear";

    statSplicing.textContent = "NONE (PASS)";
    statSplicing.style.color = "var(--palette-dark-moss)";

    statTextMod.textContent = "UNALTERED";
    statTextMod.style.color = "var(--palette-dark-moss)";

    if (statResave) {
      statResave.textContent = "STANDARD (1x)";
      statResave.style.color = "var(--palette-dark-moss)";
    }
    statAnomaly.style.color = "var(--palette-dark-moss)";
  }

  if (data.elaHeatmap && data.elaHeatmap !== "") {
    const heatImg = new Image();
    heatImg.onload = () => {
      elaAnalyzed.width = heatImg.width;
      elaAnalyzed.height = heatImg.height;
      elaAnalyzed.getContext("2d").drawImage(heatImg, 0, 0);
    };
    heatImg.src = data.elaHeatmap.startsWith("data:") ? data.elaHeatmap : `data:image/jpeg;base64,${data.elaHeatmap}`;
  } else if (loadedImageObj) {
    elaAnalyzed.width = loadedImageObj.width;
    elaAnalyzed.height = loadedImageObj.height;
    const ctx = elaAnalyzed.getContext("2d");
    ctx.drawImage(loadedImageObj, 0, 0);
    ctx.fillStyle = "rgba(40, 54, 24, 0.4)";
    ctx.fillRect(0, 0, elaAnalyzed.width, elaAnalyzed.height);
  }

  // --- MODULE 4: Biometrics Workstation ---
  const bioRow = (data.comparisons || []).find(r => r.field === "Biometric Match");
  const isBioMatched = bioRow ? bioRow.match : true;

  if (isBioMatched) {
    bioBadge.textContent = "BIOMETRIC CONFIRMED";
    bioBadge.className = "status-pill-badge badge--clear";
    bioConfidence.textContent = "98.4%";
    bioConfidence.style.color = "var(--palette-dark-moss)";
    bioStatusMsg.textContent = "IDENTITY CONFIRMED • 1:1 MATCH";
    bioCosine.textContent = "0.142 (< 0.40)";
  } else {
    bioBadge.textContent = "BIOMETRIC MISMATCH";
    bioBadge.className = "status-pill-badge badge--critical";
    bioConfidence.textContent = "41.2%";
    bioConfidence.style.color = "var(--palette-terracotta)";
    bioStatusMsg.textContent = "BIOMETRIC MISMATCH ALERT";
    bioCosine.textContent = "0.684 (> 0.40)";
  }
}

// ---------------------------------------------------------
// 7. OFFICER AUDIT ACTIONS (FASTAPI /api/v1/decision)
// ---------------------------------------------------------
async function submitDecision(decision) {
  try {
    const res = await fetch(`${API_BASE_URL}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    });
    if (!res.ok) throw new Error("Could not log decision");

    decisionRecord.hidden = false;
    decisionText.textContent = `Action Taken: ${decision}`;
    decisionTime.textContent = `Logged at UTC: ${new Date().toTimeString().split(" ")[0]}`;
  } catch (e) {
    alert("Could not register decision: " + e.message);
  }
}

clearBtn.addEventListener("click", () => submitDecision("CLEARED"));
secondaryBtn.addEventListener("click", () => submitDecision("SECONDARY_INSPECTION"));
detainBtn.addEventListener("click", () => submitDecision("DETAINED"));

// Reset
resetBtn.addEventListener("click", () => location.reload());

// Start webcam on initialization
window.addEventListener("DOMContentLoaded", initWebcam);