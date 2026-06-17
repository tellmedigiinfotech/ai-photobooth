const Replicate = require("replicate");

// JSON body: { sourceImage, targetImage } where both are data URLs. We avoid
// multipart/form-data because Vercel drains the request stream before the
// handler runs, which surfaces as "Unexpected end of form". With bodyParser
// off we drain the raw stream ourselves and JSON.parse it.
async function readJsonBody(req) {
    if (req.body && typeof req.body === "object") return req.body;
    if (typeof req.body === "string") return JSON.parse(req.body);
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
}

// A data URL is already in the form Replicate accepts; just validate it.
function isDataUrl(s) {
    return typeof s === "string" && /^data:[^;,]*;base64,/.test(s);
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
//    face. fidelity 0.9 biases hard toward keeping the swapped identity over
//    "beautifying" (validated to stay natural, not plastic);
//    background_enhance stays off so the scene isn't
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
        const body = await readJsonBody(req);
        const sourceImage = body.sourceImage; // webcam face (data URL)
        const targetImage = body.targetImage; // generated scene (data URL)

        if (!isDataUrl(sourceImage) || !isDataUrl(targetImage)) {
            return res.status(400).json({
                error: "Both sourceImage (face) and targetImage (scene) are required as data URLs",
            });
        }

        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
            const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(targetImage);
            return res.json({
                success: true,
                generatedImage: m ? m[2] : "",
                mimeType: m ? m[1] : "image/jpeg",
                note: "REPLICATE_API_TOKEN not configured — returning scene unchanged.",
            });
        }

        const replicate = new Replicate({ auth: token });

        console.log("Face swap (inswapper)...");
        const swapOutput = await replicate.run(SWAP_MODEL, {
            input: {
                swap_image: sourceImage,   // already a data URL
                input_image: targetImage,  // already a data URL
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
                    codeformer_fidelity: 0.9,
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
