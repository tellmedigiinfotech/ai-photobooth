// Shared Firebase Admin initialisation used by every server endpoint that
// touches Firestore. The service-account JSON is read from the
// FIREBASE_SERVICE_ACCOUNT env var (set in Vercel project settings).
//
// The initialised app is cached so warm serverless invocations reuse the
// same SDK instance instead of re-initialising on every request.

const admin = require("firebase-admin");

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

module.exports = { admin, getDb };
