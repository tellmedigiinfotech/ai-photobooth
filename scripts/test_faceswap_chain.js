// Verifies the two-stage identity finisher in api/faceswap.js against the
// live Replicate API: inswapper face swap → CodeFormer face restore.
// Usage: node scripts/test_faceswap_chain.js
const fs = require("fs");
const path = require("path");
const Replicate = require("replicate");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const SWAP_MODEL = "cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762c71ed111";
const RESTORE_MODEL = "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2";

function fileToDataUrl(p) {
    return `data:image/jpeg;base64,${fs.readFileSync(p).toString("base64")}`;
}

async function normaliseOutputToUrl(output) {
    const first = Array.isArray(output) ? output[0] : output;
    if (!first) return null;
    if (typeof first === "string") return first;
    if (typeof first.url === "function") {
        const u = first.url();
        return typeof u === "string" ? u : u?.toString?.();
    }
    return null;
}

(async () => {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const samples = path.join(__dirname, "samples");
    const face = path.join(samples, "sample-5-male-raw.jpg");
    const scene = path.join(samples, "sample-3-male-raw.jpg");

    console.time("swap");
    const swapOut = await replicate.run(SWAP_MODEL, {
        input: { swap_image: fileToDataUrl(face), input_image: fileToDataUrl(scene) },
    });
    console.timeEnd("swap");
    const swapUrl = await normaliseOutputToUrl(swapOut);
    if (!swapUrl) throw new Error("swap returned no output");
    console.log("swap url:", swapUrl);

    console.time("restore");
    const restoreOut = await replicate.run(RESTORE_MODEL, {
        input: {
            image: swapUrl,
            codeformer_fidelity: 0.7,
            face_upsample: true,
            background_enhance: false,
            upscale: 1,
        },
    });
    console.timeEnd("restore");
    const restoredUrl = await normaliseOutputToUrl(restoreOut);
    if (!restoredUrl) throw new Error("restore returned no output");
    console.log("restore url:", restoredUrl);

    const buf = Buffer.from(await (await fetch(restoredUrl)).arrayBuffer());
    const out = "/tmp/faceswap_chain_test.png";
    fs.writeFileSync(out, buf);
    console.log(`✅ chain OK — final image ${buf.length} bytes → ${out}`);
})().catch(err => { console.error("❌", err.message); process.exit(1); });
