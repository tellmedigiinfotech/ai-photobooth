const Replicate = require("replicate");
const Busboy = require("busboy");

const MAX_FILE_BYTES = 30 * 1024 * 1024;

async function readRequestBody(req) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return Buffer.from(req.body);
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

function parseMultipart(req) {
    return new Promise(async (resolve, reject) => {
        try {
            const bodyBuffer = await readRequestBody(req);
            const bb = Busboy({
                headers: req.headers,
                limits: { fileSize: MAX_FILE_BYTES, files: 4, fields: 20 },
            });
            const fields = {};
            const files = {};
            let fileTooLarge = false;

            bb.on("field", (name, val) => { fields[name] = val; });
            bb.on("file", (name, file, info) => {
                const chunks = [];
                file.on("data", c => chunks.push(c));
                file.on("limit", () => { fileTooLarge = true; });
                file.on("end", () => {
                    files[name] = {
                        fieldname: name,
                        buffer: Buffer.concat(chunks),
                        mimetype: info.mimeType,
                        originalname: info.filename,
                    };
                });
            });
            bb.on("error", reject);
            bb.on("close", () => {
                if (fileTooLarge) return reject(new Error("File too large (max 30MB)"));
                resolve({ fields, files });
            });
            bb.end(bodyBuffer);
        } catch (err) {
            reject(err);
        }
    });
}

function bufferToDataUrl(buffer, mimeType) {
    return `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

// Replicate SDK returns URL string | URL[] | FileOutput stream | object with .url().
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
        const { fields, files } = await parseMultipart(req);
        const scenePrompt = fields.prompt;
        const sourceImage = files["sourceImage"]; // webcam face
        const targetImage = files["targetImage"]; // Gemini scene

        if (!sourceImage || !targetImage) {
            return res.status(400).json({
                error: "Both sourceImage (face) and targetImage (scene) are required",
            });
        }

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            return res.json({
                success: true,
                generatedImage: targetImage.buffer.toString("base64"),
                mimeType: targetImage.mimetype || "image/png",
                note: "REPLICATE_API_TOKEN not configured — returning scene unchanged.",
            });
        }

        const replicate = new Replicate({ auth: token });

        // InstantID (SDXL + IdentityNet + IP-Adapter) — single-model identity
        // swap with dramatically better fidelity than InsightFace inswapper_128.
        // We pass the Gemini scene as pose_image + enable depth ControlNet so
        // composition (pose, framing, rough scene layout) is preserved while
        // the person is regenerated with the user's actual face identity.
        //
        // Tuning rationale:
        // - controlnet_conditioning_scale 0.9: strong IdentityNet — face must match.
        // - ip_adapter_scale 0.85: detailed identity features (moles, eye shape).
        // - pose_strength 0.5: preserve head+body pose from Gemini scene.
        // - enable_depth_controlnet + depth_strength 0.55: preserve scene
        //   composition/framing so the heritage monument still reads.
        // - 30 inference steps: quality over speed (still ~12-15s end-to-end).
        const promptText = (scenePrompt && scenePrompt.trim()) ||
            "a photorealistic portrait photograph of a person at a heritage location, natural lighting, sharp focus, authentic cultural attire, medium shot from the waist up";

        const negativePrompt = "cartoon, anime, painting, illustration, 3d render, plastic skin, over-smoothed, blurry face, distorted face, extra limbs, deformed, low quality, watermark, text, signature";

        console.log("InstantID face swap...");
        const output = await replicate.run(
            "zsxkib/instant-id:2e4785a4d80dadf580077b2244c8d7c05d8e3faac04a04c02d8e099dd2876789",
            {
                input: {
                    image: bufferToDataUrl(sourceImage.buffer, sourceImage.mimetype),
                    pose_image: bufferToDataUrl(targetImage.buffer, targetImage.mimetype),
                    prompt: promptText,
                    negative_prompt: negativePrompt,
                    controlnet_conditioning_scale: 0.9,
                    ip_adapter_scale: 0.85,
                    enable_pose_controlnet: true,
                    pose_strength: 0.5,
                    enable_depth_controlnet: true,
                    depth_strength: 0.55,
                    enable_canny_controlnet: false,
                    guidance_scale: 5.5,
                    num_inference_steps: 30,
                    output_format: "png",
                    output_quality: 95,
                    enhance_nonface_region: true,
                },
            }
        );

        const finalUrl = await normaliseOutputToUrl(output);
        if (!finalUrl) throw new Error("InstantID returned no output");

        console.log("✅ InstantID done:", finalUrl);

        const { buf, mime } = await downloadAsBuffer(finalUrl);

        return res.json({
            success: true,
            generatedImage: buf.toString("base64"),
            mimeType: mime,
        });
    } catch (error) {
        console.error("❌ Face swap error:", error.message);
        return res.status(500).json({
            error: "Face swap failed",
            details: error.message,
        });
    }
};

module.exports.config = {
    api: {
        bodyParser: false,
    },
};

