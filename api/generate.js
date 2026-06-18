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

// Per-preset data: background filename, a richly described setting, and
// gender-keyed period outfits designed from the ACTUAL history of each site.
// Every outfit is fully covering by design (the global wardrobe rule forbids
// any bare-chested / nude / "clothless" result — important at Khajuraho, whose
// carvings must never be read as a styling cue).
//   1-2   Khajuraho temples     → Chandela dynasty, 950-1050 CE
//   3-4   Orchha Jahangir Mahal  → Bundela Rajput, Mughal-era 17th c
//   6, 9  Maheshwar chhatris     → Holkar-Maratha, Ahilyabai era, 18th c
//   10-11 Indore Rajwada         → Holkar royal seat, built 1747
//   7     Sanchi Stupa           → Mauryan Buddhist monument, 3rd c BCE
//   8     Mandu Jahaz Mahal      → Malwa Sultanate court, 15th c
//   12-13 Kheoni Sanctuary       → modern wildlife park (male-only on client)
//   14    Bandhavgarh Shesh Shaiya → forest jungle, ancient rock sculpture
const PRESETS = {
    1:  { bg: "jagdambi-temple-kandariya-mahadev-temple.jpg",
          setting: "the Kandariya Mahadev, the grandest 11th-century Chandela sandstone temple at Khajuraho, its carved spire rising under bright open daylight",
          male:   "a Chandela-era royal courtier in a finely draped deep-saffron silk dhoti with a woven gold border, a full cream silk angavastram wrapped across the chest and over one shoulder, a broad embroidered patka sash with tassels at the waist, a jewelled gold armlet (bajuband), layered gold-and-bead necklaces, ornate earrings and a richly wound turban with a jewel clasp — fully clothed, chest covered",
          female: "a Chandela-era temple noblewoman in a richly draped ivory-and-gold silk saree worn over a full-coverage embroidered blouse, an ornate jewelled girdle at the waist, elaborate gold temple jewellery (layered necklaces, a broad choker, jhumka earrings, maang-tikka, armlets and stacked bangles) and a small red bindi — fully covered and modest" },

    2:  { bg: "lakshmana-temple-img-9753-hdr.jpg",
          setting: "the intricately carved 10th-century Lakshmana temple at Khajuraho, a Chandela sandstone shrine under clear daylight",
          male:   "a Chandela-era nobleman in a warm cream silk dhoti with a maroon-and-gold border, a draped angavastram covering the chest and one shoulder, a brocade patka at the waist, a gold armlet, a rudraksha-and-gold mala, ornate earrings and a simple jewelled turban — fully clothed, chest covered",
          female: "a Chandela-era noblewoman in a deep teal-and-gold silk saree draped classically over a full embroidered choli, a jewelled waistband, rich gold temple jewellery, jhumkas, a choker, maang-tikka and stacked bangles, and a small red bindi — fully covered and modest" },

    3:  { bg: "jahangir-mahal-6-copy.jpg",
          setting: "the arched courtyard of the early-17th-century Jahangir Mahal at Orchha, a Bundela-Rajput palace built in the Mughal era",
          male:   "a Bundela Rajput prince in a richly brocaded ivory-and-gold angarkha tied across the chest, a churidar pyjama, a jewelled patka sash, a vivid coloured safa turban crowned with a kalgi jewel and a pearl strand, a kundan necklace, gold armlets and a sheathed jewelled dagger tucked at the waist",
          female: "a Bundela Rajput princess in a sumptuous deep-red and gold zari lehenga-choli with a fine net odhni draped over the head, regal kundan-polki jewellery — a borla maang-tikka, layered necklaces, a choker, jhumkas, haath-phool and bangles — fully covered and elegant" },

    4:  { bg: "jahangir-gate-orchha.jpg",
          setting: "the towering Mughal-era Bundela gateway (Jahangir Gate) at Orchha",
          male:   "a Bundela Rajput warrior-noble in a saffron-and-gold brocade angarkha over a churidar, a jewelled kamarband, a richly tied coloured safa turban with a sarpech ornament, a long shawl across one shoulder, a kundan necklace and a sheathed curved talwar at the waist",
          female: "a Bundela Rajput rani in a maroon-and-antique-gold zari lehenga with a heavily bordered odhni draped over the head, ornate Rajput kundan jewellery (rakhdi maang-tikka, layered necklaces, choker, jhumkas and bangles) — fully covered and regal" },

    6:  { bg: "chattei-river-view-7.jpg",
          setting: "an 18th-century Holkar-Maratha riverside chhatri above the Narmada ghats at Maheshwar",
          male:   "an Ahilyabai-era Maratha sardar in a crisp cream dhoti with a fine zari border, a buttoned bandi jacket over a kurta, a richly tied red-and-gold pheta turban with a small kalgi, a woven-border shawl over one shoulder, a pearl kanthi and gold ear-studs",
          female: "an Ahilyabai-era Maharashtrian noblewoman in a rich burgundy-and-gold Maheshwari nauvari (nine-yard) silk saree draped in the kashta style over a full blouse, a thushi choker, a layered pearl necklace, green-and-gold glass bangles, vati earrings, a crescent chandrakor bindi and flowers in a low bun — fully covered and dignified" },

    9:  { bg: "krishnabai-holkar-chhatri.jpg",
          setting: "the 18th-century Holkar royal chhatri of Krishnabai above the Narmada at Maheshwar",
          male:   "a Holkar-era Maratha noble in a cream dhoti-kurta with a zari-bordered shoulder shawl, a deep-red pheta turban with a jewel, gold ear-studs and a pearl kanthi",
          female: "a Holkar-era Maratha queen styled after the court of Ahilyabai Holkar, in a royal peacock-blue Maheshwari nauvari saree with a broad gold border over a full blouse, a thushi, multi-strand pearls, ornate vati earrings, green-and-gold bangles, a chandrakor bindi and flowers in the hair — regal and fully covered" },

    10: { bg: "rajwada-indore.jpg",
          setting: "the seven-storey Rajwada, the 18th-century Holkar palace facade in Indore",
          male:   "a Holkar Maharaja in full durbar dress — an ornate cream-and-gold brocade angarkha over a churidar, a jewelled red pheta turban with a sarpech and pearl strands, a kamarband, a multi-strand pearl-and-emerald necklace, gold armlets and a shoulder shawl",
          female: "a Holkar Maharani in a regal peacock-green Paithani silk saree with a heavy gold zari pallu and border over a full blouse, an ornate thushi and multi-strand pearl-and-emerald necklaces, a maang-tikka, vati earrings and stacked gold bangles — richly bejewelled and fully covered" },

    11: { bg: "rajwada-15.jpg",
          setting: "the inner courtyard of the 18th-century Holkar Rajwada palace in Indore",
          male:   "a Holkar-era Maratha noble in a cream dhoti-kurta with a buttoned bandi jacket, a red pheta turban, a fine zari-bordered shawl and a pearl kanthi",
          female: "a Holkar-era royal lady in a teal-and-gold Paithani silk saree draped over a full blouse, a thushi, a layered pearl necklace, vati earrings, gold bangles and a chandrakor bindi — elegant and fully covered" },

    12: { bg: "kheoni-wildlife-sanctuary.jpg",
          setting: "a central Indian teak and sal forest in the Kheoni Wildlife Sanctuary",
          male:   "a seasoned wildlife naturalist on safari in a well-worn olive-green field shirt with the sleeves rolled up and buttoned chest pockets, a lightweight khaki utility vest, sturdy beige cargo trousers, a wide-brim canvas bush hat, a brown leather field-satchel slung across the chest, a pair of binoculars on a leather strap and a vintage wristwatch",
          female: "a seasoned wildlife naturalist on safari in a khaki field shirt with rolled sleeves and chest pockets, a lightweight olive utility vest, beige cargo trousers, a wide-brim canvas bush hat, a brown leather field-satchel across the chest, binoculars on a strap and a vintage wristwatch" },

    13: { bg: "kheoni-wildlife-sanctuary-1.jpg",
          setting: "a forest trail through teak, sal and bamboo in the Kheoni Wildlife Sanctuary",
          male:   "a wildlife naturalist on a forest trail in a sand-beige field shirt with the sleeves rolled up and chest pockets, a patterned cotton neckerchief, khaki cargo trousers, a wide-brim canvas bush hat, a brown leather satchel across the chest, a compact field camera and a pair of binoculars on a strap",
          female: "a wildlife naturalist on a forest trail in a sand-beige field shirt with rolled sleeves and chest pockets, a light olive vest, khaki cargo trousers, a wide-brim canvas bush hat, a brown leather satchel across the chest, binoculars and a compact field camera" },

    // 7  Sanchi Stupa — Mauryan Buddhist monument (~3rd c BCE). Dressed as a lay
    //    pilgrim / donor in the style of the figures carved on the toranas
    //    themselves — fully clothed, never bare-chested.
    7:  { bg: "sanchi-stupa.jpg",
          setting: "the UNESCO-listed Great Stupa at Sanchi in Madhya Pradesh, a 3rd-century-BCE Mauryan Buddhist monument with its great hemispherical dome and intricately carved sandstone torana gateways, under bright daylight and a dramatic cloud-filled sky",
          male:   "an early-historic Mauryan-era nobleman and lay pilgrim, dressed like the donor figures carved on Sanchi's own gateways: a finely woven ankle-length white antariya (lower wrap), a full cream uttariya upper cloth wrapped across the chest and over one shoulder so the torso is completely covered, a broad embroidered waist sash, heavy beaded-and-gold necklaces, armlets, large decorative earrings and an ornately wound turban (ushnisha) with a jewel — modest and fully clothed, never bare-chested",
          female: "an early-historic Mauryan-era noblewoman and lay pilgrim, in the style of the figures carved on Sanchi's gateways: a richly draped cream-and-gold antariya over a full-coverage fitted bodice, a long uttariya shawl wrapped across the chest and shoulders, an ornate beaded girdle, heavy gold-and-bead necklaces, broad bangles, armlets, large jhumka-style earrings, a beaded headband and a small bindi — modest and fully covered" },

    // 8  Mandu Jahaz Mahal — built under the Malwa Sultanate (15th c). Dressed in
    //    Malwa-Sultanate Indo-Islamic court attire.
    8:  { bg: "jahaz-mahal-mandu.jpg",
          setting: "the Jahaz Mahal (Ship Palace) in the Royal Enclave at Mandu, Madhya Pradesh, a 15th-century Malwa-Sultanate palace, on a soft cloudy monsoon day with overcast diffused light, lush bright-green surroundings and moisture in the air",
          male:   "a Malwa-Sultanate courtier of Mandu in a richly brocaded long jama (Indo-Persian court robe) tied at the side over a churidar, a patterned patka sash, a kamarband, an ornate turban with a jewelled sarpech and a pearl strand, a kundan necklace and soft leather mojari — courtly and fully covered",
          female: "a Malwa-Sultanate court lady of Mandu in an elegant full-length peshwaz gown over a churidar with a fine dupatta draped over the head, delicate kundan-and-pearl jewellery (jhumkas, a maang-tikka, layered necklaces and bangles) and henna-patterned hands — modest, refined and fully covered" },

    14: { bg: "shesh-shaiya-bandhavgarh.jpg",
          setting: "beside the ancient moss-covered Shesh Shaiya reclining-Vishnu rock sculpture by a still forest pool deep in the green jungle of Bandhavgarh National Park, Madhya Pradesh, with a dense leafy canopy, soft filtered forest light, ferns and vines",
          male:   "a wildlife-and-heritage jungle explorer in an olive-green long-sleeve cotton explorer shirt with a chest pocket, a lightweight khaki safari vest, rugged khaki trekking cargo trousers, brown jungle boots, a brown leather explorer satchel slung across the chest, a pair of binoculars around the neck and a light explorer scarf — no weapons",
          female: "a wildlife-and-heritage jungle explorer in a khaki long-sleeve cotton explorer shirt, a lightweight olive safari jacket, comfortable khaki trekking trousers, brown trekking boots, a brown leather crossbody explorer satchel across the chest, a pair of binoculars or a compact camera and a light neutral scarf — natural explorer look, no glamour styling" },
};

// Vision pass: "note the facial characteristics". Turns the face photo into a
// factual written description a generator can paint from — so GPT Image 2 paints
// a fresh, scene-lit face that matches the person instead of pasting the source
// photo (which is what made the face look patched-on).
async function describeFace(openai, image) {
    const dataUrl = `data:${image.mimeType || "image/jpeg"};base64,${image.buffer.toString("base64")}`;
    const c = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 240,
        messages: [{
            role: "user",
            content: [
                { type: "text", text: "Describe ONLY this person's facial characteristics for a portrait painter who must reproduce their likeness exactly. In 3-5 precise, factual sentences cover: apparent age range, gender presentation, skin tone/complexion, face shape, forehead, eyebrows, eye shape/size/colour and spacing, nose shape, lips, cheekbones and jawline, chin, hairline, hair (length/style/colour/texture), any facial hair, and any distinctive marks (moles, dimples, etc.). Be specific and neutral. Do NOT mention lighting, camera, background, clothing, accessories or expression." },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
        }],
    });
    return (c.choices?.[0]?.message?.content || "").trim();
}

function buildPrompt(preset, gender, hasBody, faceDescription) {
    const outfit = gender === "female" ? preset.female : preset.male;
    // Image legend + body-type rule adapt to whether a full-body shot was sent.
    const legend = hasBody
        ? `IMAGE 1 = a reference of the person's FACE — study their facial features from it, but IGNORE its lighting, colour, white balance, background, camera and pose. It is a likeness reference, NOT pixels to copy.
IMAGE 2 = a full-body photo of the SAME person — use this ONLY to read their body type, build and proportions (height, weight, frame). Ignore the clothing, pose and background in Image 2.
IMAGE 3 = the LOCATION (a real heritage site) — use this as the background and as the single source of scene lighting.`
        : `IMAGE 1 = a reference of the person's FACE — study their facial features from it, but IGNORE its lighting, colour, white balance, background, camera and pose. It is a likeness reference, NOT pixels to copy.
IMAGE 2 = the LOCATION (a real heritage site) — use this as the background and as the single source of scene lighting.`;
    const locImage = hasBody ? "Image 3" : "Image 2";
    const faceChars = faceDescription
        ? `\n\nThe person's facial characteristics (reproduce these EXACTLY and do not alter them): ${faceDescription}`
        : "";
    const bodyRule = hasBody
        ? `

BODY TYPE — render the person with the SAME body build and proportions as the full-body person in Image 2: the same overall size and weight (slim, average or heavier), the same shoulder width and frame. Do not slim them down or bulk them up — match Image 2's build honestly.`
        : "";
    return `Create ONE photorealistic photograph by combining the reference images.

${legend}

TASK: Show this exact person on location at ${preset.setting}, dressed as ${outfit}. The result must look like a single genuine photograph of that same individual, taken at that place in one shot.

IDENTITY — ACCURATE AND UNCHANGED. Render the person's face freshly as a natural part of this photograph (not a cut-out, overlay or pasted copy of the reference), but keep their likeness EXACTLY: the same eye shape, size and spacing, the same eyebrows, nose, mouth and lips, jawline, face shape, cheekbones, the natural hairline where it frames the face (it may be partly covered by headwear — that is fine), complexion and apparent age — so anyone who knows them recognises them at once. Do NOT beautify, slim, smooth, sharpen the jaw, enlarge the eyes, de-age, symmetrise or substitute a different face. Their real features are fixed and must not change.${faceChars}

FACE — HEAD DIRECTION MUST FOLLOW THE BODY AND POSE (BUT NEVER THE FEATURES). The head, face and neck belong to the SAME body and must be oriented consistently with it. Decide ONE natural candid pose for the whole person first, then set the head so it sits believably on the shoulders for that pose: if the shoulders and torso are angled into a three-quarter or turned view, the head and face turn the SAME way on a natural neck, with the chin, jaw, neck and shoulder line connecting anatomically — no twist, no mismatch. Do NOT counter-rotate the head to stare flat into the lens, and do NOT leave a front-facing, straight-on face sitting on a turned or angled body. The face reference (Image 1) supplies the FEATURES ONLY — ignore its frontal, head-on orientation entirely; you choose the head direction from the pose and body, not from the reference. Aim the gaze in the same direction the head is facing (a relaxed look toward or just past the lens), never a forced flat symmetrical stare. Light the face from the SAME direction and with the same softness, intensity and colour temperature as the scene, and match its skin tone, warmth, shadows and highlights to the location's light in ${locImage}. Change ONLY the head orientation, gaze direction, lighting and tone of the face — the underlying features themselves stay exactly as described above, accurate and unchanged.${bodyRule}

WARDROBE & FULL COVERAGE — CRITICAL. Dress the person in the complete period outfit described above, fitted naturally to their body and pose, with rich, tasteful, historically-grounded detail: real fabric weave, embroidery, zari, drape and folds, and era-appropriate ornament — make it striking and characterful, never plain or generic. The person must be FULLY CLOTHED and modest at all times: the chest, torso, shoulders and midriff are covered by the garment — never bare-chested, topless, nude, semi-undressed or in underclothes. Some of these heritage sites carry carved figures in sensual or revealing poses; that is NOT a styling cue — ignore it entirely. If any described element would leave the torso exposed, add a covering upper garment (kurta, angavastram, choli, shawl, jacket) so the person is decently dressed. The wardrobe must never alter the face or the body build.

HEADWEAR & HAIR — FIT IT CORRECTLY, NEVER ERASE THE HAIR. If the outfit specifies a turban (safa, pheta, pagri, ushnisha) or a hat, it must sit naturally ON TOP of the head: correctly sized and shaped to THIS person's head, tilted to match the head's angle and pose, wrapped snugly and evenly with believable cloth folds and depth, resting at a realistic height on the forehead — never floating above the head, hovering, half-transparent, lopsided, oversized, or clipping into the forehead, ears, eyebrows or face. People wear a turban OVER their hair, so tuck the hair neatly beneath it while KEEPING the person's own natural hair visible where it really shows — at the temples and sideburns, in front of and around the ears, and at the nape and back of the head — and keep the natural hairline that frames the face. Do NOT shave, delete, thin, bald or erase the person's hair, sideburns, eyebrows or facial hair to make room for the headwear, and do NOT invent a receding, raised or shifted hairline or a smooth bare scalp. If the outfit instead drapes a dupatta or odhni over the head, let it rest softly over the hair without flattening or removing it. If the outfit specifies NO headwear, give the person their OWN natural hair from the reference, neatly styled in an era-appropriate way — never bald, never a wig, never changed in length, colour or texture.

FRAMING & POSE. A natural waist-up or three-quarter portrait with the face clearly visible, sharp and well-lit. Use a RELAXED, candid pose — a natural stance with weight shifted easily, a calm genuine expression or a soft natural smile, perhaps a slight turn of the head or shoulders. Do NOT make it a stiff, rigid, perfectly symmetrical, straight-on "mugshot". It should feel like a real travel photograph someone actually posed for at the site, not a posed studio cut-out.

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

        const openai = new OpenAI({ apiKey: openaiKey });

        // First "note the facial characteristics" — a vision pass turns the face
        // into a written description. GPT Image 2 then PAINTS the face from that
        // description (cinematically lit by the scene) instead of compositing the
        // reference photo's pixels/lighting, which is what caused the "patched-on"
        // look. Best-effort: if it fails we still generate from the image alone.
        let faceDescription = "";
        try {
            faceDescription = await describeFace(openai, userImage);
            console.log("Face description:", faceDescription);
        } catch (descErr) {
            console.warn("Face description failed:", descErr.message);
        }

        const prompt = buildPrompt(preset, gender, !!bodyImage, faceDescription);
        console.log("Prompt:", prompt);

        const background = await fetchBackgroundBuffer(req, preset.bg);

        // GPT Image 2 (images/edits) with up to THREE inputs, in prompt order:
        //   Image 1 = face reference → facial characteristics (NOT pixels to paste)
        //   Image 2 = full-body shot → body type / build (optional)
        //   Image 3 = heritage photo → background + scene lighting
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
