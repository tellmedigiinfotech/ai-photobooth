const OpenAI = require("openai");
const { toFile } = require("openai");
const { admin, getDb } = require("../lib/firebase");
const {
    PRESETS, GROUP_MAX, readJsonBody, parseDataUrl, fetchBackgroundBuffer,
    describeGroup, detectSceneFaces, buildGroupPrompt,
} = require("./generate.js");
const Replicate = require("replicate");
const swapCore = require("../lib/faceswap-core.js");

// ═══════════════════════════════════════════════════════════════════
//  EXPERIMENTAL — Group photo. ONE photo of 2–GROUP_MAX people →
//  a costumed group scene at a heritage site, with EACH person's real
//  face swapped back onto their generated body (per-person accuracy).
//
//  Pipeline:
//   1. describeGroup()  — vision census: per-person gender+face+box, L-R.
//   2. buildGroupPrompt + gpt-image-2 images.edit([groupPhoto, bg]).
//   3. detectSceneFaces() on the generated scene (ignores carvings), L-R.
//   4. Count gate: regenerate once if the scene's face count ≠ N.
//   5. Per-person swap loop: crop real face i (from the group photo) →
//      swap onto cropped generated face i → composite back. Cropping to a
//      real person is what keeps InsightFace off the monument's carved
//      figures. Correspondence is by construction (same L-R index).
//   6. ONE CodeFormer pass over the whole composite.
//
//  Everything after generation is best-effort: if a swap/detect/restore
//  step fails, we degrade to the dressed scene rather than erroring.
// ═══════════════════════════════════════════════════════════════════

// Clamp so a padded crop never bleeds into a neighbour (midpoint between
// adjacent face centres becomes the hard horizontal limit).
function neighbourClamp(list, i) {
    const cx = (list[i].centerX ?? ((list[i].boundingBox.x + list[i].boundingBox.width / 2)));
    const prev = i > 0 ? (list[i - 1].centerX ?? 0) : null;
    const next = i < list.length - 1 ? (list[i + 1].centerX ?? 1) : null;
    return {
        xMin: prev != null ? (prev + cx) / 2 : 0,
        xMax: next != null ? (cx + next) / 2 : 1,
    };
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const body = await readJsonBody(req);
        const { presetId } = body;
        const groupImage = parseDataUrl(body.groupImage);

        if (!groupImage) return res.status(400).json({ error: "groupImage is required" });
        if (!presetId)   return res.status(400).json({ error: "presetId is required" });

        const preset = PRESETS[Number(presetId)];
        if (!preset) return res.status(400).json({ error: "Unknown presetId" });
        // Group presets are mixed-gender: gender-scoped presets (e.g. Kheoni,
        // male-only) aren't offered to groups on the client, but guard anyway.
        if (preset.genders) return res.status(400).json({ error: "This destination isn't available for group photos." });

        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            return res.json({
                success: true,
                generatedImage: groupImage.buffer.toString("base64"),
                mimeType: groupImage.mimeType,
                note: "Set OPENAI_API_KEY in Vercel env to enable group generation.",
            });
        }
        const openai = new OpenAI({ apiKey: openaiKey });

        // ── 1. Census ────────────────────────────────────────────────
        let census;
        try {
            census = await describeGroup(openai, groupImage);
        } catch (e) {
            console.error("describeGroup failed:", e.message);
            return res.status(502).json({ error: "Couldn't read the faces in that photo — please retake.", code: "CENSUS_FAILED" });
        }
        const { people, detectedFaceCount, truncated } = census;
        console.log(`Group census: ${people.length} kept, detected ${detectedFaceCount}`);

        if (people.length === 0)          return res.status(400).json({ error: "No faces detected — please retake the group photo.", code: "NO_FACES" });
        if (people.length < 2)            return res.status(400).json({ error: "A group photo needs at least 2 people.", code: "TOO_FEW" });
        if (truncated || detectedFaceCount > GROUP_MAX)
            return res.status(400).json({ error: `Group photos support up to ${GROUP_MAX} people — please retake with ${GROUP_MAX} or fewer.`, code: "TOO_MANY" });

        const N = people.length;
        const prompt = buildGroupPrompt(preset, people);

        // ── 2. Generate the costumed scene ──────────────────────────
        const background = await fetchBackgroundBuffer(req, preset.bg);
        const groupFile = await toFile(groupImage.buffer, "group.jpg", { type: groupImage.mimeType || "image/jpeg" });
        const bgFile    = await toFile(background.buffer, preset.bg,   { type: background.mimeType || "image/jpeg" });

        async function generateScene() {
            const result = await openai.images.edit({
                model: "gpt-image-2",
                image: [groupFile, bgFile],   // [structure+likeness, location+light]
                prompt,
                size: "1024x1536",
                quality: "high",              // more people ⇒ smaller faces ⇒ need detail for the swap
                output_format: "jpeg",
                output_compression: 90,
            });
            const b64 = result?.data?.[0]?.b64_json;
            if (!b64) throw new Error("GPT Image 2 returned no image data");
            return Buffer.from(b64, "base64");
        }

        let sceneBuf = await generateScene();

        // ── 3. Detect scene faces (ignoring carvings), left-to-right ─
        // NOTE: we deliberately do NOT regenerate on a count mismatch. A second
        // gpt-image-2 "high" pass would risk the 300s function budget (gen +
        // swaps + CodeFormer already ~230s). On mismatch we degrade gracefully:
        // swap the min(N, detected) faces in left-to-right order + a note.
        let genFaces = [];
        try {
            const det = await detectSceneFaces(openai, { buffer: sceneBuf, mimeType: "image/jpeg" });
            genFaces = det.faces;
            if (genFaces.length !== N) {
                console.warn(`Scene has ${genFaces.length} faces, expected ${N} — best-effort left-to-right swap.`);
            }
        } catch (e) {
            console.warn("Scene face detection failed — returning dressed scene without swap:", e.message);
        }

        // ── 5. Per-person swap loop (best-effort) ───────────────────
        const token = process.env.REPLICATE_API_TOKEN;
        const swappableCount = Math.min(N, genFaces.length);
        let swapped = 0;
        let note = null;

        if (token && swappableCount > 0) {
            const replicate = new Replicate({ auth: token });
            const { width: srcW, height: srcH } = await swapCore.imageSize(groupImage.buffer);
            const { width: genW, height: genH } = await swapCore.imageSize(sceneBuf);

            for (let i = 0; i < swappableCount; i++) {
                try {
                    // real source face i (from the group photo)
                    const sClamp = neighbourClamp(people, i);
                    const srcBox = swapCore.resolveBox(people[i].boundingBox, srcW, srcH, { padFrac: 0.5, ...sClamp });
                    const srcCrop = await swapCore.cropRegion(groupImage.buffer, srcBox);

                    // generated face i (same L-R index)
                    const gClamp = neighbourClamp(genFaces, i);
                    const genBox = swapCore.resolveBox(genFaces[i].boundingBox, genW, genH, { padFrac: 0.4, ...gClamp });
                    const genCrop = await swapCore.cropRegion(sceneBuf, genBox);

                    const swapUrl = await swapCore.swapFace(
                        replicate,
                        swapCore.bufferToDataUrl(srcCrop),
                        swapCore.bufferToDataUrl(genCrop),
                    );
                    const { buf: swappedCrop } = await swapCore.downloadAsBuffer(swapUrl);
                    sceneBuf = await swapCore.compositeRegion(sceneBuf, swappedCrop, genBox);
                    swapped++;
                } catch (e) {
                    console.warn(`Swap for person ${i} failed (keeping generated face):`, e.message);
                }
            }

            // ── 6. ONE CodeFormer pass over the whole composite ─────
            if (swapped > 0) {
                try {
                    const restoredUrl = await swapCore.restoreFaces(replicate, swapCore.bufferToDataUrl(sceneBuf));
                    if (restoredUrl) {
                        const { buf } = await swapCore.downloadAsBuffer(restoredUrl);
                        sceneBuf = buf;
                    }
                } catch (e) {
                    console.warn("CodeFormer restore failed (using un-restored composite):", e.message);
                }
            }
        }

        if (swappableCount < N) {
            note = "Some faces couldn't be matched — showing the best result. For sharper faces, retake with everyone facing the camera.";
        } else if (token && swapped < N) {
            note = "A face or two couldn't be locked in — retake with everyone facing the camera for the sharpest result.";
        } else if (!token) {
            note = "REPLICATE_API_TOKEN not set — faces are AI-approximations, not swapped.";
        }

        // Best-effort usage log (mirror api/generate.js).
        try {
            const db = getDb();
            await Promise.all([
                db.collection("usage").doc(preset.bg).set({
                    filename: preset.bg,
                    count: admin.firestore.FieldValue.increment(1),
                    lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true }),
                db.collection("generations").add({
                    backgroundFilename: preset.bg,
                    presetId: Number(presetId),
                    gender: "group",
                    groupSize: N,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                }),
            ]);
        } catch (counterErr) {
            console.warn("Usage counter / generation log failed:", counterErr.message);
        }

        return res.json({
            success: true,
            generatedImage: sceneBuf.toString("base64"),
            mimeType: "image/jpeg",
            groupSize: N,
            facesSwapped: swapped,
            ...(note ? { note } : {}),
        });
    } catch (error) {
        console.error("❌ Group generation error:", error.message);
        return res.status(500).json({ error: "Failed to generate group image", details: error.message });
    }
};

// Same raw-body handling as the other endpoints (we drain + JSON.parse).
module.exports.config = { api: { bodyParser: false } };
