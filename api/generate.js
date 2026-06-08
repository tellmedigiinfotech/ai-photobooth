const { GoogleGenAI } = require("@google/genai");

// The client sends a JSON body: { userImage: <data-URL>, presetId, gender }.
// Vercel's Node runtime parses an application/json body into req.body for us;
// we fall back to draining the raw stream just in case it arrives unparsed.
//
// (We previously accepted multipart/form-data, but Vercel's dev/runtime drains
// the request stream before the handler runs without populating req.body for
// multipart — which surfaced as "Unexpected end of form". JSON is reliable.)
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

// Split a data URL ("data:image/jpeg;base64,XXXX") into mime type + base64.
function parseDataUrl(dataUrl) {
    const m = /^data:([^;,]+)?(?:;base64)?,([\s\S]*)$/.exec(dataUrl || "");
    if (!m || !m[2]) return null;
    return { mimeType: m[1] || "image/jpeg", base64: m[2] };
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
          female: "ahilyabai-era maharashtrian lady in a traditional burgundy nauvari saree (9-yard drape), a gold nath (curved nose ring), thushi (short gold choker), green glass bangles, a pearl necklace and a small red decorative bindi" },

    9:  { bg: "krishnabai-holkar-chhatri.jpg",
          setting: "18th-century Holkar royal chhatri at Maheshwar",
          male:   "holkar-era maratha sardar in a cream cotton dhoti-kurta with a red pheta turban and a shawl draped over one shoulder",
          female: "holkar-era maharashtrian queen in a royal-blue nauvari saree with gold border, a gold nath, thushi, pearl necklace and ornate traditional jewellery, styled after queen ahilyabai holkar" },

    10: { bg: "rajwada-indore.jpg",
          setting: "18th-century seven-storey Holkar palace in Indore",
          male:   "holkar-era maharaja in a cream brocade angarkha, churidar pyjama, a jewelled red pheta turban with a sarpech ornament, a kamarband and a pearl necklace",
          female: "holkar-era maharani in a peacock-green paithani saree with a heavy gold zari border, a large gold nath, ornate thushi, a multi-strand pearl necklace, maang tikka and traditional regal jewellery" },

    11: { bg: "rajwada-15.jpg",
          setting: "inner courtyard of the 18th-century Holkar palace in Indore",
          male:   "holkar-era maratha nobleman in a cream cotton dhoti-kurta with a red pheta turban and a simple shawl",
          female: "holkar-era royal lady in a teal nauvari saree with a gold border, a gold nath, thushi, pearl necklace and traditional maharashtrian jewellery" },

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
    5:  { bg: "bhimbetka-rock-shelter.jpg",
          setting: "ancient Bhimbetka rock shelters in Madhya Pradesh during the prehistoric era around 30,000 BCE, beneath the dramatic overhanging sandstone outcrop, with a warm-toned untouched primeval landscape and no modern structures, paths or visitors anywhere in frame",
          male:   "prehistoric paleolithic cave artist in a short rough animal-hide loincloth in earthy browns with ochre stains low on the hips, a fiber rope belt holding small pigment pouches and twig brushes, a simple bone-bead necklace, a bare torso streaked with red, white and ochre paints mimicking Bhimbetka cave art motifs, wild hair tied back with vine and feathers, paint-splattered hands",
          female: "prehistoric paleolithic gatherer in a fringed grass skirt in earthy beige with leaf patterns ending at mid-calf, a rough bark-cloth shawl draped over one shoulder and tied at the waist with a fiber rope belt set with small shell beads, subtle red ochre body-paint streaks on the arms mimicking Bhimbetka cave art motifs, a simple feather-and-bone necklace, long hair loose with small wildflower accents — modest, fully covered" },

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
    // x-forwarded-* arrive as comma-separated lists when the request passes
    // through multiple proxies (e.g. dev tunnel -> vercel dev). Take the first.
    const first = (v) => String(v || "").split(",")[0].trim();
    const host = first(req.headers["x-forwarded-host"]) || first(req.headers.host);
    const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(host);
    const protocol = first(req.headers["x-forwarded-proto"]) || (isLocal ? "http" : "https");
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
        const body = await readJsonBody(req);
        const { presetId, gender } = body;
        const userImage = parseDataUrl(body.userImage);

        if (!userImage)         return res.status(400).json({ error: "userImage is required" });
        if (!presetId)          return res.status(400).json({ error: "presetId is required" });
        if (gender !== "male" && gender !== "female") {
            return res.status(400).json({ error: "gender must be 'male' or 'female'", received: gender });
        }

        const preset = PRESETS[Number(presetId)];
        if (!preset) return res.status(400).json({ error: "Unknown presetId" });

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return res.json({
                success: true,
                generatedImage: userImage.base64,
                mimeType: userImage.mimeType,
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
                { inlineData: { mimeType: userImage.mimeType, data: userImage.base64 } },
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
