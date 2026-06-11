// Site-wide password gate.
//
// Runs on every request at Vercel's edge. If the visitor has a valid
// site_auth cookie, the request goes through unchanged. Otherwise they're
// redirected to /lock.html where they can enter the password.
//
// The auth cookie value is sha256(SITE_PASSWORD + "ai-photobooth-v1").
// Rotating SITE_PASSWORD invalidates every existing cookie automatically.
//
// Required env var:
//   SITE_PASSWORD — the password every device must enter once.

export const config = {
    // Match every path EXCEPT internal Vercel paths and static-asset extensions
    // that don't need to be gated (favicon, etc).
    matcher: [
        '/((?!_next/|favicon\\.|robots\\.txt|sitemap\\.xml).*)',
    ],
};

const PUBLIC_PATHS = new Set([
    '/lock.html',         // the password-entry page itself
    '/api/login',         // the endpoint that issues the cookie
    '/api/usage',         // public popularity counts (no PII)
]);

// Path prefixes that bypass the gate. /assets/backgrounds/ must be reachable
// without a cookie because /api/generate fetches the background image
// server-to-server (no cookie) and passes it to Gemini — gating it broke
// generation with "Unsupported MIME type: text/html".
const PUBLIC_PREFIXES = [
    '/assets/backgrounds/',
];

export default async function middleware(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Always allow public paths
    if (PUBLIC_PATHS.has(path)) return;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;

    const cookie = request.headers.get('cookie') || '';
    const m = /(?:^|;\s*)site_auth=([^;]+)/.exec(cookie);
    const token = m ? m[1] : null;
    const expected = await expectedToken(process.env.SITE_PASSWORD || '');

    if (token && expected && token === expected) {
        return;                          // valid cookie — let request through
    }
    return Response.redirect(new URL('/lock.html', request.url), 302);
}

async function expectedToken(password) {
    if (!password) return null;
    const data = new TextEncoder().encode(password + 'ai-photobooth-v1');
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
