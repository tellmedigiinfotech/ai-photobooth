const { GoogleGenAI } = require("@google/genai");

async function testApiKey() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Missing GEMINI_API_KEY");
        return;
    }

    console.log("Testing with API Key ending in: ..." + apiKey.slice(-5));
    const ai = new GoogleGenAI({ apiKey });

    try {
        console.log("Generating image...");
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: ["A test sunset scene"],
            config: {
                responseModalities: ["Image"],
            },
        });
        console.log("✅ Success! Generated image.");
        console.log(response);
    } catch (error) {
        console.error("❌ Failed!");
        console.error(error.message);
    }
}

testApiKey();
