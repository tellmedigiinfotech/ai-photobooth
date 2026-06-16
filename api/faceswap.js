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

// Identity finisher for the Gemini scene. Two stages:
//
// 1. cdingram/face-swap (InsightFace inswapper): replaces ONLY the face
//    region of the scene with the visitor's actual face embedding. Unlike
//    the previous InstantID approach (which regenerated the whole image
//    with SDXL and destroyed the monument/outfit), every non-face pixel of
//    the Gemini scene survives untouched. Identity is deterministic — the
//    output face is reconstructed from the visitor's own features.
//
// 2. sczhou/codeformer: inswapper works at 128px internally, so the swapped
//    face is identity-accurate but soft. CodeFormer re-sharpens just the
//    face. fidelity 0.7 biases toward keeping the swapped identity over
//    "beautifying"; background_enhance stays off so the scene isn't
//    re-rendered; upscale 1 keeps the 2K output size (and the latency down).
//
// CodeFormer failing is not fatal — we return the soft-but-correct swap.
const SWAP_MODEL = "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111";
const RESTORE_MODEL = "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2";

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const { files } = await parseMultipart(req);
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

        console.log("Face swap (inswapper)...");
        const swapOutput = await replicate.run(SWAP_MODEL, {
            input: {
                swap_image: bufferToDataUrl(sourceImage.buffer, sourceImage.mimetype),
                input_image: bufferToDataUrl(targetImage.buffer, targetImage.mimetype),
            },
        });

        const swapUrl = await normaliseOutputToUrl(swapOutput);
        if (!swapUrl) throw new Error("Face swap returned no output");
        console.log("✅ Swap done:", swapUrl);

        let finalUrl = swapUrl;
        try {
            console.log("Face restore (CodeFormer)...");
            const restoreOutput = await replicate.run(RESTORE_MODEL, {
                input: {
                    image: swapUrl,
                    codeformer_fidelity: 0.7,
                    face_upsample: true,
                    background_enhance: false,
                    upscale: 1,
                },
            });
            const restoredUrl = await normaliseOutputToUrl(restoreOutput);
            if (restoredUrl) finalUrl = restoredUrl;
            console.log("✅ Restore done:", restoredUrl);
        } catch (restoreErr) {
            console.warn("CodeFormer restore failed, using raw swap:", restoreErr.message);
        }

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
