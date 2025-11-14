const supabase = require("../supabaseConfig");

async function getCooldownStatus(email, type) {
    // Διαφορετικά cooldowns ανά type
    const COOLDOWNS = {
        email_verify: 59 * 1000,      // 59 δευτερόλεπτα
        password_reset: 59 * 1000     // 59 δευτερόλεπτα
    };

    const COOLDOWN_MS = COOLDOWNS[type] || 59 * 1000;

    try {
        const now = Date.now();

        const { data: recentCode, error } = await supabase
            .from("verification_codes")
            .select("created_at")
            .eq("email", email)
            .eq("type", type)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error("getCooldownStatus Supabase error:", error);
            return { error: true, isCoolingDown: false, remaining: 0 };
        }

        if (!recentCode) {
            return { isCoolingDown: false, remaining: 0, error: false };
        }

        const createdAt = new Date(recentCode.created_at).getTime();
        const diff = now - createdAt;

        if (diff < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - diff) / 1000);
            return { isCoolingDown: true, remaining, error: false };
        }

        return { isCoolingDown: false, remaining: 0, error: false };

    } catch (err) {
        console.error("getCooldownStatus runtime error:", err);
        return { error: true, isCoolingDown: false, remaining: 0 };
    }
}

module.exports = getCooldownStatus;
