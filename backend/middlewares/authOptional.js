const { verifyAccessToken } = require('../helpers/tokens.js');

function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const payload = verifyAccessToken(token);

        // Το sub στο JWT είναι το user_id
        const userId = payload.sub;

        req.user = { id: userId };

        return next();

    } catch (err) {
        req.user = null;
        return next();
    }
}

module.exports = { checkAuth }