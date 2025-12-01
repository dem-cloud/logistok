import jwt from "jsonwebtoken";
import crypto from "crypto";

export function generateAccessToken(userId) {
    return jwt.sign(
        { sub: userId },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "15m" } // short-lived token
    );
}

export function verifyAccessToken(token) {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
}

export function generateRefreshToken() {
    // 512 bits of randomness
    return crypto.randomBytes(64).toString("hex");
}

export function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

// cookie options για refresh
const refreshCookieOpts = {
    // domain: '.logistok.gr',
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // sameSite: "strict",      // ή 'lax' αν χρειάζεσαι cross-site redirects
    // path: "/api/auth/refresh",   // μειώνει επιφάνεια επίθεσης
};

export function setRefreshCookie(res, token, maxAgeDays) {
    res.cookie("refresh_token", token, { ...refreshCookieOpts, maxAge: maxAgeDays * 24 * 60 * 60 * 1000 });
}

export function clearRefreshCookie(res) {
    res.clearCookie("refresh_token", refreshCookieOpts);
}