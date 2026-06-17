// Offline hero-template factory for the photobooth.
//
// Generates a frozen, ops-approvable "sample output" per preset × gender × build
// using GPT Image 2 (images/edits with the real heritage background as the canvas).
// At runtime the app NO LONGER generates per user — it just face-swaps the visitor
// onto one of these frozen templates, so the background never changes and output
// is predictable. The face in each template is a generic forward-facing face that
// gets replaced by the swap; only the BODY BUILD and scene matter here.
//
// Usage:
//   node scripts/generate_templates.js <presetId|all> [male|female|both] [slim|average|heavier|all]
//   e.g. node scripts/generate_templates.js 3 male all        # validate one preset, all builds
//        node scripts/generate_templates.js all both all      # full bulk run (~78 images)
//
// Output: assets/templates/preset-<id>-<gender>-<build>.jpg
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

const BUILDS = {
    slim:    "a slim, slender, lean body build",
    average: "an average, medium body build",
    heavier: "a noticeably fuller, heavier-set, plus-size body build",
};

// Which genders each preset supports (mirror of the client's `genders` field).
const MALE_ONLY = new Set([12, 13]);
function gendersFor(id) {
    return MALE_ONLY.has(id) ? ["male"] : ["male", "female"];
}

function buildTemplatePrompt(preset, gender, buildKey) {
    const outfit = gender === "female" ? preset.female : preset.male;
    const person = gender === "female" ? "woman" : "man";
    const build = BUILDS[buildKey];
    return `Use the provided photograph of ${preset.setting} as the background, and add ONE ${person} standing naturally in the scene, dressed as a ${outfit}. The result must look like a real photograph of a person at that location.

BODY BUILD — IMPORTANT: render the ${person} with ${build}. This build must be clearly and unmistakably visible in the figure's proportions.

FACE: give them a clear, neutral, FORWARD-FACING face looking straight toward the camera, evenly lit, unobstructed, with a natural relaxed closed-mouth expression. (This face will be replaced later by compositing, so it must be front-on, clean and well exposed.)

FRAMING: a three-quarter, knees-up medium portrait. The ${person} faces the camera close to front-on, with the head and face rendered LARGE, sharp and well-lit, occupying a generous, clearly readable portion of the frame. Never a small or distant figure; never crop at the neck or chin.

WARDROBE: the period attire described above, fitted naturally to ${build}, historically grounded and tasteful.

ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol: no sindoor / vermilion (red or orange powder, streak or dot) in the hair parting, no kumkum marriage dot, no mangalsutra (black-bead marriage necklace), no bridal makeup, no heavy nath / nose ring. Use ONLY decorative, non-marital jewellery; when in doubt, omit it.

INTEGRATION: match the lighting direction, colour temperature, shadows, perspective and depth of the background so the person sits naturally in the scene. Photorealistic, natural skin texture, professional photography — not plastic, waxy or over-retouched.`;
}

async function genOne(openai, preset, id, gender, buildKey) {
    const outPath = path.join(OUT_DIR, `preset-${id}-${gender}-${buildKey}.jpg`);
    if (process.env.SKIP_EXISTING !== "0" && fs.existsSync(outPath)) {
        return { outPath, usd: 0, skipped: true };
    }
    const bgPath = path.join(BG_DIR, preset.bg);
    const bgFile = await toFile(fs.readFileSync(bgPath), preset.bg, { type: "image/jpeg" });
    const result = await openai.images.edit({
        model: "gpt-image-2",
        image: [bgFile],
        prompt: buildTemplatePrompt(preset, gender, buildKey),
        size: "1024x1536",
        quality: QUALITY,
        output_format: "jpeg",     // ~300KB vs ~2.7MB PNG — keeps the repo/deploy lean
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
    const buildArg = process.argv[4] || "all";

    const presetIds = presetArg === "all" ? Object.keys(PRESETS).map(Number) : [Number(presetArg)];
    const buildKeys = buildArg === "all" ? Object.keys(BUILDS) : [buildArg];

    // Build the work list.
    const jobs = [];
    for (const id of presetIds) {
        const preset = PRESETS[id];
        if (!preset) { console.warn(`skip unknown preset ${id}`); continue; }
        const genders = genderArg === "both" ? gendersFor(id) : [genderArg].filter(g => gendersFor(id).includes(g));
        for (const gender of genders) {
            for (const buildKey of buildKeys) jobs.push({ id, preset, gender, buildKey });
        }
    }
    console.log(`Generating ${jobs.length} templates (quality=${QUALITY})...`);

    // Modest concurrency to respect image rate limits (Tier 1 = 5/min).
    const CONCURRENCY = Number(process.env.TEMPLATE_CONCURRENCY || 3);
    let totalUsd = 0, done = 0, failed = 0;
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
        const batch = jobs.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(j => genOne(openai, j.preset, j.id, j.gender, j.buildKey)));
        results.forEach((r, k) => {
            const j = batch[k];
            const tag = `preset-${j.id}-${j.gender}-${j.buildKey}`;
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
