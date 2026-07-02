// Shared face-swap + image-region helpers, used by BOTH the (currently
// unused) single-face api/faceswap.js and the group pipeline in
// api/generate-group.js. Keeping the Replicate model slugs + params in ONE
// place means the single and group paths can never drift apart.
//
// Identity comes from InsightFace inswapper (cdingram/face-swap), which swaps
// ONE face per call. The group pipeline therefore crops each real person out
// (so exactly one face is present), swaps that crop onto the matching cropped
// region of the generated scene, composites it back, and runs CodeFormer once
// over the whole image at the end. Cropping to a real person is what keeps
// InsightFace off the carved temple figures (Khajuraho apsaras, Sanchi
// toranas) that a whole-scene swap would false-detect as faces.
const sharp = require("sharp");

const SWAP_MODEL    = "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111";
const RESTORE_MODEL = "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2";

// Replicate SDK returns URL string | URL[] | FileOutput stream | {url()}.
function normaliseOutputToUrl(output) {
    const first = Array.isArray(output) ? output[0] : output;
    if (!first) return null;
    if (typeof first === "string") return first;
    if (typeof first.url === "function") {
        const u = first.url();
        return typeof u === "string" ? u : u?.toString?.();
    }
    return null;
}

async function downloadAsBuffer(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Download failed: ${r.status}`);
    const mime = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    return { buf, mime };
}

function bufferToDataUrl(buf, mime = "image/jpeg") {
    return `data:${mime};base64,${buf.toString("base64")}`;
}

// One inswapper call: put the face from `swapImage` onto the primary face in
// `inputImage`. Both are data URLs (or http URLs). Returns the output URL.
async function swapFace(replicate, swapImage, inputImage) {
    const out = await replicate.run(SWAP_MODEL, {
        input: { swap_image: swapImage, input_image: inputImage },
    });
    const url = normaliseOutputToUrl(out);
    if (!url) throw new Error("Face swap returned no output");
    return url;
}

// CodeFormer restore pass — sharpens ALL faces in the image at once. Reuses the
// exact params validated in the single-face path. Returns the output URL, or
// null (caller keeps the un-restored image — restore is best-effort).
async function restoreFaces(replicate, image) {
    const out = await replicate.run(RESTORE_MODEL, {
        input: {
            image,
            codeformer_fidelity: 0.9,
            face_upsample:       true,
            background_enhance:  false,
            upscale:             1,
        },
    });
    return normaliseOutputToUrl(out);
}

async function imageSize(buffer) {
    const m = await sharp(buffer).metadata();
    return { width: m.width || 0, height: m.height || 0 };
}

// Turn a normalised face box {x,y,width,height} (0..1) into a padded pixel box,
// clamped to image bounds AND (optionally) to horizontal limits so the crop
// never bleeds into a neighbouring person. padFrac widens the box on each side
// so inswapper gets enough of the face + hair to align well.
function resolveBox(boxNorm, W, H, { padFrac = 0.35, xMin = 0, xMax = 1 } = {}) {
    const bx = boxNorm.x * W, by = boxNorm.y * H;
    const bw = boxNorm.width * W, bh = boxNorm.height * H;
    const padX = bw * padFrac, padY = bh * padFrac;
    const left   = Math.max(Math.round(xMin * W), Math.round(bx - padX));
    const top    = Math.max(0, Math.round(by - padY));
    const right  = Math.min(Math.round(xMax * W), Math.round(bx + bw + padX));
    const bottom = Math.min(H, Math.round(by + bh + padY));
    return {
        left,
        top,
        width:  Math.max(1, right - left),
        height: Math.max(1, bottom - top),
    };
}

async function cropRegion(buffer, box) {
    return sharp(buffer)
        .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
        .jpeg({ quality: 95 })
        .toBuffer();
}

// Paste a (possibly-resized) swapped patch back at `box`. The inswapper returns
// the same framing it was given, so the patch's non-face pixels match the scene
// underneath — the composite is seam-free by construction; we resize defensively
// in case the model changed dimensions.
async function compositeRegion(baseBuffer, patchBuffer, box) {
    const patch = await sharp(patchBuffer)
        .resize(box.width, box.height, { fit: "fill" })
        .toBuffer();
    return sharp(baseBuffer)
        .composite([{ input: patch, left: box.left, top: box.top }])
        .jpeg({ quality: 92 })
        .toBuffer();
}

module.exports = {
    SWAP_MODEL,
    RESTORE_MODEL,
    normaliseOutputToUrl,
    downloadAsBuffer,
    bufferToDataUrl,
    swapFace,
    restoreFaces,
    imageSize,
    resolveBox,
    cropRegion,
    compositeRegion,
};
