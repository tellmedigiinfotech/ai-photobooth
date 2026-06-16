// Live smoke test for the GPT Image 2 scene generator used by api/generate.js.
// Sends a sample face + a heritage background through images/edits with
// input_fidelity:"high" and writes the result to /tmp so we can eyeball likeness.
// Usage: node scripts/test_gptimage_generate.js [presetId] [male|female]
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = require("openai");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

// Keep these two in sync with api/generate.js if the prompt/preset logic changes.
const SETTING = "17th-century Bundela palace courtyard at Orchha";
const OUTFIT_MALE = "bundela rajput prince in a brocade cream angarkha, churidar pyjama, a colourful safa (rajput turban) and a kamarband (waist sash), with subtle gold jewellery";
const BG_FILE = "Jahangir Mahal 6 - Copy.jpg";

function buildPrompt(outfit) {
    return `face-preservation rule: the face in the first reference photo must be preserved exactly in the output. same eyes, nose, mouth, jawline, skin tone, age and expression. do not beautify, smooth, slim, de-age or reshape the face.

framing rule: compose from roughly the knees up, person facing the camera front-on, head and face rendered large and sharp — never a tiny distant figure.

now create an image of this person standing in this ${SETTING}, dressed like a ${outfit}. adjust lights and shadows so they blend naturally. super realistic and natural.`;
}

(async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set in .env.local");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const samples = path.join(__dirname, "samples");
    const facePath = path.join(samples, "sample-5-male-raw.jpg");
    const bgPath = path.join(__dirname, "..", "assets", "backgrounds", BG_FILE);

    const userFile = await toFile(fs.readFileSync(facePath), "face.jpg", { type: "image/jpeg" });
    const bgFile = await toFile(fs.readFileSync(bgPath), BG_FILE, { type: "image/jpeg" });

    console.time("gpt-image-2");
    const result = await openai.images.edit({
        model: "gpt-image-2",
        image: [userFile, bgFile],
        prompt: buildPrompt(OUTFIT_MALE),
        size: "1024x1536",
        quality: "high",
        input_fidelity: "high",
    });
    console.timeEnd("gpt-image-2");

    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data returned");
    const out = "/tmp/gptimage_generate_test.png";
    fs.writeFileSync(out, Buffer.from(b64, "base64"));
    console.log(`✅ scene OK — ${Math.round(Buffer.from(b64, "base64").length / 1024)}KB → ${out}`);
    if (result.usage) console.log("usage:", JSON.stringify(result.usage));
})().catch(err => { console.error("❌", err.message); process.exit(1); });
