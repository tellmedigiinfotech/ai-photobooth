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

// Per-preset prompts describe the scene + attire. The server adds the
// identity-preservation scaffolding and labels the three reference angles,
// so no prefix is appended here — keeping prompt signal-to-noise high.

// ── Presets ──────────────────────────────────────────────────────
const presets = [
    {
        id: 1,
        name: 'Khajuraho — Kandariya Mahadev',
        description: 'UNESCO-listed Chandela-era sandstone temples',
        prompt: 'Composite the person naturally into the provided background photograph of the Kandariya Mahadev and Jagdambi temples at Khajuraho, Madhya Pradesh. Place the person standing on the temple platform in the mid-foreground, framed by the carved sandstone wall behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain ivory cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in soft mustard with a thin gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the pale sandstone.',
        backgroundUrl: 'assets/backgrounds/Jagdambi Temple , Kandariya Mahadev Temple.jpg'
    },
    {
        id: 2,
        name: 'Khajuraho — Lakshmana Temple',
        description: 'The finely carved 10th-century Chandela temple',
        prompt: 'Composite the person naturally into the provided background photograph of the Lakshmana Temple at Khajuraho, Madhya Pradesh. Place the person standing on the temple plinth in the mid-foreground, framed by the carved sandstone reliefs behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain off-white cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in ivory with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused sunlight on the sandstone.',
        backgroundUrl: 'assets/backgrounds/Lakshmana Temple IMG_9753-HDR.jpg'
    },
    {
        id: 3,
        name: 'Orchha — Jahangir Mahal',
        description: '17th-century Bundela palace, arched courtyards',
        prompt: 'Composite the person naturally into the provided background photograph of Jahangir Mahal at Orchha, Madhya Pradesh. Place the person standing in an arched gallery in the mid-foreground, framed by the sandstone arches behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain jade-green cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in deep red with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight falling through the arches.',
        backgroundUrl: 'assets/backgrounds/Jahangir Mahal 6 - Copy.jpg'
    },
    {
        id: 4,
        name: 'Orchha — Jahangir Gate',
        description: 'Monumental Bundela-Mughal archway',
        prompt: 'Composite the person naturally into the provided background photograph of the grand entrance gate of Jahangir Mahal at Orchha, Madhya Pradesh. Place the person standing just in front of the archway in the mid-foreground, framed by the carved stone brackets above them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain saffron cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in deep maroon with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the pale stone.',
        backgroundUrl: 'assets/backgrounds/jahangir gate orchha.jpg'
    },
    {
        id: 5,
        name: 'Mandu — Watchful Gates',
        description: 'Afghan-era fortress gateways of the Malwa Sultanate',
        prompt: 'Composite the person naturally into the provided background photograph of the monumental stone gateways of Mandu, Madhya Pradesh. Place the person standing beneath the gateway arch in the mid-foreground, framed by the weathered stone masonry behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain deep-indigo cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in teal with a rust-red border, small silver stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the weathered stone.',
        backgroundUrl: 'assets/backgrounds/Mandu’s Watchful Gates.jpg'
    },
    {
        id: 6,
        name: 'Maheshwar — Chhatri by the River',
        description: 'Holkar cenotaphs above the Narmada ghats',
        prompt: 'Composite the person naturally into the provided background photograph of the riverside chhatri at Maheshwar, Madhya Pradesh. Place the person standing on the stone platform in the mid-foreground, framed by the sandstone chhatri rising behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with a cream cotton dhoti; for women, a Maheshwari silk-cotton saree in burgundy with a thin gold border, a small gold nath (nose pin), a simple gold thushi (short choker), small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused river-reflected daylight.',
        backgroundUrl: 'assets/backgrounds/Chattei River view (7).jpg'
    },
    {
        id: 7,
        name: 'Holkar Chhatris I',
        description: 'Domed sandstone cenotaphs with pillared verandas',
        prompt: 'Composite the person naturally into the provided background photograph of the Holkar-dynasty chhatris in Madhya Pradesh. Place the person standing on the stone plinth in the mid-foreground, framed by the carved sandstone columns behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in forest green with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the sandstone.',
        backgroundUrl: 'assets/backgrounds/Chattri Monuments 1.jpg'
    },
    {
        id: 8,
        name: 'Holkar Chhatris II',
        description: 'Regal silhouette of a domed royal cenotaph',
        prompt: 'Composite the person naturally into the provided background photograph of the domed chhatri monument in Madhya Pradesh. Place the person standing in the mid-foreground directly in front of the chhatri, framed by its carved silhouette behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain ivory cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in deep red with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused golden daylight on the monument.',
        backgroundUrl: 'assets/backgrounds/Chattri Monuments 4.jpg'
    },
    {
        id: 9,
        name: 'Krishnabai Holkar Chhatri',
        description: 'The queen\'s cenotaph above the Narmada, Maheshwar',
        prompt: 'Composite the person naturally into the provided background photograph of the Krishnabai Holkar chhatri at Maheshwar, Madhya Pradesh. Place the person standing on the stone plinth in the mid-foreground, framed by the chhatri rising behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in royal blue with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused Narmada-side daylight.',
        backgroundUrl: 'assets/backgrounds/Krishnabai holkar chhatri .jpg'
    },
    {
        id: 10,
        name: 'Indore — Rajwada Palace',
        description: 'The seven-storey Holkar palace of Indore',
        prompt: 'Composite the person naturally into the provided background photograph of Rajwada Palace in Indore, Madhya Pradesh. Place the person standing before the main entrance in the mid-foreground, framed by the wooden-and-stone palace facade behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Paithani silk-cotton saree in peacock green with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the palace facade.',
        backgroundUrl: 'assets/backgrounds/Rajwada Indore.jpg'
    },
    {
        id: 11,
        name: 'Indore — Rajwada Courtyard',
        description: 'Inside the Holkar royal seat',
        prompt: 'Composite the person naturally into the provided background photograph of the inner courtyard and facade of Rajwada Palace in Indore, Madhya Pradesh. Place the person standing in the mid-foreground courtyard, framed by the palace wings behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in teal with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight of the courtyard.',
        backgroundUrl: 'assets/backgrounds/RajWada 15.jpg'
    },
    {
        id: 12,
        name: 'Kheoni Sanctuary — Wilds of MP',
        description: 'Central Indian teak and sal forest',
        prompt: 'Composite the person naturally into the provided background photograph of Kheoni Wildlife Sanctuary in Madhya Pradesh. Place the person standing on the forest path in the mid-foreground, framed by the teak and sal trees behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire simple and everyday: for men, a plain olive cotton kurta with loose cream cotton trousers; for women, a plain olive cotton kurta with matching cotton palazzo trousers. Match the skin lighting to the soft dappled forest daylight.',
        backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary .jpg'
    },
    {
        id: 13,
        name: 'Kheoni Sanctuary — Forest Trail',
        description: 'Quiet woodland of teak, sal and bamboo',
        prompt: 'Composite the person naturally into the provided background photograph of a forest trail inside Kheoni Wildlife Sanctuary, Madhya Pradesh. Place the person standing on the trail in the mid-foreground, framed by the teak and bamboo trees behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire simple and everyday: for men, a plain beige cotton kurta with loose cream cotton trousers; for women, a plain beige cotton kurta with matching cotton palazzo trousers. Match the skin lighting to the soft cool filtered forest light.',
        backgroundUrl: 'assets/backgrounds/kheoni wildlife sanctuary 1.jpg'
    }
];

// ═══════════════════════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════════════════════

function init() {
    renderDestinations();
    wireEvents();
    loadCameraDevices();
    checkHealth();
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

function renderDestinations() {
    const frag = document.createDocumentFragment();
    presets.forEach(p => {
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
    el.generateBtn.disabled = false;
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

const SCENE_HINTS = [
    'Painting the heritage scene…',
    'Dressing you in traditional attire…',
    'Aligning shadows and perspective…',
];
const SWAP_HINTS = [
    'Locking in your face with pixel accuracy…',
    'Blending skin tone and lighting…',
    'Final touches…',
];
let loadingHintTimer = null;
function cycleHints(hints) {
    stopLoadingHints();
    let i = 0;
    el.loadingHint.textContent = hints[0];
    loadingHintTimer = setInterval(() => {
        i = (i + 1) % hints.length;
        el.loadingHint.textContent = hints[i];
    }, 4500);
}
function stopLoadingHints() {
    clearInterval(loadingHintTimer);
    loadingHintTimer = null;
}

async function generate() {
    if (!state.capturedBlob || !state.selectedPreset) {
        toast('Please capture a photo and pick a destination.', 'error');
        return;
    }

    goToStep(3);
    el.loadingState.hidden = false;
    el.resultPanel.hidden = true;
    cycleHints(SCENE_HINTS);

    try {
        // Stage 1 — scene generation via Gemini.
        // Reference photo only informs age/gender/complexion now, so a
        // modest 1280px compression is plenty.
        const userImg = await compressImage(state.capturedBlob, 0.9, 1280);

        const genForm = new FormData();
        genForm.append('userImage', userImg, 'photo.jpg');
        genForm.append('prompt', state.selectedPreset.prompt);

        try {
            const bgRes = await fetch(state.selectedPreset.backgroundUrl);
            if (bgRes.ok) {
                const bgBlob = await bgRes.blob();
                const bgCompressed = await compressImage(bgBlob, 0.6, 1280);
                genForm.append('backgroundImage', bgCompressed, 'bg.jpg');
            }
        } catch (e) {
            console.warn('Background fetch failed; continuing without it.');
        }

        const genRes = await fetch('/api/generate', { method: 'POST', body: genForm });
        const genData = await genRes.json();
        if (!genRes.ok || !genData.success) {
            throw new Error(genData.details || genData.error || 'Scene generation failed');
        }

        // Stage 2 — face swap. Source = webcam face, target = Gemini scene.
        // On mock mode (no GEMINI_API_KEY), genData.generatedImage is the
        // original webcam photo; skip the swap and just show it.
        let finalDataUrl;
        if (genData.note) {
            finalDataUrl = `data:${genData.mimeType};base64,${genData.generatedImage}`;
            toast(genData.note, 'error', 6000);
        } else {
            cycleHints(SWAP_HINTS);

            const sceneBlob = await (await fetch(`data:${genData.mimeType};base64,${genData.generatedImage}`)).blob();

            // Higher-res source face gives the swap model more identity detail.
            const sourceFace = await compressImage(state.capturedBlob, 0.95, 2048);

            const swapForm = new FormData();
            swapForm.append('sourceImage', sourceFace, 'face.jpg');
            swapForm.append('targetImage', sceneBlob, 'scene.jpg');

            const swapRes = await fetch('/api/faceswap', { method: 'POST', body: swapForm });
            const swapData = await swapRes.json();
            if (!swapRes.ok || !swapData.success) {
                throw new Error(swapData.details || swapData.error || 'Face swap failed');
            }

            finalDataUrl = `data:${swapData.mimeType};base64,${swapData.generatedImage}`;
            if (swapData.note) toast(swapData.note, 'error', 6000);
            else toast('Your photo is ready!', 'success');
        }

        el.generatedImage.src = finalDataUrl;
        el.resultLocation.textContent = state.selectedPreset.name;
        el.loadingState.hidden = true;
        el.resultPanel.hidden = false;
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
    el.presetsGrid.querySelectorAll('.destination-card').forEach(c => {
        c.classList.remove('is-selected');
        c.setAttribute('aria-checked', 'false');
    });
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
