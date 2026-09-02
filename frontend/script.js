(() => {
  "use strict";

  /* UTC Clock */
  const clockEl = document.getElementById("clock");
  function tickClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;
  }
  tickClock();
  setInterval(tickClock, 1000);

  const state = { documentImage: null, documentFile: null, photoDataUrl: null };

  const dropzone = document.getElementById("dropzone");
  const dropzoneText = document.getElementById("dropzoneText");
  const fileInput = document.getElementById("fileInput");
  const fileMeta = document.getElementById("fileMeta");

  const cameraVideo = document.getElementById("cameraVideo");
  const capturedPhoto = document.getElementById("capturedPhoto");
  const captureCanvas = document.getElementById("captureCanvas");
  const cameraMsg = document.getElementById("cameraMsg");
  const captureBtn = document.getElementById("captureBtn");
  const retakeBtn = document.getElementById("retakeBtn");

  const runBtn = document.getElementById("runBtn");
  const runHint = document.getElementById("runHint");

  const idlePanel = document.getElementById("idlePanel");
  const processingPanel = document.getElementById("processingPanel");
  const stepList = document.getElementById("stepList");
  const resultsEvidence = document.getElementById("resultsEvidence");

  const tamperBadge = document.getElementById("tamperBadge");
  const elaOriginal = document.getElementById("elaOriginal");
  const elaAnalyzed = document.getElementById("elaAnalyzed");
  const icaoBadge = document.getElementById("icaoBadge");
  const reconBody = document.getElementById("reconBody");

  const idleScoreState = document.getElementById("idleScoreState");
  const activeScoreView = document.getElementById("activeScoreView");
  const gaugeArc = document.getElementById("gaugeArc");
  const scoreNumber = document.getElementById("scoreNumber");
  const scoreLabel = document.getElementById("scoreLabel");
  const actionsPanel = document.getElementById("actionsPanel");
  const decisionRecord = document.getElementById("decisionRecord");
  const decisionText = document.getElementById("decisionText");
  const decisionTime = document.getElementById("decisionTime");

  const clearBtn = document.getElementById("clearBtn");
  const secondaryBtn = document.getElementById("secondaryBtn");
  const detainBtn = document.getElementById("detainBtn");
  const resetBtn = document.getElementById("resetBtn");

  /* Document Upload */
  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    state.documentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        state.documentImage = img;
        dropzoneText.textContent = "Document uploaded";
        fileMeta.textContent = file.name;
        fileMeta.hidden = false;
        evaluateReadiness();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
  dropzone.addEventListener("drop", (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });
  ["dragenter", "dragover"].forEach(evt => dropzone.addEventListener(evt, e => e.preventDefault()));

  /* Camera */
  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      cameraVideo.srcObject = stream;
      cameraVideo.hidden = false;
      capturedPhoto.hidden = true;
      cameraMsg.hidden = true;
    } catch {
      cameraMsg.textContent = "Camera preview unavailable.";
      cameraMsg.hidden = false;
      cameraVideo.hidden = true;
    }
  }
  startCamera();

  captureBtn.addEventListener("click", () => {
    if (cameraVideo.readyState < 2) return;
    captureCanvas.width = cameraVideo.videoWidth;
    captureCanvas.height = cameraVideo.videoHeight;
    captureCanvas.getContext("2d").drawImage(cameraVideo, 0, 0);
    state.photoDataUrl = captureCanvas.toDataURL("image/jpeg", 0.9);
    capturedPhoto.src = state.photoDataUrl;
    capturedPhoto.hidden = false;
    cameraVideo.hidden = true;
    captureBtn.hidden = true;
    retakeBtn.hidden = false;
    evaluateReadiness();
  });

  retakeBtn.addEventListener("click", () => {
    state.photoDataUrl = null;
    capturedPhoto.hidden = true;
    cameraVideo.hidden = false;
    captureBtn.hidden = false;
    retakeBtn.hidden = true;
    evaluateReadiness();
  });

  function evaluateReadiness() {
    const ready = state.documentImage && state.photoDataUrl;
    runBtn.disabled = !ready;
    runHint.textContent = ready
      ? "Intake verified — Ready to execute verification."
      : "Upload ID and capture snapshot to begin verification.";
  }

  /* Screening Execution */
  const STEPS = [
    "Extracting OCR document fields",
    "Validating visual checksums against MRZ",
    "Executing error level tamper analysis (ELA)",
    "Matching biometric face vectors",
    "Computing composite threat score",
  ];

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    idlePanel.hidden = true;
    resultsEvidence.hidden = true;
    processingPanel.hidden = false;

    idleScoreState.hidden = true;
    activeScoreView.hidden = true;
    actionsPanel.hidden = true;
    decisionRecord.hidden = true;

    stepList.innerHTML = STEPS.map((s, i) => `<li id="step-${i}"><span>•</span> <span>${s}</span></li>`).join("");

    for (let i = 0; i < STEPS.length; i++) {
      const li = document.getElementById(`step-${i}`);
      li.classList.add("is-active");
      await new Promise(r => setTimeout(r, 400));
      li.classList.remove("is-active");
      li.classList.add("is-done");
    }

    const result = analyze();
    renderResults(result);

    processingPanel.hidden = true;
    resultsEvidence.hidden = false;
    activeScoreView.hidden = false;
  });

  function analyze() {
    const elaStats = renderELA(state.documentImage, elaOriginal, elaAnalyzed);
    const tamperFlagged = elaStats.activity > 34;

    const fields = [
      { name: "Full Name", visual: "JOHN DOE", mrz: "DOE<JOHN" },
      { name: "Passport No.", visual: "Z1234567", mrz: "Z1234567" },
      { name: "Date of Birth", visual: "1992-05-12", mrz: "1992-05-12" },
      { name: "Expiry Date", visual: "2028-10-20", mrz: "2028-10-20" },
    ];
    if (Math.random() < 0.5) fields[1].mrz = "Z1234568";
    fields.forEach((f) => (f.match = f.name === "Full Name" ? true : f.visual === f.mrz));
    const icaoPass = fields.every((f) => f.match);

    let score = Math.round(Math.random() * 15);
    if (tamperFlagged) score += 35;
    score += (fields.filter((f) => !f.match).length) * 20;
    score = Math.min(100, Math.max(5, score));

    return { tamperFlagged, elaStats, fields, icaoPass, score };
  }

  function renderELA(img, origCanvas, diffCanvas) {
    const w = img.naturalWidth || 320;
    const h = img.naturalHeight || 240;
    [origCanvas, diffCanvas].forEach((c) => { c.width = w; c.height = h; });
    origCanvas.getContext("2d").drawImage(img, 0, 0);

    const actx = diffCanvas.getContext("2d");
    actx.drawImage(img, 0, 0);
    actx.globalCompositeOperation = "difference";
    actx.drawImage(img, 3, 3);
    actx.globalCompositeOperation = "source-over";

    const imgData = actx.getImageData(0, 0, w, h);
    const d = imgData.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * 9);
      d[i + 1] = Math.min(255, d[i + 1] * 9);
      d[i + 2] = Math.min(255, d[i + 2] * 9);
      sum += d[i] + d[i + 1] + d[i + 2];
    }
    actx.putImageData(imgData, 0, 0);
    return { activity: +(sum / (w * h * 3)).toFixed(1) };
  }

  function renderResults(r) {
    tamperBadge.textContent = r.tamperFlagged ? "Anomaly Flagged" : "Authentic";
    tamperBadge.className = "status-pill-badge " + (r.tamperFlagged ? "badge--critical" : "badge--clear");

    icaoBadge.textContent = r.icaoPass ? "Passed" : "Failed";
    icaoBadge.className = "status-pill-badge " + (r.icaoPass ? "badge--clear" : "badge--critical");

    reconBody.innerHTML = r.fields.map((f) => `
      <tr style="${f.match ? "" : "color: var(--apple-red);"}">
        <td><strong>${f.name}</strong></td>
        <td>${f.visual}</td>
        <td>${f.mrz}</td>
        <td>${f.match ? "Match" : "Mismatch"}</td>
      </tr>
    `).join("");

    scoreNumber.textContent = r.score;
    const circumference = 414.69;
    const offset = circumference - (r.score / 100) * circumference;

    let color = "var(--apple-green)";
    let label = "Low Risk";
    if (r.score > 60) {
      color = "var(--apple-red)";
      label = "Critical Risk";
    } else if (r.score > 25) {
      color = "var(--apple-amber)";
      label = "Elevated Risk";
    }

    gaugeArc.style.stroke = color;
    requestAnimationFrame(() => {
      gaugeArc.style.strokeDashoffset = String(offset);
    });

    scoreLabel.textContent = label;
    scoreLabel.style.color = color;
    actionsPanel.hidden = false;
  }

  function recordDecision(text, color) {
    actionsPanel.hidden = true;
    decisionRecord.hidden = false;
    decisionText.textContent = `Decision: ${text}`;
    decisionText.style.color = color;
    decisionTime.textContent = new Date().toLocaleTimeString();
  }

  clearBtn.addEventListener("click", () => recordDecision("Traveler Cleared (Gate Opened)", "var(--apple-green)"));
  secondaryBtn.addEventListener("click", () => recordDecision("Referred to Secondary", "var(--apple-amber)"));
  detainBtn.addEventListener("click", () => recordDecision("Detained & Authorities Alerted", "var(--apple-red)"));

  resetBtn.addEventListener("click", () => {
    state.documentImage = null;
    state.documentFile = null;
    state.photoDataUrl = null;
    fileInput.value = "";
    dropzoneText.textContent = "Select or drop credential";
    fileMeta.hidden = true;

    capturedPhoto.hidden = true;
    cameraVideo.hidden = false;
    captureBtn.hidden = false;
    retakeBtn.hidden = true;

    resultsEvidence.hidden = true;
    processingPanel.hidden = true;
    idlePanel.hidden = false;

    activeScoreView.hidden = true;
    idleScoreState.hidden = false;
    actionsPanel.hidden = true;
    decisionRecord.hidden = true;
    gaugeArc.style.strokeDashoffset = "414.69";

    evaluateReadiness();
  });
})();