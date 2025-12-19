const supabase = require("../supabaseConfig");
const { VERIFICATION_TYPES } = require("./verificationTypes");

async function getCooldownStatus(email, type) {
    // Διαφορετικά cooldowns ανά type
    const COOLDOWNS = {
        [VERIFICATION_TYPES.SIGNUP]: 60 * 1000,          // 60 δευτερόλεπτα
        [VERIFICATION_TYPES.PASSWORD_RESET]: 60 * 1000   // 60 δευτερόλεπτα
    };

    const COOLDOWN_MS = COOLDOWNS[type] || 60 * 1000;

    try {
        const now = Date.now();

        const { data: verificationCode, error } = await supabase
            .from("verification_codes")
            .select("updated_at")
            .eq("email", email)
            .eq("type", type)
            .maybeSingle();

        if (error) {
            console.error("getCooldownStatus Supabase error:", error);
            return { error: true, isCoolingDown: false, remaining: 0 };
        }

        if (!verificationCode) {
            return { existedCode: false, isCoolingDown: false, remaining: 0, error: false };
        }

        const updatedAt = new Date(verificationCode.updated_at).getTime();
        const diff = now - updatedAt;

        if (diff < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - diff) / 1000);
            return { existedCode: true, isCoolingDown: true, remaining, error: false };
        }
        
        return { existedCode: true, isCoolingDown: false, remaining: 0, error: false };

    } catch (err) {
        console.error("getCooldownStatus runtime error:", err);
        return { error: true, isCoolingDown: false, remaining: 0 };
    }
}

module.exports = getCooldownStatus;
