const { GoogleGenAI } = require("@google/genai");
const Replicate = require("replicate");
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

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        await runMulter(req, res);

        const { presetId } = req.body;

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;
        const userImage = fileByField["userImage"];

        if (!userImage) return res.status(400).json({ error: "User image is required" });
        if (!presetId) return res.status(400).json({ error: "presetId is required" });

        const numericPresetId = Number(presetId);
        if (!Number.isInteger(numericPresetId) || numericPresetId < 1) {
            return res.status(400).json({ error: "presetId must be a positive integer" });
        }

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

        const userImagePart = {
            inlineData: {
                mimeType: userImage.mimetype || "image/jpeg",
                data: userImage.buffer.toString("base64"),
            },
        };

        // Stage 1 — classify the reference photo with Gemini 2.5 Flash to
        // select the right-gender template. ~500ms, ~$0.001.
        console.log("Classifying reference photo...");
        const classifyResp = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                userImagePart,
                { text: `Analyse the person in this photo. Return ONLY a JSON object, no prose:\n{\n  "gender": "male" | "female"\n}` },
            ],
            config: { responseMimeType: "application/json" },
        });

        let gender = null;
        try {
            const rawText = classifyResp.candidates?.[0]?.content?.parts?.find(p => p.text)?.text || "";
            const parsed = JSON.parse(rawText);
            if (parsed.gender === "male" || parsed.gender === "female") gender = parsed.gender;
        } catch (_) { /* fall through */ }

        if (!gender) {
            return res.status(422).json({
                error: "Couldn't detect a face clearly. Please retake the photo with better lighting and a front-facing pose.",
            });
        }

        // Stage 2 — build the template URL. Templates are static assets
        // bundled with the deployment at /assets/templates/{id}-{gender}.jpg.
        // We pass the URL directly to Replicate, which fetches it.
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const templateUrl = `${protocol}://${host}/assets/templates/${numericPresetId}-${gender}.jpg`;

        console.log(`Gender: ${gender}, template: ${templateUrl}`);

        // Stage 3 — face-swap the user's face onto the template. The target
        // face in the template is a real, well-lit, front-facing photograph,
        // which is the ideal case for InsightFace-based swap models.
        console.log("Face swap: cdingram/face-swap...");
        const swapOutput = await replicate.run(
            "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111",
            {
                input: {
                    swap_image: bufferToDataUrl(userImage.buffer, userImage.mimetype),
                    input_image: templateUrl,
                },
            }
        );
        const swappedUrl = await normaliseOutputToUrl(swapOutput);
        if (!swappedUrl) throw new Error("Face-swap returned no output");
        console.log("✅ Swap done:", swappedUrl);

        // Stage 4 — face restoration / re-rendering. At fidelity=0.5 the
        // model rebalances toward restoration quality: it preserves
        // identity but re-textures the face region to match the template's
        // photo grain, lighting, and skin tones. This dissolves the "pasted
        // on" feeling that raw InsightFace swaps exhibit. Background is not
        // touched (background_enhance=false).
        let finalUrl = swappedUrl;
        try {
            console.log("Face restore: sczhou/codeformer (fidelity=0.5)...");
            const restoreOutput = await replicate.run(
                "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2",
                {
                    input: {
                        image: swappedUrl,
                        codeformer_fidelity: 0.5,
                        background_enhance: false,
                        face_upsample: true,
                        upscale: 1,
                    },
                }
            );
            const restoredUrl = await normaliseOutputToUrl(restoreOutput);
            if (restoredUrl) {
                finalUrl = restoredUrl;
                console.log("✅ Restore done:", restoredUrl);
            }
        } catch (err) {
            console.warn("CodeFormer failed, using raw swap:", err.message);
        }

        const { buf, mime } = await downloadAsBuffer(finalUrl);

        return res.json({
            success: true,
            generatedImage: buf.toString("base64"),
            mimeType: mime,
            gender,
        });
    } catch (error) {
        console.error("❌ Error:", error.message);
        return res.status(500).json({
            error: "Failed to generate image",
            details: error.message,
        });
    }
};
