// shared.js
require('dotenv').config();
const express = require('express');
const supabase = require('../supabaseConfig');
const { requireAuth } = require('../middlewares/authMiddleware');
const Stripe = require('stripe');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ### Onboarding ###
router.get("/onboarding-data", requireAuth, async (req, res) => {

    const userId = req.user.id;

    try {
        // 1. Get industries
        const { data: industries, error: industriesError } = await supabase
            .from("industries")
            .select("*");

        if (industriesError) {
            console.error("INDUSTRIES SELECT ERROR:", industriesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των industries",
                code: "DB_ERROR",
            });
        }

        // 2. Get plans
        const { data: plansData, error: plansError } = await supabase
            .from("plans")
            .select("id, name, description, max_users_per_station, features, stripe_price_id_monthly, stripe_price_id_yearly, stripe_extra_station_price_id")
            .eq("is_public", true)
            .order("id", {ascending: true});

        if (plansError) {
            console.error("PLANS SELECT ERROR:", plansError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των plans",
                code: "DB_ERROR",
            });
        }

        const plans = await Promise.all(
            plansData.map(async (plan) => {
                const {
                    id,
                    name,
                    description,
                    max_users_per_station,
                    features,
                    stripe_price_id_monthly,
                    stripe_price_id_yearly,
                    stripe_extra_station_price_id,
                } = plan;

                const stripe_base_price_per_month = stripe_price_id_monthly ? await stripe.prices.retrieve(stripe_price_id_monthly) : stripe_price_id_monthly;
                const base_price_per_month = stripe_base_price_per_month ? stripe_base_price_per_month.unit_amount / 100 : 0;

                const stripe_base_price_per_year = stripe_price_id_yearly ? await stripe.prices.retrieve(stripe_price_id_yearly): stripe_price_id_yearly;
                const base_price_per_year = stripe_base_price_per_year ? (stripe_base_price_per_year.unit_amount / 100) / 12 : 0;

                const stripe_extra_station_price = stripe_extra_station_price_id ? await stripe.prices.retrieve(stripe_extra_station_price_id) : null;
                const extra_station_price = stripe_extra_station_price ? stripe_extra_station_price.unit_amount / 100 : null;

                return {
                    id,
                    name,
                    description,
                    base_price_per_month,
                    base_price_per_year,
                    extra_station_price,
                    max_users_per_station,
                    features,
                    // currency
                    // annual_discount
                    // vat
                };
            })
        );

        // 3. Get subscription (step1 + step2 data)
        const { data: subData, error: subError } = await supabase
            .from("subscriptions")
            .select("company_name, managers_phone, industry_id")
            .eq("owner_id", userId)
            .single();

        if (subError) {
            console.error("SUBSCRIPTION SELECT ERROR:", subError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση του subscription",
                code: "DB_ERROR",
            });
        }

        if (!subData) {
            console.log("SUBSCRIPTION NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND",
            });
        }

        // 4. Return everything
        return res.json({
            success: true,
            message: "",
            data: {
                industries,
                plans,
                step1: {
                    companyName: subData.company_name ?? "",
                    managersPhone: subData.managers_phone ?? "",
                },
                step2: {
                    industryId: subData.industry_id ?? null,
                },
            },
        });
    } catch (error) {
        console.error("Onboarding data error:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR",
        });
    }
});


router.post('/submit-step-one', requireAuth, async (req, res) => {

    const userId = req.user.id;
    const { companyName, managersPhone } = req.body;

    // ---- Inputs Validation
    if (!companyName) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα εταιρείας είναι υποχρεωτικό",
            code: "MISSING_COMPANY_NAME"
        });
    }

    if (!managersPhone) {
        return res.status(400).json({
            success: false,
            message: "Το τηλέφωνο υπεύθυνου είναι υποχρεωτικό",
            code: "MISSING_MANAGERS_PHONE"
        });
    }

    // Company name validation
    if (typeof companyName !== "string" || companyName.trim().length < 3) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα εταιρείας πρέπει να έχει τουλάχιστον 3 χαρακτήρες",
            code: "INVALID_COMPANY_NAME"
        });
    }

    // Managers phone validation
    const cleanedPhone = managersPhone.replace(/\D/g, ""); // κρατάει μόνο αριθμούς

    if (cleanedPhone.length !== 10) {
        return res.status(400).json({
            success: false,
            message: "Το τηλέφωνο υπεύθυνου πρέπει να αποτελείται από 10 ψηφία",
            code: "INVALID_PHONE"
        });
    }

    if (!/^\d+$/.test(cleanedPhone)) {
        return res.status(400).json({
            success: false,
            message: "Το τηλέφωνο πρέπει να περιέχει μόνο αριθμούς",
            code: "INVALID_PHONE_FORMAT"
        });
    }
    // ---

    try {
        // 1. Update subscription
        const { data: subData, error: updateSubError } = await supabase
            .from("subscriptions")
            .update({
                company_name: companyName,
                managers_phone: managersPhone
            })
            .eq("owner_id", userId)
            .select("id")
            .single();

        // 1a. Database update error
        if (updateSubError) {
            console.error("DB UPDATE ERROR:", updateSubError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση subscription",
                code: "DB_ERROR"
            });
        }

        // 1b. Subscription not found
        if (!subData) {
            console.log("SUBSCRIPTION NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND"
            });
        }

        const subscriptionId = subData.id;

        // 2. Update onboarding step (max step pattern)
        const { error: updateOnboardingError } = await supabase
            .from("onboarding")
            .update({ step: 2 })
            .eq("subscription_id", subscriptionId)
            .lte("step", 2); // prevents step overriding backwards if already > 2

        // 2a. Database error
        if (updateOnboardingError) {
            console.error("ONBOARDING UPDATE ERROR:", updateOnboardingError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση του onboarding",
                code: "DB_ERROR"
            });
        }

        // 3. All good
        return res.json({
            success: true,
            message: "Το βήμα 1 ολοκληρώθηκε",
        });

    } catch (error) {
        console.error("Step 1 error:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
})

router.post('/submit-step-two', requireAuth, async (req, res) => {

    const userId = req.user.id;
    const { selectedIndustryId } = req.body;

    // VALIDATION
    if (!selectedIndustryId) {
        return res.status(400).json({
            success: false,
            message: "Η επιλογή κλάδου είναι υποχρεωτική",
            code: "MISSING_INDUSTRY"
        });
    }

    try {
        // CHECK INDUSTRY EXISTS
        const { data: industryData, error: industryError } = await supabase
            .from("industries")
            .select("*")
            .eq("id", selectedIndustryId)
            .single();

        if (industryError) {
            console.error("INDUSTRY SELECT ERROR:", industryError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση του industry",
                code: "DB_ERROR",
            });
        }

        if (!industryData) {
            console.log("INDUSTRY NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε industry",
                code: "INDUSTRY_NOT_FOUND",
            });
        }

        // UPDATE SUBSCRIPTION
        const { data: subData, error: updateSubError } = await supabase
            .from("subscriptions")
            .update({
                industry_id: selectedIndustryId,
            })
            .eq("owner_id", userId)
            .select("id")
            .single();

        if (updateSubError) {
            console.error("DB UPDATE ERROR:", updateSubError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση subscription",
                code: "DB_ERROR"
            });
        }

        if (!subData) {
            console.log("SUBSCRIPTION NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND"
            });
        }

        const subscriptionId = subData.id;

        // Update onboarding step (max step pattern)
        const { error: updateOnboardingError } = await supabase
            .from("onboarding")
            .update({ step: 3 })
            .eq("subscription_id", subscriptionId)
            .lte("step", 3); // prevents step overriding backwards if already > 3

        if (updateOnboardingError) {
            console.error("ONBOARDING UPDATE ERROR:", updateOnboardingError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση του onboarding",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Το βήμα 2 ολοκληρώθηκε",
        });

    } catch (error) {
        console.error("Step 2 error:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
})

router.post('/submit-step-three', requireAuth, async (req, res) => {
    
    const userId = req.user.id;

    try {
        const { data: subData, error: updateSubError } = await supabase
            .from("subscriptions")
            .update({
                billing_status: "free",
                plan_id: 1,
                stripe_customer_id: null,
                stripe_subscription_id: null
            })
            .eq("owner_id", userId)
            .select("id")
            .single();

        if (updateSubError) {
            console.error("DB UPDATE ERROR:", updateSubError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση subscription",
                code: "DB_ERROR"
            });
        }

        if (!subData) {
            console.log("SUBSCRIPTION NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND"
            });
        }

        const { error: updateOnboardingError } = await supabase
            .from("onboarding")
            .update({
                step: null,
                is_completed: true
            })
            .eq("subscription_id", subData.id)

        if (updateOnboardingError) {
            console.error("DB UPDATE ERROR:", updateOnboardingError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση onboarding",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Επιτυχής ολοκλήρωση των βημάτων στο onboarding"
        })
        
    } catch (error) {
        console.error("Step 3 error:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
})

router.get('/get-company', requireAuth, async (req, res) => {
    
    const userId = req.user.id;

    try {
        const { data: subData, error: subError } = await supabase
            .from("subscriptions")
            .select("company_name")
            .eq("owner_id", userId)
            .single();

        if (subError) {
            console.error("DB SELECT ERROR:", subError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση subscription",
                code: "DB_ERROR"
            });
        }

        if (!subData) {
            console.log("SUBSCRIPTION NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε subscription",
                code: "SUB_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Επιτυχής ανάγνωση εταιρείας",
            data: {
                companyName: subData.company_name
            }
        })
        
    } catch (error) {
        console.error("Get company error:", error);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή. Προσπαθήστε ξανά.",
            code: "SERVER_ERROR"
        });
    }
})


module.exports = router;