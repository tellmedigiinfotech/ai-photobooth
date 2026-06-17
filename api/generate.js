const OpenAI = require("openai");
const { toFile } = require("openai");
const Busboy = require("busboy");

const MAX_FILE_BYTES = 30 * 1024 * 1024;

// Robust multipart parser for Vercel's Node runtime.
//
// Vercel sometimes pre-buffers req.body into a Buffer (or even a string),
// and sometimes leaves it as a stream — depending on runtime version,
// region, and bodyParser config. Multer assumes a stream and throws
// "Unexpected end of form" the moment it sees anything else. To make this
// bulletproof we ALWAYS drain to a Buffer first, then hand it to busboy
// (the underlying parser multer wraps) ourselves.
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
            const bb = Busboy({
                headers: req.headers,
                limits: { fileSize: MAX_FILE_BYTES, files: 4, fields: 20 },
            });

            const fields = {};
            const files = {};
            let fileTooLarge = false;

            bb.on("field", (name, val) => { fields[name] = val; });

            bb.on("file", (name, file, info) => {
                const chunks = [];
                file.on("data", c => chunks.push(c));
                file.on("limit", () => { fileTooLarge = true; });
                file.on("end", () => {
                    files[name] = {
                        fieldname: name,
                        buffer: Buffer.concat(chunks),
                        mimetype: info.mimeType,
                        originalname: info.filename,
                    };
                });
            });

            bb.on("error", reject);
            bb.on("close", () => {
                if (fileTooLarge) return reject(new Error("File too large (max 30MB)"));
                resolve({ fields, files });
            });

            bb.end(bodyBuffer);
        } catch (err) {
            reject(err);
        }
    });
}

// Per-preset data: background filename, a setting noun, and gender-keyed
// outfit phrases grounded in the actual history of each location.
//  1-2   Khajuraho temples       → Chandela dynasty, 950-1050 CE
//  3-4   Orchha Jahangir Mahal   → Bundela Rajput, 17th c (Mughal-era)
//  6, 9  Holkar chhatris         → Holkar Maratha dynasty, 18th century
//  10-11 Rajwada palace          → Holkar royal seat, built 1747
//  12-13 Kheoni Sanctuary        → modern wildlife sanctuary (male-only on client)
const PRESETS = {
    1:  { bg: "Jagdambi Temple , Kandariya Mahadev Temple.jpg",
          setting: "ancient carved sandstone temple at Khajuraho",
          male:   "chandela-era hindu devotee in a traditional white cotton dhoti, a saffron uttariya (shoulder cloth) draped over one shoulder, and a rudraksha mala",
          female: "chandela-era noblewoman in a traditional ivory silk saree with a narrow gold border, classical temple gold jewellery (jhumka earrings, a thin choker and bangles) and a small red bindi" },

    2:  { bg: "Lakshmana Temple IMG_9753-HDR.jpg",
          setting: "10th-century Chandela sandstone temple at Khajuraho",
          male:   "chandela-era nobleman in a cream cotton dhoti and unstitched shoulder cloth, a simple gold armlet and a rudraksha mala around the neck",
          female: "chandela-era noblewoman in a soft mustard silk saree with a gold border, traditional temple gold jewellery and a small red bindi" },

    3:  { bg: "Jahangir Mahal 6 - Copy.jpg",
          setting: "17th-century Bundela palace courtyard at Orchha",
          male:   "bundela rajput prince in a brocade cream angarkha, churidar pyjama, a colourful safa (rajput turban) and a kamarband (waist sash), with subtle gold jewellery",
          female: "bundela rajput princess in a deep-red silk lehenga-choli with zari embroidery, a sheer dupatta draped over the head, traditional rajput gold jewellery (maang tikka, jhumkas, choker)" },

    4:  { bg: "jahangir gate orchha.jpg",
          setting: "monumental Mughal-era Bundela gateway at Orchha",
          male:   "bundela rajput warrior in a saffron brocade angarkha, churidar pyjama, a colourful safa turban, a kamarband and a scabbarded sword at the waist",
          female: "bundela rajput princess in a maroon silk lehenga with gold zari work, a sheer dupatta draped over the head and traditional rajput gold jewellery" },

    6:  { bg: "Chattei River view (7).jpg",
          setting: "18th-century Maratha riverside chhatri on the Narmada at Maheshwar",
          male:   "ahilyabai-era maratha nobleman in a crisp white cotton dhoti and bandgala-style kurta with a bright red pheta (maratha turban) and a simple shawl over one shoulder",
          female: "ahilyabai-era maharashtrian lady in a traditional burgundy nauvari saree (9-yard drape), a thushi (short gold choker), green glass bangles, a pearl necklace and a small decorative bindi" },

    9:  { bg: "Krishnabai holkar chhatri .jpg",
          setting: "18th-century Holkar royal chhatri at Maheshwar",
          male:   "holkar-era maratha sardar in a cream cotton dhoti-kurta with a red pheta turban and a shawl draped over one shoulder",
          female: "holkar-era maharashtrian queen in a royal-blue nauvari saree with gold border, a thushi, pearl necklace and ornate traditional jewellery, styled after queen ahilyabai holkar" },

    10: { bg: "Rajwada Indore.jpg",
          setting: "18th-century seven-storey Holkar palace in Indore",
          male:   "holkar-era maharaja in a cream brocade angarkha, churidar pyjama, a jewelled red pheta turban with a sarpech ornament, a kamarband and a pearl necklace",
          female: "holkar-era maharani in a peacock-green paithani saree with a heavy gold zari border, an ornate thushi, a multi-strand pearl necklace, maang tikka and traditional regal jewellery" },

    11: { bg: "RajWada 15.jpg",
          setting: "inner courtyard of the 18th-century Holkar palace in Indore",
          male:   "holkar-era maratha nobleman in a cream cotton dhoti-kurta with a red pheta turban and a simple shawl",
          female: "holkar-era royal lady in a teal nauvari saree with a gold border, a thushi, pearl necklace and traditional maharashtrian jewellery" },

    12: { bg: "kheoni wildlife sanctuary .jpg",
          setting: "central Indian teak and sal forest at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    13: { bg: "kheoni wildlife sanctuary 1.jpg",
          setting: "forest trail through teak and bamboo at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    // 5   Bhimbetka rock shelters    → prehistoric paleolithic attire, ~30,000 BCE
    // 7   Sanchi Stupa               → modern cultural heritage explorer
    // 8   Mandu Jahaz Mahal          → early-1900s Indian heritage traveller
    // 14  Bandhavgarh Shesh Shaiya   → modern jungle / wildlife explorer
    5:  { bg: "Bhimbetka rock shelter.jpg",
          setting: "ancient Bhimbetka rock shelters in Madhya Pradesh during the prehistoric era around 30,000 BCE, beneath the dramatic overhanging sandstone outcrop, with a warm-toned untouched primeval landscape and no modern structures, paths or visitors anywhere in frame",
          male:   "prehistoric paleolithic cave artist in a short rough animal-hide loincloth in earthy browns with ochre stains low on the hips, a fiber rope belt holding small pigment pouches and twig brushes, a simple bone-bead necklace, a bare torso streaked with red, white and ochre paints mimicking Bhimbetka cave art motifs, wild hair tied back with vine and feathers, paint-splattered hands",
          female: "prehistoric paleolithic gatherer in a fringed grass skirt in earthy beige with leaf patterns ending at mid-calf, a rough bark-cloth shawl draped over one shoulder and tied at the waist with a fiber rope belt set with small shell beads, subtle red ochre body-paint streaks on the arms mimicking Bhimbetka cave art motifs, a simple feather-and-bone necklace, long hair loose with small wildflower accents — modest, fully covered" },

    7:  { bg: "Sanchi Stupa.jpg",
          setting: "the UNESCO World Heritage Site of Sanchi Stupa in Madhya Pradesh, with its great hemispherical dome and intricately carved sandstone torana gateway, under bright daylight and a dramatic cloud-filled sky",
          male:   "modern cultural heritage explorer and traveller in a lightweight beige linen explorer shirt with the sleeves rolled up, an olive-khaki utility cargo jacket with travel pockets, khaki trekking trousers, brown hiking boots, a brown leather crossbody satchel bag clearly visible across the chest with the strap crossing the shoulder, a vintage leather wristwatch, and a lightweight neutral cotton scarf around the neck",
          female: "modern cultural heritage explorer and traveller in a light beige safari-style explorer jacket, olive-khaki cargo trousers, comfortable brown trekking boots, a soft natural-cotton stole around the neck, a brown leather crossbody satchel bag clearly visible at the front with the strap crossing the chest and shoulder, a vintage wristwatch — natural travel-photography look, no glamour styling" },

    8:  { bg: "Jahaz Mahal Mandu.jpg",
          setting: "the Jahaz Mahal in the Royal Enclave at Mandu, Madhya Pradesh, on a soft cloudy monsoon day with overcast diffused daylight, lush bright-green monsoon surroundings and atmospheric moisture in the air",
          male:   "early-1900s Indian heritage traveller in a cream linen kurta shirt, a vintage safari-style overcoat, straight period trousers in muted earth tones, polished brown leather boots, a brown leather satchel bag fully visible at the front, holding a vintage leather field journal — optionally a cream sola topi pith helmet held in the hand",
          female: "elegant early-1900s heritage lady traveller in an ankle-length linen-and-cotton period travel dress in cream or muted earth tones, a lightweight embroidered cotton shawl draped over the shoulders, a fitted period travel overcoat, brown leather ankle boots, a small vintage brown satchel bag fully visible at the front, holding an antique leather diary — natural historical appearance, no glamour makeup, no bridal styling, no heavy jewellery, modest and fully covered" },

    14: { bg: "Shesh Shaiya Bandhavgarh.jpg",
          setting: "beside the ancient moss-covered Shesh Shaiya reclining Vishnu rock-cut sculpture by a still forest pool deep inside the lush green jungle of Bandhavgarh National Park, Madhya Pradesh, with a dense leafy canopy, soft filtered forest light, ferns and vines",
          male:   "modern wildlife and heritage jungle explorer in an olive-green long-sleeve cotton explorer shirt with a chest pocket, a lightweight khaki safari vest with pockets, rugged khaki trekking cargo trousers, brown jungle trekking boots, a brown leather explorer satchel clearly visible at the front with the strap crossing the chest, a pair of binoculars hanging around the neck, an optional explorer scarf — no weapons",
          female: "modern wildlife and heritage jungle explorer in a khaki long-sleeve cotton explorer shirt, a lightweight olive safari jacket, comfortable khaki trekking trousers, brown trekking boots, a brown leather crossbody explorer satchel clearly visible at the front with the strap crossing the chest and shoulder, a pair of binoculars or a compact travel camera, a lightweight neutral scarf — natural explorer look, no glamour makeup, no jewellery" },
};

function buildPrompt(preset, gender) {
    const outfit = gender === "female" ? preset.female : preset.male;
    return `Create ONE photorealistic portrait by combining the two reference images.

IMAGE 1 = THE PERSON (the subject). IMAGE 2 = THE LOCATION (a real heritage site, used as the background and for accurate scene lighting).

TASK: Show the exact person from Image 1 on location at ${preset.setting}, dressed as a ${outfit}. The result must look like a genuine photograph of that same individual taken at that place.

1. IDENTITY — HIGHEST PRIORITY. Reproduce the person's face from Image 1 exactly: the same eyes, eyebrows, nose, mouth, lips, jawline, face shape, cheekbones, skin tone, complexion, hairline, apparent age and natural expression. This must be unmistakably the SAME person — a viewer who knows them should recognise them instantly. Do NOT beautify, smooth, slim, sharpen the jaw, enlarge the eyes, de-age, lighten the skin, or restyle the face in any way. Preserve their real body type and build. If the face is even slightly a different person, the image has failed.

2. FRAMING. A three-quarter, knees-up medium portrait. The person faces the camera close to front-on, with the head and face rendered LARGE, sharp, in focus and well-lit — occupying a generous, clearly readable portion of the frame. Never a small or distant full-body figure; never crop at the neck or chin.

3. WARDROBE. Replace only the clothing with the period attire described above, fitted naturally to the person's body and pose, historically grounded and tasteful. Do not let the wardrobe change the face or body.

4. ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol to anyone, under any circumstances: no sindoor / vermilion (red or orange powder, streak or dot) in the hair parting, no kumkum dot implying marriage, no mangalsutra (black-bead-and-gold marriage necklace), no bridal makeup, no heavy nath / nose ring, no other suhaag or saubhagya marriage marker. The hair parting stays clean with no colour; the neck carries no marriage necklace. This holds regardless of the era, region, tradition, the outfit description, or the person's apparent age or gender — and even if Image 1 appears to show one, do not reproduce it. Use ONLY decorative, non-marital jewellery; when in doubt, omit it. Adding these symbols causes serious cultural and religious offence and is a critical failure.

5. AGE-APPROPRIATE. Match the person's apparent age in Image 1. If they appear to be a child or teenager, keep the styling simple and light — no nose ring, no heavy ornaments, no adult makeup, no bindi — and drop any wardrobe element that is not suitable for their age. A small plain decorative bindi is acceptable only for an adult woman; otherwise omit it.

6. INTEGRATION. Match the lighting direction, colour temperature, shadows, perspective and depth of the location in Image 2 so the person sits naturally in the scene. Professional, realistic photography with natural skin texture — not plastic, waxy or over-retouched.`;
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
        const { fields, files } = await parseMultipart(req);
        const { presetId, gender } = fields;
        const userImage = files["userImage"];

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
                mimeType: userImage.mimetype,
                note: "Set OPENAI_API_KEY in Vercel env to enable generation.",
            });
        }

        const prompt = buildPrompt(preset, gender);
        console.log("Prompt:", prompt);

        const background = await fetchBackgroundBuffer(req, preset.bg);

        // GPT Image 2 (images/edits). The visitor's photo is passed FIRST so the
        // model anchors on THEIR likeness, then the heritage background is the
        // second reference for the scene. The model restyles them into period
        // attire while keeping their face/body recognisable. (gpt-image-2 has no
        // input_fidelity knob — it handles identity natively.) A deterministic
        // inswapper face-swap still runs afterwards (client → /api/faceswap) to
        // lock the exact identity: GPT Image 2 gives the believable, likeness-
        // aware base; the swap removes all remaining drift.
        const openai = new OpenAI({ apiKey: openaiKey });
        const userFile = await toFile(
            userImage.buffer,
            userImage.originalname || "face.png",
            { type: userImage.mimetype || "image/png" },
        );
        const bgFile = await toFile(
            background.buffer,
            preset.bg,
            { type: background.mimeType || "image/jpeg" },
        );

        const result = await openai.images.edit({
            model: "gpt-image-2",
            image: [userFile, bgFile],
            prompt,
            size: "1024x1536",      // portrait, closest GPT-Image size to the 3:4 layout
            quality: "medium",      // ~71s, ~₹6/photo; the face-swap finisher locks
                                    // identity so high's extra detail/latency isn't worth 3x
        });

        const b64 = result?.data?.[0]?.b64_json;
        if (!b64) throw new Error("GPT Image 2 returned no image data");

        return res.json({
            success: true,
            generatedImage: b64,
            mimeType: "image/png",
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
