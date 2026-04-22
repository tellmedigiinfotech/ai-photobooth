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

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

// Replicate SDK returns URL string | URL[] | FileOutput stream | object with .url().
// Normalise to an accessible URL.
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

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;

        const sourceImage = fileByField["sourceImage"];
        const targetImage = fileByField["targetImage"];

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

        // Stage A — identity transfer. cdingram uses InsightFace inswapper_128
        // under the hood, which produces a sharp-but-blurry 128×128 face crop
        // pasted into the target. The output identity is correct but facial
        // detail can look soft, especially in small faces.
        console.log("Face swap: cdingram/face-swap...");
        const swapOutput = await replicate.run(
            "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111",
            {
                input: {
                    swap_image: bufferToDataUrl(sourceImage.buffer, sourceImage.mimetype),
                    input_image: bufferToDataUrl(targetImage.buffer, targetImage.mimetype),
                },
            }
        );

        const swappedUrl = await normaliseOutputToUrl(swapOutput);
        if (!swappedUrl) throw new Error("Face-swap returned no output");
        console.log("✅ Swap done:", swappedUrl);

        // Stage B — face restoration. Pipes the swapped image through
        // CodeFormer with a high fidelity setting (0.8) — prioritises
        // preserving the identity transferred by Stage A while sharpening
        // skin texture, eyes, hairline, and mouth detail. Result reads as the
        // actual person rather than a soft approximation. background_enhance
        // is off so the heritage monument pixels are not re-rendered.
        let finalUrl = swappedUrl;
        try {
            console.log("Face restore: sczhou/codeformer...");
            const restoreOutput = await replicate.run(
                "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2",
                {
                    input: {
                        image: swappedUrl,
                        codeformer_fidelity: 0.8,
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
            } else {
                console.warn("CodeFormer returned no URL — using swap output");
            }
        } catch (restoreErr) {
            // Never let restoration failure break the request — fall back to
            // the raw swap output.
            console.warn("CodeFormer failed, using swap-only output:", restoreErr.message);
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
