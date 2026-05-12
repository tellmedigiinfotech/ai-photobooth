const { GoogleGenAI } = require("@google/genai");
const multer = require("multer");
const { Readable } = require("stream");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
});

// Vercel's Node.js runtime pre-buffers the multipart body into req.body as
// a Buffer. Multer expects a stream, so when the body is already drained
// we reconstruct a Readable mimicking IncomingMessage and hand that to
// multer instead. Without this, multer throws "Unexpected end of form".
function runMulter(req, res) {
    return new Promise((resolve, reject) => {
        let streamReq = req;
        if (Buffer.isBuffer(req.body)) {
            const rebuilt = new Readable({ read() {} });
            rebuilt.push(req.body);
            rebuilt.push(null);
            Object.assign(rebuilt, {
                headers: req.headers,
                method: req.method,
                url: req.url,
            });
            streamReq = rebuilt;
        }
        upload.any()(streamReq, res, (err) => {
            if (err) return reject(err);
            req.files = streamReq.files;
            req.body = streamReq.body;
            resolve();
        });
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
          female: "ahilyabai-era maharashtrian lady in a traditional burgundy nauvari saree (9-yard drape), a gold nath (curved nose ring), thushi (short gold choker), green glass bangles, a pearl necklace and a small red decorative bindi" },

    9:  { bg: "Krishnabai holkar chhatri .jpg",
          setting: "18th-century Holkar royal chhatri at Maheshwar",
          male:   "holkar-era maratha sardar in a cream cotton dhoti-kurta with a red pheta turban and a shawl draped over one shoulder",
          female: "holkar-era maharashtrian queen in a royal-blue nauvari saree with gold border, a gold nath, thushi, pearl necklace and ornate traditional jewellery, styled after queen ahilyabai holkar" },

    10: { bg: "Rajwada Indore.jpg",
          setting: "18th-century seven-storey Holkar palace in Indore",
          male:   "holkar-era maharaja in a cream brocade angarkha, churidar pyjama, a jewelled red pheta turban with a sarpech ornament, a kamarband and a pearl necklace",
          female: "holkar-era maharani in a peacock-green paithani saree with a heavy gold zari border, a large gold nath, ornate thushi, a multi-strand pearl necklace, maang tikka and traditional regal jewellery" },

    11: { bg: "RajWada 15.jpg",
          setting: "inner courtyard of the 18th-century Holkar palace in Indore",
          male:   "holkar-era maratha nobleman in a cream cotton dhoti-kurta with a red pheta turban and a simple shawl",
          female: "holkar-era royal lady in a teal nauvari saree with a gold border, a gold nath, thushi, pearl necklace and traditional maharashtrian jewellery" },

    12: { bg: "kheoni wildlife sanctuary .jpg",
          setting: "central Indian teak and sal forest at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a clean khaki short-sleeve shirt with a chest pocket, light beige cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    13: { bg: "kheoni wildlife sanctuary 1.jpg",
          setting: "forest trail through teak and bamboo at Kheoni Wildlife Sanctuary",
          male:   "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck",
          female: "modern wildlife safari explorer in a sand-beige short-sleeve shirt with a chest pocket, khaki cargo trousers, a wide-brim canvas safari hat and binoculars hanging around the neck" },

    // 14-15  Goa beaches            → modern, modest, fully-covered beach attire
    // 16     Salim Ali Bird Sanctuary → smart-casual birdwatching attire
    // 17-19  Gulmarg, Kashmir       → very well-dressed formal suit / elegant dress
    14: { bg: "Cabo de Rama Beach_DSC9670.jpg",
          setting: "wide curving Goan beach at Cabo de Rama during a soft pink-and-orange sunset, with the calm Arabian Sea, golden sand, dark coastal rocks and tall coconut palms swaying along the shoreline",
          male:   "easy-going beach-day visitor in a soft cream linen full-sleeve shirt with the sleeves loosely rolled up to the forearm, fully buttoned, comfortable beige cotton beach trousers, and a pair of simple rubber flip-flop beach slippers — modest, fully clothed, no shorts and no swimwear",
          female: "easy-going beach-day visitor in an ankle-length flowy white-and-pastel-floral cotton maxi dress with three-quarter sleeves and a high modest neckline, a wide-brim natural straw sun hat, and a pair of simple rubber flip-flop beach slippers — modest, fully covered, ankle-length skirt, no swimwear, no exposed shoulders or midriff" },

    15: { bg: "Cola Beach_DSC9401.jpg",
          setting: "secluded Goan cove at Cola Beach with shallow turquoise water lapping over weathered black-and-rust coastal rocks, a small strip of golden sand and a lush forested hillside rising behind",
          male:   "easy-going beach-day visitor in a soft sky-blue linen full-sleeve shirt with the sleeves loosely rolled up, fully buttoned, light sand-coloured cotton beach trousers, and a pair of simple rubber flip-flop beach slippers — modest, fully clothed, no shorts and no swimwear",
          female: "easy-going beach-day visitor in an ankle-length flowy mint-green cotton maxi dress with three-quarter sleeves and a high modest neckline, a light sheer cotton scarf draped over the shoulders, and a pair of simple rubber flip-flop beach slippers — modest, fully covered, ankle-length skirt, no swimwear, no exposed shoulders or midriff" },

    16: { bg: "Dr. Salim Ali Bird Sanctuary_DSC8234.jpg",
          setting: "peaceful mangrove forest and tidal creek at the Dr. Salim Ali Bird Sanctuary on Chorão Island, Goa, with arching mangrove branches, a leafy green canopy and still water reflecting the trees",
          male:   "modern Goan-day birdwatcher in a clean light-olive long-sleeve cotton shirt with a chest pocket, comfortable beige cotton trousers, lightweight canvas walking shoes and a pair of binoculars hanging around the neck — neat, modest, fully clothed smart-casual",
          female: "modern Goan-day birdwatcher in a clean ivory long-sleeve cotton shirt with a chest pocket, comfortable beige cotton trousers, lightweight canvas walking shoes and a pair of binoculars hanging around the neck — neat, modest, fully clothed smart-casual" },

    17: { bg: "Gulmarg landscapes .jpg",
          setting: "historic wooden Maharani St. Mary's Church set in a sunlit Gulmarg alpine meadow in Kashmir, with daisies and a tall conifer beside it",
          male:   "very well-dressed gentleman in a tailored charcoal-grey three-piece wool suit, a crisp white shirt, a deep-burgundy silk tie, a neatly folded white pocket square and polished black oxford shoes — formal, refined and fully covered",
          female: "very well-dressed lady in an elegant tea-length midi dress in deep emerald with three-quarter sleeves and a modest high neckline, layered with a fitted camel wool overcoat, simple pearl earrings and refined low-heeled shoes — formal, graceful and fully covered" },

    19: { bg: "Gulmarg landscapes 3.jpg",
          setting: "open Gulmarg alpine pasture carpeted with white daisies under a clear blue sky, with a single tree on the horizon, Kashmir",
          male:   "very well-dressed gentleman in a smart light-grey wool suit, a soft pastel-blue shirt, a navy silk tie and polished oxford shoes — formal, refined and fully covered",
          female: "very well-dressed lady in an elegant pastel-blue midi dress with three-quarter sleeves and a modest high neckline, layered with a tailored ivory overcoat, simple pearl earrings and refined low-heeled shoes — formal, graceful and fully covered" },
};

function buildPrompt(preset, gender) {
    const outfit = gender === "female" ? preset.female : preset.male;
    return `ABSOLUTE RULE — symbols of marital status. do NOT add any of the following to the person in the output UNLESS that exact symbol is clearly, visibly present on the person in the first reference photo:
  • sindoor (red or orange vermilion powder in the hair parting)
  • mangalsutra (black-bead and gold marriage necklace)
  • kumkum at the parting or forehead
  • bridal makeup, heavy nath / nose ring, or any other suhaag / saubhagya symbol
if the reference photo does not show these, the output must not show them — regardless of what the outfit description below suggests, regardless of the cultural setting, and regardless of what is "traditional" for the era or region. inventing these on a person who does not wear them (a child, an unmarried woman, a person of any age or background who simply does not use them) is a critical failure that causes religious and cultural offence. when in doubt, OMIT.

face-preservation rule: the face in the first reference photo must be preserved exactly in the output. same eyes, same nose, same mouth, same jawline, same skin tone, same age, same expression — every facial detail must be identical to the reference. do not beautify, smooth, slim, stylise, de-age, lighten or reshape the face in any way. if the face does not match the reference exactly, the image is wrong.

age-appropriateness rule: study the apparent age in the reference photo and adapt the outfit accordingly. if the reference shows a child, young girl or teenager, keep the attire age-appropriate — simpler, lighter jewellery; no nath / nose ring; no heavy bridal ornaments; no adult makeup; absolutely no sindoor, mangalsutra or kumkum. treat the outfit description below as a stylistic direction, not a literal checklist — drop any element that is not appropriate for the person's apparent age. a small plain decorative bindi is acceptable only if the person clearly appears to be an adult woman; otherwise omit it.

now create an image of this person standing in this ${preset.setting}, dressed like a ${outfit}. please adjust the lights and shadows so the person blends naturally into the scene. the image should look super realistic and natural.`;
}

async function fetchBackgroundAsDataParts(req, filename) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const url = `${protocol}://${host}/assets/backgrounds/${encodeURI(filename)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch background (${r.status}): ${url}`);
    const mime = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return { mimeType: mime, data: buf.toString("base64") };
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        await runMulter(req, res);

        const { presetId, gender } = req.body;

        const fileByField = {};
        for (const f of req.files || []) fileByField[f.fieldname] = f;
        const userImage = fileByField["userImage"];

        if (!userImage) return res.status(400).json({ error: "User image is required" });
        if (!presetId)  return res.status(400).json({ error: "presetId is required" });
        if (gender !== "male" && gender !== "female") {
            return res.status(400).json({ error: "gender must be 'male' or 'female'" });
        }

        const preset = PRESETS[Number(presetId)];
        if (!preset) return res.status(400).json({ error: "Unknown presetId" });

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return res.json({
                success: true,
                generatedImage: userImage.buffer.toString("base64"),
                mimeType: userImage.mimetype,
                note: "Set GEMINI_API_KEY in Vercel env to enable generation.",
            });
        }

        const prompt = buildPrompt(preset, gender);
        console.log("Prompt:", prompt);

        const backgroundPart = await fetchBackgroundAsDataParts(req, preset.bg);

        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: [
                { inlineData: { mimeType: userImage.mimetype || "image/jpeg", data: userImage.buffer.toString("base64") } },
                { inlineData: backgroundPart },
                { text: prompt },
            ],
            config: {
                responseModalities: ["Image"],
                imageConfig: {
                    aspectRatio: "3:4",
                    imageSize: "2K",
                },
            },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData);
        if (!imagePart) {
            const textPart = parts.find(p => p.text);
            throw new Error(`No image in response. ${textPart?.text || ""}`.trim());
        }

        return res.json({
            success: true,
            generatedImage: imagePart.inlineData.data,
            mimeType: imagePart.inlineData.mimeType || "image/jpeg",
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
