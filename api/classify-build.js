const OpenAI = require("openai");
const Busboy = require("busboy");

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const BUILDS = ["slim", "average", "heavier"];

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
            const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 10 } });
            const files = {};
            bb.on("file", (name, file, info) => {
                const chunks = [];
                file.on("data", c => chunks.push(c));
                file.on("end", () => { files[name] = { buffer: Buffer.concat(chunks), mimetype: info.mimeType }; });
            });
            bb.on("error", reject);
            bb.on("close", () => resolve({ files }));
            bb.end(bodyBuffer);
        } catch (err) { reject(err); }
    });
}

// Classify a visitor's full-body photo into one of three build buckets so the
// app can pick the matching pre-approved hero template. Best-effort: the client
// defaults to "average" and lets the operator override, so a wrong/failed call
// is never fatal.
module.exports = async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { files } = await parseMultipart(req);
        const bodyImage = files["bodyImage"];
        if (!bodyImage) return res.status(400).json({ error: "bodyImage is required" });

        const token = process.env.OPENAI_API_KEY;
        if (!token) return res.json({ build: "average", note: "OPENAI_API_KEY not set — defaulting." });

        const dataUrl = `data:${bodyImage.mimetype || "image/jpeg"};base64,${bodyImage.buffer.toString("base64")}`;
        const openai = new OpenAI({ apiKey: token });

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 10,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: "Classify the body build of the main person in this photo into exactly one of these words: slim, average, heavier. Judge overall body size/weight. Reply with only that one word, nothing else." },
                    { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
                ],
            }],
        });

        const raw = (completion.choices?.[0]?.message?.content || "").toLowerCase();
        const build = BUILDS.find(b => raw.includes(b)) || "average";
        return res.json({ build });
    } catch (error) {
        console.error("classify-build error:", error.message);
        // Soft-fail to average so the booth flow never blocks.
        return res.json({ build: "average", note: "classification failed" });
    }
};

module.exports.config = { api: { bodyParser: false } };
