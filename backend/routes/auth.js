require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit');
const supabase = require('../supabaseConfig');
const { generateRefreshToken, hashRefreshToken, setRefreshCookie, generateAccessToken, verifyAccessToken, verifyRefreshToken, clearRefreshCookie } = require('../helpers/tokens.js');


// ## Rate Limiting (ανά IP) -> Προστατεύει τον server από spam & network floods από DoS / Botnets
// ## Brute-force ανά Fingerprint -> Προστατεύει τον λογαριασμό από token/password guessing από Account takeover

const loginRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 5, // max 5 attempts
    message: { error: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

const refreshRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 10, // max 10 αιτήματα / λεπτό ανά IP
    message: { error: "Too many refresh attempts. Please wait." },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post("/login", loginRateLimiter, async (req, res) => {
    const { email, password, fingerprint } = req.body;

    const user = await db.query(
        `SELECT id, password_hash FROM users WHERE email = $1`,
        [email]
    ).then(r => r.rows[0]);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    
    // create session + refresh cookie
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    // Έλεγχος υπάρχοντος session
    const existingSession = await db.query(`
        SELECT id, refresh_token_hash
        FROM user_sessions
        WHERE user_id = $1 AND fingerprint = $2 AND revoked = FALSE
        ORDER BY created_at DESC
        LIMIT 1
    `, [user.id, fingerprint]).then(r => r.rows[0]);

    if (existingSession) {
        await db.query(`
            UPDATE user_sessions
            SET refresh_token_hash = $1,
                expires_at = now() + interval '${process.env.REFRESH_TOKEN_LIFETIME_DAYS} days',
                updated_at = now()
            WHERE id = $2
        `, [refreshTokenHash, existingSession.id]);

    } else {
        await db.query(`
            INSERT INTO user_sessions (user_id, refresh_token_hash, fingerprint, expires_at)
            VALUES ($1, $2, $3, now() + interval '${process.env.REFRESH_TOKEN_LIFETIME_DAYS} days')
        `, [user.id, refreshTokenHash, fingerprint]);
    }

    setRefreshCookie(res, refreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));
    return res.json({
        access_token: generateAccessToken(user.id)
    });
});

// --- REFRESH (ROTATION) ---
router.post("/refresh", refreshRateLimiter, async (req, res) => {

    // -- Anti-CSRF: έλεγξε Origin/Referer (προαιρετικό αλλά συνισταται)
    const allowedOrigins = [
        "https://logistok.com",
        "https://logistok.gr",
        "https://app.logistok.com",
        "https://app.logistok.gr",
        "http://localhost:5173",
        "http://localhost:3000"
    ];

    const origin = req.headers.origin || "";

    if (!origin || !allowedOrigins.includes(origin)) {
        return res.status(403).json({ error: "Invalid origin" });
    }
    // --

    const refreshToken = req.cookies.refresh_token;
    const { fingerprint } = req.body || {};

    if ( !refreshToken || !fingerprint ) return res.status(401).json({ error: "Missing token or fingerprint" });

    const session = await db.query(`
        SELECT id, user_id, refresh_token_hash, revoked, expires_at
        FROM user_sessions
        WHERE fingerprint = $1
        ORDER BY created_at DESC
        LIMIT 1
    `, [fingerprint]).then(r => r.rows[0]);

    if (!session) return res.status(401).json({ error: "Session not found" });

    if (session.revoked || new Date(session.expires_at) < new Date())
        return res.status(401).json({ error: "Session expired. Please login." });

    const match = verifyRefreshToken(refreshToken, session.refresh_token_hash);
    if (!match) {
        // πιθανή κλοπή token → revoke όλα τα sessions
        await db.query(`UPDATE user_sessions SET revoked = TRUE WHERE user_id = $1`, [session.user_id]);
        clearRefreshCookie(res);
        return res.status(401).json({ error: "Token compromised, forced logout" });
    }

    // ROTATION
    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);

    await db.query(`
        UPDATE user_sessions
        SET refresh_token_hash = $1,
            expires_at = now() + interval '${process.env.REFRESH_TOKEN_LIFETIME_DAYS} days',
            updated_at = now()
        WHERE id = $2
    `, [newHash, session.id]);

    setRefreshCookie(res, newRefreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));
    return res.json({
        access_token: generateAccessToken(session.user_id)
    });
});

// --- LOGOUT current device ---
router.post("/logout", async (req, res) => {
    const refreshToken = req.cookies.refresh_token;
    const { fingerprint } = req.body || {};
    if (refreshToken && fingerprint) {
        const session = await db.query(`
            SELECT id, refresh_token_hash FROM user_sessions WHERE fingerprint=$1 ORDER BY created_at DESC LIMIT 1
            `, [fingerprint]).then(r => r.rows[0]);
        if (session && verifyRefreshHash(refreshToken, session.refresh_token_hash)) {
            await db.query(`UPDATE user_sessions SET revoked=TRUE WHERE id=$1`, [session.id]);
        }
    }
    clearRefreshCookie(res);
    return res.json({ success: true });
});

// --- LOGOUT all devices ---
router.post("/logout-all", async (req, res) => {
    const userId = req.body.user_id; // ή από auth middleware
    await db.query(`UPDATE user_sessions SET revoked = TRUE WHERE user_id = $1`, [userId]);
    clearRefreshCookie(res);
    return res.json({ success: true });
});

// --- Middleware for protected routes (με Access JWT στο Authorization header) ---
function requireAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });
    try {
        const payload = verifyAccessToken(token);
        req.user = { id: payload.sub };
        next();
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}