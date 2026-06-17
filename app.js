// ═════════════════════════════════════════════════════════════════
//  AI Photobooth — Heritage edition
//  Three-step wizard: Capture → Choose → Reveal
// ═════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
const state = {
    step: 1,
    stream: null,
    // Two-shot capture: a face close-up (Image 1 → facial likeness) and a
    // full-body shot (Image 2 → body type). Both are sent to /api/generate.
    // `pending*` holds the shot under review before it's confirmed.
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
    // { "bhimbetka-rock-shelter.jpg": 12, ... } — populated by /api/usage
    usageCounts: {},
};

// The picker sample (1 per preset+gender) — shown so the visitor sees the kind
// of result a destination produces. Falls back to the raw background if absent.
function sampleUrl(presetId, gender) {
    return `assets/templates/sample-${presetId}-${gender || 'male'}.jpg`;
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
    { id: 1,  name: 'Khajuraho — Kandariya Mahadev',  description: 'UNESCO-listed Chandela-era sandstone temples',     backgroundUrl: 'assets/backgrounds/jagdambi-temple-kandariya-mahadev-temple.jpg' },
    { id: 2,  name: 'Khajuraho — Lakshmana Temple',   description: 'The finely carved 10th-century Chandela temple',   backgroundUrl: 'assets/backgrounds/lakshmana-temple-img-9753-hdr.jpg' },
    { id: 7,  name: 'Sanchi Stupa',                   description: 'UNESCO Buddhist monument with carved toranas',     backgroundUrl: 'assets/backgrounds/sanchi-stupa.jpg' },
    { id: 3,  name: 'Orchha — Jahangir Mahal',        description: '17th-century Bundela palace, arched courtyards',   backgroundUrl: 'assets/backgrounds/jahangir-mahal-6-copy.jpg' },
    { id: 4,  name: 'Orchha — Jahangir Gate',         description: 'Monumental Bundela-Mughal archway',                backgroundUrl: 'assets/backgrounds/jahangir-gate-orchha.jpg' },
    { id: 8,  name: 'Mandu — Jahaz Mahal',            description: 'Ship Palace of the Royal Enclave, monsoon mood',   backgroundUrl: 'assets/backgrounds/jahaz-mahal-mandu.jpg' },
    { id: 6,  name: 'Maheshwar — Chhatri by the River', description: 'Holkar cenotaphs above the Narmada ghats',       backgroundUrl: 'assets/backgrounds/chattei-river-view-7.jpg' },
    { id: 9,  name: 'Krishnabai Holkar Chhatri',      description: "The queen's cenotaph above the Narmada, Maheshwar", backgroundUrl: 'assets/backgrounds/krishnabai-holkar-chhatri.jpg' },
    { id: 10, name: 'Indore — Rajwada Palace',        description: 'The seven-storey Holkar palace of Indore',         backgroundUrl: 'assets/backgrounds/rajwada-indore.jpg' },
    { id: 11, name: 'Indore — Rajwada Courtyard',     description: 'Inside the Holkar royal seat',                     backgroundUrl: 'assets/backgrounds/rajwada-15.jpg' },
    { id: 14, name: 'Bandhavgarh — Shesh Shaiya',     description: 'Reclining Vishnu in deep Bandhavgarh jungle',      backgroundUrl: 'assets/backgrounds/shesh-shaiya-bandhavgarh.jpg' },
    { id: 12, name: 'Kheoni Sanctuary — Wilds of MP', description: 'Central Indian teak and sal forest',               backgroundUrl: 'assets/backgrounds/kheoni-wildlife-sanctuary.jpg', genders: ['male'] },
    { id: 13, name: 'Kheoni Sanctuary — Forest Trail', description: 'Quiet woodland of teak, sal and bamboo',          backgroundUrl: 'assets/backgrounds/kheoni-wildlife-sanctuary-1.jpg', genders: ['male'] },
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
    fetchUsageCounts();
    if (el.yearSpan) el.yearSpan.textContent = new Date().getFullYear();
}

// Pulls the per-background usage counts and re-renders the destinations so
// the count badge appears on each card. Silent on failure — the counts are
// a nice-to-have, the app works fine without them.
async function fetchUsageCounts() {
    try {
        const r = await fetch('/api/usage');
        const data = await r.json();
        if (data && data.counts) {
            state.usageCounts = data.counts;
            renderDestinations();
        }
    } catch (_) { /* silent */ }
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

    // body phase — both shots captured, move on to pick a destination.
    state.bodyBlob = state.pendingBlob;
    if (state.bodyUrl) URL.revokeObjectURL(state.bodyUrl);
    state.bodyUrl = state.pendingUrl;
    state.pendingBlob = null;
    state.pendingUrl = null;

    goToStep(2);
}

// ═══════════════════════════════════════════════════════════════
//  Step 2: Destinations
// ═══════════════════════════════════════════════════════════════

function visiblePresets() {
    return presets.filter(p => !p.genders || !state.selectedGender || p.genders.includes(state.selectedGender));
}

function renderDestinations() {
    const gender = state.selectedGender || 'male';
    const frag = document.createDocumentFragment();
    visiblePresets().forEach(p => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'destination-card';
        card.setAttribute('role', 'radio');
        card.setAttribute('aria-checked', state.selectedPreset?.id === p.id ? 'true' : 'false');
        if (state.selectedPreset?.id === p.id) card.classList.add('is-selected');
        card.dataset.presetId = p.id;
        // Show a sample of the kind of result this destination produces. Falls
        // back to the raw heritage background if no sample exists yet.
        const sample = sampleUrl(p.id, gender);
        const filename = (p.backgroundUrl || '').split('/').pop();
        const count = state.usageCounts[filename] || 0;
        card.innerHTML = `
            <div class="destination-card__media">
                <img src="${sample}" alt="" loading="lazy"
                     onerror="this.onerror=null;this.src='${p.backgroundUrl}'" />
                <div class="destination-card__uses" aria-label="Used ${count} times">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5Zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>
                    <span>${count}</span>
                </div>
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
        // Compress and encode both shots as data URLs. We send JSON (not
        // multipart) because Vercel mangles multipart bodies → "Unexpected end
        // of form". Sizes kept modest so two base64 images fit the body limit.
        const userImg = await compressImage(state.faceBlob, 0.92, 1600);
        const bodyImg = state.bodyBlob ? await compressImage(state.bodyBlob, 0.85, 1024) : null;
        const userImageDataUrl = await blobToBase64(userImg);
        const bodyImageDataUrl = bodyImg ? await blobToBase64(bodyImg) : null;

        // Stage 1 — GPT Image 2 generates the scene from the face (Image 1),
        // the full-body shot (Image 2 → body type), and the heritage background.
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

        // Stage 2 — face-swap the visitor's real face onto the generated scene to
        // lock identity exactly. Skipped in mock mode (genData.note). If the swap
        // fails we still show the generated image — the booth never breaks.
        let imageB64 = genData.generatedImage;
        let imageMime = genData.mimeType;
        if (!genData.note) {
            try {
                const sceneDataUrl = `data:${genData.mimeType};base64,${genData.generatedImage}`;
                const swapRes = await fetch('/api/faceswap', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sourceImage: userImageDataUrl,
                        targetImage: sceneDataUrl,
                    }),
                });
                const swapData = await swapRes.json();
                if (swapRes.ok && swapData.success && swapData.generatedImage && !swapData.note) {
                    imageB64 = swapData.generatedImage;
                    imageMime = swapData.mimeType;
                } else {
                    console.warn('Face swap skipped:', swapData.note || swapData.details || swapData.error);
                }
            } catch (swapErr) {
                console.warn('Face swap failed, using generated image as-is:', swapErr);
            }
        }

        const rawDataUrl = `data:${imageMime};base64,${imageB64}`;
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

        if (genData.note) toast(genData.note, 'error', 6000);
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
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
    });
    el.genderRadios.forEach(r => { r.checked = false; });
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

    el.generateBtn.addEventListener('click', generate);

    // "Start over" — if the user hasn't given feedback yet this session,
    // surface the popup first; resetAll then runs after they close it
    // (handled inside closeFeedback). Otherwise just reset right away.
    el.newPhotoBtn.addEventListener('click', () => {
        if (feedback.submittedThisSession || !feedback.overlay) {
            resetAll();
            return;
        }
        feedback.resetAfterClose = true;
        openFeedback();
    });
    // The feedback popup surfaces whenever the user takes a post-generation
    // action (download, share, print) — i.e. they've used the image.
    el.downloadBtn.addEventListener('click', () => { download(); openFeedback(); });
    el.shareWhatsAppBtn.addEventListener('click', () => { shareWhatsApp(); openFeedback(); });
    el.printBtn.addEventListener('click', () => { window.print(); openFeedback(); });

    wireFeedback();
}

// ═══════════════════════════════════════════════════════════════
//  Feedback (post-generation star rating, persisted to Firestore)
// ═══════════════════════════════════════════════════════════════

const feedback = {
    overlay: null,
    panel: null,
    submitBtn: null,
    skipBtn: null,
    closeBtn: null,
    thanks: null,
    ratings: { rating1: 0, rating2: 0 },
    submittedThisSession: false,
    resetAfterClose: false,
};

// Stable anonymous user id so admin can spot repeat submitters without
// us collecting any personal data.
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

// Downscale a data URL to a small JPEG thumbnail for the feedback record.
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
    feedback.overlay.addEventListener('click', (e) => {
        if (e.target === feedback.overlay) closeFeedback();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !feedback.overlay.hidden) closeFeedback();
    });
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
    if (feedback.thanks) {
        feedback.thanks.hidden = true;
        feedback.thanks.textContent = 'Thank you for your feedback! ✨';
    }
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

