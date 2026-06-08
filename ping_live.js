const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testApi() {
    // We just need ANY small image to test the upload
    // We can use package.json or any text file disguised as an image for a split second, or just create a 1x1 png

    const dummyImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

    const form = new FormData();
    form.append('prompt', 'test prompt');
    form.append('userImage', dummyImage, { filename: 'test.png', contentType: 'image/png' });

    console.log('Sending request to Vercel...');
    try {
        const response = await axios.post('https://ai-photobooth-zeta.vercel.app/api/generate', form, {
            headers: form.getHeaders(),
            timeout: 60000
        });

        console.log('=== SUCCESS ===');
        console.log('Status:', response.status);
        console.log('Response Keys:', Object.keys(response.data));
    } catch (error) {
        console.log('=== ERROR ===');
        if (error.response) {
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testApi();
