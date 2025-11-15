const { verifyAccessToken } = require('../helpers/tokens.js');

// --- Middleware for protected routes (με Access JWT στο Authorization header) ---
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Δεν έγινε πιστοποίηση.",
            code: "NO_ACCESS_TOKEN"
        });
    }

    try {
        const payload = verifyAccessToken(token);

        // Το sub στο JWT είναι το user_id
        req.user = { id: payload.sub };

        // UPDATE last_activity_at

        return next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Η συνεδρία έληξε. Συνδεθείτε ξανά.",
            code: "ACCESS_TOKEN_EXPIRED_OR_INVALID"
        });
    }
}

module.exports = requireAuth;