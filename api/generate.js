const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
});

// Helper: run multer as a promise
function runMulter(req, res) {
    return new Promise((resolve, reject) => {
        upload.fields([
            { name: "userImage", maxCount: 1 },
            { name: "backgroundImage", maxCount: 1 },
        ])(req, res, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        // Parse multipart form data
        await runMulter(req, res);

        const { prompt } = req.body;
        const userImage = req.files?.["userImage"]?.[0];
        const backgroundImage = req.files?.["backgroundImage"]?.[0];

        if (!userImage) {
            return res.status(400).json({ error: "User image is required" });
        }
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            // Mock response when no API key
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimetype,
                note: "Configure GEMINI_API_KEY in Vercel env to use actual AI generation.",
            });
        }

        console.log("Starting Gemini image generation...");
        console.log("Prompt:", prompt);

        // Initialize Gemini client
        const ai = new GoogleGenAI({ apiKey });

        // System-level instruction for consistent quality
        const systemPrompt = `You are an expert AI portrait photographer. You will receive:
1. A REFERENCE PHOTO of a real person (first image) — you MUST preserve their exact facial identity
2. A BACKGROUND REFERENCE image (second image, if provided) — use this as the scene/location
3. A description of the desired output

CRITICAL RULES:
- The output MUST be a single hyper-realistic photograph, not a collage or split image
- The person's face must be IDENTICAL to the reference photo — same face shape, skin tone, eyes, nose, jawline, lips, facial hair, wrinkles, scars, moles, and all distinguishing features
- The person should be naturally composited into the scene with correct perspective, scale, lighting, and shadows
- Generate a professional-quality photograph that looks like it was taken by a high-end DSLR camera
- The output should be a single cohesive image, not side-by-side comparisons`;

        // Build content parts with explicit labeling
        const contents = [
            { text: systemPrompt + "\n\nHere is the reference photo of the person:" },
            {
                inlineData: {
                    mimeType: userImage.mimetype || "image/jpeg",
                    data: userImage.buffer.toString("base64"),
                },
            },
        ];

        // Add background image with label
        if (backgroundImage) {
            contents.push(
                { text: "Here is the background/location reference image:" },
                {
                    inlineData: {
                        mimeType: backgroundImage.mimetype || "image/jpeg",
                        data: backgroundImage.buffer.toString("base64"),
                    },
                }
            );
        }

        // Add the specific preset prompt
        contents.push({ text: "Now generate the image based on this description:\n" + prompt });

        // Call Gemini API
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: contents,
            config: {
                responseModalities: ["Image"],
            },
        });

        // Extract the generated image from response
        let generatedImageBase64 = null;
        let responseMimeType = "image/png";

        if (response.candidates && response.candidates[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    generatedImageBase64 = part.inlineData.data;
                    responseMimeType = part.inlineData.mimeType || "image/png";
                    break;
                }
            }
        }

        if (!generatedImageBase64) {
            // Check if there's text explaining why no image was generated
            let textResponse = "";
            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.text) {
                        textResponse += part.text;
                    }
                }
            }
            throw new Error(
                textResponse || "No image was generated. Try a different prompt."
            );
        }

        console.log("✅ Gemini image generation complete!");

        return res.json({
            success: true,
            generatedImage: generatedImageBase64,
            mimeType: responseMimeType,
        });
    } catch (error) {
        console.error("❌ Error generating image:", error.message);
        return res.status(500).json({
            error: "Failed to generate image",
            details: error.message,
        });
    }
};
