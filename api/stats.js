// Admin MIS endpoint — top-level usage numbers for the admin dashboard.
// GET /api/stats   (requires x-admin-password)
//
// Returns:
//   { success: true,
//     total: <total photos ever generated>,
//     backgrounds: [ { filename, count, lastUsedAt }, ... sorted by count desc ] }

const crypto = require("crypto");
const { getDb } = require("../lib/firebase");

function safeEqual(a, b) {
    const A = Buffer.from(String(a || ""));
    const B = Buffer.from(String(b || ""));
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass) return res.status(500).json({ error: "ADMIN_PASSWORD not configured" });
    if (!safeEqual(req.headers["x-admin-password"], adminPass)) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        const snap = await getDb().collection("usage").get();
        let total = 0;
        const backgrounds = snap.docs.map((d) => {
            const x = d.data();
            const count = Number(x.count) || 0;
            total += count;
            return {
                filename:   d.id,
                count,
                lastUsedAt: x.lastUsedAt && x.lastUsedAt.toDate ? x.lastUsedAt.toDate().toISOString() : null,
            };
        }).sort((a, b) => b.count - a.count);

        return res.json({ success: true, total, backgrounds });
    } catch (err) {
        console.error("[stats]", err);
        return res.status(500).json({ error: "Internal error", details: err.message });
    }
};
