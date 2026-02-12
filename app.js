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
        prompt: 'I am sharing a picture of me and also a place in Palace. I want an image where I am dressed in a Royal Scindhia Prince dress and I am standing by my hands, folded back near the chair, it should be hyper realistic. Make sure the facial characters are exact same.',
        backgroundUrl: 'assets/backgrounds/palace.jpg'
    },
    {
        id: 2,
        name: 'Taj Mahal',
        description: 'Stand before the iconic Taj Mahal',
        prompt: 'Create a hyper-realistic image of me standing in front of the Taj Mahal, dressed in traditional Indian royal attire. Maintain exact facial features.',
        backgroundUrl: 'assets/backgrounds/taj-mahal.jpg'
    },
    {
        id: 3,
        name: 'Jaipur Fort',
        description: 'Experience the grandeur of Rajasthan',
        prompt: 'Place me in front of a magnificent Rajasthani fort, wearing traditional Rajasthani royal clothing. Keep my facial features identical.',
        backgroundUrl: 'assets/backgrounds/jaipur-fort.jpg'
    },
    {
        id: 4,
        name: 'Mumbai Gateway',
        description: 'Iconic Gateway of India backdrop',
        prompt: 'Show me at the Gateway of India in Mumbai, dressed in elegant formal attire. Ensure facial features match exactly.',
        backgroundUrl: 'assets/backgrounds/gateway.jpg'
    },
    {
        id: 5,
        name: 'Mysore Palace',
        description: 'Royal Mysore Palace setting',
        prompt: 'Create an image of me at Mysore Palace in traditional South Indian royal attire. Maintain exact facial characteristics.',
        backgroundUrl: 'assets/backgrounds/mysore.jpg'
    },
    {
        id: 6,
        name: 'Red Fort',
        description: 'Historic Red Fort in Delhi',
        prompt: 'Place me at the Red Fort wearing Mughal-era royal clothing. Keep facial features identical and hyper-realistic.',
        backgroundUrl: 'assets/backgrounds/red-fort.jpg'
    },
    {
        id: 7,
        name: 'Hawa Mahal',
        description: 'The Palace of Winds',
        prompt: 'Show me at Hawa Mahal in traditional Rajasthani attire. Ensure exact facial features in a hyper-realistic style.',
        backgroundUrl: 'assets/backgrounds/hawa-mahal.jpg'
    },
    {
        id: 8,
        name: 'Amber Fort',
        description: 'Majestic Amber Fort experience',
        prompt: 'Create a hyper-realistic image of me at Amber Fort in royal Rajasthani dress. Maintain identical facial characteristics.',
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

        // Call API
        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to generate image');
        }

        const data = await response.json();

        // Display generated image
        const imageData = `data:${data.mimeType};base64,${data.generatedImage}`;
        generatedImage.src = imageData;

        // Show result panel
        resultPanel.style.display = 'block';
        resultPanel.scrollIntoView({ behavior: 'smooth' });

        if (data.note) {
            showStatus(data.note, 'error', 8000);
        } else {
            showStatus('Image generated successfully!', 'success');
        }

    } catch (error) {
        console.error('Error generating image:', error);
        showStatus('Failed to generate image. Please try again.', 'error');
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
