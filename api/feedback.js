// Feedback endpoint
// POST /api/feedback   — save a feedback submission (anonymous, anyone can call)
// GET  /api/feedback   — list all feedback for the admin (requires x-admin-password)
//
// Storage: Firestore collection "feedback" in the Firebase project whose
// service-account JSON is in FIREBASE_SERVICE_ACCOUNT env var.
//
// Required env vars (set in Vercel → Project Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT — entire service account JSON (one line)
//   ADMIN_PASSWORD           — password the admin types on /admin.html

const admin = require("firebase-admin");
const crypto = require("crypto");

// Cache the initialised Firebase app across serverless invocations on the
// same warm container so we don't reinitialise on every request.
function getDb() {
  if (admin.apps.length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
    let creds;
    try {
      creds = JSON.parse(raw);
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON: " + e.message);
    }
    admin.initializeApp({ credential: admin.credential.cert(creds) });
  }
  return admin.firestore();
}

// Timing-safe string compare so we don't leak the admin password byte-by-byte.
function safeEqual(a, b) {
  const A = Buffer.from(String(a || ""));
  const B = Buffer.from(String(b || ""));
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
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

function clampRating(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const rating1 = clampRating(body.rating1);
      const rating2 = clampRating(body.rating2);
      if (rating1 == null || rating2 == null) {
        return res.status(400).json({ error: "rating1 and rating2 must be integers 1-5" });
      }
      const doc = {
        rating1,                                                    // "Did you like the image?"
        rating2,                                                    // "Would you share it on social media?"
        presetName:         String(body.presetName || "").slice(0, 120) || null,
        backgroundFilename: String(body.backgroundFilename || "").slice(0, 160) || null,
        gender:             body.gender === "male" || body.gender === "female" ? body.gender : null,
        anonId:             String(body.anonId || "").slice(0, 64) || null,
        userAgent:          String(req.headers["user-agent"] || "").slice(0, 240),
        createdAt:          admin.firestore.FieldValue.serverTimestamp(),
      };
      const db = getDb();
      const ref = await db.collection("feedback").add(doc);
      return res.json({ success: true, id: ref.id });
    }

    if (req.method === "GET") {
      const adminPass = process.env.ADMIN_PASSWORD;
      if (!adminPass) return res.status(500).json({ error: "ADMIN_PASSWORD not configured" });
      const supplied = req.headers["x-admin-password"];
      if (!safeEqual(supplied, adminPass)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const db = getDb();
      const snap = await db.collection("feedback").orderBy("createdAt", "desc").limit(500).get();
      const items = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          rating1: x.rating1,
          rating2: x.rating2,
          presetName: x.presetName,
          backgroundFilename: x.backgroundFilename || null,
          gender: x.gender,
          anonId: x.anonId,
          userAgent: x.userAgent,
          createdAt: x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toISOString() : null,
        };
      });
      return res.json({ success: true, count: items.length, items });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[feedback]", err);
    return res.status(500).json({ error: "Internal error", details: err.message });
  }
};
