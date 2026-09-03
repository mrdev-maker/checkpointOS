// =========================================================
// CHECKPOINTOS FRONTEND CLIENT LOGIC (Synchronized IDs)
// =========================================================

const API_BASE_URL = "http://127.0.0.1:8000/api/v1";

// 1. DOM Elements mapped to index.html
const clockEl = document.getElementById("clock");
const resetBtn = document.getElementById("resetBtn");

// Intake (Column 1)
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
const runHint = document.getElementById("runHint");
const runBtn = document.getElementById("runBtn");

// Forensics (Column 2)
const idlePanel = document.getElementById("idlePanel");
const processingPanel = document.getElementById("processingPanel");
const resultsEvidence = document.getElementById("resultsEvidence");
const tamperBadge = document.getElementById("tamperBadge");
const icaoBadge = document.getElementById("icaoBadge");
const reconBody = document.getElementById("reconBody");
const elaOriginal = document.getElementById("elaOriginal");
const elaAnalyzed = document.getElementById("elaAnalyzed");

// Decision Engine (Column 3)
const idleScoreState = document.getElementById("idleScoreState");
const activeScoreView = document.getElementById("activeScoreView");
const gaugeArc = document.getElementById("gaugeArc");
const scoreNumber = document.getElementById("scoreNumber");
const scoreLabel = document.getElementById("scoreLabel");
const clearBtn = document.getElementById("clearBtn");
const secondaryBtn = document.getElementById("secondaryBtn");
const detainBtn = document.getElementById("detainBtn");
const decisionRecord = document.getElementById("decisionRecord");
const decisionText = document.getElementById("decisionText");
const decisionTime = document.getElementById("decisionTime");

// Internal State
let selectedDocumentFile = null;
let capturedLiveFaceBase64 = null;
let mediaStream = null;

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
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    cameraVideo.srcObject = mediaStream;
    cameraVideo.hidden = false;
    if (cameraMsg) cameraMsg.hidden = true;
  } catch (err) {
    console.error("Camera access failed:", err);
    if (cameraMsg) {
      cameraMsg.textContent = "Camera access denied or unavailable. Grant browser permission.";
      cameraMsg.hidden = false;
    }
  }
}

captureBtn.addEventListener("click", () => {
  if (!cameraVideo.srcObject) {
    alert("Camera is not active. Check permissions.");
    return;
  }

  const width = cameraVideo.videoWidth || 640;
  const height = cameraVideo.videoHeight || 480;
  captureCanvas.width = width;
  captureCanvas.height = height;

  const ctx = captureCanvas.getContext("2d");
  // Mirror un-inversion
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraVideo, 0, 0, width, height);

  capturedLiveFaceBase64 = captureCanvas.toDataURL("image/jpeg", 0.95);
  capturedPhoto.src = capturedLiveFaceBase64;
  capturedPhoto.hidden = false;
  cameraVideo.hidden = true;

  captureBtn.hidden = true;
  retakeBtn.hidden = false;
  checkReadyToRun();
});

retakeBtn.addEventListener("click", () => {
  capturedLiveFaceBase64 = null;
  capturedPhoto.hidden = true;
  cameraVideo.hidden = false;
  captureBtn.hidden = false;
  retakeBtn.hidden = true;
  checkReadyToRun();
});

// ---------------------------------------------------------
// 4. DOCUMENT DRAG & DROP / FILE INPUT
// ---------------------------------------------------------
dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFile(e.target.files[0]);
  }
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFile(e.dataTransfer.files[0]);
  }
});

function handleFile(file) {
  selectedDocumentFile = file;
  dropzoneText.textContent = file.name;
  fileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB — Ready`;
  fileMeta.hidden = false;

  // Render preview into the forensic ELA Canvas
  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      elaOriginal.width = img.width;
      elaOriginal.height = img.height;
      const ctx = elaOriginal.getContext("2d");
      ctx.drawImage(img, 0, 0);
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);

  checkReadyToRun();
}

function checkReadyToRun() {
  if (selectedDocumentFile && capturedLiveFaceBase64) {
    runBtn.disabled = false;
    runHint.textContent = "Credential and live biometric ready for multi-modal analysis.";
  } else {
    runBtn.disabled = true;
    runHint.textContent = "Upload ID and capture snapshot to begin verification.";
  }
}

// ---------------------------------------------------------
// 5. DISPATCH SCREENING TO FASTAPI
// ---------------------------------------------------------
runBtn.addEventListener("click", async () => {
  if (!selectedDocumentFile || !capturedLiveFaceBase64) return;

  // UI state transition to Processing
  runBtn.disabled = true;
  runBtn.textContent = "Processing...";
  idlePanel.hidden = true;
  resultsEvidence.hidden = true;
  processingPanel.hidden = false;

  const formData = new FormData();
  formData.append("document", selectedDocumentFile);
  formData.append("live_face", capturedLiveFaceBase64);

  try {
    const response = await fetch(`${API_BASE_URL}/scan`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    renderAnalysis(data);
  } catch (error) {
    console.error("Analysis Pipeline Failed:", error);
    alert(`Screening Failed: Could not connect to backend (${error.message}). Is Uvicorn running on port 8000?`);
  } finally {
    processingPanel.hidden = true;
    runBtn.disabled = false;
    runBtn.textContent = "Run Multi-Modal Screening";
  }
});

// ---------------------------------------------------------
// 6. RENDER ANALYSIS RESULTS & UPDATE DIAL
// ---------------------------------------------------------
function renderAnalysis(data) {
  // Show results
  resultsEvidence.hidden = false;
  idleScoreState.hidden = true;
  activeScoreView.hidden = false;

  // Badges & Tables
  tamperBadge.textContent = data.tamperDetected ? "TAMPER DETECTED" : "INTEGRITY VERIFIED";
  tamperBadge.className = `status-pill-badge ${data.tamperDetected ? "badge-red" : "badge-green"}`;

  icaoBadge.textContent = data.icaoValid ? "ICAO PASSED" : "CHECKSUM FAILED";
  icaoBadge.className = `status-pill-badge ${data.icaoValid ? "badge-green" : "badge-red"}`;

  reconBody.innerHTML = "";
  (data.comparisons || []).forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.field}</td>
      <td>${row.viz}</td>
      <td>${row.mrz}</td>
      <td style="color: ${row.match ? '#10b981' : '#ef4444'}; font-weight: 700;">
        ${row.match ? "MATCH" : "MISMATCH"}
      </td>
    `;
    reconBody.appendChild(tr);
  });

  // Gauge & Score
  const score = data.riskScore ?? 0;
  scoreNumber.textContent = score;

  if (score >= 60) {
    scoreLabel.textContent = "HIGH RISK — DETAIN";
    scoreLabel.style.background = "#fee2e2";
    scoreLabel.style.color = "#b91c1c";
  } else if (score >= 30) {
    scoreLabel.textContent = "MEDIUM RISK — SECONDARY";
    scoreLabel.style.background = "#fef3c7";
    scoreLabel.style.color = "#b45309";
  } else {
    scoreLabel.textContent = "LOW RISK — CLEARED";
    scoreLabel.style.background = "#dcfce7";
    scoreLabel.style.color = "#15803d";
  }

  // Draw Heatmap Canvas if Base64 returned
  if (data.elaHeatmap) {
    const heatImg = new Image();
    heatImg.onload = () => {
      elaAnalyzed.width = heatImg.width;
      elaAnalyzed.height = heatImg.height;
      elaAnalyzed.getContext("2d").drawImage(heatImg, 0, 0);
    };
    heatImg.src = data.elaHeatmap;
  }
}

// ---------------------------------------------------------
// 7. OFFICER DECISION ACTIONS
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

// Reset Button
resetBtn.addEventListener("click", () => location.reload());

// Start webcam when page loads
window.addEventListener("DOMContentLoaded", initWebcam);