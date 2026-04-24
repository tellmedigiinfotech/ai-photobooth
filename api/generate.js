const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");
const { Readable } = require("stream");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
});

// Vercel's Node.js runtime pre-buffers the multipart body into req.body as
// a Buffer. Multer expects a stream, so when the body is already drained
// we reconstruct a Readable mimicking IncomingMessage and hand that to
// multer instead. Without this, multer throws "Unexpected end of form".
function runMulter(req, res) {
    return new Promise((resolve, reject) => {
        let streamReq = req;
        if (Buffer.isBuffer(req.body)) {
            const rebuilt = new Readable({ read() {} });
            rebuilt.push(req.body);
            rebuilt.push(null);
            Object.assign(rebuilt, {
                headers: req.headers,
                method: req.method,
                url: req.url,
            });
            streamReq = rebuilt;
        }
        upload.any()(streamReq, res, (err) => {
            if (err) return reject(err);
            req.files = streamReq.files;
            req.body = streamReq.body;
            resolve();
        });
    });
}

// Per-preset data: the background filename, a short setting noun for the
// prompt, and gender-keyed outfit phrases. Kept deliberately terse — the
// winning prompt that inspired this used just "maratha warrior".
const PRESETS = {
    1:  { bg: "Jagdambi Temple , Kandariya Mahadev Temple.jpg", setting: "temple", male: "rajput king",            female: "rajput queen in a traditional saree" },
    2:  { bg: "Lakshmana Temple IMG_9753-HDR.jpg",              setting: "temple", male: "rajput king",            female: "rajput queen in a traditional saree" },
    3:  { bg: "Jahangir Mahal 6 - Copy.jpg",                    setting: "palace courtyard", male: "bundela rajput warrior", female: "bundela princess in a red silk lehenga" },
    4:  { bg: "jahangir gate orchha.jpg",                       setting: "palace gateway",   male: "bundela rajput warrior", female: "bundela princess in a maroon silk lehenga" },
    5:  { bg: "Mandu’s Watchful Gates.jpg",                setting: "fort gateway",     male: "medieval warrior in dark robes and a turban", female: "malwa-era queen in a teal saree" },
    6:  { bg: "Chattei River view (7).jpg",                     setting: "riverside chhatri", male: "maratha warrior", female: "maratha queen in a traditional burgundy nauvari saree" },
    7:  { bg: "Chattri Monuments 1.jpg",                        setting: "chhatri monument", male: "maratha warrior", female: "peshwa-era lady in a traditional forest-green nauvari saree" },
    8:  { bg: "Chattri Monuments 4.jpg",                        setting: "chhatri monument", male: "maratha warrior", female: "peshwa-era lady in a traditional deep-red nauvari saree" },
    9:  { bg: "Krishnabai holkar chhatri .jpg",                 setting: "chhatri",          male: "maratha warrior", female: "holkar-era queen in a traditional royal-blue nauvari saree" },
    10: { bg: "Rajwada Indore.jpg",                             setting: "palace",           male: "maratha king",    female: "holkar-era queen in a traditional peacock-green paithani saree" },
    11: { bg: "RajWada 15.jpg",                                 setting: "palace courtyard", male: "maratha nobleman", female: "holkar-era royal lady in a traditional teal nauvari saree" },
    12: { bg: "kheoni wildlife sanctuary .jpg",                 setting: "forest",           male: "wildlife safari explorer in a khaki shirt, cargo trousers and a wide-brim safari hat", female: "wildlife safari explorer in a khaki shirt, cargo trousers and a wide-brim safari hat" },
    13: { bg: "kheoni wildlife sanctuary 1.jpg",                setting: "forest trail",     male: "wildlife safari explorer in a sand-beige shirt, khaki cargo trousers and a wide-brim safari hat", female: "wildlife safari explorer in a sand-beige shirt, khaki cargo trousers and a wide-brim safari hat" },
};

function buildPrompt(preset, gender) {
    const outfit = gender === "female" ? preset.female : preset.male;
    return `the most important rule: the face in the first reference photo must be preserved exactly in the output. same eyes, same nose, same mouth, same jawline, same skin tone, same age, same expression — every facial detail must be identical to the reference. do not beautify, smooth, slim, stylise, de-age, lighten or reshape the face in any way. if the face does not match the reference exactly, the image is wrong.

now create an image of this person standing in this ${preset.setting}, dressed like a ${outfit}. please adjust the lights and shadows so the person blends naturally into the scene. the image should look super realistic and natural.`;
}

async function fetchBackgroundAsDataParts(req, filename) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const url = `${protocol}://${host}/assets/backgrounds/${encodeURI(filename)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch background (${r.status}): ${url}`);
    const mime = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return { mimeType: mime, data: buf.toString("base64") };
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        await runMulter(req, res);

        const { presetId, gender } = req.body;

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;
        const userImage = fileByField["userImage"];

        if (!userImage) return res.status(400).json({ error: "User image is required" });
        if (!presetId)  return res.status(400).json({ error: "presetId is required" });
        if (gender !== "male" && gender !== "female") {
            return res.status(400).json({ error: "gender must be 'male' or 'female'" });
        }

        const preset = PRESETS[Number(presetId)];
        if (!preset) return res.status(400).json({ error: "Unknown presetId" });

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimetype,
                note: "Set GEMINI_API_KEY in Vercel env to enable generation.",
            });
        }

        const prompt = buildPrompt(preset, gender);
        console.log("Prompt:", prompt);

        const backgroundPart = await fetchBackgroundAsDataParts(req, preset.bg);

        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: [
                { inlineData: { mimeType: userImage.mimetype || "image/jpeg", data: userImage.buffer.toString("base64") } },
                { inlineData: backgroundPart },
                { text: prompt },
            ],
            config: {
                responseModalities: ["Image"],
                imageConfig: {
                    aspectRatio: "3:4",
                    imageSize: "2K",
                },
            },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);
        if (!imagePart) {
            const textPart = parts.find(p => p.text);
            throw new Error(`No image in response. ${textPart?.text || ""}`.trim());
        }

        return res.json({
            success: true,
            generatedImage: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType || "image/jpeg",
        });
    } catch (error) {
        console.error("❌ Error:", error.message);
        return res.status(500).json({
            error: "Failed to generate image",
            details: error.message,
        });
    }
};
