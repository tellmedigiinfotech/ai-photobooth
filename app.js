// ═════════════════════════════════════════════════════════════════
//  Samay Yatra — The Heritage Time-Visa
//  An iPad-portrait kiosk: Attract → Capture (2 shots) → Choose →
//  Generate → Reveal. The passport/visa ceremony is a skin over the
//  proven Capture→Choose→Reveal pipeline; the network contract and the
//  canvas brandify pipeline are byte-for-byte unchanged.
// ═════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
const state = {
    screen: 'attract',
    stream: null,
    mirrorStream: null,
    capturePhase: 'face',        // 'face' | 'body'
    pendingBlob: null,
    pendingUrl: null,
    faceBlob: null,
    faceUrl: null,
    bodyBlob: null,
    bodyUrl: null,
    selectedPreset: null,
    selectedGender: null,
    cameraDevices: [],
    usageCounts: {},
};

// ── DOM ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const el = {
    app:                $('app'),

    // Attract
    beginBtn:           $('beginBtn'),
    mirrorVideo:        $('mirrorVideo'),
    attractCrest:       document.querySelector('.passport__crest'),
    visaDrift:          $('visaDrift'),
    usageCount:         $('usageCount'),
    demoRibbon:         $('demoRibbon'),

    // Capture
    webcam:             $('webcam'),
    canvas:             $('canvas'),
    cameraPlaceholder:  $('cameraPlaceholder'),
    startCameraBtn:     $('startCameraBtn'),
    captureControls:    $('captureControls'),
    cameraSourceField:  $('cameraSourceField'),
    cameraSelect:       $('cameraSelect'),
    captureBtn:         $('captureBtn'),
    captureCountdown:   $('captureCountdown'),
    cameraGuide:        $('cameraGuide'),
    cameraFlash:        $('cameraFlash'),
    captureView:        document.querySelector('.capture-view'),
    captureReview:      $('captureReview'),
    capturedImage:      $('capturedImage'),
    retakeBtn:          $('retakeBtn'),
    toStep2Btn:         $('toStep2Btn'),
    capturePhaseLabel:  $('capturePhaseLabel'),
    captureTitle:       $('step1-title'),
    captureIntro:       $('captureIntro'),
    captureReviewTitle: $('captureReviewTitle'),
    captureReviewIntro: $('captureReviewIntro'),
    wellFace:           $('wellFace'),
    wellBody:           $('wellBody'),
    wellFaceImg:        $('wellFaceImg'),
    wellBodyImg:        $('wellBodyImg'),

    // Choose
    contextPhoto:       $('contextPhoto'),
    editPhotoBtn:       $('editPhotoBtn'),
    genderRadios:       document.querySelectorAll('input[name="gender"]'),
    presetsGrid:        $('presetsGrid'),
    destinationsScroll: document.querySelector('.destinations-scroll'),
    generateBtn:        $('generateBtn'),
    selectedDestName:   $('selectedDestinationName'),

    // Generating
    loadingState:       $('loadingState'),
    developImg:         $('developImg'),
    developFlecks:      $('developFlecks'),
    progressFill:       $('progressFill'),
    progressPct:        $('progressPct'),
    checkpoints:        $('checkpoints'),
    loadingHint:        $('loadingHint'),
    heritageFact:       $('heritageFact'),
    heritageFactText:   $('heritageFactText'),

    // Reveal
    resultPanel:        $('resultPanel'),
    waxSeal:            $('waxSeal'),
    approvedStamp:      $('approvedStamp'),
    resultFrame:        $('resultFrame'),
    generatedImage:     $('generatedImage'),
    resultLocation:     $('resultLocation'),
    stampShower:        $('stampShower'),
    newPhotoBtn:        $('newPhotoBtn'),
    downloadBtn:        $('downloadBtn'),
    shareWhatsAppBtn:   $('shareWhatsAppBtn'),
    printBtn:           $('printBtn'),

    // Overlays
    idleWarning:        $('idleWarning'),
    idleRing:           $('idleRing'),
    staySessionBtn:     $('staySessionBtn'),
    cameraAsleep:       $('cameraAsleep'),
    wakeCameraBtn:      $('wakeCameraBtn'),
    staffReset:         $('staffReset'),

    toast:              $('toast'),
};

// ── Presets ──────────────────────────────────────────────────────
// Display data only — the actual prompt template + outfit per gender
// lives server-side in api/generate.js (PRESETS). The client just sends
// presetId + gender. `era` and FACTS drive the document/embassy fiction.
const presets = [
    { id: 1,  name: 'Khajuraho — Kandariya Mahadev',  era: 'Chandela · 11th c.',     description: 'UNESCO-listed Chandela-era sandstone temples',     backgroundUrl: 'assets/backgrounds/jagdambi-temple-kandariya-mahadev-temple.jpg' },
    { id: 2,  name: 'Khajuraho — Lakshmana Temple',   era: 'Chandela · 10th c.',     description: 'The finely carved 10th-century Chandela temple',   backgroundUrl: 'assets/backgrounds/lakshmana-temple-img-9753-hdr.jpg' },
    { id: 7,  name: 'Sanchi Stupa',                   era: 'Mauryan · 3rd c. BCE',   description: 'UNESCO Buddhist monument with carved toranas',     backgroundUrl: 'assets/backgrounds/sanchi-stupa.jpg' },
    { id: 3,  name: 'Orchha — Jahangir Mahal',        era: 'Bundela · 17th c.',      description: '17th-century Bundela palace, arched courtyards',   backgroundUrl: 'assets/backgrounds/jahangir-mahal-6-copy.jpg' },
    { id: 4,  name: 'Orchha — Jahangir Gate',         era: 'Bundela–Mughal · 17th c.', description: 'Monumental Bundela-Mughal archway',              backgroundUrl: 'assets/backgrounds/jahangir-gate-orchha.jpg' },
    { id: 8,  name: 'Mandu — Jahaz Mahal',            era: 'Malwa Sultanate · 15th c.', description: 'Ship Palace of the Royal Enclave, monsoon mood', backgroundUrl: 'assets/backgrounds/jahaz-mahal-mandu.jpg' },
    { id: 6,  name: 'Orchha — Chhatris on the Betwa', era: 'Bundela · 16th–18th c.', description: 'Royal Bundela cenotaphs reflected in the Betwa River',  backgroundUrl: 'assets/backgrounds/chattei-river-view-7.jpg' },
    { id: 9,  name: 'Indore — Krishnapura Chhatris',  era: 'Holkar · 19th c.',       description: 'Holkar royal cenotaphs by the Khan river, Indore',    backgroundUrl: 'assets/backgrounds/krishnabai-holkar-chhatri.jpg' },
    { id: 10, name: 'Indore — Rajwada Palace',        era: 'Holkar · 18th c.',       description: 'The seven-storey Holkar palace of Indore',         backgroundUrl: 'assets/backgrounds/rajwada-indore.jpg' },
    { id: 11, name: 'Indore — Rajwada Courtyard',     era: 'Holkar · 18th c.',       description: 'Inside the Holkar royal seat',                     backgroundUrl: 'assets/backgrounds/rajwada-15.jpg' },
    { id: 14, name: 'Bandhavgarh — Shesh Shaiya',     era: 'Kalachuri · 10th c.',    description: 'Reclining Vishnu in deep Bandhavgarh jungle',      backgroundUrl: 'assets/backgrounds/shesh-shaiya-bandhavgarh.jpg' },
    { id: 12, name: 'Kheoni Sanctuary — Wilds of MP', era: 'Central Indian forest',  description: 'Central Indian teak and sal forest',               backgroundUrl: 'assets/backgrounds/kheoni-wildlife-sanctuary.jpg', genders: ['male'] },
    { id: 13, name: 'Kheoni Sanctuary — Forest Trail', era: 'Central Indian forest', description: 'Quiet woodland of teak, sal and bamboo',           backgroundUrl: 'assets/backgrounds/kheoni-wildlife-sanctuary-1.jpg', genders: ['male'] },
];

// One DAAMS-flavoured heritage fact per site — shown during the wait.
const FACTS = {
    1:  'The Kandariya Mahadev is the largest and most ornate of the Khajuraho temples, raised around 1025–1050 CE by the Chandela kings and dedicated to Shiva.',
    2:  'The Lakshmana Temple (c. 930–950 CE) is one of the earliest and most complete Chandela temples at Khajuraho, dedicated to Vishnu.',
    7:  'The Great Stupa at Sanchi was commissioned by Emperor Ashoka in the 3rd century BCE — among the oldest stone structures in India.',
    3:  "Orchha's Jahangir Mahal was built by the Bundela king Bir Singh Deo to honour a visit by the Mughal emperor Jahangir.",
    4:  'The monumental Jahangir Gate marks the grand Bundela–Mughal architecture of Orchha, on the banks of the Betwa.',
    8:  "Mandu's Jahaz Mahal — the 'Ship Palace' — seems to float between two lakes, built in the 15th century during the Malwa Sultanate.",
    6:  'The royal chhatris of Orchha rise in a stately row along the Betwa River — cenotaphs raised by the Bundela kings between the 16th and 18th centuries.',
    9:  'The Krishnapura Chhatris are mid-19th-century domed cenotaphs on the banks of the Khan river in Indore, raised by the Holkars over the cremation sites of their rulers and named for Krishna Bai Holkar.',
    10: "Indore's seven-storey Rajwada palace, begun around 1747, was the seat of the Holkar dynasty.",
    11: 'Inside the Rajwada, the Holkar royal courtyard blends Maratha, Mughal and French architectural influences.',
    14: 'Deep in Bandhavgarh, a 10th-century reclining Vishnu (Shesh Shaiya) rests at the foot of the ancient hill fort.',
    12: "Kheoni Wildlife Sanctuary protects the teak and sal forests of central India's Malwa plateau.",
    13: 'The quiet teak, sal and bamboo woodlands of Kheoni shelter deer, leopard and a wealth of birdlife.',
};

// ── Branding overlay (UNCHANGED pipeline) ───────────────────────
const BRAND_LOGO_LEFT_SRC  = 'assets/brand/daams-logo.png';
const BRAND_LOGO_RIGHT_SRC = 'assets/brand/aakhon-dekha-final.png';

let brandLogoLeftImage = null;
let brandLogoRightImage = null;
let brandLogosPromise = null;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

function preloadBrandLogos() {
    if (brandLogosPromise) return brandLogosPromise;
    brandLogosPromise = Promise.all([
        loadImage(BRAND_LOGO_LEFT_SRC).catch(err => { console.warn('Left logo failed:', err); return null; }),
        loadImage(BRAND_LOGO_RIGHT_SRC).catch(err => { console.warn('Right logo failed:', err); return null; }),
    ]).then(([left, right]) => {
        brandLogoLeftImage = left;
        brandLogoRightImage = right;
        return [left, right];
    });
    return brandLogosPromise;
}

// ═══════════════════════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════════════════════

function init() {
    setCapturePhase('face');
    renderDestinations();
    populateVisaDrift();
    wireEvents();
    wireFeedback();
    loadCameraDevices();
    checkHealth();
    preloadBrandLogos();
    fetchUsageCounts();
    maybeStartMirror();
    setScreen('attract');
}

async function fetchUsageCounts() {
    try {
        const r = await fetch('/api/usage');
        const data = await r.json();
        if (data && data.counts) {
            state.usageCounts = data.counts;
            renderDestinations();
            animateUsageTicker(Object.values(data.counts).reduce((a, b) => a + (Number(b) || 0), 0));
        }
    } catch (_) { /* silent — counts are a nice-to-have */ }
}

function animateUsageTicker(total) {
    if (!el.usageCount || !total) return;
    const dur = 1100, t0 = performance.now();
    const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        el.usageCount.textContent = Math.round(total * eased).toLocaleString('en-IN');
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

async function checkHealth() {
    try {
        const r = await fetch('/api/health');
        const data = await r.json();
        if (!data.apiKeyConfigured && el.demoRibbon) el.demoRibbon.hidden = false;
    } catch (_) { /* silent */ }
}

// Drifting "issued visas" behind the closed passport (heritage backgrounds).
function populateVisaDrift() {
    if (!el.visaDrift) return;
    const picks = presets.slice().sort(() => 0.5 - Math.random()).slice(0, 5);
    el.visaDrift.innerHTML = '';
    picks.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'visa-drift__card';
        const left = 6 + (i * 19) + (Math.random() * 8 - 4);
        const dur = 16 + Math.random() * 10;
        const delay = i * 3.2;
        const rot = (Math.random() * 10 - 5).toFixed(1) + 'deg';
        card.style.cssText = `left:${left}%;animation-duration:${dur}s;animation-delay:-${delay}s;--rot:${rot};`;
        card.innerHTML = `<img src="${p.backgroundUrl}" alt="" loading="lazy" />`;
        el.visaDrift.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════════
//  Screen machine
// ═══════════════════════════════════════════════════════════════

function setScreen(name) {
    state.screen = name;
    el.app.dataset.screen = name;
    armIdle();
}

// Map the proven step model onto screens so the unchanged pipeline keeps working.
function goToStep(n) {
    if (n === 1) setScreen('capture');
    else if (n === 2) setScreen('choose');
    else if (n === 3) setScreen('generating');
}

// "Tap to begin" — leave the attract mirror, enter capture, start the camera.
function startSession() {
    stopMirror();
    clearWells();
    setCapturePhase('face');
    setScreen('capture');
    startCamera();
}

// ═══════════════════════════════════════════════════════════════
//  Idle timer + hardened privacy reset
// ═══════════════════════════════════════════════════════════════

const IDLE_TOTAL = { capture: 60000, choose: 60000, reveal: 90000 };
const IDLE_WARN  = 12000;
let idleTimer = null, idleWarnTimer = null;

function armIdle() {
    clearTimeout(idleTimer); clearTimeout(idleWarnTimer);
    hideIdleWarning();
    const total = IDLE_TOTAL[state.screen];
    if (!total) return;                 // no idle reset on attract or while generating
    idleWarnTimer = setTimeout(showIdleWarning, Math.max(0, total - IDLE_WARN));
    idleTimer = setTimeout(resetAll, total);
}

function onActivity() {
    if (!el.idleWarning.hidden) hideIdleWarning();
    if (IDLE_TOTAL[state.screen]) armIdle();
}

function showIdleWarning() {
    el.idleWarning.hidden = false;
    const ring = el.idleRing;
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = '0';
    void ring.getBoundingClientRect();   // reflow so the drain animates
    ring.style.transition = `stroke-dashoffset ${IDLE_WARN}ms linear`;
    ring.style.strokeDashoffset = '327';
}
function hideIdleWarning() { if (el.idleWarning) el.idleWarning.hidden = true; }

function clearAllTimers() {
    [countdownTimer, loadingHintTimer, progressTimer, factTimer, cameraRetryTimer,
     idleTimer, idleWarnTimer].forEach(t => { if (t) { clearInterval(t); clearTimeout(t); } });
    countdownTimer = loadingHintTimer = progressTimer = factTimer = cameraRetryTimer = null;
    idleTimer = idleWarnTimer = null;
    ceremonyTimers.forEach(t => clearTimeout(t));
    ceremonyTimers = [];
}

// One hardened reset for EVERY exit path (idle, "new visa", error). No face
// or session data may survive into the next visitor's session.
function resetAll() {
    clearAllTimers();
    stopStream();
    stopMirror();

    [state.pendingUrl, state.faceUrl, state.bodyUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    state.pendingBlob = state.pendingUrl = null;
    state.faceBlob = state.faceUrl = state.bodyBlob = state.bodyUrl = null;
    state.selectedPreset = null;
    state.selectedGender = null;

    el.genderRadios.forEach(r => { r.checked = false; });
    el.selectedDestName.textContent = 'Nothing yet';
    el.generateBtn.disabled = true;
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
    });
    if (el.destinationsScroll) el.destinationsScroll.classList.remove('is-unlocked');

    if (el.capturedImage) el.capturedImage.removeAttribute('src');
    if (el.contextPhoto) el.contextPhoto.removeAttribute('src');
    if (el.generatedImage) el.generatedImage.removeAttribute('src');
    clearWells();
    resetCeremony();
    hideIdleWarning();
    hideCameraAsleep();

    // dismiss feedback + reset its per-visitor state
    feedback.submittedThisSession = false;
    feedback.resetAfterClose = false;
    if (feedback.overlay) feedback.overlay.hidden = true;
    resetFeedback();

    setCapturePhase('face');
    renderDestinations();
    setScreen('attract');
    maybeStartMirror();
}

// ═══════════════════════════════════════════════════════════════
//  Camera & capture
// ═══════════════════════════════════════════════════════════════

async function loadCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        state.cameraDevices = devices.filter(d => d.kind === 'videoinput');
        populateCameraSelect();
    } catch (err) {
        console.error('Failed to enumerate cameras:', err);
    }
}

function populateCameraSelect() {
    el.cameraSelect.innerHTML = '<option value="">Default camera</option>';
    state.cameraDevices.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${i + 1}`;
        el.cameraSelect.appendChild(opt);
    });
    el.cameraSourceField.hidden = state.cameraDevices.length < 2;
}

function stopStream() {
    if (!state.stream) return;
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
}

async function startCamera() {
    try {
        stopStream();
        const deviceId = el.cameraSelect.value;
        const video = deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } };

        state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        el.webcam.srcObject = state.stream;

        el.cameraPlaceholder.hidden = true;
        el.captureControls.hidden = false;
        el.captureView.dataset.state = 'live';
        el.captureBtn.disabled = false;
        el.cameraGuide.dataset.lit = 'true';
        hideCameraAsleep();
        stopCameraRetry();

        await loadCameraDevices();
    } catch (err) {
        console.error('Camera error:', err);
        showCameraAsleep();
        if (err && err.name !== 'NotAllowedError') startCameraRetry();
    }
}

async function handleCameraChange() {
    if (!state.stream) return;
    await startCamera();
}

// Live mirror in the attract passport cover — ONLY when permission is already
// granted, so an idle device never throws a permission prompt at a passer-by.
async function maybeStartMirror() {
    if (state.screen !== 'attract' && el.app.dataset.screen !== 'attract') return;
    try {
        if (!navigator.permissions || !navigator.mediaDevices?.getUserMedia) return;
        const status = await navigator.permissions.query({ name: 'camera' }).catch(() => null);
        if (!status || status.state !== 'granted') return;   // silhouette stays
        state.mirrorStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false,
        });
        if (state.screen !== 'attract') { stopMirror(); return; }   // left attract meanwhile
        el.mirrorVideo.srcObject = state.mirrorStream;
        if (el.attractCrest) el.attractCrest.dataset.mirror = 'on';
    } catch (_) { /* silhouette fallback */ }
}
function stopMirror() {
    if (state.mirrorStream) { state.mirrorStream.getTracks().forEach(t => t.stop()); state.mirrorStream = null; }
    if (el.attractCrest) el.attractCrest.removeAttribute('data-mirror');
}

// Camera-asleep overlay (replaces the old dead error toast)
let cameraRetryTimer = null;
function showCameraAsleep() {
    el.cameraPlaceholder.hidden = false;
    el.cameraAsleep.hidden = false;
}
function hideCameraAsleep() { if (el.cameraAsleep) el.cameraAsleep.hidden = true; }
function startCameraRetry() {
    stopCameraRetry();
    cameraRetryTimer = setInterval(() => { if (state.screen === 'capture') startCamera(); }, 4000);
}
function stopCameraRetry() { if (cameraRetryTimer) { clearInterval(cameraRetryTimer); cameraRetryTimer = null; } }

// Copy + wells per phase
const CAPTURE_COPY = {
    face: {
        title:  'Identity photo',
        intro:  'Look straight into the lens.',
        review: 'Verify your identity photo',
        guide:  'face',
    },
    body: {
        title:  'Stature photo',
        intro:  'Step back, head to knees.',
        review: 'Verify your stature photo',
        guide:  'body',
    },
};

function setCapturePhase(phase) {
    state.capturePhase = phase;
    const c = CAPTURE_COPY[phase];
    el.captureTitle.textContent = c.title;
    el.captureIntro.textContent = c.intro;
    el.captureReviewTitle.textContent = c.review;
    el.cameraGuide.dataset.shape = c.guide;

    // Wells: active vs done/pending
    if (phase === 'face') {
        if (el.wellFace.dataset.state !== 'done') el.wellFace.dataset.state = 'active';
        if (el.wellBody.dataset.state !== 'done') el.wellBody.dataset.state = 'pending';
    } else {
        el.wellFace.dataset.state = 'done';
        el.wellBody.dataset.state = 'active';
    }

    // Back to the live view for the new shot (camera keeps running).
    el.captureReview.hidden = true;
    el.captureView.hidden = false;
}

function clearWells() {
    el.wellFace.dataset.state = 'active';
    el.wellBody.dataset.state = 'pending';
    el.wellFaceImg.removeAttribute('src');
    el.wellBodyImg.removeAttribute('src');
}

let countdownTimer = null;
function startCaptureCountdown() {
    if (countdownTimer) return;
    if (!state.stream) { capturePhoto(); return; }
    el.captureBtn.disabled = true;
    let n = 5;
    const tick = () => {
        el.captureCountdown.hidden = false;
        el.captureCountdown.innerHTML = `<span class="capture-countdown__num">${n}</span>`;
        if (n === 0) {
            clearInterval(countdownTimer);
            countdownTimer = null;
            el.captureCountdown.hidden = true;
            el.captureBtn.disabled = false;
            fireShutterFlash();
            capturePhoto();
            return;
        }
        n -= 1;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
}

function fireShutterFlash() {
    if (!el.cameraFlash) return;
    el.cameraFlash.dataset.fire = 'true';
    setTimeout(() => el.cameraFlash.removeAttribute('data-fire'), 340);
}

function capturePhoto() {
    const ctx = el.canvas.getContext('2d');
    el.canvas.width = el.webcam.videoWidth;
    el.canvas.height = el.webcam.videoHeight;

    // Mirror horizontally to match the preview.
    ctx.save();
    ctx.translate(el.canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(el.webcam, 0, 0, el.canvas.width, el.canvas.height);
    ctx.restore();

    el.canvas.toBlob(blob => {
        if (!blob) { toast('Capture failed. Try again.', 'error'); return; }
        state.pendingBlob = blob;
        if (state.pendingUrl) URL.revokeObjectURL(state.pendingUrl);
        state.pendingUrl = URL.createObjectURL(blob);
        el.capturedImage.src = state.pendingUrl;
        el.captureView.hidden = true;
        el.captureReview.hidden = false;
    }, 'image/jpeg', 0.95);
}

function retakePhoto() {
    state.pendingBlob = null;
    if (state.pendingUrl) { URL.revokeObjectURL(state.pendingUrl); state.pendingUrl = null; }
    el.captureReview.hidden = true;
    el.captureView.hidden = false;
}

async function confirmCaptureAndAdvance() {
    if (!state.pendingBlob) return;

    if (state.capturePhase === 'face') {
        state.faceBlob = state.pendingBlob;
        if (state.faceUrl) URL.revokeObjectURL(state.faceUrl);
        state.faceUrl = state.pendingUrl;
        state.pendingBlob = null;
        state.pendingUrl = null;
        el.contextPhoto.src = state.faceUrl;
        el.wellFaceImg.src = state.faceUrl;
        el.wellFace.dataset.state = 'done';
        setCapturePhase('body');
        return;
    }

    // body phase — both shots captured.
    state.bodyBlob = state.pendingBlob;
    if (state.bodyUrl) URL.revokeObjectURL(state.bodyUrl);
    state.bodyUrl = state.pendingUrl;
    state.pendingBlob = null;
    state.pendingUrl = null;
    el.wellBodyImg.src = state.bodyUrl;
    el.wellBody.dataset.state = 'done';

    goToStep(2);
}

// ═══════════════════════════════════════════════════════════════
//  Choose — destinations
// ═══════════════════════════════════════════════════════════════

function visiblePresets() {
    return presets.filter(p => !p.genders || !state.selectedGender || p.genders.includes(state.selectedGender));
}

function renderDestinations() {
    const frag = document.createDocumentFragment();
    visiblePresets().forEach(p => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'destination-card';
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', state.selectedPreset?.id === p.id ? 'true' : 'false');
        if (state.selectedPreset?.id === p.id) card.classList.add('is-selected');
        card.dataset.presetId = p.id;
        const filename = (p.backgroundUrl || '').split('/').pop();
        const count = state.usageCounts[filename] || 0;
        const permit = p.genders ? `<span class="destination-card__permit">Wilderness permit</span>` : '';
        card.innerHTML = `
            <div class="destination-card__media">
                <img src="${p.backgroundUrl}" alt="" loading="lazy" />
            </div>
            <div class="destination-card__stub">
                <span class="destination-card__era">${escapeHtml(p.era || '')}</span>
                <span class="destination-card__name">${escapeHtml(p.name)}</span>
                <span class="destination-card__desc">${escapeHtml(p.description)}</span>
                <span class="destination-card__uses">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>
                    ${count} stamps
                </span>
                ${permit}
            </div>
            <div class="destination-card__select" aria-hidden="true"><span>Selected · चयनित</span></div>`;
        card.addEventListener('click', () => selectDestination(p, card));
        frag.appendChild(card);
    });
    el.presetsGrid.innerHTML = '';
    el.presetsGrid.appendChild(frag);
}

function selectDestination(preset, cardEl) {
    state.selectedPreset = preset;
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        const isSel = c === cardEl;
        c.classList.toggle('is-selected', isSel);
        c.setAttribute('aria-checked', isSel ? 'true' : 'false');
    });
    el.selectedDestName.textContent = preset.name;
    // Pin the chosen card to the top of the stack.
    if (cardEl && el.presetsGrid.firstElementChild !== cardEl) {
        el.presetsGrid.prepend(cardEl);
        if (el.destinationsScroll) el.destinationsScroll.scrollTo({ top: 0, behavior: 'smooth' });
    }
    updateGenerateEnabled();
}

function handleGenderChange(e) {
    const value = e.target.value;
    if (value === 'male' || value === 'female') state.selectedGender = value;

    if (el.destinationsScroll) el.destinationsScroll.classList.add('is-unlocked');
    renderDestinations();

    if (state.selectedPreset && !visiblePresets().some(p => p.id === state.selectedPreset.id)) {
        state.selectedPreset = null;
        el.selectedDestName.textContent = 'Nothing yet';
    }
    updateGenerateEnabled();
}

function updateGenerateEnabled() {
    el.generateBtn.disabled = !(state.selectedPreset && state.selectedGender);
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ═══════════════════════════════════════════════════════════════
//  Image helpers (UNCHANGED)
// ═══════════════════════════════════════════════════════════════

async function compressImage(blob, quality = 0.9, maxWidth = 1600) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            c.getContext('2d').drawImage(img, 0, 0, width, height);
            c.toBlob(b => b ? resolve(b) : reject(new Error('Compression failed')), 'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = URL.createObjectURL(blob);
    });
}

function base64ToBlob(b64, mimeType) {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType || 'image/png' });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y,     x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x,     y + h, radius);
    ctx.arcTo(x,     y + h, x,     y,     radius);
    ctx.arcTo(x,     y,     x + w, y,     radius);
    ctx.closePath();
}

async function ensureBrandFonts(captionSize) {
    if (!document.fonts || !document.fonts.load) return;
    try {
        await document.fonts.load(`700 ${captionSize}px "Eczar"`);
    } catch (_) { /* fall back to system fonts */ }
}

function drawCircularLogo(ctx, logo, cx, cy, diameter) {
    if (!logo) return;
    const r = diameter / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, diameter, diameter);
    ctx.restore();
}

async function brandifyImage(dataUrl, locationName) {
    const photo = await loadImage(dataUrl);
    const [leftLogo, rightLogo] = await preloadBrandLogos();

    // The physical print is 5:7 (portrait). GPT Image 2 only emits fixed sizes, so
    // the scene is generated at the closest (1024x1536 = 2:3); normalise to 5:7
    // here with a centre-crop "cover" — trims ~3% off the top and bottom of the
    // 2:3 source (the scene is framed with headroom for exactly this), giving a
    // full-bleed 5:7 image the reveal, download, share and print all inherit.
    const PRINT_AR = 5 / 7;                     // width / height
    const srcW = photo.naturalWidth;
    const srcH = photo.naturalHeight;
    let W = srcW;
    let H = Math.round(W / PRINT_AR);           // 5:7 canvas at the source's full width
    if (H > srcH) { H = srcH; W = Math.round(H * PRINT_AR); } // source too short → base on height

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // "cover": fill WxH, centre-cropping whatever overflows.
    const scale = Math.max(W / srcW, H / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    ctx.drawImage(photo, (W - dw) / 2, (H - dh) / 2, dw, dh);

    const badgeD = Math.round(W * 0.11);
    const badgeR = badgeD / 2;
    const inset  = Math.round(W * 0.03);
    const cyTop  = Math.round(H * 0.03 + badgeR);
    const cxLeft  = inset + badgeR;
    const cxRight = W - inset - badgeR;

    const drawShadowDisc = (cx, cy) => {
        ctx.save();
        ctx.shadowColor   = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur    = Math.round(badgeD * 0.10);
        ctx.shadowOffsetY = Math.round(badgeD * 0.025);
        ctx.fillStyle     = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };

    if (leftLogo)  drawShadowDisc(cxLeft,  cyTop);
    if (rightLogo) drawShadowDisc(cxRight, cyTop);

    if (leftLogo)  drawCircularLogo(ctx, leftLogo,  cxLeft,  cyTop, badgeD);
    if (rightLogo) drawCircularLogo(ctx, rightLogo, cxRight, cyTop, badgeD);

    const caption = (locationName || '').trim();
    if (caption) {
        const captionSize = Math.max(16, Math.round(H * 0.022));
        await ensureBrandFonts(captionSize);

        const fontStack   = '"Eczar", "Tiro Devanagari Hindi", "Noto Serif Devanagari", "Kohinoor Devanagari", "Mangal", "Nirmala UI", Georgia, serif';
        const captionFont = `700 ${captionSize}px ${fontStack}`;

        const gradHeight = Math.round(H * 0.18);
        const gradTop    = H - gradHeight;
        const gradient   = ctx.createLinearGradient(0, gradTop, 0, H);
        gradient.addColorStop(0,    'rgba(0, 0, 0, 0)');
        gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
        gradient.addColorStop(1,    'rgba(0, 0, 0, 0.55)');
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, gradTop, W, gradHeight);
        ctx.restore();

        const captionY = H - Math.round(H * 0.05);
        ctx.save();
        ctx.font          = captionFont;
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'alphabetic';
        ctx.shadowColor   = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur    = Math.round(H * 0.009);
        ctx.shadowOffsetY = Math.round(H * 0.002);
        ctx.fillStyle     = '#ffffff';
        ctx.fillText(caption, W / 2, captionY);
        ctx.restore();
    }

    return canvas.toDataURL('image/jpeg', 0.95);
}

// ═══════════════════════════════════════════════════════════════
//  Generating — the entertaining 60–90s wait
// ═══════════════════════════════════════════════════════════════

const CHECKPOINTS = [
    'Identity verified',
    'Era locked',
    'Tailoring period attire · पोशाक',
    'Matching the light',
    'Stitching you into stone',
    "Awaiting the ambassador's seal · लगभग तैयार",
];

let loadingHintTimer = null;
let progressTimer = null;
let factTimer = null;
let progressVal = 0;

function startGenerating() {
    setScreen('generating');
    el.heritageFact.hidden = true;

    // The destination develops blurred-sepia → sharp behind the loader.
    if (state.selectedPreset) {
        el.developImg.style.backgroundImage = `url("${state.selectedPreset.backgroundUrl}")`;
    }
    el.developImg.removeAttribute('data-develop');
    requestAnimationFrame(() => requestAnimationFrame(() => { el.developImg.dataset.develop = 'true'; }));
    spawnFlecks();

    renderCheckpoints();
    startProgress();
    startCheckpointCycle();
    scheduleFact();
}

function spawnFlecks() {
    if (!el.developFlecks) return;
    el.developFlecks.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const f = document.createElement('span');
        f.className = 'fleck';
        f.style.cssText = `left:${Math.random() * 100}%;animation-duration:${3 + Math.random() * 4}s;animation-delay:-${Math.random() * 5}s;`;
        el.developFlecks.appendChild(f);
    }
}

function renderCheckpoints() {
    el.checkpoints.innerHTML = '';
    CHECKPOINTS.forEach((label, i) => {
        const li = document.createElement('li');
        li.className = 'checkpoint' + (i === 0 ? ' is-active' : '');
        li.dataset.i = i;
        li.innerHTML = `<span class="checkpoint__tick">${i + 1}</span><span class="checkpoint__label">${escapeHtml(label)}</span>`;
        el.checkpoints.appendChild(li);
    });
    el.loadingHint.textContent = CHECKPOINTS[0];
}

function startCheckpointCycle() {
    let i = 0;
    el.loadingHint.textContent = CHECKPOINTS[0];
    loadingHintTimer = setInterval(() => {
        const items = el.checkpoints.querySelectorAll('.checkpoint');
        if (i < items.length) { items[i].classList.remove('is-active'); items[i].classList.add('is-done'); }
        i += 1;
        if (i >= items.length) { i = items.length - 1; return; }   // hold on the last
        items[i].classList.add('is-active');
        el.loadingHint.textContent = CHECKPOINTS[i];
    }, 12000);
}

// Honest progress: asymptote toward ~92% and HOLD until /api/generate resolves.
function startProgress() {
    progressVal = 0;
    setProgressUI(0);
    progressTimer = setInterval(() => {
        progressVal += (92 - progressVal) * 0.045;
        if (progressVal > 91.5) progressVal = 91.5;
        setProgressUI(progressVal);
    }, 650);
}
function setProgressUI(v) {
    el.progressFill.style.width = v + '%';
    el.progressPct.textContent = Math.round(v) + '%';
}
function finishProgress() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    progressVal = 100;
    setProgressUI(100);
    el.checkpoints.querySelectorAll('.checkpoint').forEach(c => { c.classList.remove('is-active'); c.classList.add('is-done'); });
}

function scheduleFact() {
    const id = state.selectedPreset?.id;
    const fact = id && FACTS[id];
    if (!fact) return;
    factTimer = setTimeout(() => {
        el.heritageFactText.textContent = fact;
        el.heritageFact.hidden = false;
    }, 26000);
}

function stopGeneratingTimers() {
    if (loadingHintTimer) { clearInterval(loadingHintTimer); loadingHintTimer = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (factTimer) { clearTimeout(factTimer); factTimer = null; }
}

// ═══════════════════════════════════════════════════════════════
//  Generate (network contract UNCHANGED)
// ═══════════════════════════════════════════════════════════════

async function generate() {
    if (!state.faceBlob || !state.selectedPreset || !state.selectedGender) {
        toast('Please capture your photos, pick male/female, and choose a destination.', 'error');
        return;
    }

    startGenerating();

    try {
        const userImg = await compressImage(state.faceBlob, 0.92, 1600);
        const bodyImg = state.bodyBlob ? await compressImage(state.bodyBlob, 0.85, 1024) : null;
        const userImageDataUrl = await blobToBase64(userImg);
        const bodyImageDataUrl = bodyImg ? await blobToBase64(bodyImg) : null;

        // Free the camera GPU/heat while the embassy "processes" — capture
        // blobs are already saved, so stopping the stream here is safe.
        stopStream();

        const genRes = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userImage: userImageDataUrl,
                bodyImage: bodyImageDataUrl,
                presetId: String(state.selectedPreset.id),
                gender: state.selectedGender,
            }),
        });
        const genData = await genRes.json();
        if (!genRes.ok || !genData.success) {
            throw new Error(genData.details || genData.error || 'Generation failed');
        }

        const rawDataUrl = `data:${genData.mimeType};base64,${genData.generatedImage}`;
        let finalDataUrl;
        try {
            finalDataUrl = await brandifyImage(rawDataUrl, state.selectedPreset.name);
        } catch (overlayErr) {
            console.warn('Brand overlay failed, falling back to raw image:', overlayErr);
            finalDataUrl = rawDataUrl;
        }

        finishProgress();
        showReveal(finalDataUrl, state.selectedPreset.name);

        if (genData.note) toast(genData.note, 'error', 6000);
    } catch (err) {
        console.error(err);
        stopGeneratingTimers();
        toast('Visa delayed — let’s try again. · फिर से कोशिश करें', 'error', 6000);
        // bounce back to Choose with selections intact
        goToStep(2);
    } finally {
        stopGeneratingTimers();
    }
}

// ═══════════════════════════════════════════════════════════════
//  Reveal — the wax-seal ceremony
// ═══════════════════════════════════════════════════════════════

let ceremonyTimers = [];
function laterC(fn, ms) { const t = setTimeout(fn, ms); ceremonyTimers.push(t); return t; }

function resetCeremony() {
    ceremonyTimers.forEach(t => clearTimeout(t));
    ceremonyTimers = [];
    if (el.waxSeal) el.waxSeal.removeAttribute('data-phase');
    if (el.approvedStamp) el.approvedStamp.removeAttribute('data-show');
    if (el.resultFrame) el.resultFrame.removeAttribute('data-show');
    if (el.stampShower) el.stampShower.innerHTML = '';
    if (el.generatedImage) el.generatedImage.classList.remove('is-developing');
}

function showReveal(finalDataUrl, locationName) {
    resetCeremony();
    el.generatedImage.classList.add('is-developing');
    el.generatedImage.src = finalDataUrl;
    el.resultLocation.textContent = locationName;
    setScreen('reveal');

    // Seal drops, cracks, photo develops out of the fog.
    el.waxSeal.dataset.phase = 'drop';
    laterC(() => { el.waxSeal.dataset.phase = 'crack'; el.approvedStamp.dataset.show = 'true'; }, 620);
    laterC(() => {
        el.resultFrame.dataset.show = 'true';
        el.generatedImage.classList.remove('is-developing');   // sharpen last
    }, 1000);
    laterC(() => { el.approvedStamp.removeAttribute('data-show'); spawnStampShower(); toast('Your visa is ready! · वीज़ा स्वीकृत', 'success'); }, 1700);
}

function spawnStampShower() {
    if (!el.stampShower) return;
    el.stampShower.innerHTML = '';
    const glyphs = ['✦', '✶', '❋', '✷', '●'];
    for (let i = 0; i < 22; i++) {
        const s = document.createElement('span');
        s.className = 'stamp-glyph';
        s.textContent = glyphs[i % glyphs.length];
        s.style.cssText = `left:${Math.random() * 100}%;animation-duration:${1.6 + Math.random() * 1.8}s;animation-delay:${Math.random() * 0.6}s;font-size:${0.9 + Math.random()}rem;`;
        el.stampShower.appendChild(s);
    }
    laterC(() => { if (el.stampShower) el.stampShower.innerHTML = ''; }, 3600);
}

// ═══════════════════════════════════════════════════════════════
//  Share / download (UNCHANGED behaviour)
// ═══════════════════════════════════════════════════════════════

function download() {
    if (!el.generatedImage.src) return;
    const a = document.createElement('a');
    a.href = el.generatedImage.src;
    const safeName = (state.selectedPreset?.name || 'photobooth').replace(/[^\w-]+/g, '_');
    a.download = `${safeName}-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function shareWhatsApp() {
    if (!el.generatedImage.src) return;
    const locationName = state.selectedPreset?.name || 'the AI Photobooth';
    const caption = `Here I am at ${locationName} — via the AI Photobooth!`;

    try {
        const response = await fetch(el.generatedImage.src);
        const blob = await response.blob();
        const file = new File([blob], `photobooth-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'AI Photobooth', text: caption });
            return;
        }

        download();
        const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(caption)}`;
        window.open(url, '_blank');
        toast('Image downloaded. Attach it in the WhatsApp window that just opened.', '', 5500);
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('WhatsApp share failed:', err);
        toast('Share failed — try downloading and sending manually.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  Toast
// ═══════════════════════════════════════════════════════════════

let toastTimer = null;
function toast(message, type = '', duration = 3200) {
    el.toast.textContent = message;
    el.toast.className = 'toast is-visible' + (type ? ` is-${type}` : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), duration);
}

// ═══════════════════════════════════════════════════════════════
//  Events
// ═══════════════════════════════════════════════════════════════

function wireEvents() {
    el.beginBtn.addEventListener('click', startSession);

    el.startCameraBtn.addEventListener('click', startCamera);
    el.cameraSelect.addEventListener('change', handleCameraChange);
    el.captureBtn.addEventListener('click', startCaptureCountdown);
    el.retakeBtn.addEventListener('click', retakePhoto);
    el.toStep2Btn.addEventListener('click', confirmCaptureAndAdvance);

    el.editPhotoBtn.addEventListener('click', () => {
        retakePhoto();
        clearWells();
        setCapturePhase('face');
        setScreen('capture');
        if (!state.stream) startCamera();
    });

    el.genderRadios.forEach(r => r.addEventListener('change', handleGenderChange));
    el.generateBtn.addEventListener('click', generate);

    // Reveal actions — feedback rides in after the user acts on the image.
    el.newPhotoBtn.addEventListener('click', () => {
        if (feedback.submittedThisSession || !feedback.overlay) { resetAll(); return; }
        feedback.resetAfterClose = true;
        openFeedback();
    });
    el.downloadBtn.addEventListener('click', () => { download(); openFeedback(); });
    el.shareWhatsAppBtn.addEventListener('click', () => { shareWhatsApp(); openFeedback(); });
    el.printBtn.addEventListener('click', () => { window.print(); openFeedback(); });

    // Overlays
    el.staySessionBtn.addEventListener('click', () => { hideIdleWarning(); armIdle(); });
    el.wakeCameraBtn.addEventListener('click', startCamera);

    // Idle activity — any touch keeps the session alive.
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
        document.addEventListener(ev, onActivity, { passive: true }));

    // Hidden staff force-reset: long-press the bottom-left corner for 3s.
    let staffTimer = null;
    const startStaff = () => { staffTimer = setTimeout(resetAll, 3000); };
    const cancelStaff = () => { if (staffTimer) { clearTimeout(staffTimer); staffTimer = null; } };
    el.staffReset.addEventListener('pointerdown', startStaff);
    el.staffReset.addEventListener('pointerup', cancelStaff);
    el.staffReset.addEventListener('pointerleave', cancelStaff);
}

// ═══════════════════════════════════════════════════════════════
//  Feedback — "Border Exit Survey" (persisted to Firestore, UNCHANGED API)
// ═══════════════════════════════════════════════════════════════

const feedback = {
    overlay: null, panel: null, submitBtn: null, skipBtn: null, closeBtn: null, thanks: null,
    ratings: { rating1: 0, rating2: 0 },
    submittedThisSession: false,
    resetAfterClose: false,
};

function getAnonId() {
    try {
        const k = 'ai-photobooth-anon-id';
        let id = localStorage.getItem(k);
        if (!id) {
            id = (window.crypto && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'anon-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem(k, id);
        }
        return id;
    } catch (_) { return null; }
}

function dataUrlToThumbnail(dataUrl, maxWidth = 600, quality = 0.75) {
    return new Promise((resolve, reject) => {
        if (!dataUrl) return resolve(null);
        const img = new Image();
        img.onload = () => {
            const ratio = Math.min(1, maxWidth / img.naturalWidth);
            const w = Math.round(img.naturalWidth * ratio);
            const h = Math.round(img.naturalHeight * ratio);
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = dataUrl;
    });
}

function wireFeedback() {
    feedback.overlay   = $('feedbackOverlay');
    feedback.panel     = $('feedbackPanel');
    feedback.submitBtn = $('submitFeedbackBtn');
    feedback.skipBtn   = $('skipFeedbackBtn');
    feedback.closeBtn  = $('feedbackCloseBtn');
    feedback.thanks    = $('feedbackThanks');
    if (!feedback.panel) return;

    feedback.panel.querySelectorAll('.rating').forEach(group => {
        const key = group.dataset.rating;
        group.querySelectorAll('.rating__star').forEach(star => {
            star.addEventListener('click', () => {
                const value = Number(star.dataset.value);
                feedback.ratings[key] = value;
                group.dataset.value = String(value);
                updateFeedbackSubmitState();
            });
        });
    });

    feedback.submitBtn.addEventListener('click', submitFeedback);
    feedback.skipBtn.addEventListener('click', skipFeedback);
    feedback.closeBtn.addEventListener('click', closeFeedback);
    feedback.overlay.addEventListener('click', (e) => { if (e.target === feedback.overlay) closeFeedback(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !feedback.overlay.hidden) closeFeedback(); });
}

function openFeedback() {
    if (!feedback.overlay) return;
    if (feedback.submittedThisSession) return;
    resetFeedback();
    feedback.overlay.hidden = false;
}
function closeFeedback() {
    if (!feedback.overlay) return;
    feedback.overlay.hidden = true;
    resetFeedback();
    if (feedback.resetAfterClose) {
        feedback.resetAfterClose = false;
        resetAll();
    }
}
function updateFeedbackSubmitState() {
    feedback.submitBtn.disabled = !(feedback.ratings.rating1 >= 1 && feedback.ratings.rating2 >= 1);
}
function resetFeedback() {
    if (!feedback.panel) return;
    feedback.ratings.rating1 = 0;
    feedback.ratings.rating2 = 0;
    feedback.panel.classList.remove('is-submitted');
    feedback.panel.querySelectorAll('.rating').forEach(g => g.removeAttribute('data-value'));
    if (feedback.thanks) { feedback.thanks.hidden = true; }
    feedback.submitBtn.disabled = true;
    feedback.submitBtn.textContent = 'Send feedback';
}
function skipFeedback() { closeFeedback(); }

async function submitFeedback() {
    if (feedback.submitBtn.disabled) return;
    feedback.submitBtn.disabled = true;
    feedback.submitBtn.textContent = 'Sending…';
    try {
        const bgUrl = state.selectedPreset?.backgroundUrl || '';
        const backgroundFilename = bgUrl.split('/').pop() || null;

        let imageDataUrl = null;
        try {
            imageDataUrl = await dataUrlToThumbnail(el.generatedImage.src, 600, 0.75);
        } catch (thumbErr) {
            console.warn('Thumbnail failed:', thumbErr);
        }

        const payload = {
            rating1:    feedback.ratings.rating1,
            rating2:    feedback.ratings.rating2,
            presetName: state.selectedPreset?.name || null,
            backgroundFilename,
            gender:     state.selectedGender || null,
            anonId:     getAnonId(),
            imageDataUrl,
        };
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.details || data.error || 'Could not send feedback');
        }
        feedback.submittedThisSession = true;
        feedback.panel.classList.add('is-submitted');
        feedback.thanks.hidden = false;
        setTimeout(closeFeedback, 1600);
    } catch (err) {
        console.error('Feedback failed:', err);
        toast(err.message || 'Could not send feedback', 'error', 4000);
        feedback.submitBtn.disabled = false;
        feedback.submitBtn.textContent = 'Send feedback';
    }
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
