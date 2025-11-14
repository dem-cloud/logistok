import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

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
    // 256-bit περίπου (2x UUID) — αρκετό entropy
    return `${randomUUID()}${randomUUID()}`;
}

export function hashRefreshToken(token) {
    return bcrypt.hashSync(token, 12);
}

export function verifyRefreshToken(rawToken, hashedToken) {
    return bcrypt.compareSync(rawToken, hashedToken);
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