const getCooldownStatus = require("../helpers/getCooldownStatus");
const { VERIFICATION_TYPES } = require("../helpers/verificationTypes");

async function verificationRateLimiter(req, res, next) {
    
    const { email, type } = req.body;

    const VALID_TYPES = Object.values(VERIFICATION_TYPES);

    if (!email || !type) {
        console.log("MISSING VALUES");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    if (!VALID_TYPES.includes(type)) {
        console.log("INVALID TYPE");
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρος τύπος αιτήματος",
            code: "INVALID_TYPE"
        });
    }

    try {
        // Έλεγχος cooldown status
        const { isCoolingDown, remaining, error } = await getCooldownStatus(email, type);

        if(error){
            console.error("DB SELECT ERROR (verification_codes):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        }

        if (isCoolingDown) {
            return res.status(200).json({
                success: true,
                message: "Υπάρχει ήδη ενεργός κωδικός.",
                code: "ACTIVE_VERIFICATION_CODE",
                data: {
                    remaining
                },
            });
        }

        // Αν όλα καλά συνέχισε
        next();

    } catch (err) {
        console.error("verificationRateLimiter error:", err);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
}

module.exports = verificationRateLimiter;
