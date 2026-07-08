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
//   3,4,6 Orchha palace/gate +   → Bundela Rajput, Mughal-era 16th-17th c
//         Betwa chhatris (6)
//   9     Krishnapura Chhatris   → Holkar-Maratha, Indore, 19th c
//   10-11 Indore Rajwada         → Holkar royal seat, built 1747
//   7     Sanchi Stupa           → Mauryan Buddhist monument, modern-day traveller
//   8     Mandu Jahaz Mahal      → Malwa Sultanate palace, modern-day traveller
//   12-13 Kheoni Sanctuary       → modern wildlife park (male-only on client)
//   14    Bandhavgarh Shesh Shaiya → forest jungle, modern-day outdoor traveller
const PRESETS = {
    1:  { bg: "jagdambi-temple-kandariya-mahadev-temple.jpg",
          setting: "the Kandariya Mahadev temple, the tallest and most ornate of the Chandela sandstone shrines at Khajuraho, its soaring shikhara clustered with a rising surge of miniature spires above bands of honey-gold carving, built around 1025-1050 CE as the dynasty's grandest Shaiva monument",
          male:   "a man in a finely woven Chanderi silk-cotton kurta in warm sandstone-ivory shot with fine gold zari buttis, layered under a short structured Bundelkhand bandhgala jacket embroidered with lotus-scroll and foliate temple motifs in antique-gold thread, worn with a slim churidar and a zari-border angavastra stole draped over one shoulder, finished with a single carved-gold brooch and a plain kada, his own neatly groomed hair; a refined modern heritage traveller, fully clothed, never royal-ceremonial",
          female: "a woman in a pre-draped Chanderi silk saree in warm sandstone-ivory and antique-gold, its fine closely woven zari pallu drawn fully across the torso and pinned at the shoulder so the midriff stays covered, over a high-necked full-sleeve blouse embroidered with lotus and foliate temple-scroll motifs, a slender beaten-gold kamarbandh at the waist, layered graduated bead-and-gold haaras, broad carved bajubandh armlets, bell-shaped jhumkas, a small plain decorative bindi and jasmine tucked into a softly waved braid; elegant contemporary heritage-couture, never bridal, fully covered" },

    2:  { bg: "lakshmana-temple-img-9753-hdr.jpg",
          setting: "the Lakshmana temple, a finely preserved 10th-century Chandela shrine to Vishnu at Khajuraho, raised on a high sculpted plinth ringed by friezes of processions, musicians and surasundaris and guarded by four intact corner sub-shrines, its warm sandstone completed around 954 CE",
          male:   "a man in a cream Chanderi silk angarkha-style kurta with a subtle woven check and delicate zari edging, worn over slim churidar with a muted-gold Maheshwari-border angavastra folded across one shoulder, layered under a short heritage waistcoat quilted with Khajuraho scrollwork and beaded borders in old-gold, finished with a simple carved pendant on a cord, a plain kada and his own hair kept natural; a fashion-forward heritage traveller, fully clothed",
          female: "a woman in a softly pre-draped Maheshwari silk saree in blush and dusty-rose with a reversible zari border, the pallu drawn fully across and pinned to cover the torso and midriff, over a modest boat-neck three-quarter-sleeve blouse embroidered with vine and lotus temple motifs in muted gold, a delicate linked-gold girdle at the waist, layered bead chokers and a long haara, spiral bajubandh armlets, small jhumkas, a tiny decorative bindi and fresh mogra strung into a half-braid; artistic contemporary heritage-couture, not bridal, fully covered" },

    3:  { bg: "jahangir-mahal-6-copy.jpg",
          setting: "the arched, jharokha-lined inner courtyard of the early-17th-century Jahangir Mahal at Orchha, a Bundela-Rajput palace raised by Bir Singh Deo in a Mughal-influenced idiom, ringed by domed chhatris, ornate stone brackets and pierced-stone jali screens above the Betwa",
          male:   "a man in a Bundela Rajput-Mughal nobleman's full-length ivory muslin jama, its fitted bodice tied at the left underarm and flaring into a gathered skirt, sprigged with fine gold zari and edged in kinkhab brocade, worn over slim churidar; a saffron-and-emerald embroidered patka knotted at the waist beneath a jewelled kundan kamarband; a neatly wound Bundela safa turban set with a gem-studded sarpech and short kalgi plume; a kundan-and-pearl necklace and gold bazuband armlets; fully clothed",
          female: "a woman in a Bundela Rajput court ghagra-choli: a floor-length deep-red silk ghagra dense with gold zari and gota borders, a snug embroidered choli, and a fine ivory odhni edged in broad gold kinari drawn over the head and across the shoulders and midriff; a decorative rakhdi forehead ornament, layered kundan-and-pearl necklaces with an aad choker, gold bajuband armlets, stacked lac-and-gold bangles, and pearl jhumka earrings; hair in a long braid wound with pearls and jasmine; fully covered" },

    4:  { bg: "jahangir-gate-orchha.jpg",
          setting: "the towering Jahangir Gate (Jahangiri Darwaza) at Orchha, the monumental early-17th-century Bundela-Mughal entrance to Bir Singh Deo's palace, its high arch flanked by domed corner turrets, tiered chhatris and accents of Persian-blue tilework",
          male:   "a man in a Bundela court noble's saffron kinkhab-brocade jama patterned in gold thread, the bodice fastened at the side and the skirt flaring over churidar; a moss-green patka with zari-worked ends knotted at the waist under a gem-set kamarband; a richly wound Bundela safa turban crowned by a kundan sarpech and heron aigrette; a fine muslin sash draped across one shoulder, a kundan-and-emerald necklace, pearl strands, gold bhujband armlets, and jewelled rings; fully clothed",
          female: "a woman in a Bundela court lady's maroon-and-antique-gold ensemble: a full pleated ghagra heavy with zari and gota borders, a bodice-hugging brocade choli, and a heavily bordered odhni drawn over the head and wrapped across the shoulders and waist; a decorative rakhdi and matha-patti forehead ornament, layered gold-and-kundan necklaces with a timaniyan choker, gold bajuband, glass-and-gold bangles to the elbow, and pearl jhumkas; hair in a low pearl-wound bun finished with a gajra; fully covered" },

    6:  { bg: "chattei-river-view-7.jpg",
          setting: "the row of Bundela royal chhatris at Orchha's Kanchana Ghat, tall spired cenotaphs of the ruling dynasty built between the 16th and 18th centuries, their shikhara-like towers mirrored in the calm Betwa River under a soft dawn sky",
          male:   "a man in a Bundela Rajput-Mughal courtly jama of soft cream figured silk, the side-tied bodice flaring over churidar and edged in slim gold zari, a deep-blue embroidered patka knotted under a kundan kamarband; a finely wrapped Bundela safa with a modest gem sarpech; a bordered pashmina dushala shawl draped over one shoulder; a kundan-and-pearl necklace and gold bazuband armlets; fully clothed",
          female: "a woman in a Bundela court lady's ensemble: a full teal-and-gold zari-bordered ghagra, a fitted embroidered choli, and a fine gold-bordered odhni drawn over the head and wrapped across the shoulders and midriff, with a light shawl added over it; a decorative rakhdi forehead ornament, layered kundan-and-pearl necklaces with a choker, gold bajuband, gold-and-lac bangles, and pearl jhumkas; hair in a pearl-threaded braid; fully covered" },

    9:  { bg: "krishnabai-holkar-chhatri.jpg",
          setting: "the pillared interior of the Krishnapura Chhatris at Chhatri Bagh in Indore — mid-19th-century Holkar royal cenotaphs on the banks of the Khan river, where rows of intricately carved sandstone columns rise into cusped Maratha arches beneath tiered, spired domes",
          male:   "a man in the refined durbar dress of a Holkar-Maratha sardar in the Ahilyabai-Holkar court tradition: a crisp cream fine-cotton dhoti tied in the kachha style with a woven zari border, a long ivory kurta beneath a fitted brocade bandi waistcoat, a gold-and-silk kamarband sash at the waist and a zari-bordered shela draped across one shoulder; his head crowned by a snugly wrapped deep-saffron Puneri pheta set with a small jewelled shirpech, and restrained ornament — a pearl kanthi, a gold chandra-haar, bajuband armlets, an angathi ring and gold ear-studs; fully clothed and dignified",
          female: "a woman in the court dress of a Holkar-Maratha noblewoman in the Ahilyabai-Holkar tradition: a nine-yard Maheshwari silk nauvari saree in peacock-teal draped in the kashta style, its handwoven gold zari border and reversible pallu drawn across the torso and over one shoulder, worn over a full-sleeved brocade choli; her ornament decorative — a gold thushi choker, a pearl-and-gold putali-mohanmala necklace, vati and bugadi ear ornaments, gold patlya and tode bangles, a bajuband armlet and a small decorative bindi — her centre-parted hair coiled into a low ambada bun wound with mogra; fully covered" },

    10: { bg: "rajwada-indore.jpg",
          setting: "the towering seven-storey facade of the Rajwada, the 18th-century Holkar Maratha palace in Indore, its stone lower storeys and timber-framed upper floors layered with arched wooden windows, projecting balconies and a grand gateway rising above the old town",
          male:   "a man in refined Holkar-Maratha durbar attire: a cream fine-cotton-and-silk angarkha with an asymmetric tie-fastened chest panel and a slim woven-gold border, worn over white churidar, a Maheshwari silk shela with a delicate zari end draped across one shoulder, a snugly wound Maratha pheta of jewel-toned silk pinned with a small pearl-and-gold turban ornament, a single strand of pearls at the throat, a pearl bhikbali in one ear, and gold buttons; fully clothed and dignified",
          female: "a woman in refined Ahilyabai-era Holkar attire: a handwoven Maheshwari silk nauvari saree draped kashta-style in a deep jewel tone, its fine reversible zari border and striped five-band pallu drawn across the chest and pinned at one shoulder over a full-sleeved fitted blouse, adorned with a restrained pearl-and-gold chinchpeti choker and a longer pearl haar, slim gold vaki armlets, flat gold patlya bangles, small pearl-drop ear studs, centre-parted hair gathered into a low ambada bun wound with a jasmine gajra, and a small plain decorative bindi; fully covered and graceful" },

    11: { bg: "rajwada-15.jpg",
          setting: "the inner courtyard of the Holkar Rajwada in Indore, ringed by carved wooden colonnades, jharokha balconies and lime-plastered walls in the restrained 18th-century Maheshwari-Maratha style, opening toward a fountain garden at the rear",
          male:   "a man in restrained Holkar courtly dress: a crisp fine white silk dhoti and cream kurta beneath a fitted buttoned bandi jacket of pale Maheshwari brocade, a fine zari-edged uparne folded over one shoulder, a snugly tied Maratha pheta in a soft jewel tone with a modest pearl turban pin, a short pearl kanthi at the throat, a pearl bhikbali earring, and a plain gold ring; courtly, understated and fully clothed",
          female: "a woman in graceful Holkar-Maheshwari attire: a handwoven Maheshwari silk saree in a soft jewel tone with its characteristic narrow gold border and striped pallu, draped in neat round pleats over a full-sleeved blouse with the pallu drawn across the chest and shoulder, wearing a delicate pearl-and-gold thushi bead choker, slender gold vaki armlets, plain gold bangles, small pearl-drop earrings, a fine gold waist chain, and centre-parted hair in a low ambada bun dressed with a gajra and a small plain decorative bindi; modest and fully covered" },

    12: { bg: "kheoni-wildlife-sanctuary.jpg",
          setting: "a dense dry-deciduous forest of teak, tendu and bamboo on the Malwa plateau within Kheoni Wildlife Sanctuary, with sun-dappled leaf litter, tall straight trunks and cool green shade receding into the distance",
          male:   "a man in a well-worn olive-green cotton field shirt with the sleeves rolled to the forearm and buttoned bellows chest pockets, a lightweight khaki multi-pocket utility vest, sturdy beige ripstop cargo trousers with a woven canvas belt, a wide-brim canvas bush hat with a chin cord, a tan leather field-satchel slung across the chest, a pair of binoculars on a worn leather strap and a plain vintage wristwatch — a grounded, practical naturalist look, fully clothed",
          female: "a woman in a khaki cotton field shirt buttoned to the collar with the sleeves rolled up and buttoned chest pockets, a lightweight olive multi-pocket utility vest, sturdy beige ripstop cargo trousers with a woven canvas belt, a wide-brim canvas bush hat with a chin cord, a tan leather field-satchel across the chest, a pair of binoculars on a leather strap and a plain vintage wristwatch — a practical, unglamorous naturalist look, fully clothed" },

    13: { bg: "kheoni-wildlife-sanctuary-1.jpg",
          setting: "a quiet forest trail winding through teak, tendu and clumping bamboo in Kheoni Wildlife Sanctuary, with filtered light falling across a leaf-strewn path and dense central-Indian woodland closing in on either side",
          male:   "a man in a sand-beige cotton field shirt with the sleeves rolled up and buttoned chest pockets, a faded patterned cotton neckerchief knotted at the throat, khaki ripstop cargo trousers with a canvas belt, a wide-brim canvas bush hat, a tan leather satchel slung across the chest, a compact field camera on a fabric neck strap and a pair of binoculars on a leather strap — a grounded, practical trail-naturalist look, fully clothed",
          female: "a woman in a sand-beige cotton field shirt with rolled sleeves and buttoned chest pockets, a light olive lightweight utility vest, khaki ripstop cargo trousers with a canvas belt, a wide-brim canvas bush hat, a tan leather satchel across the chest, a compact field camera on a fabric neck strap and a pair of binoculars on a leather strap — a practical, unglamorous trail-naturalist look, fully clothed" },

    // 7  Sanchi Stupa — Mauryan Buddhist monument (~3rd c BCE). Contemporary
    //    smart-casual traveller in linen echoing the torana palette.
    7:  { bg: "sanchi-stupa.jpg",
          setting: "the UNESCO-listed Great Stupa at Sanchi in Madhya Pradesh — a 3rd-century-BCE Mauryan Buddhist monument of brick-cored sandstone, its great hemispherical dome (anda) crowned by a railed harmika and tiered stone parasol, encircled by a carved stone railing (vedika) and processional path, and pierced by four richly relief-carved sandstone torana gateways added under the Satavahanas around the 1st century BCE",
          male:   "a man in a crisp ecru linen-blend shirt worn open at the collar over a fine ochre cotton tee, sleeves rolled to the forearm, with tailored stone-grey chinos, a woven tan leather belt and clean minimalist off-white sneakers, a slim canvas-and-leather day satchel over one shoulder, matte tortoiseshell sunglasses tucked at the collar and a plain leather-strap watch, his own neatly groomed hair; a relaxed, put-together modern-day traveller at a Buddhist heritage site, fully clothed, never bare-chested or in period costume",
          female: "a woman in a breezy full-length ecru linen shirt-dress with a narrow madder-red and indigo woven trim echoing Sanchi's torana palette, buttoned modestly and belted with a slim tan waist tie, three-quarter sleeves, worn with comfortable tan flat sandals, a compact rattan-and-leather crossbody bag, delicate disc ear-studs and a fine gold pendant, oversized sunglasses pushed into softly waved shoulder-length hair; a chic, understated modern-day traveller at a sacred Buddhist site, modest and fully covered, never traditional or bridal" },

    // 8  Mandu Jahaz Mahal — Malwa Sultanate palace (15th c). Contemporary
    //    monsoon traveller in the site's teal/rust palette.
    8:  { bg: "jahaz-mahal-mandu.jpg",
          setting: "the Jahaz Mahal (Ship Palace) at Mandu, a long, narrow two-storeyed red-sandstone pleasure-palace raised by Sultan Ghiyas-ud-din Khalji of the Malwa Sultanate on a slim strip of land between the Munj Talao and Kapur Talao lakes, so that it seems to float like an anchored ship; its arcaded facade, open terraces, overhanging balconies and blue-tiled domed chhatris rise beneath a soft, cloud-heavy monsoon sky",
          male:   "a man in a lightweight monsoon-teal cotton overshirt worn open over a clean white crew tee, sleeves rolled, with slim tapered rust-brown chinos, a woven leather belt and water-ready tan leather sneakers, a packable olive rain-shell knotted at the waist, a compact canvas crossbody bag, matte sunglasses at the collar and a simple steel-strap watch, neatly groomed hair; a polished modern-day traveller exploring Mandu's monsoon palaces, fully clothed",
          female: "a woman in a flowing monsoon-teal midi shirt-dress in soft cotton with a slim rust-red and antique-gold woven border, three-quarter sleeves and a tie waist, worn with comfortable tan leather sandals, a light packable trench folded over one arm, a compact leather crossbody bag, small gold hoop earrings and oversized sunglasses pushed into softly waved hair; an elegant contemporary modern-day traveller at a Malwa lake palace, modest and fully covered, not traditional" },

    // 14 Bandhavgarh Shesh Shaiya — jungle heritage site. Contemporary
    //    outdoor-casual traveller, never safari-costume or military.
    14: { bg: "shesh-shaiya-bandhavgarh.jpg",
          setting: "beside the moss-covered Shesh Shaiya reclining-Vishnu rock sculpture, a roughly 10th-century Kalachuri-era carving resting by a still forest pool below the Bandhavgarh hill fort, deep in the leafy jungle of Bandhavgarh National Park amid ferns, vines and soft filtered canopy light",
          male:   "a man in a breathable sage-green half-zip travel shirt with the sleeves rolled to the forearm, a lightweight quilted gilet in muted olive, slim stretch hiking trousers in warm khaki with a woven belt and low brown trail sneakers, a compact crossbody sling, sport sunglasses at the collar, a modern outdoor wristwatch and a light packable cap; a grounded, put-together modern-day traveller on a jungle heritage visit, no weapons, fully clothed",
          female: "a woman in a breathable sage-green half-zip travel shirt with rolled sleeves, a lightweight quilted gilet in muted olive, slim stretch hiking trousers in warm khaki with a woven belt and low brown trail sneakers, a compact crossbody sling, a small travel camera on a fabric neck strap, sport sunglasses pushed into a low ponytail and a light forest-green bandana at the neck; a natural, polished modern-day traveller on a jungle heritage visit, no weapons, fully clothed" },
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
        ? `IMAGE 1 = a reference of the person's FACE — study their facial features from it, but IGNORE its lighting, colour, white balance, background, camera and pose. It was shot at a kiosk with a bright on-camera RING LIGHT, so its face is lit flat, even and head-on with a brightened forehead/cheeks and round ring-shaped catchlights in the eyes — DISCARD that ring-light look entirely; do not reproduce the flat frontal glare or the circular catchlights. It is a likeness reference, NOT pixels to copy.
IMAGE 2 = a full-body photo of the SAME person — use this ONLY to read their body type, build and proportions (height, weight, frame). Ignore the clothing, pose and background in Image 2.
IMAGE 3 = the LOCATION (a real heritage site) — use this as the background and as the single source of scene lighting.`
        : `IMAGE 1 = a reference of the person's FACE — study their facial features from it, but IGNORE its lighting, colour, white balance, background, camera and pose. It was shot at a kiosk with a bright on-camera RING LIGHT, so its face is lit flat, even and head-on with a brightened forehead/cheeks and round ring-shaped catchlights in the eyes — DISCARD that ring-light look entirely; do not reproduce the flat frontal glare or the circular catchlights. It is a likeness reference, NOT pixels to copy.
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

FACE — LOOK AT THE CAMERA, BUT NATURALLY (NOT A FLAT, PASTED-ON CUT-OUT). The person looks at the camera with both eyes meeting the lens in a warm, relaxed, engaged gaze — not looking away to the side, down, or over a shoulder. But do NOT force a rigid, flat, dead-symmetrical head-on stare: turn the head naturally toward the camera at a relaxed near-frontal or gentle three-quarter angle with a slight, easy tilt, sitting believably on the neck and shoulders (chin, jaw, neck and shoulder line connecting anatomically, no front-face-on-a-turned-body mismatch) — like a real person posing for a travel photo, never a stiff mugshot. Render the face as a true THREE-DIMENSIONAL part of this head and skull, in the SAME camera perspective and foreshortening as the neck, shoulders and body: the brow, nose, cheeks and jaw have real volume and catch the scene's light, and the far side of the face recedes in perspective. It must NOT look like a flat 2D photo of a face laid on top of the head. The face reference (Image 1) supplies the BONE STRUCTURE AND FEATURES ONLY — completely discard its flat frontal framing, its even shadowless brightness and its round ring-light catchlights; take nothing from it but the identity. The features stay exactly as described, but their orientation, perspective, lighting and shading all come from THIS scene in ${locImage}.${bodyRule}

WARDROBE & FULL COVERAGE — CRITICAL. Dress the person in the complete period outfit described above, fitted naturally to their body and pose, with rich, tasteful, historically-grounded detail: real fabric weave, embroidery, zari, drape and folds, and era-appropriate ornament — make it striking and characterful, never plain or generic. The person must be FULLY CLOTHED and modest at all times: the chest, torso, shoulders and midriff are covered by the garment — never bare-chested, topless, nude, semi-undressed or in underclothes. Some of these heritage sites carry carved figures in sensual or revealing poses; that is NOT a styling cue — ignore it entirely. If any described element would leave the torso exposed, add a covering upper garment (kurta, angavastram, choli, shawl, jacket) so the person is decently dressed. The wardrobe must never alter the face or the body build.

HEADWEAR & HAIR — FIT IT CORRECTLY, NEVER ERASE THE HAIR. If the outfit specifies a turban (safa, pheta, pagri, ushnisha) or a hat, it must sit naturally ON TOP of the head: correctly sized and shaped to THIS person's head, tilted to match the head's angle and pose, wrapped snugly and evenly with believable cloth folds and depth, resting at a realistic height on the forehead — never floating above the head, hovering, half-transparent, lopsided, oversized, or clipping into the forehead, ears, eyebrows or face. People wear a turban OVER their hair, so tuck the hair neatly beneath it while KEEPING the person's own natural hair visible where it really shows — at the temples and sideburns, in front of and around the ears, and at the nape and back of the head — and keep the natural hairline that frames the face. Do NOT shave, delete, thin, bald or erase the person's hair, sideburns, eyebrows or facial hair to make room for the headwear, and do NOT invent a receding, raised or shifted hairline or a smooth bare scalp. If the outfit instead drapes a dupatta or odhni over the head, let it rest softly over the hair without flattening or removing it. If the outfit specifies NO headwear, give the person their OWN natural hair from the reference, neatly styled in an era-appropriate way — never bald, never a wig, never changed in length, colour or texture.

LOCATION — REPRODUCE IT FAITHFULLY; DO NOT CROP, REPLACE OR REINVENT IT. The heritage photo (${locImage}) is a REAL, specific place and it matters just as much as the person — visitors come to see themselves standing at THIS exact spot. Reproduce the location faithfully and in full: the same architecture, monument, spires, arches, pillars, river, ghats, steps, landscape, materials, colours and overall composition as the reference — recognisably the same place. Do NOT crop it away, cut it off, zoom past it, swap it out, redesign, modernise or stylise it, and do NOT invent a different backdrop or reduce it to a plain blurred wash behind the person. Keep the identifying landmarks of the site clearly present in the frame. You may extend or lightly reframe the scene only as much as needed to fit the person into it naturally — never at the cost of losing or altering the real landmark.

FRAMING & POSE — SHOW THE PERSON *AND* THE PLACE, EQUALLY. Frame this as a travel photograph where the person and the location share the frame with roughly EQUAL importance: a three-quarter-length or full standing shot of the person standing in the location, placed a little off-centre / naturally within the scene so a generous, clearly-recognisable expanse of the real site — its architecture, monument, river or landscape — stays visible around and behind them and is NOT blocked by the person. Do NOT crop in to a tight head-and-shoulders or waist-up portrait that fills the frame with the person and buries the setting. The person stands naturally at the site with a calm, genuine expression or a soft natural smile and weight relaxed, looking at the camera. It must feel like a real photo someone actually posed for at that place, not a studio cut-out.

ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol to anyone, under any circumstances: no sindoor / vermilion (red or orange powder, streak or dot) in the hair parting, no kumkum dot implying marriage, no mangalsutra (black-bead-and-gold marriage necklace), no bridal makeup, no heavy nath / nose ring, no other suhaag or saubhagya marriage marker. The hair parting stays clean with no colour; the neck carries no marriage necklace. This holds regardless of the era, region, tradition, the outfit description, or the person's apparent age or gender — and even if a reference image appears to show one, do not reproduce it. Use ONLY decorative, non-marital jewellery; when in doubt, omit it. Adding these symbols causes serious cultural and religious offence and is a critical failure.

AGE-APPROPRIATE. Match the person's apparent age. If they appear to be a child or teenager, keep the styling simple and light — no nose ring, no heavy ornaments, no adult makeup, no bindi — and drop any wardrobe element that is not suitable for their age. A small plain decorative bindi is acceptable only for an adult woman; otherwise omit it.

BLENDING & SCENE LIGHTING — CRITICAL (THIS is what fixes the "patched-on / pasted" face). The single biggest cause of a pasted look is keeping the flat, even, shadowless frontal light of the kiosk selfie — DO NOT reproduce it. Read the main light in ${locImage} — its direction, height, hardness and colour temperature (warm low sunlight, bright open daylight, soft overcast, cool shade, etc.) — and light the face with that SAME light: the side of the face toward the light is brighter, the far side falls into soft natural shadow, with matching contrast, warmth or coolness, and gentle contact shadows under the brow, nose, lips, chin and jaw. Repaint every pixel of the face as part of this ONE exposure — identical white balance, exposure, contrast, lens focus, depth of field, film grain and colour grade to the body, neck and background. Match the skin tone, shading and highlights of the face to the neck, ears and hands so it is unmistakably the same skin under the same light. There must be NO seam, edge, outline, halo, blur line, or brightness / sharpness / tone jump anywhere around the face, hairline, jaw or neck. If the face looks flatter, brighter, sharper, cleaner, more front-lit or a different colour temperature than the body and its surroundings, it is WRONG and will read as pasted — relight and re-render it until it dissolves into the photograph as one seamless shot.

PHOTOREALISM — CRITICAL. The result MUST look like a genuine photograph taken on a professional full-frame camera with a 35–50mm lens (an environmental-portrait focal length that keeps the whole scene sharp) — NOT a digital illustration, NOT a 3D render, NOT a glossy "AI-generated" image. Render true-to-life skin with natural texture: visible pores, fine lines, slight natural blemishes and asymmetry, realistic subsurface tone variation and a natural matte sheen — never airbrushed, plastic, waxy, smoothed or doll-like. Real catchlights in the eyes, individual hair strands with a few natural flyaways, fabric with genuine weave, folds and wrinkles. Use natural, slightly uneven daylight, a DEEP depth of field so BOTH the person and the entire location behind them are in sharp focus — no background blur, no bokeh, no depth-of-field softening of the monument or scenery; the location must be rendered as crisp, detailed and clearly in focus as the person — and photographic colour grading (not over-saturated AI colour). Subtle film grain is welcome. The face especially must read as a real human photographed in the moment, not a rendered or beautified likeness.`;
}

// ─────────────────────────────────────────────────────────────────
//  GROUP MODE (experimental) — one photo of 2–4 people → costumed group
//  scene. describeGroup() does the census (per-person gender + face +
//  box, strict left-to-right); buildGroupPrompt() paints the scene;
//  api/generate-group.js runs the per-person face-swap loop.
// ─────────────────────────────────────────────────────────────────

// How many people the group feature supports. Kept here so the client cap and
// the server guard can't drift. (Accuracy is strong at 2–3, acceptable at 4.)
const GROUP_MAX = 4;

const GROUP_SYSTEM_PROMPT = `You are a forensic facial-analysis assistant for a heritage photo booth. You are given ONE group photograph and must return a strict left-to-right census of the human faces in it, so that a portrait artist can later repaint each person's likeness exactly and a face-swap step can restore each real face into the correct position.

Follow these rules without exception:

1. LEFT-TO-RIGHT MEANS THE VIEWER'S LEFT. Order people by the horizontal position of the CENTRE of each face (the midpoint between the eyes) as it appears in the image, starting from the LEFT edge of the photograph as you look at it. Index 0 is the leftmost face. This is the camera's / viewer's left, NOT the subjects' own left or right. If two faces sit at nearly the same horizontal position (for example one standing behind or above the other), place the higher face (nearer the top of the frame) first.

2. Assign index 0, 1, 2 … strictly in that left-to-right order. The "position" label, the "centerX" value and the "boundingBox" you give each person MUST be consistent with that order: index 0 cannot be labelled "far right", and centerX must increase as the index increases.

3. Count only real, clearly visible human faces that are large enough to describe. IGNORE faces on posters, paintings, statues, temple carvings, reliefs, murals, reflections, phone or camera screens, and heavily blurred or tiny background bystanders.

4. Support at most ${GROUP_MAX} people. If more than ${GROUP_MAX} clear faces are present, select the ${GROUP_MAX} largest, most in-focus, most front-facing faces and describe only those, still ordered left-to-right. Always set detectedFaceCount to the TRUE total number of clear human faces you saw, even if that is greater than ${GROUP_MAX}.

5. Describe ONLY permanent facial characteristics. Never mention clothing, jewellery, makeup, headwear, expression, pose, lighting, camera or background.

6. Judge apparentGender as a best guess and ALWAYS output exactly 'male' or 'female' (never null, never "unknown"); report your certainty in genderConfidence. For young children whose gender is not clearly readable, use genderConfidence 'low', and do NOT infer gender from hair length or from any clothing or accessory — judge only from facial structure.

7. Judge ageBand as 'adult', 'teen', or 'child'. For anyone who is a child or a teenager, describe only their real juvenile features; never attribute adult facial hair, adult makeup or adult ornament to them.

Return your answer ONLY through the provided structured schema.`;

const GROUP_USER_PROMPT = `Analyse this group photo and produce the left-to-right census of everyone in it.

For EACH person, write a "faceDescription" of 2-3 precise, factual, neutral sentences covering: apparent age; skin tone / complexion; face shape; forehead; eyebrows; eye shape, size, spacing and colour; nose shape; lips; cheekbones and jawline; chin; hairline; hair length, style, colour and texture; any facial hair; and any distinctive marks (moles, dimples, scars, freckles). Be specific enough that a portrait artist could pick this exact person out of a crowd. Do NOT mention clothing, jewellery, headwear, makeup, accessories, expression, pose, lighting, camera or background.

For EACH person also give: a "position" label; the normalised horizontal centre of their face ("centerX": 0.0 at the left edge of the image, 1.0 at the right edge — this must increase from the first person to the last); a normalised "boundingBox" around their face (x, y of the top-left corner and width, height, all as fractions of the image); an "apparentGender" best guess with "genderConfidence"; and an "ageBand".

Order the people strictly left-to-right as instructed. Set "detectedFaceCount" to the true number of clear, real human faces you saw.`;

const GROUP_RESPONSE_FORMAT = {
    type: "json_schema",
    json_schema: {
        name: "group_face_census",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            properties: {
                detectedFaceCount: { type: "integer" },
                people: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            index:    { type: "integer" },
                            position: { type: "string", enum: ["far left", "left", "centre-left", "centre", "centre-right", "right", "far right"] },
                            centerX:  { type: "number" },
                            boundingBox: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    x:      { type: "number" },
                                    y:      { type: "number" },
                                    width:  { type: "number" },
                                    height: { type: "number" },
                                },
                                required: ["x", "y", "width", "height"],
                            },
                            apparentGender:   { type: "string", enum: ["male", "female"] },
                            genderConfidence: { type: "string", enum: ["high", "medium", "low"] },
                            ageBand:          { type: "string", enum: ["adult", "teen", "child"] },
                            faceDescription:  { type: "string" },
                        },
                        required: ["index", "position", "centerX", "boundingBox", "apparentGender", "genderConfidence", "ageBand", "faceDescription"],
                    },
                },
            },
            required: ["detectedFaceCount", "people"],
        },
    },
};

// Group vision pass: ONE group photo → ordered (strict left-to-right) census of
// up to GROUP_MAX people, each with gender+confidence, ageBand, a factual face
// description and a normalised face box. gpt-4o (not mini): counting + binding
// attributes to the right person in a crowded frame is beyond mini.
async function describeGroup(openai, image) {
    const dataUrl = `data:${image.mimeType || "image/jpeg"};base64,${image.buffer.toString("base64")}`;
    const c = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1600,
        temperature: 0,
        response_format: GROUP_RESPONSE_FORMAT,
        messages: [
            { role: "system", content: GROUP_SYSTEM_PROMPT },
            { role: "user", content: [
                { type: "text", text: GROUP_USER_PROMPT },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ] },
        ],
    });
    const parsed = JSON.parse(c.choices?.[0]?.message?.content || "{}");
    // Canonicalise: re-sort by centerX (authoritative L-R key), cap, re-index.
    const people = (Array.isArray(parsed.people) ? parsed.people : [])
        .filter(p => p && typeof p.faceDescription === "string" && p.faceDescription.trim() && p.boundingBox)
        .sort((a, b) => (a.centerX ?? 0) - (b.centerX ?? 0))
        .slice(0, GROUP_MAX)
        .map((p, i) => ({ ...p, index: i }));
    const detectedFaceCount = Number(parsed.detectedFaceCount) || people.length;
    return { detectedFaceCount, truncated: detectedFaceCount > people.length, people };
}

const SCENE_FACE_FORMAT = {
    type: "json_schema",
    json_schema: {
        name: "scene_faces",
        strict: true,
        schema: {
            type: "object",
            additionalProperties: false,
            properties: {
                faceCount: { type: "integer" },
                faces: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            centerX: { type: "number" },
                            boundingBox: {
                                type: "object",
                                additionalProperties: false,
                                properties: {
                                    x:      { type: "number" },
                                    y:      { type: "number" },
                                    width:  { type: "number" },
                                    height: { type: "number" },
                                },
                                required: ["x", "y", "width", "height"],
                            },
                        },
                        required: ["centerX", "boundingBox"],
                    },
                },
            },
            required: ["faceCount", "faces"],
        },
    },
};

// Locate the REAL human faces in a GENERATED scene, ordered left-to-right, with
// normalised boxes for cropping. Crucially instructs the model to ignore the
// carved/sculpted/painted figures on the heritage monument — those are exactly
// what a raw face detector would false-positive on at Khajuraho / Sanchi.
async function detectSceneFaces(openai, image) {
    const dataUrl = `data:${image.mimeType || "image/jpeg"};base64,${image.buffer.toString("base64")}`;
    const c = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 900,
        temperature: 0,
        response_format: SCENE_FACE_FORMAT,
        messages: [{
            role: "user",
            content: [
                { type: "text", text: `Find every REAL, living human person's face in this photograph and return a normalised bounding box for each, ordered strictly LEFT-TO-RIGHT by face centre (viewer's left = index 0). "centerX" (0.0 left edge → 1.0 right edge) must increase with each face. IGNORE any face that belongs to a statue, temple carving, relief, sculpture, mural, painting, poster, reflection or screen — count ONLY the real people posing in the photo. boundingBox is {x,y,width,height} as fractions of the image (x,y = top-left of the face box). Set faceCount to the number of real human faces.` },
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
        }],
    });
    const parsed = JSON.parse(c.choices?.[0]?.message?.content || "{}");
    const faces = (Array.isArray(parsed.faces) ? parsed.faces : [])
        .filter(f => f && f.boundingBox)
        .sort((a, b) => (a.centerX ?? 0) - (b.centerX ?? 0));
    return { faceCount: Number(parsed.faceCount) || faces.length, faces };
}

// Group generation prompt. `people` is the left-to-right census from
// describeGroup(). Reuses the single-person prompt's coverage / marital-symbol /
// age / photorealism rules, adds hard GROUP INTEGRITY rules (exact count, no
// mirroring, no reordering/merging) so the downstream L-R swap stays aligned.
function buildGroupPrompt(preset, people) {
    const N = people.length;
    const ORD = ["FIRST (the LEFTMOST person)", "SECOND FROM THE LEFT", "THIRD FROM THE LEFT",
                 "FOURTH FROM THE LEFT", "FIFTH FROM THE LEFT"];
    const personList = people.map((p, i) => {
        const outfit = p.gender === "female" || p.apparentGender === "female" ? preset.female : preset.male;
        const face = p.faceDescription
            ? ` Facial characteristics to reproduce EXACTLY (do not alter): ${p.faceDescription}`
            : "";
        const age = (p.ageBand === "child" || p.ageBand === "teen")
            ? " This person is young — keep their styling simple and age-appropriate: no heavy ornaments, no adult makeup, no nose ring, no bindi."
            : "";
        return `• PERSON ${i + 1} — ${ORD[i]}: ${outfit}.${face}${age}`;
    }).join("\n");

    return `Create ONE photorealistic group photograph by combining the reference images.

IMAGE 1 = a real GROUP PHOTO of EXACTLY ${N} people standing together. This is your STRUCTURAL and LIKENESS reference: it fixes HOW MANY people there are, their LEFT-TO-RIGHT ORDER, each person's RELATIVE HEIGHT, BUILD and SIZE, their POSES, and the SPACING between them. Study each person's facial features from it, but IGNORE its lighting, colour, white balance, background, camera and framing — it was shot at a kiosk with a flat frontal light. It is a layout-and-likeness reference, NOT pixels to copy.
IMAGE 2 = the LOCATION (a real heritage site) — use this as the background and as the single source of scene lighting.

TASK: Re-dress these SAME ${N} people IN PLACE — keeping their number, order, positions, relative sizes and poses from Image 1 — and show them together on location at ${preset.setting}. Change ONLY their clothing (into the period costumes below), the background (to Image 2), and the lighting on them (to match Image 2). The result must look like a single genuine photograph of these same ${N} people taken at that place in one shot.

THE ${N} PEOPLE, IN STRICT LEFT-TO-RIGHT ORDER (person 1 is the leftmost, and so on):
${personList}

GROUP INTEGRITY — CRITICAL. Output EXACTLY ${N} people — no more, no fewer. Do NOT add extra bystanders, a crowd, duplicated/twin figures, or reflections; do NOT remove, hide or merge anyone. Keep every person a separate, clearly-separated individual: do NOT merge two people into one, blend their faces or bodies, or let one person's costume bleed into another. Keep them in the SAME left-to-right order and the SAME positions as Image 1 — do NOT swap, reorder, rearrange or MIRROR/FLIP the group (the leftmost person in Image 1 stays leftmost here). Preserve each person's RELATIVE height, build and size exactly as in Image 1 — if someone is a child, or shorter, taller, larger or smaller, keep it; do NOT equalise their heights or builds. Keep their poses and the natural gaps/overlap between them as in Image 1; a natural staggered arrangement is fine if that is how they stand, but every one of the ${N} people must be FULLY VISIBLE and none may be cropped off at the edges of the frame.

IDENTITY — ACCURATE AND UNCHANGED, PER PERSON. Render each person's face freshly as a natural part of this photograph (not a cut-out, overlay or pasted copy), but keep each individual's likeness EXACTLY as in Image 1 and as described above: the same eye shape/size/spacing, eyebrows, nose, mouth, lips, jawline, face shape, cheekbones, hairline, complexion and apparent age — so each person is recognised at once. Do NOT beautify, slim, smooth, de-age, symmetrise or substitute a different face for anyone, and do NOT make the ${N} people look like siblings or copies of one another — they are distinct individuals.

FACES — EVERYONE LOOKS AT THE CAMERA, NATURALLY (NOT FLAT PASTED-ON CUT-OUTS). Every person looks at the camera with both eyes meeting the lens in a warm, relaxed gaze — nobody looking down, away or over a shoulder — but NOT a row of rigid, flat, dead-on stares: each head is turned naturally toward the camera at a relaxed near-frontal or gentle three-quarter angle with a slight easy tilt, sitting believably on the neck and shoulders (chin, jaw, neck and shoulders connecting anatomically), like a real group posing for a travel photo, never stiff mugshots. Render each face as a true three-dimensional part of that person's head and skull, in the SAME camera perspective and foreshortening as their neck, shoulders and body — real volume in brow, nose, cheeks and jaw — never a flat 2D face laid over the head. Do NOT keep the flat, even, shadowless frontal light of the reference: light every face with the scene's own main light from Image 2 — its direction, hardness and colour temperature — so one side is brighter and the far side falls into soft natural shadow, matching each person's skin tone to the location's light.

WARDROBE & FULL COVERAGE — CRITICAL. Dress EACH person in their complete period outfit listed above, fitted naturally to that person's body and pose, with rich, historically-grounded detail (real fabric weave, embroidery, zari, drape, folds and era-appropriate ornament) — striking and characterful, never plain or generic, and never identical uniforms. EVERY person must be FULLY CLOTHED and modest at all times: chest, torso, shoulders and midriff covered — never bare-chested, topless, nude, semi-undressed or in underclothes. Some of these heritage sites carry carved figures in sensual or revealing poses; that is NOT a styling cue — ignore it. If any element would leave a torso exposed, add a covering upper garment. Wardrobe must never alter anyone's face or body build.

HEADWEAR & HAIR — FIT IT CORRECTLY, NEVER ERASE THE HAIR. Where an outfit specifies a turban (safa, pheta, pagri, ushnisha) or hat, it must sit naturally ON TOP of that person's head: correctly sized to their head, tilted to their pose, wrapped snugly with believable folds, at a realistic height on the forehead — never floating, hovering, half-transparent, lopsided, oversized, or clipping into forehead, ears, eyebrows or face. People wear it OVER their hair: tuck hair beneath it while KEEPING each person's own natural hair visible at temples, sideburns, around the ears and at the nape, and keep the natural hairline. Do NOT shave, thin, bald or erase anyone's hair, sideburns, eyebrows or facial hair, and do NOT invent a receding or shifted hairline. A dupatta/odhni over the head rests softly over the hair without flattening it. Where an outfit specifies NO headwear, give that person their OWN natural hair from Image 1, neatly styled — never bald, never a wig, never changed in length, colour or texture.

LOCATION — REPRODUCE IT FAITHFULLY; DO NOT CROP, REPLACE OR REINVENT IT. Image 2 is a REAL, specific place and it matters as much as the people. Reproduce it faithfully and in full — the same architecture, monument, spires, arches, pillars, river, ghats, steps, landscape, materials, colours and composition — recognisably the same place. Do NOT crop it away, zoom past it, swap it, redesign, modernise or stylise it, and do NOT reduce it to a plain blurred wash. Keep the identifying landmarks clearly present. You may extend or lightly reframe the scene only as much as needed to fit all ${N} people in naturally — never at the cost of losing the landmark or cropping out a person.

FRAMING & POSE — SHOW THE GROUP *AND* THE PLACE, EQUALLY. Frame this as a travel photograph where the ${N} people and the location share the frame with roughly equal importance: a three-quarter-length or full standing shot of the group standing together in the location, placed so a generous, clearly-recognisable expanse of the real site stays visible around and behind them. Do NOT crop into a tight portrait that buries the setting. Everyone stands naturally with calm, genuine expressions or soft natural smiles, looking at the camera. It must feel like a real photo the group actually posed for at that place.

ABSOLUTE PROHIBITION — never add any Hindu marital-status symbol to ANY person, under any circumstances: no sindoor / vermilion in the hair parting, no kumkum dot implying marriage, no mangalsutra, no bridal makeup, no heavy nath / nose ring, no other suhaag/saubhagya marker. Every hair parting stays clean with no colour; no neck carries a marriage necklace. This holds regardless of era, region, tradition, outfit, or anyone's apparent age or gender — and even if Image 1 appears to show one, do not reproduce it. Use ONLY decorative, non-marital jewellery; when in doubt, omit it. Adding these symbols causes serious cultural and religious offence and is a critical failure.

AGE-APPROPRIATE. Match each person's apparent age. For anyone who appears to be a child or teenager, keep styling simple and light — no nose ring, no heavy ornaments, no adult makeup, no bindi — and drop any wardrobe element unsuitable for their age. A small plain decorative bindi is acceptable only for an adult woman; otherwise omit it.

BLENDING & SCENE LIGHTING — CRITICAL (this is what stops faces looking pasted). The biggest cause of a pasted look is keeping the flat, even, shadowless frontal light of the reference — do NOT reproduce it on anyone. Relight EVERY face with the main light of the scene in Image 2 (its direction, height, hardness and colour temperature): the lit side brighter, the far side in soft shadow, with gentle contact shadows under brow, nose, chin and jaw, and matching contrast and warmth. Repaint each face as part of this ONE exposure — identical white balance, exposure, lens focus, depth of field, grain and colour grade to the bodies, necks and background — and match each person's skin tone/shadows/highlights to their own neck, ears and hands. No seam, edge, outline, halo or brightness/sharpness/tone jump around any face, hairline, jaw or neck. Any face that looks flatter, brighter, sharper or more front-lit than its body is WRONG and reads as pasted — re-render it until it dissolves into the photograph.

PHOTOREALISM — CRITICAL. The result MUST look like a genuine photograph taken on a professional full-frame camera with a 35–50mm lens — NOT an illustration, 3D render or glossy "AI" image. True-to-life skin with natural texture (pores, fine lines, slight asymmetry), real catchlights, individual hair strands, fabric with genuine weave and folds. Natural daylight and a DEEP depth of field so ALL ${N} people AND the entire location behind them are in sharp focus — no background blur, no bokeh; the monument must be as crisp as the people. Photographic colour grading, not over-saturated AI colour; subtle film grain welcome. Every face must read as a real human photographed in the moment.`;
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
            size: "1024x1536",      // closest portrait GPT-Image size; brandifyImage()
                                    // then centre-crops to the 5:7 print aspect (client)
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
// Group mode (shared with api/generate-group.js and the offline test harness).
module.exports.GROUP_MAX = GROUP_MAX;
module.exports.describeGroup = describeGroup;
module.exports.detectSceneFaces = detectSceneFaces;
module.exports.buildGroupPrompt = buildGroupPrompt;
module.exports.GROUP_RESPONSE_FORMAT = GROUP_RESPONSE_FORMAT;
module.exports.SCENE_FACE_FORMAT = SCENE_FACE_FORMAT;
module.exports.readJsonBody = readJsonBody;
module.exports.parseDataUrl = parseDataUrl;
module.exports.fetchBackgroundBuffer = fetchBackgroundBuffer;
