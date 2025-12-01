const { verifyAccessToken } = require('../helpers/tokens.js');
const supabase = require('../supabaseConfig.js');

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
        const userId = payload.sub;

        req.user = { id: userId };

        // Fire-and-forget (no await)
        supabase
            .from("user_sessions")
            .update({ last_activity_at: new Date() })
            .eq("user_id", userId);

        return next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Η συνεδρία έληξε. Συνδεθείτε ξανά.",
            code: "ACCESS_TOKEN_EXPIRED_OR_INVALID"
        });
    }
}

async function requireOwnerAuth(req, res, next) {
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
        const userId = payload.sub;

        const { data: subscription, error: subErr } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("owner_id", userId)
            .single();

        if (subErr || !subscription) {
            return res.status(403).json({ 
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND"
            });
        }

        const { data: onboarding, error: onboardingErr } = await supabase
            .from("onboarding")
            .select("is_completed")
            .eq("subscription_id", subscription.id)
            .single();

        if (onboardingErr || !onboarding) {
            return res.status(403).json({ 
                success: false,
                message: "Δεν βρέθηκε onboarding",
                code: "ONBOARDING_NOT_FOUND"
            });
        }

        req.user = { 
            id: userId, 
            subId: subscription.id,
            needsOnboarding: !onboarding.is_completed,
        };

        // Fire-and-forget (no await)
        supabase
            .from("user_sessions")
            .update({ last_activity_at: new Date() })
            .eq("user_id", userId);

        return next();

    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Η συνεδρία έληξε. Συνδεθείτε ξανά.",
            code: "ACCESS_TOKEN_EXPIRED_OR_INVALID"
        });
    }
}

module.exports = { requireAuth, requireOwnerAuth };