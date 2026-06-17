// Admin MIS endpoint — top-level usage numbers + per-generation events.
// GET /api/stats                     — all-time summary from the cached
//                                       usage counters (fast path, no events)
// GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
//                                    — date-filtered: aggregates from the
//                                       generations log and returns the
//                                       individual events for the range
//
// All paths require x-admin-password.
//
// Response:
//   { success: true,
//     total: <count for the active range>,
//     backgrounds: [ { filename, count, lastUsedAt }, ... sorted by count desc ],
//     events: [ { id, createdAt, backgroundFilename, gender }, ... ]   // empty for the no-filter path
//     filter: { from, to }                                              // echoed back, may be null
//   }

const crypto = require("crypto");
const { getDb } = require("../lib/firebase");

const MAX_EVENTS = 1000;       // safety cap for very wide ranges

function safeEqual(a, b) {
    const A = Buffer.from(String(a || ""));
    const B = Buffer.from(String(b || ""));
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

// Parse a YYYY-MM-DD (or full ISO) string into a JS Date or null.
// "from" defaults to start-of-day; "to" defaults to end-of-day so the
// admin can think in whole calendar days.
function parseDate(s, endOfDay) {
    if (!s) return null;
    const str = String(s);
    let d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        d = new Date(str + (endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"));
    } else {
        d = new Date(str);
    }
    return isNaN(d.getTime()) ? null : d;
}

async function allTimeSummary(db) {
    const snap = await db.collection("usage").get();
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
    return { total, backgrounds, events: [] };
}

async function rangeSummary(db, fromDate, toDate) {
    let q = db.collection("generations").orderBy("createdAt", "desc");
    if (fromDate) q = q.where("createdAt", ">=", fromDate);
    if (toDate)   q = q.where("createdAt", "<=", toDate);
    q = q.limit(MAX_EVENTS);
    const snap = await q.get();

    const byFilename = new Map();
    const events = snap.docs.map((d) => {
        const x = d.data();
        const filename = x.backgroundFilename || "(unknown)";
        const createdAt = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toISOString() : null;
        const cur = byFilename.get(filename) || { filename, count: 0, lastUsedAt: null };
        cur.count += 1;
        if (createdAt && (!cur.lastUsedAt || createdAt > cur.lastUsedAt)) cur.lastUsedAt = createdAt;
        byFilename.set(filename, cur);
        return {
            id: d.id,
            createdAt,
            backgroundFilename: filename,
            gender: x.gender || null,
        };
    });

    const backgrounds = [...byFilename.values()].sort((a, b) => b.count - a.count);
    return { total: events.length, backgrounds, events, truncated: events.length === MAX_EVENTS };
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
        const db = getDb();
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const fromRaw = url.searchParams.get("from");
        const toRaw   = url.searchParams.get("to");
        const fromDate = parseDate(fromRaw, false);
        const toDate   = parseDate(toRaw,   true);

        let data;
        if (fromDate || toDate) {
            data = await rangeSummary(db, fromDate, toDate);
        } else {
            data = await allTimeSummary(db);
        }

        return res.json({
            success: true,
            ...data,
            filter: { from: fromRaw || null, to: toRaw || null },
        });
    } catch (err) {
        console.error("[stats]", err);
        return res.status(500).json({ error: "Internal error", details: err.message });
    }
};
