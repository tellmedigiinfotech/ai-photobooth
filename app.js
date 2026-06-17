// ═════════════════════════════════════════════════════════════════
//  AI Photobooth — Heritage edition
//  Three-step wizard: Capture → Choose → Reveal
// ═════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
const state = {
    step: 1,
    stream: null,
    // Two-shot capture: a face close-up (drives the face-swap) and a full-body
    // shot (drives the body-build match). `pending*` holds the shot currently
    // under review before it's confirmed into face*/body*.
    capturePhase: 'face',        // 'face' | 'body'
    pendingBlob: null,
    pendingUrl: null,
    faceBlob: null,
    faceUrl: null,
    bodyBlob: null,
    bodyUrl: null,
    selectedPreset: null,
    selectedGender: null,
    selectedBuild: 'average',    // slim | average | heavier — body-build template variant
    cameraDevices: [],
};

const BUILDS = ['slim', 'average', 'heavier'];

// The frozen, ops-approved hero template for a (preset, gender, build). The app
// face-swaps the visitor onto this exact image, so the background never changes.
function templateUrl(presetId, gender, build) {
    return `assets/templates/preset-${presetId}-${gender || 'male'}-${build || 'average'}.jpg`;
}

// ── DOM ──────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const el = {
    stepperItems: document.querySelectorAll('.stepper__item'),
    stepSections: document.querySelectorAll('.step'),

    // Step 1
    webcam:             $('webcam'),
    canvas:             $('canvas'),
    cameraPlaceholder:  $('cameraPlaceholder'),
    startCameraBtn:     $('startCameraBtn'),
    captureControls:    $('captureControls'),
    cameraSourceField:  $('cameraSourceField'),
    cameraSelect:       $('cameraSelect'),
    captureBtn:         $('captureBtn'),
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

    // Step 2
    contextPhoto:       $('contextPhoto'),
    editPhotoBtn:       $('editPhotoBtn'),
    genderRadios:       document.querySelectorAll('input[name="gender"]'),
    buildToggle:        $('buildToggle'),
    buildRadios:        document.querySelectorAll('input[name="build"]'),
    buildPrompt:        $('buildPrompt'),
    presetsGrid:        $('presetsGrid'),
    generateBtn:        $('generateBtn'),
    selectedDestName:   $('selectedDestinationName'),

    // Step 3
    loadingState:       $('loadingState'),
    loadingHint:        $('loadingHint'),
    resultPanel:        $('resultPanel'),
    generatedImage:     $('generatedImage'),
    resultLocation:     $('resultLocation'),
    newPhotoBtn:        $('newPhotoBtn'),
    downloadBtn:        $('downloadBtn'),
    shareWhatsAppBtn:   $('shareWhatsAppBtn'),
    printBtn:           $('printBtn'),

    toast:              $('toast'),
    yearSpan:           $('yearSpan'),
};

// ── Presets ──────────────────────────────────────────────────────
// Display data only — the actual prompt template + outfit per gender
// lives server-side in api/generate.js (PRESETS). The client just sends
// presetId + gender.
const presets = [
    { id: 5,  name: 'Bhimbetka Rock Shelters',        description: 'Prehistoric sandstone overhang, 30,000 BCE',       backgroundUrl: 'assets/backgrounds/Bhimbetka rock shelter.jpg' },
    { id: 1,  name: 'Khajuraho — Kandariya Mahadev',  description: 'UNESCO-listed Chandela-era sandstone temples',     backgroundUrl: 'assets/backgrounds/Jagdambi Temple , Kandariya Mahadev Temple.jpg' },
    { id: 2,  name: 'Khajuraho — Lakshmana Temple',   description: 'The finely carved 10th-century Chandela temple',   backgroundUrl: 'assets/backgrounds/Lakshmana Temple IMG_9753-HDR.jpg' },
    { id: 7,  name: 'Sanchi Stupa',                   description: 'UNESCO Buddhist monument with carved toranas',     backgroundUrl: 'assets/backgrounds/Sanchi Stupa.jpg' },
    { id: 3,  name: 'Orchha — Jahangir Mahal',        description: '17th-century Bundela palace, arched courtyards',   backgroundUrl: 'assets/backgrounds/Jahangir Mahal 6 - Copy.jpg' },
    { id: 4,  name: 'Orchha — Jahangir Gate',         description: 'Monumental Bundela-Mughal archway',                backgroundUrl: 'assets/backgrounds/jahangir gate orchha.jpg' },
    { id: 8,  name: 'Mandu — Jahaz Mahal',            description: 'Ship Palace of the Royal Enclave, monsoon mood',   backgroundUrl: 'assets/backgrounds/Jahaz Mahal Mandu.jpg' },
    { id: 6,  name: 'Maheshwar — Chhatri by the River', description: 'Holkar cenotaphs above the Narmada ghats',       backgroundUrl: 'assets/backgrounds/Chattei River view (7).jpg' },
    { id: 9,  name: 'Krishnabai Holkar Chhatri',      description: "The queen's cenotaph above the Narmada, Maheshwar", backgroundUrl: 'assets/backgrounds/Krishnabai holkar chhatri .jpg' },
    { id: 10, name: 'Indore — Rajwada Palace',        description: 'The seven-storey Holkar palace of Indore',         backgroundUrl: 'assets/backgrounds/Rajwada Indore.jpg' },
    { id: 11, name: 'Indore — Rajwada Courtyard',     description: 'Inside the Holkar royal seat',                     backgroundUrl: 'assets/backgrounds/RajWada 15.jpg' },
    { id: 14, name: 'Bandhavgarh — Shesh Shaiya',     description: 'Reclining Vishnu in deep Bandhavgarh jungle',      backgroundUrl: 'assets/backgrounds/Shesh Shaiya Bandhavgarh.jpg' },
    { id: 12, name: 'Kheoni Sanctuary — Wilds of MP', description: 'Central Indian teak and sal forest',               backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary .jpg', genders: ['male'] },
    { id: 13, name: 'Kheoni Sanctuary — Forest Trail', description: 'Quiet woodland of teak, sal and bamboo',          backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary 1.jpg', genders: ['male'] },
];

// ── Branding overlay ────────────────────────────────────────────
// Two circular logos are composited onto the generated image client-side
// via canvas: DAAMS (Madhya Pradesh Directorate of Archaeology) top-left,
// Aakhon Dekha top-right. The bottom caption shows the actual heritage
// location of the photo. Deterministic, no model involvement.
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
    wireEvents();
    loadCameraDevices();
    checkHealth();
    preloadBrandLogos();
    if (el.yearSpan) el.yearSpan.textContent = new Date().getFullYear();
}

async function checkHealth() {
    try {
        const r = await fetch('/api/health');
        const data = await r.json();
        if (!data.apiKeyConfigured) {
            toast('Running in mock mode — no API key configured.', 'error', 5000);
        }
    } catch (_) { /* silent; user will see failures when they generate */ }
}

// ═══════════════════════════════════════════════════════════════
//  Step navigation
// ═══════════════════════════════════════════════════════════════

function goToStep(n) {
    state.step = n;

    // Sections
    el.stepSections.forEach(section => {
        const thisStep = Number(section.dataset.step);
        section.hidden = (thisStep !== n);
    });

    // Stepper
    el.stepperItems.forEach(item => {
        const thisStep = Number(item.dataset.step);
        item.classList.toggle('is-active', thisStep === n);
        item.classList.toggle('is-done', thisStep < n);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════════════════════════
//  Step 1: Camera & capture
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
    // Only show the source selector when there are multiple cameras
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

        // Refresh labels (only available after permission granted)
        await loadCameraDevices();
    } catch (err) {
        console.error('Camera error:', err);
        toast('Could not access the camera. Check permissions.', 'error');
    }
}

async function handleCameraChange() {
    if (!state.stream) return;
    await startCamera();
    toast('Camera switched.', 'success');
}

// Copy per phase, so one capture view serves both the face and body shots.
const CAPTURE_COPY = {
    face: {
        phase:  'Photo 1 of 2 · Face close-up',
        title:  'Smile for the camera',
        intro:  'A close-up of your face — look straight into the lens, keep your head and shoulders inside the guide.',
        review: 'How’s your face shot?',
        next:   'Looks good →',
    },
    body: {
        phase:  'Photo 2 of 2 · Full body',
        title:  'Now step back',
        intro:  'A full-body shot, head to knees — this is used only to match your body type, then discarded.',
        review: 'How’s your full-body shot?',
        next:   'Use this →',
    },
};

function setCapturePhase(phase) {
    state.capturePhase = phase;
    const c = CAPTURE_COPY[phase];
    el.capturePhaseLabel.textContent = c.phase;
    el.captureTitle.textContent = c.title;
    el.captureIntro.textContent = c.intro;
    el.captureReviewTitle.textContent = c.review;
    el.toStep2Btn.textContent = c.next;
    // Back to the live view for the new shot (camera keeps running).
    el.captureReview.hidden = true;
    el.captureView.hidden = false;
}

function capturePhoto() {
    const ctx = el.canvas.getContext('2d');
    el.canvas.width = el.webcam.videoWidth;
    el.canvas.height = el.webcam.videoHeight;

    // Mirror horizontally to match the preview, so the saved shot matches what
    // the user saw when they hit the shutter.
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

        // Flip to review state
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

// "Looks good" on the review screen. Face → advance to the body shot.
// Body → keep the shot, kick off build classification, and go to step 2.
async function confirmCaptureAndAdvance() {
    if (!state.pendingBlob) return;

    if (state.capturePhase === 'face') {
        state.faceBlob = state.pendingBlob;
        if (state.faceUrl) URL.revokeObjectURL(state.faceUrl);
        state.faceUrl = state.pendingUrl;
        state.pendingBlob = null;
        state.pendingUrl = null;
        el.contextPhoto.src = state.faceUrl;
        setCapturePhase('body');
        return;
    }

    // body phase
    state.bodyBlob = state.pendingBlob;
    if (state.bodyUrl) URL.revokeObjectURL(state.bodyUrl);
    state.bodyUrl = state.pendingUrl;
    state.pendingBlob = null;
    state.pendingUrl = null;

    goToStep(2);
    classifyBuild(state.bodyBlob); // async; preselects the body-type radio
}

// Ask the server to classify the full-body shot as slim/average/heavier and
// preselect it. Non-blocking and best-effort — the operator can always adjust,
// and we default to "average" if it fails.
async function classifyBuild(bodyBlob) {
    el.buildPrompt.textContent = 'Reading your body type…';
    try {
        const img = await compressImage(bodyBlob, 0.85, 1024);
        const form = new FormData();
        form.append('bodyImage', img, 'body.jpg');
        const res = await fetch('/api/classify-build', { method: 'POST', body: form });
        const data = await res.json();
        if (res.ok && data.build && BUILDS.includes(data.build)) {
            setBuild(data.build);
            el.buildPrompt.textContent = 'Body type — matched from your full-body photo, adjust if needed';
        } else {
            throw new Error(data.error || 'no build');
        }
    } catch (err) {
        console.warn('Build classification failed, defaulting to average:', err);
        setBuild('average');
        el.buildPrompt.textContent = 'Body type — pick the closest match';
    }
}

function setBuild(build) {
    state.selectedBuild = BUILDS.includes(build) ? build : 'average';
    el.buildRadios.forEach(r => { r.checked = (r.value === state.selectedBuild); });
    renderDestinations(); // hero thumbnails reflect the chosen build
}

// ═══════════════════════════════════════════════════════════════
//  Step 2: Destinations
// ═══════════════════════════════════════════════════════════════

function visiblePresets() {
    return presets.filter(p => !p.genders || !state.selectedGender || p.genders.includes(state.selectedGender));
}

function renderDestinations() {
    const gender = state.selectedGender || 'male';
    const build = state.selectedBuild || 'average';
    const frag = document.createDocumentFragment();
    visiblePresets().forEach(p => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'destination-card';
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', state.selectedPreset?.id === p.id ? 'true' : 'false');
        if (state.selectedPreset?.id === p.id) card.classList.add('is-selected');
        card.dataset.presetId = p.id;
        // Show the actual frozen hero template the visitor will receive (minus
        // their face). Falls back to the raw background if a template is missing.
        const tpl = templateUrl(p.id, gender, build);
        card.innerHTML = `
            <div class="destination-card__media">
                <img src="${tpl}" alt="" loading="lazy"
                     onerror="this.onerror=null;this.src='${p.backgroundUrl}'" />
            </div>
            <div class="destination-card__check" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 17.575-4.95-4.95 1.414-1.414 3.536 3.536 7.07-7.071 1.415 1.414-8.485 8.485Z"/></svg>
            </div>
            <div class="destination-card__overlay">
                <div class="destination-card__name">${escapeHtml(p.name)}</div>
                <div class="destination-card__desc">${escapeHtml(p.description)}</div>
            </div>`;
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
    updateGenerateEnabled();
}

function handleGenderChange(e) {
    const value = e.target.value;
    if (value === 'male' || value === 'female') state.selectedGender = value;

    // Re-render destinations so gender-restricted presets disappear / reappear.
    renderDestinations();

    // If the previously selected preset is no longer visible for this gender,
    // clear it so the user must pick again.
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
//  Step 3: Generation
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
        reader.onload = () => resolve(reader.result); // data: URL
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Composite the brand logo (top-right, circular badge with white ring) and
// the bilingual tagline (bottom-center, dark translucent rounded plate)
// onto the generated photo. Sizes are proportional to the image so the
// overlay reads the same on any output resolution.
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

// Wait for the Eczar webfont to load before drawing — otherwise the canvas
// silently substitutes a default font and the typography won't match the UI.
async function ensureBrandFonts(captionSize) {
    if (!document.fonts || !document.fonts.load) return;
    try {
        await document.fonts.load(`700 ${captionSize}px "Eczar"`);
    } catch (_) { /* fall back to system fonts if Google Fonts fails */ }
}

// Each new logo is already designed as a circle with its own border/canvas,
// so we clip+draw without an outer white ring and let the design speak.
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

    const W = photo.naturalWidth;
    const H = photo.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Base photo
    ctx.drawImage(photo, 0, 0, W, H);

    // 2. Two mirrored circular logo badges — DAAMS top-left, Aakhon Dekha
    //    top-right. Same diameter, same vertical inset.
    const badgeD = Math.round(W * 0.11);
    const badgeR = badgeD / 2;
    const inset  = Math.round(W * 0.03);
    const cyTop  = Math.round(H * 0.03 + badgeR);
    const cxLeft  = inset + badgeR;
    const cxRight = W - inset - badgeR;

    // Soft drop shadow drawn as a filled disc — gives both logos a
    // consistent shadow shape regardless of their own transparency.
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

    // 3. Bottom caption — the actual heritage location of the photo, in
    //    Eczar Bold, on a soft dark gradient fade.
    const caption = (locationName || '').trim();
    if (caption) {
        const captionSize = Math.max(16, Math.round(H * 0.022));
        await ensureBrandFonts(captionSize);

        const fontStack   = '"Eczar", "Tiro Devanagari Hindi", "Noto Serif Devanagari", "Kohinoor Devanagari", "Mangal", "Nirmala UI", Georgia, serif';
        const captionFont = `700 ${captionSize}px ${fontStack}`;

        // 3a. Gradient fade so text reads on any background
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

        // 3b. Caption text with drop shadow
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

const LOADING_HINTS = [
    'Setting the scene…',
    'Tailoring your outfit…',
    'Matching light and shadows…',
    'Perfecting your likeness…',
    'Adding the final touches…',
    'Almost there…',
];
let loadingHintTimer = null;
function startLoadingHints() {
    let i = 0;
    el.loadingHint.textContent = LOADING_HINTS[0];
    loadingHintTimer = setInterval(() => {
        i = (i + 1) % LOADING_HINTS.length;
        el.loadingHint.textContent = LOADING_HINTS[i];
    }, 4500);
}
function stopLoadingHints() {
    clearInterval(loadingHintTimer);
    loadingHintTimer = null;
}

async function generate() {
    if (!state.faceBlob || !state.selectedPreset || !state.selectedGender) {
        toast('Please capture your photos, pick male/female, and choose a destination.', 'error');
        return;
    }

    goToStep(3);
    el.loadingState.hidden = false;
    el.resultPanel.hidden = true;
    startLoadingHints();

    try {
        const userImg = await compressImage(state.faceBlob, 0.95, 2048);

        // Fetch the frozen, ops-approved hero template for this preset + gender
        // + body build. We DON'T generate a scene per user — we only swap the
        // visitor's face onto this fixed image, so the background is identical
        // every time and the output is predictable.
        const tplResp = await fetch(templateUrl(state.selectedPreset.id, state.selectedGender, state.selectedBuild));
        if (!tplResp.ok) throw new Error('This look isn’t ready yet — please pick another destination.');
        const templateBlob = await tplResp.blob();

        // Face-swap the visitor onto the template.
        const swapForm = new FormData();
        swapForm.append('sourceImage', userImg, 'face.jpg');
        swapForm.append('targetImage', templateBlob, 'template.png');

        const swapRes = await fetch('/api/faceswap', { method: 'POST', body: swapForm });
        const swapData = await swapRes.json();
        if (!swapRes.ok || !swapData.success) {
            throw new Error(swapData.details || swapData.error || 'Face swap failed');
        }

        // swapData.note means the swap couldn't run (e.g. no Replicate token) —
        // it returns the template unchanged. That's a config issue, not a result
        // we'd want to hand a visitor (it'd show a stranger's face), so flag it.
        let rawDataUrl;
        if (swapData.note) {
            console.warn('Face swap skipped:', swapData.note);
            const tplB64 = await blobToBase64(templateBlob);
            rawDataUrl = tplB64;
        } else {
            rawDataUrl = `data:${swapData.mimeType};base64,${swapData.generatedImage}`;
        }
        let finalDataUrl;
        try {
            finalDataUrl = await brandifyImage(rawDataUrl, state.selectedPreset.name);
        } catch (overlayErr) {
            console.warn('Brand overlay failed, falling back to raw image:', overlayErr);
            finalDataUrl = rawDataUrl;
        }
        el.generatedImage.src = finalDataUrl;
        el.resultLocation.textContent = state.selectedPreset.name;
        el.loadingState.hidden = true;
        el.resultPanel.hidden = false;

        if (swapData.note) toast('Face swap is not configured — showing the sample look.', 'error', 6000);
        else toast('Your photo is ready!', 'success');
    } catch (err) {
        console.error(err);
        toast(err.message || 'Generation failed. Please try again.', 'error', 6000);
        // On failure, return to step 2 so the user can retry
        el.loadingState.hidden = true;
        goToStep(2);
    } finally {
        stopLoadingHints();
    }
}

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

// Share to WhatsApp via the Web Share API (mobile — opens the native share
// sheet where the user picks WhatsApp). On desktop, falls back to opening
// WhatsApp Web with a prefilled text message and triggers a download so the
// user can attach it manually, since wa.me URLs can't carry image payloads.
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

        // Desktop fallback — trigger a download and open WhatsApp Web with text.
        download();
        const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(caption)}`;
        window.open(url, '_blank');
        toast('Image downloaded. Attach it in the WhatsApp window that just opened.', '', 5500);
    } catch (err) {
        if (err.name === 'AbortError') return; // user dismissed the share sheet
        console.error('WhatsApp share failed:', err);
        toast('Share failed — try downloading and sending manually.', 'error');
    }
}

// ═══════════════════════════════════════════════════════════════
//  Reset
// ═══════════════════════════════════════════════════════════════

function resetAll() {
    retakePhoto();
    // Clear both captures and start the camera flow over at the face shot.
    [state.faceUrl, state.bodyUrl].forEach(u => { if (u) URL.revokeObjectURL(u); });
    state.faceBlob = state.faceUrl = state.bodyBlob = state.bodyUrl = null;
    state.selectedPreset = null;
    state.selectedGender = null;
    state.selectedBuild = 'average';
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
    });
    el.genderRadios.forEach(r => { r.checked = false; });
    el.buildRadios.forEach(r => { r.checked = false; });
    el.selectedDestName.textContent = 'Nothing yet';
    el.generateBtn.disabled = true;
    setCapturePhase('face');
    goToStep(1);
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
    el.startCameraBtn.addEventListener('click', startCamera);
    el.cameraSelect.addEventListener('change', handleCameraChange);
    el.captureBtn.addEventListener('click', capturePhoto);
    el.retakeBtn.addEventListener('click', retakePhoto);
    el.toStep2Btn.addEventListener('click', confirmCaptureAndAdvance);

    el.editPhotoBtn.addEventListener('click', () => {
        retakePhoto();
        setCapturePhase('face');
        goToStep(1);
    });

    el.genderRadios.forEach(r => r.addEventListener('change', handleGenderChange));
    el.buildRadios.forEach(r => r.addEventListener('change', e => setBuild(e.target.value)));

    el.generateBtn.addEventListener('click', generate);

    el.newPhotoBtn.addEventListener('click', resetAll);
    el.downloadBtn.addEventListener('click', download);
    el.shareWhatsAppBtn.addEventListener('click', shareWhatsApp);
    el.printBtn.addEventListener('click', () => window.print());
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

