const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
});

function runMulter(req, res) {
    return new Promise((resolve, reject) => {
        upload.any()(req, res, (err) => {
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
        await runMulter(req, res);

        const { prompt } = req.body;

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;

        const userImage = fileByField["userImage"];
        const backgroundImage = fileByField["backgroundImage"];

        if (!userImage) {
            return res.status(400).json({ error: "User image is required" });
        }
        if (!prompt) {
            return res.status(400).json({ error: "Prompt is required" });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimetype,
                note: "Configure GEMINI_API_KEY in Vercel env to use actual AI generation.",
            });
        }

        console.log("Starting Gemini image generation...");

        const ai = new GoogleGenAI({ apiKey });

        // Identity preservation is handled by a separate face-swap stage
        // downstream, so Gemini only needs to produce a plausible scene:
        // correct background (unchanged), correct attire, correct framing,
        // and a generic person whose face will be overwritten.
        const systemPrompt = [
            `TASK: Insert a person into the provided heritage-location background photograph, dressed in the specified cultural attire.`,
            ``,
            `=================================================================`,
            `RULE 1 — THE BACKGROUND MUST BE THE EXACT IMAGE PROVIDED`,
            `=================================================================`,
            `The heritage background photograph is the FINAL CANVAS. Every pixel of the background not directly covered by the inserted person must remain identical to the input background photograph.`,
            ``,
            `FORBIDDEN background changes:`,
            `- Regenerating or re-rendering any part of the architecture, stonework, carvings, walls, arches, roof, or facade`,
            `- Changing the colours, hues, or colour-grade of the background`,
            `- Changing the lighting, shadows, time of day, or sky in the background`,
            `- Altering the camera angle, perspective, crop, or framing of the background`,
            `- Adding or removing objects, people, plants, or architectural details`,
            `- Softening, stylising, painting-over, or "prettifying" the background`,
            ``,
            `=================================================================`,
            `RULE 2 — HISTORICAL & CULTURAL ATTIRE`,
            `=================================================================`,
            `The clothing, jewellery, accessories, and footwear MUST match the specific region, era, and tradition described in the scene description — not generic modern clothing, not westernised fusion. Follow the scene description's attire spec precisely.`,
            ``,
            `=================================================================`,
            `RULE 3 — FRAMING`,
            `=================================================================`,
            `Frame as a MEDIUM SHOT: show the person from roughly the WAIST UP. The person's torso and upper body fills roughly half to two-thirds of the frame's vertical height. The face should occupy roughly 12-18% of the vertical height.`,
            ``,
            `- Think "portrait photograph taken from 2-3 metres away": head, shoulders, chest, and waist visible, with the heritage monument clearly visible as context behind them.`,
            `- The face must be clearly visible, well-lit, and front-facing so it can be cleanly identified.`,
            `- Match the person's lighting direction, colour temperature, and cast shadows to the background's existing lighting.`,
            `- Output ONE cohesive photograph. No collages, grids, or side-by-side views.`,
            ``,
            `=================================================================`,
            `RULE 4 — PERSON APPEARANCE`,
            `=================================================================`,
            `Use the reference photo only to infer: approximate age range, gender presentation, skin tone, and hair style/length — so the generated person is broadly plausible as the same demographic. Exact facial identity does NOT need to be preserved; a downstream step handles that. Do not attempt a photorealistic face-copy — a generic, well-lit, front-facing face that roughly matches the reference's age/gender/complexion is sufficient.`,
        ].join("\n");

        const userImageData = {
            inlineData: {
                mimeType: userImage.mimetype || "image/jpeg",
                data: userImage.buffer.toString("base64"),
            },
        };
        const backgroundImageData = backgroundImage ? {
            inlineData: {
                mimeType: backgroundImage.mimetype || "image/jpeg",
                data: backgroundImage.buffer.toString("base64"),
            },
        } : null;

        const contents = [
            { text: `REFERENCE PHOTO — use only for age/gender/complexion/hair style cues:` },
            userImageData,
        ];

        if (backgroundImageData) {
            contents.push({ text: `\nBACKGROUND PHOTOGRAPH — this is the final canvas; every pixel must remain unchanged except where covered by the inserted person:` });
            contents.push(backgroundImageData);
        }

        contents.push({ text: `\n${systemPrompt}` });
        contents.push({ text: `\nSCENE DESCRIPTION — follow the attire and accessories specified PRECISELY (while preserving the background exactly):\n${prompt}` });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: contents,
            config: {
                responseModalities: ["Image"],
                imageConfig: {
                    imageSize: "1K",
                    aspectRatio: "4:3",
                },
            },
        });

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
            let textResponse = "";
            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.text) textResponse += part.text;
                }
            }
            throw new Error(
                textResponse || "No image was generated. Try a different prompt."
            );
        }

        console.log("✅ Gemini scene generation complete!");

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
