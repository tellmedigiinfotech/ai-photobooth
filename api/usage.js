// Public usage endpoint — returns the number of times each heritage
// background has been used to generate an image. Powers the "Used N times"
// badge shown on every destination card on step 2.
//
// Read-only; called by the client on every page load, so no auth.

const { getDb } = require("../lib/firebase");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }
    try {
        const snap = await getDb().collection("usage").get();
        const counts = {};
        snap.docs.forEach((d) => {
            const x = d.data();
            counts[d.id] = Number(x.count) || 0;
        });
        // Cheap edge cache: lets the CDN reuse the response for 30s, so the
        // homepage doesn't hammer Firestore even under heavy traffic.
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
        return res.json({ success: true, counts });
    } catch (err) {
        console.error("[usage]", err);
        return res.status(500).json({ error: "Internal error", details: err.message });
    }
};
