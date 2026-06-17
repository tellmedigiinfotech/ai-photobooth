// Offline picker-sample factory for the photobooth.
//
// Generates ONE representative "sample output" per preset × gender using GPT
// Image 2 (images/edits with the real heritage background as the canvas). These
// samples are shown in the destination picker so a visitor sees the kind of
// result a destination produces. They are NOT used at runtime — the live app
// generates each visitor's photo from their own face + body shots and then
// face-swaps. So these are purely illustrative; the face here is a generic one.
//
// Usage:
//   node scripts/generate_templates.js <presetId|all> [male|female|both]
//   e.g. node scripts/generate_templates.js all both      # fill in every sample
//        node scripts/generate_templates.js 8 both        # just preset 8
//
// Output: assets/templates/sample-<id>-<gender>.jpg  (skips existing)
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const { toFile } = require("openai");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const { PRESETS } = require("../api/generate.js");

const OUT_DIR = path.join(__dirname, "..", "assets", "templates");
const BG_DIR = path.join(__dirname, "..", "assets", "backgrounds");
const QUALITY = process.env.TEMPLATE_QUALITY || "medium"; // medium ≈ ₹6, high ≈ ₹16.5
const USD_INR = 86;

// Which genders each preset supports (mirror of the client's `genders` field).
const MALE_ONLY = new Set([12, 13]);
function gendersFor(id) {
    return MALE_ONLY.has(id) ? ["male"] : ["male", "female"];
}

function buildSamplePrompt(preset, gender) {
    const outfit = gender === "female" ? preset.female : preset.male;
    const person = gender === "female" ? "woman" : "man";
    return `Use the provided photograph of ${preset.setting} as the background, and add ONE ${person} of average build standing naturally in the scene, dressed as a ${outfit}. The result must look like a real photograph of a person at that location.

FACE: a clear, neutral, FORWARD-FACING face looking straight toward the camera, evenly lit, unobstructed, with a natural relaxed closed-mouth expression.

FRAMING: a three-quarter, knees-up medium portrait. The ${person} faces the camera close to front-on, with the head and face rendered LARGE, sharp and well-lit, occupying a generous, clearly readable portion of the frame. Never a small or distant figure; never crop at the neck or chin.

WARDROBE: the period attire described above, fitted naturally, historically grounded and tasteful.

ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol: no sindoor / vermilion (red or orange powder, streak or dot) in the hair parting, no kumkum marriage dot, no mangalsutra (black-bead marriage necklace), no bridal makeup, no heavy nath / nose ring. Use ONLY decorative, non-marital jewellery; when in doubt, omit it.

INTEGRATION: match the lighting direction, colour temperature, shadows, perspective and depth of the background so the person sits naturally in the scene. Photorealistic, natural skin texture, professional photography — not plastic, waxy or over-retouched.`;
}

async function genOne(openai, preset, id, gender) {
    const outPath = path.join(OUT_DIR, `sample-${id}-${gender}.jpg`);
    if (process.env.SKIP_EXISTING !== "0" && fs.existsSync(outPath)) {
        return { outPath, usd: 0, skipped: true };
    }
    const bgFile = await toFile(fs.readFileSync(path.join(BG_DIR, preset.bg)), preset.bg, { type: "image/jpeg" });
    const result = await openai.images.edit({
        model: "gpt-image-2",
        image: [bgFile],
        prompt: buildSamplePrompt(preset, gender),
        size: "1024x1536",
        quality: QUALITY,
        output_format: "jpeg",
        output_compression: 85,
    });
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image data");
    fs.writeFileSync(outPath, Buffer.from(b64, "base64"));
    let usd = 0;
    if (result.usage) {
        const u = result.usage;
        usd = (u.input_tokens_details?.text_tokens ?? 0) * 5 / 1e6
            + (u.input_tokens_details?.image_tokens ?? 0) * 8 / 1e6
            + (u.output_tokens ?? 0) * 30 / 1e6;
    }
    return { outPath, usd };
}

(async () => {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const presetArg = process.argv[2] || "all";
    const genderArg = process.argv[3] || "both";
    const presetIds = presetArg === "all" ? Object.keys(PRESETS).map(Number) : [Number(presetArg)];

    const jobs = [];
    for (const id of presetIds) {
        const preset = PRESETS[id];
        if (!preset) { console.warn(`skip unknown preset ${id}`); continue; }
        const genders = genderArg === "both" ? gendersFor(id) : [genderArg].filter(g => gendersFor(id).includes(g));
        for (const gender of genders) jobs.push({ id, preset, gender });
    }
    console.log(`Generating ${jobs.length} picker samples (quality=${QUALITY})...`);

    const CONCURRENCY = Number(process.env.TEMPLATE_CONCURRENCY || 3);
    let totalUsd = 0, done = 0, failed = 0;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const batch = jobs.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(j => genOne(openai, j.preset, j.id, j.gender)));
        results.forEach((r, k) => {
            const j = batch[k];
            const tag = `sample-${j.id}-${j.gender}`;
            if (r.status === "fulfilled") {
                totalUsd += r.value.usd; done++;
                const label = r.value.skipped ? "exists, skipped" : `₹${(r.value.usd * USD_INR).toFixed(2)}`;
                console.log(`  ✅ ${tag} → ${path.basename(r.value.outPath)}  (${label})`);
            } else {
                failed++;
                console.error(`  ❌ ${tag}: ${r.reason?.message || r.reason}`);
            }
        });
    }
    console.log(`\nDone: ${done} ok, ${failed} failed. Spend ≈ $${totalUsd.toFixed(2)} ≈ ₹${(totalUsd * USD_INR).toFixed(0)}`);
})().catch(err => { console.error("❌", err.message); process.exit(1); });
