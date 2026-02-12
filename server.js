const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024 // 30MB limit (API supports up to 30MB)
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper function to upload image and get public URL
async function uploadImageToPublicHost(imageBuffer, mimeType = 'image/jpeg') {
  try {
    // Try uploading to freeimage.host (no API key required)
    const formData = new FormData();
    formData.append('source', imageBuffer.toString('base64'));
    formData.append('type', 'base64');
    formData.append('action', 'upload');
    formData.append('timestamp', Date.now().toString());
    formData.append('auth_token', '');

    const response = await axios.post(
      'https://freeimage.host/api/1/upload',
      formData,
      {
        params: {
          key: '6d207e02198a847aa98d0a2a901485a5' // Free public key
        },
        headers: formData.getHeaders(),
        timeout: 30000
      }
    );

    if (response.data && response.data.image && response.data.image.url) {
      console.log('Image uploaded successfully to freeimage.host');
      return response.data.image.url;
    }

    throw new Error('Upload failed');
  } catch (error) {
    console.error('Error uploading image:', error.message);

    // Fallback: Try imgbb with a working free key
    try {
      const formData2 = new FormData();
      formData2.append('image', imageBuffer.toString('base64'));

      const response2 = await axios.post(
        'https://api.imgbb.com/1/upload',
        formData2,
        {
          params: {
            key: 'd2f1a3c8e9b4f7a6d5c3e8b9a7f6d4c2' // Alternative free key
          },
          headers: formData2.getHeaders(),
          timeout: 30000
        }
      );

      if (response2.data && response2.data.data && response2.data.data.url) {
        console.log('Image uploaded successfully to imgbb');
        return response2.data.data.url;
      }
    } catch (fallbackError) {
      console.error('Fallback upload also failed:', fallbackError.message);
    }

    throw new Error('All image upload methods failed. Please check your internet connection.');
  }
}

// Helper function to create Nano Banana Pro task
async function createNanoBananaTask(prompt, imageUrls, aspectRatio = '1:1', resolution = '2K') {
  const apiKey = process.env.API_KEY;
  const createTaskUrl = process.env.CREATE_TASK_URL || 'https://api.kie.ai/api/v1/jobs/createTask';

  const requestBody = {
    model: 'nano-banana-pro',
    input: {
      prompt: prompt,
      image_input: imageUrls,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      output_format: 'jpg'
    }
  };

  console.log('Creating Nano Banana Pro task...');
  console.log('Request:', JSON.stringify(requestBody, null, 2));

  const response = await axios.post(createTaskUrl, requestBody, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  return response.data;
}

// Helper function to query task status
async function queryTaskStatus(taskId) {
  const apiKey = process.env.API_KEY;
  const queryTaskUrl = process.env.QUERY_TASK_URL || 'https://api.kie.ai/api/v1/jobs/recordInfo';

  const response = await axios.get(queryTaskUrl, {
    params: { taskId },
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });

  return response.data;
}

// Helper function to poll task until completion
async function pollTaskUntilComplete(taskId, maxAttempts = 60, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await queryTaskStatus(taskId);

    console.log(`Poll attempt ${i + 1}/${maxAttempts} - Status: ${result.data.state}`);

    if (result.data.state === 'success') {
      return result;
    } else if (result.data.state === 'fail') {
      throw new Error(`Task failed: ${result.data.failMsg || 'Unknown error'}`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Task timeout - maximum polling attempts reached');
}

// API endpoint for AI image generation
app.post('/api/generate', upload.fields([
  { name: 'userImage', maxCount: 1 },
  { name: 'backgroundImage', maxCount: 1 }
]), async (req, res) => {
  try {
    const { prompt } = req.body;
    const userImage = req.files['userImage'] ? req.files['userImage'][0] : null;
    const backgroundImage = req.files['backgroundImage'] ? req.files['backgroundImage'][0] : null;

    if (!userImage) {
      return res.status(400).json({ error: 'User image is required' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('\n=== New Generation Request ===');
    console.log('Prompt:', prompt);
    console.log('User image size:', userImage.size, 'bytes');
    console.log('Background image:', backgroundImage ? 'provided' : 'not provided');

    // Check if API key is configured
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
      console.log('⚠️  API key not configured. Returning mock response.');
      return res.json({
        success: true,
        message: 'Mock response - API key not configured',
        generatedImage: userImage.buffer.toString('base64'),
        mimeType: userImage.mimetype,
        note: 'Configure API_KEY in .env to use actual AI generation.'
      });
    }

    // Step 1: Upload images to get public URLs
    console.log('Step 1: Uploading images to public host...');
    const imageUrls = [];

    // Upload user image
    const userImageUrl = await uploadImageToPublicHost(userImage.buffer, userImage.mimetype);
    imageUrls.push(userImageUrl);
    console.log('User image uploaded:', userImageUrl);

    // Upload background image if provided
    if (backgroundImage) {
      const bgImageUrl = await uploadImageToPublicHost(backgroundImage.buffer, backgroundImage.mimetype);
      imageUrls.push(bgImageUrl);
      console.log('Background image uploaded:', bgImageUrl);
    }

    // Step 2: Create Nano Banana Pro task
    console.log('Step 2: Creating Nano Banana Pro task...');
    const createTaskResponse = await createNanoBananaTask(prompt, imageUrls, '1:1', '2K');

    if (createTaskResponse.code !== 200) {
      throw new Error(`Failed to create task: ${createTaskResponse.msg}`);
    }

    const taskId = createTaskResponse.data.taskId;
    console.log('Task created successfully! Task ID:', taskId);

    // Step 3: Poll for task completion
    console.log('Step 3: Waiting for task completion...');
    const taskResult = await pollTaskUntilComplete(taskId);

    // Step 4: Extract result
    console.log('Step 4: Extracting results...');
    const resultJson = JSON.parse(taskResult.data.resultJson);
    const generatedImageUrl = resultJson.resultUrls[0];

    console.log('Generated image URL:', generatedImageUrl);

    // Step 5: Download the generated image
    console.log('Step 5: Downloading generated image...');
    const imageResponse = await axios.get(generatedImageUrl, {
      responseType: 'arraybuffer'
    });

    const generatedImageBase64 = Buffer.from(imageResponse.data).toString('base64');

    console.log('✅ Generation complete!');
    console.log('Cost time:', taskResult.data.costTime, 'ms');
    console.log('================================\n');

    return res.json({
      success: true,
      generatedImage: generatedImageBase64,
      mimeType: 'image/jpeg',
      taskId: taskId,
      costTime: taskResult.data.costTime
    });

  } catch (error) {
    console.error('❌ Error generating image:', error.message);
    console.error('Stack:', error.stack);

    res.status(500).json({
      error: 'Failed to generate image',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    apiKeyConfigured: !!process.env.API_KEY
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AI Photobooth server running on http://localhost:${PORT}`);
  console.log(`📸 Open http://localhost:${PORT} in your browser`);

  if (!process.env.API_KEY) {
    console.log('\n⚠️  WARNING: API key not configured!');
    console.log('   Add API_KEY to .env file to enable AI generation.\n');
  } else {
    console.log('\n✅ Nano Banana Pro API configured and ready!\n');
  }
});
