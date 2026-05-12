// ═════════════════════════════════════════════════════════════════
//  AI Photobooth — Heritage edition
//  Three-step wizard: Capture → Choose → Reveal
// ═════════════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────────────
const state = {
    step: 1,
    stream: null,
    capturedBlob: null,
    capturedUrl: null,
    selectedPreset: null,
    selectedGender: null,
    cameraDevices: [],
};

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
    { id: 1,  name: 'Khajuraho — Kandariya Mahadev',  description: 'UNESCO-listed Chandela-era sandstone temples',     backgroundUrl: 'assets/backgrounds/Jagdambi Temple , Kandariya Mahadev Temple.jpg' },
    { id: 2,  name: 'Khajuraho — Lakshmana Temple',   description: 'The finely carved 10th-century Chandela temple',   backgroundUrl: 'assets/backgrounds/Lakshmana Temple IMG_9753-HDR.jpg' },
    { id: 3,  name: 'Orchha — Jahangir Mahal',        description: '17th-century Bundela palace, arched courtyards',   backgroundUrl: 'assets/backgrounds/Jahangir Mahal 6 - Copy.jpg' },
    { id: 4,  name: 'Orchha — Jahangir Gate',         description: 'Monumental Bundela-Mughal archway',                backgroundUrl: 'assets/backgrounds/jahangir gate orchha.jpg' },
    { id: 6,  name: 'Maheshwar — Chhatri by the River', description: 'Holkar cenotaphs above the Narmada ghats',       backgroundUrl: 'assets/backgrounds/Chattei River view (7).jpg' },
    { id: 9,  name: 'Krishnabai Holkar Chhatri',      description: "The queen's cenotaph above the Narmada, Maheshwar", backgroundUrl: 'assets/backgrounds/Krishnabai holkar chhatri .jpg' },
    { id: 10, name: 'Indore — Rajwada Palace',        description: 'The seven-storey Holkar palace of Indore',         backgroundUrl: 'assets/backgrounds/Rajwada Indore.jpg' },
    { id: 11, name: 'Indore — Rajwada Courtyard',     description: 'Inside the Holkar royal seat',                     backgroundUrl: 'assets/backgrounds/RajWada 15.jpg' },
    { id: 12, name: 'Kheoni Sanctuary — Wilds of MP', description: 'Central Indian teak and sal forest',               backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary .jpg', genders: ['male'] },
    { id: 13, name: 'Kheoni Sanctuary — Forest Trail', description: 'Quiet woodland of teak, sal and bamboo',          backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary 1.jpg', genders: ['male'] },
    { id: 14, name: 'Goa — Cabo de Rama Beach',       description: 'Palm-fringed Goan coast at golden-hour sunset',    backgroundUrl: 'assets/backgrounds/Cabo de Rama Beach_DSC9670.jpg' },
    { id: 15, name: 'Goa — Cola Beach',               description: 'Rocky Goan shoreline framed by forested hills',    backgroundUrl: 'assets/backgrounds/Cola Beach_DSC9401.jpg' },
    { id: 16, name: 'Goa — Salim Ali Bird Sanctuary', description: "Chorão Island's serene mangrove wetland",          backgroundUrl: 'assets/backgrounds/Dr. Salim Ali Bird Sanctuary_DSC8234.jpg' },
    { id: 17, name: "Gulmarg — St. Mary's Church",    description: 'Heritage wooden church in a Kashmir alpine meadow', backgroundUrl: 'assets/backgrounds/Gulmarg landscapes .jpg' },
    { id: 19, name: 'Gulmarg — Daisy Field',          description: 'Open pasture of daisies under Kashmir skies',      backgroundUrl: 'assets/backgrounds/Gulmarg landscapes 3.jpg' },
];

// ── Branding overlay ────────────────────────────────────────────
// Logo + experience locations are composited onto the generated image
// client-side via canvas — no model involvement, deterministic output,
// works at full 2K resolution.
const BRAND_LOGO_SRC = 'assets/brand/aakhon-dekha-logo.png';
const BRAND_LOCATIONS = ['Bhopal', 'Orchha', 'Maheshwar', 'Boat Club'];

let brandLogoImage = null;
let brandLogoPromise = null;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

function preloadBrandLogo() {
    if (brandLogoPromise) return brandLogoPromise;
    brandLogoPromise = loadImage(BRAND_LOGO_SRC)
        .then(img => { brandLogoImage = img; return img; })
        .catch(err => { console.warn('Brand logo preload failed:', err); return null; });
    return brandLogoPromise;
}

// ═══════════════════════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════════════════════

function init() {
    renderDestinations();
    wireEvents();
    loadCameraDevices();
    checkHealth();
    preloadBrandLogo();
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
        state.capturedBlob = blob;
        if (state.capturedUrl) URL.revokeObjectURL(state.capturedUrl);
        state.capturedUrl = URL.createObjectURL(blob);
        el.capturedImage.src = state.capturedUrl;

        // Flip to review state
        el.captureView.hidden = true;
        el.captureReview.hidden = false;
    }, 'image/jpeg', 0.95);
}

function retakePhoto() {
    state.capturedBlob = null;
    if (state.capturedUrl) { URL.revokeObjectURL(state.capturedUrl); state.capturedUrl = null; }
    el.captureReview.hidden = true;
    el.captureView.hidden = false;
}

function confirmCaptureAndAdvance() {
    if (!state.capturedBlob) return;
    if (state.capturedUrl) el.contextPhoto.src = state.capturedUrl;
    goToStep(2);
}

// ═══════════════════════════════════════════════════════════════
//  Step 2: Destinations
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
        card.setAttribute('aria-checked', 'false');
        card.dataset.presetId = p.id;
        card.innerHTML = `
            <div class="destination-card__media">
                <img src="${p.backgroundUrl}" alt="" loading="lazy" />
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

// Composite the brand logo (top-left, rounded plate) and the experience
// locations (bottom-center, dark translucent pill) onto the generated photo.
// Sizes are proportional to the image so the overlay reads the same on
// any output resolution.
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

async function brandifyImage(dataUrl) {
    const photo = await loadImage(dataUrl);
    const logo  = await preloadBrandLogo();

    const W = photo.naturalWidth;
    const H = photo.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Base photo
    ctx.drawImage(photo, 0, 0, W, H);

    // 2. Logo on a slightly-rounded cream plate, top-left
    if (logo) {
        const plateW    = Math.round(W * 0.26);
        const innerPad  = Math.round(plateW * 0.07);
        const logoAR    = logo.naturalWidth / logo.naturalHeight;
        const logoW     = plateW - innerPad * 2;
        const logoH     = Math.round(logoW / logoAR);
        const plateH    = logoH + innerPad * 2;
        const plateX    = Math.round(W * 0.035);
        const plateY    = Math.round(H * 0.028);
        const plateR    = Math.max(14, Math.round(plateW * 0.06));

        ctx.save();
        ctx.shadowColor   = 'rgba(0, 0, 0, 0.32)';
        ctx.shadowBlur    = Math.round(plateW * 0.05);
        ctx.shadowOffsetY = Math.round(plateW * 0.012);
        ctx.fillStyle     = 'rgba(255, 252, 246, 0.94)';
        drawRoundedRect(ctx, plateX, plateY, plateW, plateH, plateR);
        ctx.fill();
        ctx.restore();

        ctx.drawImage(logo, plateX + innerPad, plateY + innerPad, logoW, logoH);
    }

    // 3. Locations pill, bottom-center
    const text     = BRAND_LOCATIONS.join('   ·   ');
    const fontSize = Math.max(18, Math.round(H * 0.022));
    const fontSpec = `500 ${fontSize}px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    ctx.font         = fontSpec;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const textW    = ctx.measureText(text).width;
    const pillPadX = Math.round(fontSize * 1.4);
    const pillPadY = Math.round(fontSize * 0.6);
    const pillW    = Math.round(textW + pillPadX * 2);
    const pillH    = fontSize + pillPadY * 2;
    const pillX    = Math.round((W - pillW) / 2);
    const pillY    = Math.round(H - pillH - H * 0.04);
    const pillR    = pillH / 2;

    ctx.save();
    ctx.shadowColor   = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur    = Math.round(H * 0.012);
    ctx.shadowOffsetY = Math.round(H * 0.003);
    ctx.fillStyle     = 'rgba(0, 0, 0, 0.62)';
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill();
    ctx.restore();

    ctx.font         = fontSpec;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#fff';
    ctx.fillText(text, W / 2, pillY + pillH / 2 + 1);

    return canvas.toDataURL('image/jpeg', 0.95);
}

const LOADING_HINTS = [
    'Setting the scene…',
    'Tailoring your outfit…',
    'Matching light and shadows…',
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
    if (!state.capturedBlob || !state.selectedPreset || !state.selectedGender) {
        toast('Please capture a photo, pick male/female, and choose a destination.', 'error');
        return;
    }

    goToStep(3);
    el.loadingState.hidden = false;
    el.resultPanel.hidden = true;
    startLoadingHints();

    try {
        const userImg = await compressImage(state.capturedBlob, 0.95, 2048);

        const genForm = new FormData();
        genForm.append('userImage', userImg, 'photo.jpg');
        genForm.append('presetId', String(state.selectedPreset.id));
        genForm.append('gender', state.selectedGender);

        const genRes = await fetch('/api/generate', { method: 'POST', body: genForm });
        const genData = await genRes.json();
        if (!genRes.ok || !genData.success) {
            throw new Error(genData.details || genData.error || 'Generation failed');
        }

        const rawDataUrl = `data:${genData.mimeType};base64,${genData.generatedImage}`;
        let finalDataUrl;
        try {
            finalDataUrl = await brandifyImage(rawDataUrl);
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
    state.selectedPreset = null;
    state.selectedGender = null;
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
    });
    el.genderRadios.forEach(r => { r.checked = false; });
    el.selectedDestName.textContent = 'Nothing yet';
    el.generateBtn.disabled = true;
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
        goToStep(1);
    });

    el.genderRadios.forEach(r => r.addEventListener('change', handleGenderChange));

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

