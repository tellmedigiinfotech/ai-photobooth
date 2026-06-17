const OpenAI = require("openai");
const { toFile } = require("openai");
const { admin, getDb } = require("../lib/firebase");

// The client sends a JSON body: { userImage, bodyImage, presetId, gender }
// where userImage (face) and bodyImage (full body) are data URLs.
//
// We deliberately AVOID multipart/form-data: Vercel's dev/runtime drains the
// request stream before the handler runs without populating req.body for
// multipart, which surfaces as "Unexpected end of form". JSON is reliable —
// with bodyParser:false we drain the raw stream ourselves and JSON.parse it.
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

// Split a data URL ("data:image/jpeg;base64,XXXX") into { mimeType, buffer }.
function parseDataUrl(dataUrl) {
    const m = /^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/.exec(dataUrl || "");
    if (!m || !m[2]) return null;
    return { mimeType: m[1] || "image/jpeg", buffer: Buffer.from(m[2], "base64") };
}

// Per-preset data: background filename, a setting noun, and gender-keyed
// outfit phrases grounded in the actual history of each location.
//  1-2   Khajuraho temples       → Chandela dynasty, 950-1050 CE
//  3-4   Orchha Jahangir Mahal   → Bundela Rajput, 17th c (Mughal-era)
//  6, 9  Holkar chhatris         → Holkar Maratha dynasty, 18th century
//  10-11 Rajwada palace          → Holkar royal seat, built 1747
//  12-13 Kheoni Sanctuary        → modern wildlife sanctuary (male-only on client)
const PRESETS = {
    1:  { bg: "jagdambi-temple-kandariya-mahadev-temple.jpg",
          setting: "ancient carved sandstone temple at Khajuraho",
          male:   "chandela-era hindu devotee in a traditional white cotton dhoti, a saffron uttariya (shoulder cloth) draped over one shoulder, and a rudraksha mala",
          female: "chandela-era noblewoman in a traditional ivory silk saree with a narrow gold border, classical temple gold jewellery (jhumka earrings, a thin choker and bangles) and a small red bindi" },

    2:  { bg: "lakshmana-temple-img-9753-hdr.jpg",
          setting: "10th-century Chandela sandstone temple at Khajuraho",
          male:   "chandela-era nobleman in a cream cotton dhoti and unstitched shoulder cloth, a simple gold armlet and a rudraksha mala around the neck",
          female: "chandela-era noblewoman in a soft mustard silk saree with a gold border, traditional temple gold jewellery and a small red bindi" },

    3:  { bg: "jahangir-mahal-6-copy.jpg",
          setting: "17th-century Bundela palace courtyard at Orchha",
          male:   "bundela rajput prince in a brocade cream angarkha, churidar pyjama, a colourful safa (rajput turban) and a kamarband (waist sash), with subtle gold jewellery",
          female: "bundela rajput princess in a deep-red silk lehenga-choli with zari embroidery, a sheer dupatta draped over the head, traditional rajput gold jewellery (maang tikka, jhumkas, choker)" },

    4:  { bg: "jahangir-gate-orchha.jpg",
          setting: "monumental Mughal-era Bundela gateway at Orchha",
          male:   "bundela rajput warrior in a saffron brocade angarkha, churidar pyjama, a colourful safa turban, a kamarband and a scabbarded sword at the waist",
          female: "bundela rajput princess in a maroon silk lehenga with gold zari work, a sheer dupatta draped over the head and traditional rajput gold jewellery" },

    6:  { bg: "chattei-river-view-7.jpg",
          setting: "18th-century Maratha riverside chhatri on the Narmada at Maheshwar",
          male:   "ahilyabai-era maratha nobleman in a crisp white cotton dhoti and bandgala-style kurta with a bright red pheta (maratha turban) and a simple shawl over one shoulder",
          female: "ahilyabai-era maharashtrian lady in a traditional burgundy nauvari saree (9-yard drape), a thushi (short gold choker), green glass bangles, a pearl necklace and a small decorative bindi" },

    9:  { bg: "krishnabai-holkar-chhatri.jpg",
          setting: "18th-century Holkar royal chhatri at Maheshwar",
          male:   "holkar-era maratha sardar in a cream cotton dhoti-kurta with a red pheta turban and a shawl draped over one shoulder",
          female: "holkar-era maharashtrian queen in a royal-blue nauvari saree with gold border, a thushi, pearl necklace and ornate traditional jewellery, styled after queen ahilyabai holkar" },

    10: { bg: "rajwada-indore.jpg",
          setting: "18th-century seven-storey Holkar palace in Indore",
          male:   "holkar-era maharaja in a cream brocade angarkha, churidar pyjama, a jewelled red pheta turban with a sarpech ornament, a kamarband and a pearl necklace",
          female: "holkar-era maharani in a peacock-green paithani saree with a heavy gold zari border, an ornate thushi, a multi-strand pearl necklace, maang tikka and traditional regal jewellery" },

    11: { bg: "rajwada-15.jpg",
          setting: "inner courtyard of the 18th-century Holkar palace in Indore",
          male:   "holkar-era maratha nobleman in a cream cotton dhoti-kurta with a red pheta turban and a simple shawl",
          female: "holkar-era royal lady in a teal nauvari saree with a gold border, a thushi, pearl necklace and traditional maharashtrian jewellery" },

    12: { bg: "kheoni-wildlife-sanctuary.jpg",
          setting: "central Indian teak and sal forest at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    13: { bg: "kheoni-wildlife-sanctuary-1.jpg",
          setting: "forest trail through teak and bamboo at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    // 5   Bhimbetka rock shelters    → prehistoric paleolithic attire, ~30,000 BCE
    // 7   Sanchi Stupa               → modern cultural heritage explorer
    // 8   Mandu Jahaz Mahal          → early-1900s Indian heritage traveller
    // 14  Bandhavgarh Shesh Shaiya   → modern jungle / wildlife explorer
    7:  { bg: "sanchi-stupa.jpg",
          setting: "the UNESCO World Heritage Site of Sanchi Stupa in Madhya Pradesh, with its great hemispherical dome and intricately carved sandstone torana gateway, under bright daylight and a dramatic cloud-filled sky",
          male:   "modern cultural heritage explorer and traveller in a lightweight beige linen explorer shirt with the sleeves rolled up, an olive-khaki utility cargo jacket with travel pockets, khaki trekking trousers, brown hiking boots, a brown leather crossbody satchel bag clearly visible across the chest with the strap crossing the shoulder, a vintage leather wristwatch, and a lightweight neutral cotton scarf around the neck",
          female: "modern cultural heritage explorer and traveller in a light beige safari-style explorer jacket, olive-khaki cargo trousers, comfortable brown trekking boots, a soft natural-cotton stole around the neck, a brown leather crossbody satchel bag clearly visible at the front with the strap crossing the chest and shoulder, a vintage wristwatch — natural travel-photography look, no glamour styling" },

    8:  { bg: "jahaz-mahal-mandu.jpg",
          setting: "the Jahaz Mahal in the Royal Enclave at Mandu, Madhya Pradesh, on a soft cloudy monsoon day with overcast diffused daylight, lush bright-green monsoon surroundings and atmospheric moisture in the air",
          male:   "early-1900s Indian heritage traveller in a cream linen kurta shirt, a vintage safari-style overcoat, straight period trousers in muted earth tones, polished brown leather boots, a brown leather satchel bag fully visible at the front, holding a vintage leather field journal — optionally a cream sola topi pith helmet held in the hand",
          female: "elegant early-1900s heritage lady traveller in an ankle-length linen-and-cotton period travel dress in cream or muted earth tones, a lightweight embroidered cotton shawl draped over the shoulders, a fitted period travel overcoat, brown leather ankle boots, a small vintage brown satchel bag fully visible at the front, holding an antique leather diary — natural historical appearance, no glamour makeup, no bridal styling, no heavy jewellery, modest and fully covered" },

    14: { bg: "shesh-shaiya-bandhavgarh.jpg",
          setting: "beside the ancient moss-covered Shesh Shaiya reclining Vishnu rock-cut sculpture by a still forest pool deep inside the lush green jungle of Bandhavgarh National Park, Madhya Pradesh, with a dense leafy canopy, soft filtered forest light, ferns and vines",
          male:   "modern wildlife and heritage jungle explorer in an olive-green long-sleeve cotton explorer shirt with a chest pocket, a lightweight khaki safari vest with pockets, rugged khaki trekking cargo trousers, brown jungle trekking boots, a brown leather explorer satchel clearly visible at the front with the strap crossing the chest, a pair of binoculars hanging around the neck, an optional explorer scarf — no weapons",
          female: "modern wildlife and heritage jungle explorer in a khaki long-sleeve cotton explorer shirt, a lightweight olive safari jacket, comfortable khaki trekking trousers, brown trekking boots, a brown leather crossbody explorer satchel clearly visible at the front with the strap crossing the chest and shoulder, a pair of binoculars or a compact travel camera, a lightweight neutral scarf — natural explorer look, no glamour makeup, no jewellery" },
};

function buildPrompt(preset, gender, hasBody) {
    const outfit = gender === "female" ? preset.female : preset.male;
    // Image legend + body-type rule adapt to whether a full-body shot was sent.
    const legend = hasBody
        ? `IMAGE 1 = the person's FACE (close-up) — use this for facial likeness.
IMAGE 2 = a full-body photo of the SAME person — use this ONLY to read their body type, build and proportions (height, weight, frame). Ignore the clothing, pose and background in Image 2.
IMAGE 3 = the LOCATION (a real heritage site) — use this as the background and for scene lighting.`
        : `IMAGE 1 = the person's FACE — use this for facial likeness.
IMAGE 2 = the LOCATION (a real heritage site) — use this as the background and for scene lighting.`;
    const bodyRule = hasBody
        ? `

BODY TYPE — render the person with the SAME body build and proportions as the full-body person in Image 2: the same overall size and weight (slim, average or heavier), the same shoulder width and frame. Do not slim them down or bulk them up — match Image 2's build honestly.`
        : "";
    const locImage = hasBody ? "Image 3" : "Image 2";
    return `Create ONE photorealistic portrait by combining the reference images.

${legend}

TASK: Show this exact person on location at ${preset.setting}, dressed as a ${outfit}. The result must look like a genuine photograph of that same individual taken at that place.

IDENTITY. Use Image 1 only as the reference for WHO this person is — reproduce their recognisable facial features and proportions: the same eye shape and spacing, eyebrows, nose, mouth and lips, jawline, face shape, cheekbones, hairline and apparent age, so anyone who knows them recognises them instantly. Keep their real features and natural skin — do not beautify, smooth, slim, sharpen the jaw, enlarge the eyes, de-age, or swap in a different face. BUT render the face FRESH as a part of THIS photograph — it is NOT a cut-out of the reference photo. You must re-light, re-shade and colour-grade the face to belong to this scene (see BLENDING below).${bodyRule}

FRAMING & POSE. A natural waist-up or three-quarter portrait with the face clearly visible, sharp and well-lit. Use a RELAXED, candid pose — a natural stance with weight shifted easily, a calm genuine expression or a soft natural smile, perhaps a slight turn of the head or shoulders. Do NOT make it a stiff, rigid, perfectly symmetrical, straight-on "mugshot". It should feel like a real travel photograph someone actually posed for at the site, not a posed studio cut-out.

WARDROBE. Dress them in the period attire described above, fitted naturally to their body and pose, historically grounded and tasteful. Do not let the wardrobe change the face or body build.

ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol to anyone, under any circumstances: no sindoor / vermilion (red or orange powder, streak or dot) in the hair parting, no kumkum dot implying marriage, no mangalsutra (black-bead-and-gold marriage necklace), no bridal makeup, no heavy nath / nose ring, no other suhaag or saubhagya marriage marker. The hair parting stays clean with no colour; the neck carries no marriage necklace. This holds regardless of the era, region, tradition, the outfit description, or the person's apparent age or gender — and even if a reference image appears to show one, do not reproduce it. Use ONLY decorative, non-marital jewellery; when in doubt, omit it. Adding these symbols causes serious cultural and religious offence and is a critical failure.

AGE-APPROPRIATE. Match the person's apparent age. If they appear to be a child or teenager, keep the styling simple and light — no nose ring, no heavy ornaments, no adult makeup, no bindi — and drop any wardrobe element that is not suitable for their age. A small plain decorative bindi is acceptable only for an adult woman; otherwise omit it.

BLENDING — CRITICAL (this fixes the "pasted / patched-on face" look). The face must look like it was photographed in THIS scene under THIS light, never pasted from another photo. Relight the face so its light direction, softness, intensity, colour temperature and white balance EXACTLY match the body, neck and background in ${locImage}. Match the skin tone, shading, contrast, shadows and highlights of the face to the neck, ears, hands and surroundings — clearly the same skin under the same light. There must be NO visible seam, edge, outline, halo, blur line or tonal/colour jump anywhere around the face, hairline, jaw or neck. The face must carry the exact same lens focus, depth of field, grain and photographic colour grade as the rest of the frame. If the face looks brighter, sharper, flatter, cooler/warmer or a different tone than the body, it is WRONG — blend it seamlessly so the whole image reads as a single photograph taken in one shot.

PHOTOREALISM — CRITICAL. The result MUST look like a genuine photograph taken on a professional full-frame camera with an 85mm portrait lens — NOT a digital illustration, NOT a 3D render, NOT a glossy "AI-generated" image. Render true-to-life skin with natural texture: visible pores, fine lines, slight natural blemishes and asymmetry, realistic subsurface tone variation and a natural matte sheen — never airbrushed, plastic, waxy, smoothed or doll-like. Real catchlights in the eyes, individual hair strands with a few natural flyaways, fabric with genuine weave, folds and wrinkles. Use natural, slightly uneven daylight, a shallow depth of field with the background gently out of focus, and photographic colour grading (not over-saturated AI colour). Subtle film grain is welcome. The face especially must read as a real human photographed in the moment, not a rendered or beautified likeness.`;
}

async function fetchBackgroundBuffer(req, filename) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const url = `${protocol}://${host}/assets/backgrounds/${encodeURI(filename)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch background (${r.status}): ${url}`);
    const mime = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return { buffer: buf, mimeType: mime };
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const body = await readJsonBody(req);
        const { presetId, gender } = body;
        const userImage = parseDataUrl(body.userImage); // face close-up (Image 1) → {mimeType, buffer}
        const bodyImage = parseDataUrl(body.bodyImage); // full-body shot (Image 2) — optional

        if (!userImage)         return res.status(400).json({ error: "User image is required" });
        if (!presetId)          return res.status(400).json({ error: "presetId is required" });
        if (gender !== "male" && gender !== "female") {
            return res.status(400).json({ error: "gender must be 'male' or 'female'", received: gender });
        }

        const preset = PRESETS[Number(presetId)];
        if (!preset) return res.status(400).json({ error: "Unknown presetId" });

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimeType,
                note: "Set OPENAI_API_KEY in Vercel env to enable generation.",
            });
        }

        const prompt = buildPrompt(preset, gender, !!bodyImage);
        console.log("Prompt:", prompt);

        const background = await fetchBackgroundBuffer(req, preset.bg);

        // GPT Image 2 (images/edits) with up to THREE inputs, in prompt order:
        //   Image 1 = face close-up  → facial likeness
        //   Image 2 = full-body shot → body type / build (optional)
        //   Image 3 = heritage photo → background + scene lighting
        // The model renders the person in period attire at the location, matching
        // their face AND their real body build. A deterministic inswapper
        // face-swap still runs afterwards (client → /api/faceswap) to lock the
        // exact identity. gpt-image-2 has no input_fidelity knob — it handles
        // identity natively, and the swap removes any remaining drift.
        const openai = new OpenAI({ apiKey: openaiKey });
        const userFile = await toFile(
            userImage.buffer,
            "face.png",
            { type: userImage.mimeType || "image/png" },
        );
        const bgFile = await toFile(
            background.buffer,
            preset.bg,
            { type: background.mimeType || "image/jpeg" },
        );
        // Body image is optional — if absent, fall back to a two-image prompt.
        const inputImages = [userFile];
        if (bodyImage) {
            inputImages.push(await toFile(
                bodyImage.buffer,
                "body.jpg",
                { type: bodyImage.mimeType || "image/jpeg" },
            ));
        }
        inputImages.push(bgFile);

        const result = await openai.images.edit({
            model: "gpt-image-2",
            image: inputImages,
            prompt,
            size: "1024x1536",      // portrait, closest GPT-Image size to the 3:4 layout
            quality: "medium",      // ~71s, ~₹6/photo; the face-swap finisher locks
                                    // identity so high's extra detail/latency isn't worth 3x
            output_format: "jpeg",
            output_compression: 90,
        });

        const b64 = result?.data?.[0]?.b64_json;
        if (!b64) throw new Error("GPT Image 2 returned no image data");

        // Best-effort: tick the usage counter for this background AND log an
        // individual generation event for the MIS view. A failure here must
        // not block returning the generated image to the user.
        try {
            const db = getDb();
            await Promise.all([
                db.collection("usage").doc(preset.bg).set({
                    filename:   preset.bg,
                    count:      admin.firestore.FieldValue.increment(1),
                    lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }),
                db.collection("generations").add({
                    backgroundFilename: preset.bg,
                    presetId:           Number(presetId),
                    gender,
                    createdAt:          admin.firestore.FieldValue.serverTimestamp(),
                }),
            ]);
        } catch (counterErr) {
            console.warn("Usage counter / generation log failed:", counterErr.message);
        }

        return res.json({
            success: true,
            generatedImage: b64,
            mimeType: "image/jpeg",
        });
    } catch (error) {
        console.error("❌ Error:", error.message);
        return res.status(500).json({
            error: "Failed to generate image",
            details: error.message,
        });
    }
};

// Tell Vercel's runtime NOT to pre-parse the multipart body — multer needs
// the raw request stream. Without this, "Unexpected end of form" errors
// surface once the runtime drains the body before multer sees it.
module.exports.config = {
    api: {
        bodyParser: false,
    },
};

// Exported for the offline test harness (scripts/test_gptimage_generate.js)
// so it exercises the EXACT production prompt and presets — no drift.
module.exports.buildPrompt = buildPrompt;
module.exports.PRESETS = PRESETS;
