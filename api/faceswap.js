const Replicate = require("replicate");
const { swapFace, restoreFaces, downloadAsBuffer } = require("../lib/faceswap-core.js");

// Single-face identity finisher. JSON body: { sourceImage, targetImage } as
// data URLs. We avoid multipart/form-data because Vercel drains the request
// stream before the handler runs ("Unexpected end of form"); with bodyParser
// off we drain the raw stream ourselves and JSON.parse it.
//
// The model slugs + CodeFormer params live in lib/faceswap-core.js so this
// single-face path and the group path (api/generate-group.js) can't drift.
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

function isDataUrl(s) {
    return typeof s === "string" && /^data:[^;,]*;base64,/.test(s);
}

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
        const swapUrl = await swapFace(replicate, sourceImage, targetImage);
        console.log("✅ Swap done:", swapUrl);

        let finalUrl = swapUrl;
        try {
            console.log("Face restore (CodeFormer)...");
            const restoredUrl = await restoreFaces(replicate, swapUrl);
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
