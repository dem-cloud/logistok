// authMiddleware.js
const jwt = require('jsonwebtoken');
const supabase = require('../supabaseConfig');

async function authenticateToken(req, res, next) {
    const token = req.cookies["accessToken"]
    
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const { user_id } = decoded;

        // Check if the session exists
        const { data: sessions, error: sessionsError } = await supabase
            .from("subscription_sessions")
            .select("*")
            .eq("user_id", user_id);

        if (sessionsError) {
            console.error('Error selecting session:', sessionsError);
            return res.status(500).json({ success: false, message: 'Error selecting session' });
        }

        if (sessions.length === 0) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        req.user = decoded;
        next();

    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
}

module.exports = authenticateToken;