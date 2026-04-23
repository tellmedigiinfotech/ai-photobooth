const Replicate = require("replicate");
const multer = require("multer");
const { Readable } = require("stream");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
});

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
        await runMulter(req, res);

        const { prompt: scenePrompt } = req.body;

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;

        const sourceImage = fileByField["sourceImage"]; // webcam face
        const targetImage = fileByField["targetImage"]; // Gemini scene

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

