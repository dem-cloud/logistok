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

        // sub → user ID
        const userId = payload.sub;
        
        // Δημιουργούμε το req.user ανάλογα με το τι υπάρχει στο token
        req.user = {
            id: userId,
            companyId: payload.companyId || null,
            role: payload.role || null,
            permissions: payload.permissions || []
        };

        // Fire-and-forget update της τελευταίας δραστηριότητας
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

async function requireOwner(req, res, next) {

    try {
        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Δεν έγινε πιστοποίηση.",
                code: "NOT_AUTHENTICATED"
            });
        }
        
        const userId = req.user.id;

        // Η ενεργή εταιρεία ΠΑΝΤΑ από token
        const tokenCompanyId = req.user.companyId;

        if (!tokenCompanyId) {
            return res.status(403).json({
                success: false,
                message: "Δεν έχει επιλεχθεί ενεργή εταιρεία.",
                code: "NO_ACTIVE_COMPANY"
            });
        }

        // Αν το endpoint έχει companyId στα params → πρέπει να ταιριάζει
        if (req.params.companyId && req.params.companyId !== tokenCompanyId) {
            return res.status(403).json({
                success: false,
                message: "Μη επιτρεπτή πρόσβαση σε άλλη εταιρεία.",
                code: "COMPANY_MISMATCH"
            });
        }

        // Έλεγχος στη βάση
        const { data: companyUser, error } = await supabase
            .from("company_users")
            .select("is_owner, status")
            .eq("user_id", userId)
            .eq("company_id", tokenCompanyId)
            .maybeSingle();

        if (error) {
            console.error("DB ERROR (company_users):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τον έλεγχο δικαιωμάτων",
                code: "DB_ERROR"
            });
        }

        if (!companyUser) {
            return res.status(403).json({
                success: false,
                message: "Δεν ανήκετε σε αυτή την εταιρεία",
                code: "NOT_COMPANY_MEMBER"
            });
        }

        if (!companyUser.is_owner) {
            return res.status(403).json({
                success: false,
                message: "Απαιτείται ρόλος owner",
                code: "OWNER_ONLY"
            });
        }

        if (companyUser.status !== "active") {
            return res.status(403).json({
                success: false,
                message: "Ο λογαριασμός σας στην εταιρεία δεν είναι ενεργός",
                code: "COMPANY_USER_NOT_ACTIVE"
            });
        }

        // 👉 Κάνε available το companyId downstream
        req.companyId = tokenCompanyId;

        return next();

    } catch (err) {
        console.error("REQUIRE OWNER ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
}

// Οταν καλω endpoint με :companyId στα params χρειαζομαι παντα requireActiveCompany
function requireActiveCompany( req, res, next ) {

    const tokenCompanyId = req.user?.companyId;
    const requestedCompanyId = req.params.companyId;

    if (!tokenCompanyId) {
        return res.status(403).json({
            success: false,
            code: "NO_ACTIVE_COMPANY",
            message: "Δεν έχει επιλεγεί ενεργή εταιρεία"
        });
    }

    if (!requestedCompanyId) {
        return res.status(400).json({
            success: false,
            code: "NO_COMPANY_IN_REQUEST",
            message: "Λείπει companyId από το request"
        });
    }

    if (tokenCompanyId !== requestedCompanyId) {
        return res.status(403).json({
            success: false,
            code: "COMPANY_MISMATCH",
            message: "Δεν έχετε πρόσβαση σε αυτή την εταιρεία"
        });
    }

    next();
}

function requirePermissions(required = []) {
    return (req, res, next) => {

        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Δεν έγινε πιστοποίηση.",
                code: "NOT_AUTHENTICATED"
            });
        }

        if (!Array.isArray(required) || required.length === 0) {
            // defensive: αν δεν ζητάς permissions, άσε να περάσει
            return next();
        }

        const userPermissions = req.user.permissions || [];

        const missingPermissions = required.filter(
            perm => !userPermissions.includes(perm)
        );

        if (missingPermissions.length > 0) {
            return res.status(403).json({
                success: false,
                message: "Δεν έχετε τα απαιτούμενα δικαιώματα.",
                code: "MISSING_PERMISSIONS",
                missing_permissions: missingPermissions
            });
        }

        return next();
    };
}

function requireAnyPermission(required = []) {
    return (req, res, next) => {

        if (!req.user?.id) {
            return res.status(401).json({
                success: false,
                message: "Δεν έγινε πιστοποίηση.",
                code: "NOT_AUTHENTICATED"
            });
        }

        if (!Array.isArray(required) || required.length === 0) {
            return next();
        }

        const userPermissions = req.user.permissions || [];

        const hasAnyPermission = required.some(
            perm => userPermissions.includes(perm)
        );

        if (!hasAnyPermission) {
            return res.status(403).json({
                success: false,
                message: "Δεν έχετε δικαίωμα πρόσβασης.",
                code: "PERMISSION_REQUIRED",
                required_permissions: required
            });
        }

        return next();
    };
}


module.exports = { requireAuth, requireOwner, requireActiveCompany, requirePermissions, requireAnyPermission };