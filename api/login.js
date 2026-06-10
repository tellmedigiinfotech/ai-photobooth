// POST /api/login
//   Body: { password: "<the site password>" }
//   On success: sets the site_auth cookie (90 days) and returns { success: true }.
//   On failure: 401.
//
// Cookie value is a deterministic sha256(SITE_PASSWORD + "ai-photobooth-v1"),
// which middleware.js recomputes on every request to validate. Rotating
// SITE_PASSWORD therefore invalidates every existing cookie automatically.

const crypto = require("crypto");

const COOKIE_NAME = "site_auth";
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;          // 90 days

function safeEqual(a, b) {
    const A = Buffer.from(String(a || ""));
    const B = Buffer.from(String(b || ""));
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
}

function expectedToken(password) {
    return crypto
        .createHash("sha256")
        .update(password + "ai-photobooth-v1")
        .digest("hex");
}

async function readJsonBody(req) {
    if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return JSON.parse(req.body);
    if (Buffer.isBuffer(req.body)) {
        const s = req.body.toString("utf8");
        return s ? JSON.parse(s) : {};
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const sitePassword = process.env.SITE_PASSWORD;
    if (!sitePassword) {
        return res.status(500).json({ error: "SITE_PASSWORD env var is not configured" });
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    if (!safeEqual(body.password, sitePassword)) {
        // Small fixed delay so brute-force attempts are dampened a bit.
        await new Promise((r) => setTimeout(r, 300));
        return res.status(401).json({ error: "Wrong password" });
    }

    const token = expectedToken(sitePassword);
    const cookie = [
        `${COOKIE_NAME}=${token}`,
        `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
    ].join("; ");
    res.setHeader("Set-Cookie", cookie);
    return res.json({ success: true });
};
