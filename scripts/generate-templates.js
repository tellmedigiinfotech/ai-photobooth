#!/usr/bin/env node
/*
 * Generate face-swap templates: one photorealistic photograph per
 * preset × gender showing a model standing at the heritage location
 * wearing the correct attire. Templates are the one-time asset the
 * runtime face-swap pipeline swaps faces onto.
 *
 * Usage:
 *   node scripts/generate-templates.js                 # all presets × male+female
 *   node scripts/generate-templates.js --preset=1      # just preset id 1
 *   node scripts/generate-templates.js --gender=male   # only male templates
 *   node scripts/generate-templates.js --force         # regenerate even if file exists
 */

const fs = require("fs");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const ROOT = path.join(__dirname, "..");
const TEMPLATE_DIR = path.join(ROOT, "assets", "templates");
if (!fs.existsSync(TEMPLATE_DIR)) fs.mkdirSync(TEMPLATE_DIR, { recursive: true });

// Keep this list in sync with app.js presets.
const presets = [
    {
        id: 1,
        name: "Khajuraho — Kandariya Mahadev",
        prompt: "Composite the person naturally into the provided background photograph of the Kandariya Mahadev and Jagdambi temples at Khajuraho, Madhya Pradesh. Place the person standing on the temple platform in the mid-foreground, framed by the carved sandstone wall behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain ivory cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in soft mustard with a thin gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the pale sandstone.",
        backgroundUrl: "assets/backgrounds/Jagdambi Temple , Kandariya Mahadev Temple.jpg",
    },
    {
        id: 2,
        name: "Khajuraho — Lakshmana Temple",
        prompt: "Composite the person naturally into the provided background photograph of the Lakshmana Temple at Khajuraho, Madhya Pradesh. Place the person standing on the temple plinth in the mid-foreground, framed by the carved sandstone reliefs behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain off-white cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in ivory with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused sunlight on the sandstone.",
        backgroundUrl: "assets/backgrounds/Lakshmana Temple IMG_9753-HDR.jpg",
    },
    {
        id: 3,
        name: "Orchha — Jahangir Mahal",
        prompt: "Composite the person naturally into the provided background photograph of Jahangir Mahal at Orchha, Madhya Pradesh. Place the person standing in an arched gallery in the mid-foreground, framed by the sandstone arches behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain jade-green cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in deep red with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight falling through the arches.",
        backgroundUrl: "assets/backgrounds/Jahangir Mahal 6 - Copy.jpg",
    },
    {
        id: 4,
        name: "Orchha — Jahangir Gate",
        prompt: "Composite the person naturally into the provided background photograph of the grand entrance gate of Jahangir Mahal at Orchha, Madhya Pradesh. Place the person standing just in front of the archway in the mid-foreground, framed by the carved stone brackets above them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain saffron cotton kurta with cream cotton pyjama trousers; for women, a Chanderi silk-cotton saree in deep maroon with a narrow gold border, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the pale stone.",
        backgroundUrl: "assets/backgrounds/jahangir gate orchha.jpg",
    },
    {
        id: 5,
        name: "Mandu — Watchful Gates",
        prompt: "Composite the person naturally into the provided background photograph of the monumental stone gateways of Mandu, Madhya Pradesh. Place the person standing beneath the gateway arch in the mid-foreground, framed by the weathered stone masonry behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and everyday: for men, a plain deep-indigo cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in teal with a rust-red border, small silver stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the weathered stone.",
        backgroundUrl: "assets/backgrounds/Mandu’s Watchful Gates.jpg",
    },
    {
        id: 6,
        name: "Maheshwar — Chhatri by the River",
        prompt: "Composite the person naturally into the provided background photograph of the riverside chhatri at Maheshwar, Madhya Pradesh. Place the person standing on the stone platform in the mid-foreground, framed by the sandstone chhatri rising behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with a cream cotton dhoti; for women, a Maheshwari silk-cotton saree in burgundy with a thin gold border, a small gold nath (nose pin), a simple gold thushi (short choker), small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused river-reflected daylight.",
        backgroundUrl: "assets/backgrounds/Chattei River view (7).jpg",
    },
    {
        id: 7,
        name: "Holkar Chhatris I",
        prompt: "Composite the person naturally into the provided background photograph of the Holkar-dynasty chhatris in Madhya Pradesh. Place the person standing on the stone plinth in the mid-foreground, framed by the carved sandstone columns behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in forest green with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the sandstone.",
        backgroundUrl: "assets/backgrounds/Chattri Monuments 1.jpg",
    },
    {
        id: 8,
        name: "Holkar Chhatris II",
        prompt: "Composite the person naturally into the provided background photograph of the domed chhatri monument in Madhya Pradesh. Place the person standing in the mid-foreground directly in front of the chhatri, framed by its carved silhouette behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain ivory cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in deep red with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused golden daylight on the monument.",
        backgroundUrl: "assets/backgrounds/Chattri Monuments 4.jpg",
    },
    {
        id: 9,
        name: "Krishnabai Holkar Chhatri",
        prompt: "Composite the person naturally into the provided background photograph of the Krishnabai Holkar chhatri at Maheshwar, Madhya Pradesh. Place the person standing on the stone plinth in the mid-foreground, framed by the chhatri rising behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in royal blue with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused Narmada-side daylight.",
        backgroundUrl: "assets/backgrounds/Krishnabai holkar chhatri .jpg",
    },
    {
        id: 10,
        name: "Indore — Rajwada Palace",
        prompt: "Composite the person naturally into the provided background photograph of Rajwada Palace in Indore, Madhya Pradesh. Place the person standing before the main entrance in the mid-foreground, framed by the wooden-and-stone palace facade behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Paithani silk-cotton saree in peacock green with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight on the palace facade.",
        backgroundUrl: "assets/backgrounds/Rajwada Indore.jpg",
    },
    {
        id: 11,
        name: "Indore — Rajwada Courtyard",
        prompt: "Composite the person naturally into the provided background photograph of the inner courtyard and facade of Rajwada Palace in Indore, Madhya Pradesh. Place the person standing in the mid-foreground courtyard, framed by the palace wings behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Keep the attire subtle and culturally Maharashtrian: for men, a plain cream cotton kurta with cream cotton pyjama trousers; for women, a Maheshwari silk-cotton saree in teal with a thin gold border, a small gold nath, a simple gold thushi, small gold stud earrings and a small red bindi. Match the skin lighting to the soft diffused daylight of the courtyard.",
        backgroundUrl: "assets/backgrounds/RajWada 15.jpg",
    },
    {
        id: 12,
        name: "Kheoni Sanctuary — Wilds of MP",
        prompt: "Composite the person naturally into the provided background photograph of Kheoni Wildlife Sanctuary in Madhya Pradesh. Place the person standing on the forest path in the mid-foreground, framed by the teak and sal trees behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Dress the person as a friendly modern wildlife-safari explorer/naturalist tourist: for men, a clean khaki short-sleeve safari shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat, and a small pair of binoculars hanging from the neck; for women, the same khaki short-sleeve safari shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat, and a small pair of binoculars hanging from the neck. The look must read as cheerful eco-tourist on a jungle safari, never military, paramilitary, uniformed or combat-styled — no camouflage, no green fatigues, no berets, no tactical gear, no weapons. Match the skin lighting to the soft dappled forest daylight.",
        backgroundUrl: "assets/backgrounds/kheoni wildlife sanctuary .jpg",
    },
    {
        id: 13,
        name: "Kheoni Sanctuary — Forest Trail",
        prompt: "Composite the person naturally into the provided background photograph of a forest trail inside Kheoni Wildlife Sanctuary, Madhya Pradesh. Place the person standing on the trail in the mid-foreground, framed by the teak and bamboo trees behind them, framed as a medium shot (waist-up, person filling roughly half the frame). Dress the person as a friendly modern wildlife-safari explorer/naturalist tourist: for men, a clean sand-beige short-sleeve safari shirt with a chest pocket, light khaki cargo trousers, a wide-brim canvas safari hat, and a small pair of binoculars hanging from the neck; for women, the same sand-beige short-sleeve safari shirt with a chest pocket, light khaki cargo trousers, a wide-brim canvas safari hat, and a small pair of binoculars hanging from the neck. The look must read as cheerful eco-tourist on a jungle safari, never military, paramilitary, uniformed or combat-styled — no camouflage, no green fatigues, no berets, no tactical gear, no weapons. Match the skin lighting to the soft cool filtered forest light.",
        backgroundUrl: "assets/backgrounds/kheoni wildlife sanctuary 1.jpg",
    },
];

function parseArgs(argv) {
    const out = { preset: null, gender: null, force: false };
    for (const a of argv.slice(2)) {
        if (a === "--force") out.force = true;
        else if (a.startsWith("--preset=")) out.preset = Number(a.split("=")[1]);
        else if (a.startsWith("--gender=")) out.gender = a.split("=")[1];
    }
    return out;
}

function buildTemplatePrompt(scenePrompt, gender) {
    const genderUpper = gender.toUpperCase();
    const attireWord = gender === "male" ? "men" : "women";
    const oppWord = gender === "male" ? "women" : "men";
    const bodyWord = gender === "male" ? "male" : "female";
    const oppBody = gender === "male" ? "female" : "male";

    return [
        `TASK: Generate a photorealistic template photograph showing a ${genderUpper} model standing at this heritage location.`,
        ``,
        `GENDER DIRECTIVE (NON-NEGOTIABLE):`,
        `- The subject is ${genderUpper}. Generate a ${bodyWord} body, ${bodyWord} face, ${bodyWord} hairstyle, and ${bodyWord} attire only. Do NOT generate a ${oppBody} body under any circumstances.`,
        `- In the scene description below, use ONLY the "for ${attireWord}" attire spec. Completely IGNORE the "for ${oppWord}" spec.`,
        ``,
        `FACE REQUIREMENTS (this template will be used as a face-swap target — face fidelity rules):`,
        `- Face must be clearly visible, well-lit, and sharply in focus`,
        `- Head front-facing (looking directly at the camera), head tilt < 10 degrees`,
        `- Both eyes fully open and visible`,
        `- No hair, hand, jewellery, or other object covering the face`,
        `- Face should occupy roughly 15-18% of the vertical frame height — big enough for good face-swap detail`,
        `- Neutral, gentle, pleasant expression — closed or softly-open mouth`,
        ``,
        `COMPOSITION:`,
        `- Medium shot, waist-up`,
        `- Person centred horizontally, upper torso and head visible`,
        `- Heritage monument clearly visible behind the person as context`,
        `- Natural, relaxed standing pose`,
        ``,
        `BACKGROUND:`,
        `- The heritage background photograph is the FINAL CANVAS. Every pixel of the background that is not covered by the inserted model must remain identical to the input photograph. Do not regenerate, re-render, or stylise the monument.`,
        ``,
        `SCENE AND ATTIRE DETAILS (authoritative; follow precisely, using only the gender-matching attire):`,
        scenePrompt,
    ].join("\n");
}

function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function generateOne(ai, preset, gender, { force }) {
    const outPath = path.join(TEMPLATE_DIR, `${preset.id}-${gender}.jpg`);
    if (!force && fs.existsSync(outPath)) {
        console.log(`  ⏭  skip (exists): ${path.relative(ROOT, outPath)}`);
        return { status: "skip" };
    }

    const bgAbsolute = path.join(ROOT, preset.backgroundUrl);
    if (!fs.existsSync(bgAbsolute)) {
        console.error(`  ✗ background file missing: ${preset.backgroundUrl}`);
        return { status: "error", reason: "background missing" };
    }
    const bgBuffer = fs.readFileSync(bgAbsolute);
    const bgMime = preset.backgroundUrl.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

    const systemPrompt = buildTemplatePrompt(preset.prompt, gender);

    const started = Date.now();
    const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [
            { text: `You are generating a high-quality template photograph. Two inputs follow — the BACKGROUND PHOTOGRAPH of the heritage location, then the INSTRUCTIONS. Follow the instructions exactly.` },
            { text: `\nBACKGROUND PHOTOGRAPH (the final canvas — preserve every pixel exactly):` },
            { inlineData: { mimeType: bgMime, data: bgBuffer.toString("base64") } },
            { text: `\n${systemPrompt}` },
            { text: `\nFINAL REMINDER: Generate a ${gender.toUpperCase()} subject only. Preserve the background above unchanged. The face must be sharp, front-facing, and unobstructed.` },
        ],
        config: {
            responseModalities: ["Image"],
            imageConfig: {
                imageSize: "2K",
                aspectRatio: "4:3",
            },
        },
    });

    let imgB64 = null;
    if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                imgB64 = part.inlineData.data;
                break;
            }
        }
    }
    if (!imgB64) {
        const txt = response.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join(" ") || "(no text reason)";
        console.error(`  ✗ no image returned: ${txt.slice(0, 140)}`);
        return { status: "error", reason: "no image" };
    }

    fs.writeFileSync(outPath, Buffer.from(imgB64, "base64"));
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(0);
    console.log(`  ✓ wrote ${path.relative(ROOT, outPath)}  (${sizeKb} KB, ${secs}s)`);
    return { status: "ok" };
}

async function main() {
    const args = parseArgs(process.argv);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY not set. Run `vercel env pull .env.local` first, or export the key.");
        process.exit(1);
    }

    const ai = new GoogleGenAI({ apiKey });

    const selectedPresets = args.preset ? presets.filter(p => p.id === args.preset) : presets;
    const genders = args.gender ? [args.gender] : ["male", "female"];

    if (selectedPresets.length === 0) {
        console.error(`Preset id ${args.preset} not found.`);
        process.exit(1);
    }
    for (const g of genders) {
        if (!["male", "female"].includes(g)) {
            console.error(`Invalid gender: ${g}`);
            process.exit(1);
        }
    }

    const tally = { ok: 0, skip: 0, error: 0 };
    console.log(`Generating templates — ${selectedPresets.length} preset(s) × ${genders.length} gender(s) = ${selectedPresets.length * genders.length} images\n`);

    for (const preset of selectedPresets) {
        console.log(`[${preset.id}] ${preset.name}`);
        for (const gender of genders) {
            console.log(`  → ${gender}`);
            try {
                const r = await generateOne(ai, preset, gender, args);
                tally[r.status] = (tally[r.status] || 0) + 1;
            } catch (err) {
                console.error(`  ✗ error:`, err.message);
                tally.error++;
            }
        }
    }

    console.log(`\nDone. ok=${tally.ok}  skip=${tally.skip}  error=${tally.error}`);
}

main().catch(err => { console.error(err); process.exit(1); });
