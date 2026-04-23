const { GoogleGenAI } = require("@google/genai");
const Replicate = require("replicate");
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

function bufferToDataUrl(buffer, mimeType) {
    return `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

async function normaliseOutputToUrl(output) {
    const first = Array.isArray(output) ? output[0] : output;
    if (!first) return null;
    if (typeof first === "string") return first;
    if (typeof first.url === "function") {
        const u = first.url();
        return typeof u === "string" ? u : u?.toString?.();
    }
    return null;
}

async function downloadAsBuffer(url) {
    const fetchRes = await fetch(url);
    if (!fetchRes.ok) throw new Error(`Download failed: ${fetchRes.status}`);
    const mime = fetchRes.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await fetchRes.arrayBuffer());
    return { buf, mime };
}

// Preset prompts in app.js encode attire as "...; for men, X; for women, Y."
// We keep only the gender-appropriate half so FLUX doesn't see conflicting
// clothing specs. The regex catches the "for <opposite>, ..." clause up to
// the next sentence-ish boundary.
function stripOppositeGenderAttire(prompt, gender) {
    const oppWord = gender === "male" ? "women" : "men";
    const pattern = new RegExp(`;\\s*for\\s+${oppWord}[^;.]*`, "gi");
    return prompt.replace(pattern, "");
}

function buildFluxPrompt(scenePrompt, subject) {
    const genderWord = subject.gender === "male" ? "man" : "woman";
    const age = (subject.ageRange || "adult").replace(/-/g, " ");
    const filtered = stripOppositeGenderAttire(scenePrompt, subject.gender);
    return [
        `Photorealistic portrait photograph of a ${age} ${genderWord} with ${subject.complexion} complexion and ${subject.hair}.`,
        filtered,
        `Medium shot from the waist up, standing pose, facing the camera, natural diffused daylight, sharp focus, 50mm lens, professional photography, cinematic colour grading, high detail.`,
    ].join(" ");
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

        if (!userImage) return res.status(400).json({ error: "User image is required" });
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        const geminiKey = process.env.GEMINI_API_KEY;
        const replicateToken = process.env.REPLICATE_API_TOKEN;
        if (!geminiKey || !replicateToken) {
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimetype,
                note: "Set GEMINI_API_KEY and REPLICATE_API_TOKEN in Vercel env to enable generation.",
            });
        }

        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const replicate = new Replicate({ auth: replicateToken });

        const userImageDataUrl = bufferToDataUrl(userImage.buffer, userImage.mimetype);
        const userImagePart = {
            inlineData: {
                mimeType: userImage.mimetype || "image/jpeg",
                data: userImage.buffer.toString("base64"),
            },
        };

        // Stage 1 — classify the reference photo with Gemini 2.5 Flash.
        // Gives FLUX-PuLID a locked-in gender/age/complexion so the prompt
        // can describe the person accurately instead of guessing.
        console.log("Classifying reference photo...");
        const classifyResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                userImagePart,
                { text: `Analyse the person in this photo. Return ONLY a JSON object with these exact keys and allowed values, no prose:\n{\n  "gender": "male" | "female",\n  "ageRange": "child" | "teen" | "young-adult" | "adult" | "senior",\n  "complexion": "fair" | "wheatish" | "olive" | "brown" | "dark",\n  "hair": "<short description, max 8 words>"\n}` },
            ],
            config: { responseMimeType: "application/json" },
        });

        const subject = { gender: null, ageRange: "adult", complexion: "wheatish", hair: "short dark hair" };
        try {
            const rawText = classifyResp.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
            const parsed = JSON.parse(rawText);
            if (parsed.gender === "male" || parsed.gender === "female") subject.gender = parsed.gender;
            if (parsed.ageRange) subject.ageRange = String(parsed.ageRange);
            if (parsed.complexion) subject.complexion = String(parsed.complexion);
            if (parsed.hair) subject.hair = String(parsed.hair).slice(0, 80);
        } catch (e) {
            console.warn("Classification parse failed:", e.message);
        }

        if (!subject.gender) {
            return res.status(422).json({
                error: "Couldn't detect a face clearly. Please retake the photo with better lighting and a front-facing pose.",
            });
        }

        console.log(`Detected: ${subject.gender}, ${subject.ageRange}, ${subject.complexion}, ${subject.hair}`);

        // Stage 2 — FLUX-PuLID generation. Single model, FLUX-dev base,
        // IdentityNet-style face conditioning via PuLID. State-of-the-art
        // identity preservation (dramatically better than SDXL-era InstantID
        // or InsightFace inswapper_128 wrappers).
        const fluxPrompt = buildFluxPrompt(prompt, subject);
        const negativePrompt = "cartoon, anime, illustration, painting, 3d render, plastic skin, over-smoothed, blurry face, distorted face, extra limbs, deformed, low quality, watermark, text, signature, cross-eyed, partially rendered, bad anatomy";

        console.log("FLUX-PuLID generation...");
        console.log("Prompt:", fluxPrompt.slice(0, 200));

        const output = await replicate.run(
            "bytedance/flux-pulid:8baa7ef2255075b46f4d91cd238c21d31181b3e6a864463f967960bb0112525b",
            {
                input: {
                    main_face_image: userImageDataUrl,
                    prompt: fluxPrompt,
                    negative_prompt: negativePrompt,
                    width: 1152,
                    height: 896,
                    num_steps: 20,
                    start_step: 0,
                    id_weight: 1.05,
                    true_cfg: 1.0,
                    guidance_scale: 4,
                    num_outputs: 1,
                    output_format: "jpg",
                    output_quality: 95,
                    max_sequence_length: 256,
                },
            }
        );

        const finalUrl = await normaliseOutputToUrl(output);
        if (!finalUrl) throw new Error("FLUX-PuLID returned no output");

        console.log("✅ Done:", finalUrl);

        const { buf, mime } = await downloadAsBuffer(finalUrl);

        return res.json({
            success: true,
            generatedImage: buf.toString("base64"),
            mimeType: mime,
            subject,
        });
    } catch (error) {
        console.error("❌ Error:", error.message);
        return res.status(500).json({
            error: "Failed to generate image",
            details: error.message,
        });
    }
};
