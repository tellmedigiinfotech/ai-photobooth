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

        console.log("Starting face swap via Replicate...");

        const replicate = new Replicate({ auth: token });

        const output = await replicate.run(
            "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111",
            {
                input: {
                    swap_image: bufferToDataUrl(sourceImage.buffer, sourceImage.mimetype),
                    input_image: bufferToDataUrl(targetImage.buffer, targetImage.mimetype),
                },
            }
        );

        // Replicate JS client returns either a URL string, an array of URLs,
        // or a ReadableStream (FileOutput) depending on the model + version.
        let resultBuffer = null;
        let resultMime = "image/jpeg";

        const first = Array.isArray(output) ? output[0] : output;

        if (!first) {
            throw new Error("Face-swap returned no output");
        }

        if (typeof first === "string") {
            const fetchRes = await fetch(first);
            if (!fetchRes.ok) throw new Error(`Download failed: ${fetchRes.status}`);
            resultMime = fetchRes.headers.get("content-type") || resultMime;
            resultBuffer = Buffer.from(await fetchRes.arrayBuffer());
        } else if (typeof first.url === "function") {
            const url = first.url();
            const fetchRes = await fetch(url);
            if (!fetchRes.ok) throw new Error(`Download failed: ${fetchRes.status}`);
            resultMime = fetchRes.headers.get("content-type") || resultMime;
            resultBuffer = Buffer.from(await fetchRes.arrayBuffer());
        } else if (first.getReader || first[Symbol.asyncIterator]) {
            resultBuffer = await streamToBuffer(first);
        } else {
            throw new Error("Unexpected Replicate output shape");
        }

        console.log("✅ Face swap complete!");

        return res.json({
            success: true,
            generatedImage: resultBuffer.toString("base64"),
            mimeType: resultMime,
        });
    } catch (error) {
        console.error("❌ Face swap error:", error.message);
        return res.status(500).json({
            error: "Face swap failed",
            details: error.message,
        });
    }
};
