// Global state
let stream = null;
let capturedImageBlob = null;
let selectedPreset = null;

// DOM Elements
const webcam = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const capturedImageContainer = document.getElementById('capturedImageContainer');
const capturedImage = document.getElementById('capturedImage');
const presetsGrid = document.getElementById('presetsGrid');
const selectedPresetInfo = document.getElementById('selectedPresetInfo');
const presetName = document.getElementById('presetName');
const presetDescription = document.getElementById('presetDescription');
const generateBtn = document.getElementById('generateBtn');
const loadingState = document.getElementById('loadingState');
const resultPanel = document.getElementById('resultPanel');
const generatedImage = document.getElementById('generatedImage');
const printBtn = document.getElementById('printBtn');
const newPhotoBtn = document.getElementById('newPhotoBtn');
const statusMessage = document.getElementById('statusMessage');

// Preset configurations
const presets = [
    {
        id: 1,
        name: 'Royal Palace',
        description: 'Transform into royalty at a majestic palace',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing inside a grand Indian royal palace. The person must wear an ornate royal Scindhia-style sherwani with gold embroidery, royal turban with jeweled brooch, and stand with a confident regal posture near an ornate throne chair. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The background should be the palace interior from the second reference image. Lighting should be warm, golden, cinematic. Shot as a professional portrait photograph with shallow depth of field.',
        backgroundUrl: 'assets/backgrounds/palace.jpg'
    },
    {
        id: 2,
        name: 'Taj Mahal',
        description: 'Stand before the iconic Taj Mahal',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing on the main walkway leading to the Taj Mahal. The person must wear an elegant traditional Indian outfit — a richly embroidered cream and gold sherwani for men or an embellished anarkali suit for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The Taj Mahal should be visible behind them matching the second reference image. Golden hour lighting with soft warm tones. Shot as a high-end travel portrait with the monument in soft focus behind.',
        backgroundUrl: 'assets/backgrounds/taj-mahal.jpg'
    },
    {
        id: 3,
        name: 'Jaipur Fort',
        description: 'Experience the grandeur of Rajasthan',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing at a magnificent Rajasthani fort. The person must wear a vibrant traditional Rajasthani royal outfit with a colorful bandhani turban, mirror-work jacket, and dhoti-kurta for men or a heavily embroidered lehenga choli for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The fort architecture from the second reference image should form the background. Bright daylight with dramatic shadows on sandstone walls. Professional portrait photography style.',
        backgroundUrl: 'assets/backgrounds/jaipur-fort.jpg'
    },
    {
        id: 4,
        name: 'Mumbai Gateway',
        description: 'Iconic Gateway of India backdrop',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing in front of the Gateway of India monument in Mumbai. The person must wear a sophisticated, well-fitted modern Indian formal outfit — a tailored Nehru jacket with silk kurta for men or an elegant contemporary saree for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The Gateway of India from the second reference image should be visible behind. Late afternoon light with warm golden tones reflecting off the harbour. Cinematic portrait style.',
        backgroundUrl: 'assets/backgrounds/gateway.jpg'
    },
    {
        id: 5,
        name: 'Mysore Palace',
        description: 'Royal Mysore Palace setting',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing inside the lavish Mysore Palace. The person must wear a traditional South Indian royal silk outfit — a richly woven Mysore silk gold-bordered dhoti and angavastram for men or a stunning Kanjeevaram silk saree with temple jewelry for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The ornate palace interior from the second reference image should be the backdrop. Warm interior lighting with golden chandeliers. Royal portrait photography style.',
        backgroundUrl: 'assets/backgrounds/mysore.jpg'
    },
    {
        id: 6,
        name: 'Red Fort',
        description: 'Historic Red Fort in Delhi',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing at the Red Fort in Delhi. The person must wear opulent Mughal-era inspired clothing — a richly embroidered brocade achkan with a jeweled belt and ornate juttis for men or an elaborate Mughal-style anarkali with kundan jewelry for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The Red Fort\'s iconic red sandstone walls from the second reference image should be the background. Dramatic sunset lighting. High-end editorial portrait style.',
        backgroundUrl: 'assets/backgrounds/red-fort.jpg'
    },
    {
        id: 7,
        name: 'Hawa Mahal',
        description: 'The Palace of Winds',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing in front of the Hawa Mahal (Palace of Winds) in Jaipur. The person must wear a stunning traditional Rajasthani outfit — a vivid saffron or maroon royal achkan with a Rajputi turban for men or an exquisite bandhani print ghagra choli with silver jewelry for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The honeycomb facade of Hawa Mahal from the second reference image should fill the background. Morning golden light. Architectural portrait photography.',
        backgroundUrl: 'assets/backgrounds/hawa-mahal.jpg'
    },
    {
        id: 8,
        name: 'Amber Fort',
        description: 'Majestic Amber Fort experience',
        prompt: 'Using the first image as a reference photo of a real person, generate a new hyper-realistic photograph of this EXACT SAME person standing at the grand Amber Fort in Jaipur. The person must wear a regal Rajasthani warrior-prince outfit — an embroidered velvet jacket with gold buttons, fitted churidar, and a jeweled turban for men or a royal Rajputi poshak with heavy silver jewelry for women. CRITICAL: Preserve the person\'s exact face shape, skin tone, eye color, nose structure, jawline, hair texture, and all unique facial features with photographic accuracy. The majestic Amber Fort architecture from the second reference image should be the backdrop. Dramatic daylight with warm amber tones on stone walls. Epic cinematic portrait.',
        backgroundUrl: 'assets/backgrounds/amber-fort.jpg'
    }
];

// Initialize the application
function init() {
    loadPresets();
    attachEventListeners();
    checkServerHealth();
}

// Check server health and API status
async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        if (!data.apiKeyConfigured) {
            showStatus('API key not configured. Using mock mode for testing.', 'error', 5000);
        }
    } catch (error) {
        console.error('Server health check failed:', error);
    }
}

// Load presets into the grid
function loadPresets() {
    presetsGrid.innerHTML = '';

    presets.forEach(preset => {
        const presetCard = document.createElement('div');
        presetCard.className = 'preset-card';
        presetCard.dataset.presetId = preset.id;

        presetCard.innerHTML = `
            <img src="${preset.backgroundUrl}" alt="${preset.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23667eea%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2224%22 fill=%22white%22%3E${preset.name}%3C/text%3E%3C/svg%3E'">
            <div class="preset-overlay">
                <h4>${preset.name}</h4>
                <p>${preset.description}</p>
            </div>
        `;

        presetCard.addEventListener('click', () => selectPreset(preset));
        presetsGrid.appendChild(presetCard);
    });
}

// Select a preset
function selectPreset(preset) {
    selectedPreset = preset;

    // Update UI
    document.querySelectorAll('.preset-card').forEach(card => {
        card.classList.remove('selected');
    });

    const selectedCard = document.querySelector(`[data-preset-id="${preset.id}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }

    // Show preset info
    presetName.textContent = preset.name;
    presetDescription.textContent = preset.description;
    selectedPresetInfo.style.display = 'block';

    // Enable generate button if image is captured
    updateGenerateButton();

    showStatus(`Selected: ${preset.name}`, 'success');
}

// Attach event listeners
function attachEventListeners() {
    startCameraBtn.addEventListener('click', startCamera);
    captureBtn.addEventListener('click', capturePhoto);
    retakeBtn.addEventListener('click', retakePhoto);
    generateBtn.addEventListener('click', generateAIImage);
    printBtn.addEventListener('click', printImage);
    newPhotoBtn.addEventListener('click', resetApp);
}

// Start camera
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'user'
            },
            audio: false
        });

        webcam.srcObject = stream;
        webcam.classList.add('active');
        cameraPlaceholder.style.display = 'none';

        startCameraBtn.disabled = true;
        captureBtn.disabled = false;

        showStatus('Camera started successfully!', 'success');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showStatus('Failed to access camera. Please check permissions.', 'error');
    }
}

// Capture photo
function capturePhoto() {
    const context = canvas.getContext('2d');
    canvas.width = webcam.videoWidth;
    canvas.height = webcam.videoHeight;

    context.drawImage(webcam, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(blob => {
        capturedImageBlob = blob;
        capturedImage.src = URL.createObjectURL(blob);
        capturedImageContainer.style.display = 'block';

        updateGenerateButton();
        showStatus('Photo captured!', 'success');
    }, 'image/jpeg', 0.95);
}

// Retake photo
function retakePhoto() {
    capturedImageBlob = null;
    capturedImageContainer.style.display = 'none';
    updateGenerateButton();
}

// Update generate button state
function updateGenerateButton() {
    generateBtn.disabled = !(capturedImageBlob && selectedPreset);
}

// Generate AI image
async function generateAIImage() {
    if (!capturedImageBlob || !selectedPreset) {
        showStatus('Please capture a photo and select a preset', 'error');
        return;
    }

    try {
        // Show loading state
        loadingState.style.display = 'block';
        generateBtn.disabled = true;

        // Prepare form data
        const formData = new FormData();
        formData.append('userImage', capturedImageBlob, 'photo.jpg');
        formData.append('prompt', selectedPreset.prompt);

        // Fetch background image if available
        try {
            const bgResponse = await fetch(selectedPreset.backgroundUrl);
            if (bgResponse.ok) {
                const bgBlob = await bgResponse.blob();
                formData.append('backgroundImage', bgBlob, 'background.jpg');
            }
        } catch (error) {
            console.log('Background image not available, proceeding without it');
        }

        showStatus('Creating your masterpiece with Gemini AI... This may take 15-30 seconds.', 'success', 60000);

        // Single request to Gemini — no polling needed
        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.details || data.error || 'Failed to generate image');
        }

        // Display generated image
        const imageData = `data:${data.mimeType};base64,${data.generatedImage}`;
        generatedImage.src = imageData;

        resultPanel.style.display = 'block';
        resultPanel.scrollIntoView({ behavior: 'smooth' });

        if (data.note) {
            showStatus(data.note, 'error', 8000);
        } else {
            showStatus('Image generated successfully!', 'success');
        }

    } catch (error) {
        console.error('Error generating image:', error);
        showStatus(error.message || 'Failed to generate image. Please try again.', 'error');
    } finally {
        loadingState.style.display = 'none';
        generateBtn.disabled = false;
    }
}

// Print image
function printImage() {
    window.print();
}

// Reset app for new photo
function resetApp() {
    capturedImageBlob = null;
    selectedPreset = null;

    capturedImageContainer.style.display = 'none';
    selectedPresetInfo.style.display = 'none';
    resultPanel.style.display = 'none';

    document.querySelectorAll('.preset-card').forEach(card => {
        card.classList.remove('selected');
    });

    updateGenerateButton();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    showStatus('Ready for new photo!', 'success');
}

// Show status message
function showStatus(message, type = 'success', duration = 3000) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type} show`;

    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, duration);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
