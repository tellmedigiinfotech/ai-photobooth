// Live smoke test for the GPT Image 2 scene generator in api/generate.js.
// Uses the EXACT production buildPrompt + PRESETS (imported, no drift), sends a
// sample face + the preset's real heritage background through images/edits with
// input_fidelity:"high", and writes the result to /tmp so we can judge likeness.
// It also prints real token usage → real per-image cost.
//
// Usage: node scripts/test_gptimage_generate.js [presetId] [male|female] [quality]
//   e.g. node scripts/test_gptimage_generate.js 3 male high
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = require("openai");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const { buildPrompt, PRESETS } = require("../api/generate.js");

const presetId = Number(process.argv[2] || 3);
const gender = process.argv[3] === "female" ? "female" : "male";
const quality = process.argv[4] || "high"; // low | medium | high

// USD→INR for a quick cost readout; adjust to your card's forex rate.
const USD_INR = 86;
// gpt-image-2 token rates ($/1M): text in 5, image in 8, image out 30.
function estimateUsd(u) {
    if (!u) return null;
    const tin = (u.input_tokens_details?.text_tokens ?? 0) * 5 / 1e6;
    const iin = (u.input_tokens_details?.image_tokens ?? 0) * 8 / 1e6;
    const out = (u.output_tokens ?? 0) * 30 / 1e6;
    return tin + iin + out;
}

(async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in .env.local");
    const preset = PRESETS[presetId];
    if (!preset) throw new Error(`Unknown presetId ${presetId}`);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const facePath = path.join(__dirname, "samples", "sample-5-male-raw.jpg");
    const bgPath = path.join(__dirname, "..", "assets", "backgrounds", preset.bg);

    const userFile = await toFile(fs.readFileSync(facePath), "face.jpg", { type: "image/jpeg" });
    const bgFile = await toFile(fs.readFileSync(bgPath), preset.bg, { type: "image/jpeg" });

    console.log(`preset ${presetId} (${gender}, quality=${quality}) — ${preset.setting}`);
    console.time("gpt-image-2");
    const result = await openai.images.edit({
        model: "gpt-image-2",
        image: [userFile, bgFile],
        prompt: buildPrompt(preset, gender),
        size: "1024x1536",
        quality,
    });
    console.timeEnd("gpt-image-2");

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data returned");
    const out = `/tmp/gptimage_p${presetId}_${gender}_${quality}.png`;
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
    console.log(`✅ scene OK — ${Math.round(Buffer.from(b64, "base64").length / 1024)}KB → ${out}`);

    if (result.usage) {
        console.log("usage:", JSON.stringify(result.usage));
        const usd = estimateUsd(result.usage);
        if (usd != null) console.log(`💰 OpenAI cost this image: $${usd.toFixed(4)}  ≈ ₹${(usd * USD_INR).toFixed(2)}`);
    }
})().catch(err => { console.error("❌", err.message); process.exit(1); });
