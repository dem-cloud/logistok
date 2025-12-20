// shared.js
require('dotenv').config();
const express = require('express');
const supabase = require('../supabaseConfig');
const { requireAuth, requireActiveCompany, requireOwner } = require('../middlewares/authRequired');
const Stripe = require('stripe');
const { ONBOARDING_STEPS, TOTAL_STEPS } = require('../helpers/onboarding/onboardingSteps');
const { sanitizeOnboardingUpdates, validateNextOnboardingData, validateCompleteOnboardingData } = require('../helpers/onboarding/onboardingValidation');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode');

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// --------------------------------
// Invitations
// --------------------------------
router.post("/company/invite", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const companyId = req.user.companyId;
    const { email, role_id } = req.body;

    if (!email || !role_id) {
        return res.status(400).json({
            success: false,
            message: "Missing values",
            code: "MISSING_VALUES"
        });
    }

    try {
        // 1. Check if user already in company
        const { data: existing, error: existsErr } = await supabase
            .from("company_users")
            .select("id")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .maybeSingle();

        if (existsErr) throw existsErr;

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "User already belongs to this company",
                code: "USER_ALREADY_IN_COMPANY"
            });
        }

        // 2. Create invitation
        const { data: invitation, error: invErr } = await supabase
            .from("invitations")
            .insert({
                invited_email: email,
                company_id: companyId,
                role_id,
                invited_by: userId
            })
            .select()
            .single();

        if (invErr) throw invErr;

        // 3. Send email via RESEND
        await resend.emails.send({
            from: "Logistok <no-reply@logistok.com>",
            to: email,
            subject: "Logistok – You've been invited",
            html: `
                <p>You have been invited to join a company on Logistok.</p>
                <p><a href="https://app.logistok.gr/invite/${invitation.token}">Click here to accept the invitation</a></p>
            `
        });

        return res.json({
            success: true,
            message: "Invitation sent",
            data: { invitation_id: invitation.id }
        });

    } catch (err) {
        console.error("INVITE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

router.get("/invite/:token", async (req, res) => {
    const { token } = req.params;

    try {
        const { data: invite, error } = await supabase
            .from("invitations")
            .select(`
                id, invited_email, status, expires_at,
                companies (id, name),
                roles (id, key, name)
            `)
            .eq("token", token)
            .maybeSingle();

        if (error || !invite) {
            return res.status(404).json({
                success: false,
                message: "Invalid invitation",
                code: "INVITE_NOT_FOUND"
            });
        }

        if (invite.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Invitation is not active",
                code: "INVITE_NOT_ACTIVE"
            });
        }

        if (new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({
                success: false,
                message: "Invitation expired",
                code: "INVITE_EXPIRED"
            });
        }

        return res.json({
            success: true,
            data: {
                email: invite.invited_email,
                company: invite.companies,
                role: invite.roles
            }
        });

    } catch (err) {
        console.error("INVITE LOOKUP ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

router.post("/invite/accept", async (req, res) => {
    const { token, password } = req.body;

    if (!token) {
        return res.status(400).json({
            success: false,
            message: "Missing token",
            code: "MISSING_TOKEN"
        });
    }

    try {
        // 1. Validate invitation
        const { data: invite, error } = await supabase
            .from("invitations")
            .select("*")
            .eq("token", token)
            .maybeSingle();

        if (error || !invite) {
            return res.status(404).json({
                success: false,
                message: "Invalid invitation",
                code: "INVITE_NOT_FOUND"
            });
        }

        if (invite.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Invitation not active",
                code: "INVITE_NOT_ACTIVE"
            });
        }

        // 2. Check if user exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", invite.invited_email)
            .maybeSingle();

        let userId;

        if (!existingUser) {
            // Create new user
            const hashedPassword = await bcrypt.hash(password, 10);

            const { data: newUser, error: newUserErr } = await supabase
                .from("users")
                .insert({
                    email: invite.invited_email,
                    password_hash: hashedPassword,
                    email_verified: true
                })
                .select()
                .single();

            if (newUserErr) throw newUserErr;

            userId = newUser.id;

        } else {
            // Attach existing user
            userId = existingUser.id;
        }

        // 3. Create company_user
        const { error: cuErr } = await supabase
            .from("company_users")
            .insert({
                user_id: userId,
                company_id: invite.company_id,
                role_id: invite.role_id,
                is_owner: false
            });

        if (cuErr) throw cuErr;

        // 4. Mark invitation accepted
        await supabase
            .from("invitations")
            .update({
                status: "accepted",
                accepted_at: new Date()
            })
            .eq("id", invite.id);

        // 5. Generate contextual JWT
        const tokenJwt = generateAccessToken(
            userId,
            null, // no role until user selects company
            null
        );

        return res.json({
            success: true,
            message: "Invitation accepted",
            data: {
                access_token: tokenJwt
            }
        });

    } catch (err) {
        console.error("ACCEPT INVITE ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});





// ============================================
// ONBOARDING
// ============================================
router.get('/industries', requireAuth, requireOwner, async (req, res) => {

    try {
        const { data: industries, error } = await supabase
            .from('industries')
            .select('key, name, description, photo_url')
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (error) {
            console.error('DB ERROR (industries):', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch industries',
                code: 'DB_ERROR'
            });
        }

        return res.json({
            success: true,
            message: "Επιτυχής λήψη κλάδων",
            data: industries
        });

    } catch (err) {
        console.error('Error fetching industries:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            code: 'SERVER_ERROR'
        });
    }
});

router.get('/plans', requireAuth, async (req, res) => {
    try {
        const { data: plansData, error: plansError } = await supabase
            .from("plans")
            .select("id, key, name, description, max_users_per_store, features, stripe_price_id_monthly, stripe_price_id_yearly, stripe_extra_store_price_id, rank, is_popular")
            .eq("is_public", true)
            .order("priority", {ascending: true});

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
                    max_users_per_store,
                    features,
                    stripe_price_id_monthly,
                    stripe_price_id_yearly,
                    stripe_extra_store_price_id,
                    rank,
                    is_popular
                } = plan;

                const stripe_base_price_per_month = stripe_price_id_monthly ? await stripe.prices.retrieve(stripe_price_id_monthly) : stripe_price_id_monthly;
                const base_price_per_month = stripe_base_price_per_month ? stripe_base_price_per_month.unit_amount / 100 : 0;

                const stripe_base_price_per_year = stripe_price_id_yearly ? await stripe.prices.retrieve(stripe_price_id_yearly): stripe_price_id_yearly;
                const base_price_per_year = stripe_base_price_per_year ? (stripe_base_price_per_year.unit_amount / 100) / 12 : 0;

                const stripe_extra_store_price = stripe_extra_store_price_id ? await stripe.prices.retrieve(stripe_extra_store_price_id) : null;
                const extra_store_price = stripe_extra_store_price ? stripe_extra_store_price.unit_amount / 100 : null;

                return {
                    id,
                    name,
                    description,
                    base_price_per_month,
                    base_price_per_year,
                    extra_store_price,
                    max_users_per_store,
                    features,
                    rank,
                    is_popular,
                    // currency
                    // annual_discount
                    // vat
                };
            })
        );

        return res.json({
            success: true,
            data: plans || []
        });

    } catch (err) {
        console.error('Error fetching plans:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            code: 'SERVER_ERROR'
        });
    }
});

router.get('/plugins-recommendations', requireAuth, async (req, res) => {

    try {
        const industriesParam = req.query.industries;
        const scope = req.query.scope || "onboarding";

        let query = supabase
            .from("plugin_industry_recommendations")
            .select(` priority, plugins ( key, name, description, stripe_price_id_monthly, photo_url, current_version ) `)
            .eq("scope", scope)
            .eq("plugins.is_active", true) 
            .order("priority", { ascending: true });

        // ===============================
        // CASE 1: industries selected + generic
        // ===============================
        if (industriesParam) {
            const industryKeys = industriesParam
                .split(",")
                .map(k => k.trim())
                .filter(Boolean);

            query = query.or(`industry_key.in.(${industryKeys.join(",")}),industry_key.is.null`);
        }

        // ===============================
        // CASE 2: NO industries → generic
        // ===============================
        // else { // ή αφαιρουμε την else για να φερνει και απο αλλους κλαδους αν δεν εχει επιλεξει industries
        //     query = query.is("industry_key", null);
        // }

        const { data: pluginsRecomData, error: pluginsRecomError } = await query;

        if (pluginsRecomError) {
            console.error("PLUGIN RECOMMEND ERROR:", pluginsRecomError);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch plugins",
                code: "DB_ERROR"
            });
        }

        // ===============================
        // PRIORITY LOGIC (CRITICAL)
        // ===============================
        const pluginsMap = new Map();

        for (const row of pluginsRecomData) {

            const isGeneric = row.industry_key === null;

            const effectivePriority = row.priority + (isGeneric ? 1000 : 0);

            const existing = pluginsMap.get(row.plugins.key);

            if (!existing || effectivePriority < existing.effectivePriority) {
                pluginsMap.set(row.plugins.key, {
                    ...row.plugins,  
                    effectivePriority
                });
            }
        }

        const result = Array.from(pluginsMap.values())
            .sort((a, b) => a.effectivePriority - b.effectivePriority)
            .map(({ effectivePriority, ...plugin }) => plugin);

        // ===============================
        // STRIPE PRICE LOGIC
        // ===============================
        const plugins = await Promise.all(
            result.map(async (r) => {
                const {
                    key,
                    name,
                    description,
                    stripe_price_id_monthly,
                    photo_url,
                    current_version
                } = r;

                let base_price_per_month = 0;
                
                try {
                    const stripePrice = await stripe.prices.retrieve(stripe_price_id_monthly);

                    base_price_per_month = stripePrice?.unit_amount
                        ? stripePrice.unit_amount / 100
                        : 0;
                        
                } catch (err) {
                    base_price_per_month = 0;
                }

                return {
                    key,
                    name,
                    description,
                    base_price_per_month,
                    photo_url,
                    current_version
                };
            })
        );

        return res.json({
            success: true,
            message: "Επιτυχής λήψη plugins",
            data: plugins
        });

    } catch (err) {
        console.error("GET PLUGINS ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});


router.get("/:companyId/onboarding/data", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {

    const { companyId } = req.params;

    try {
        // Fetch onboarding draft data
        const { data: onboarding, error } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data, meta')
            .eq('company_id', companyId)
            .single();

        if (error) {
            console.error("DB ERROR (onboarding):", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch onboarding data",
                code: "DB_ERROR"
            });
        }

        if(onboarding.is_completed) {
            return res.status(403).json({
                success: false,
                message: "Το onboarding εχει ολοκληρωθεί",
                code: "ONBOARDING_IS_COMPLETED"
            });
        }


        return res.status(200).json({
            success: true,
            message: "Επιτυχής ανάκτηση draft onboarding data",
            data: {
                draft_data: onboarding.data,
                meta_data: onboarding.meta
            }
        });

    } catch (err) {
        console.error("SELECT ONBOARDING DATA ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
})

// ============================================
// ENDPOINT : Sync Step
// ============================================ 
router.post("/:companyId/onboarding/sync-step", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {
    
    const { companyId } = req.params;
    const { step } = req.body;

    if (!Number.isInteger(step)) {
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρο βήμα",
            code: "INVALID_STEP"
        });
    }

    try {

        const { data: onboarding, error: fetchError } = await supabase
            .from("onboarding")
            .select("current_step, max_step_reached, is_completed")
            .eq("company_id", companyId)
            .single();

        if (fetchError || !onboarding) {
            console.error("DB ERROR (onboarding):", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch onboarding data",
                code: "DB_ERROR"
            });
        }

        if (onboarding.is_completed) {
            return res.status(400).json({
                success: false,
                message: "Το onboarding έχει ολοκληρωθεί",
                code: "ONBOARDING_COMPLETED"
            });
        }

        if (step > onboarding.max_step_reached) {
            return res.status(403).json({
                success: false,
                message: "Μη επιτρεπτό βήμα",
                code: "STEP_NOT_ALLOWED"
            });
        }

        if (step === onboarding.current_step) {
            return res.status(200).json({
                success: true,
                message: "Το βήμα είναι ήδη συγχρονισμένο"
            });
        }

        const { error: updateError } = await supabase
            .from("onboarding")
            .update({ current_step: step })
            .eq("company_id", companyId);

        if (updateError) {
            console.error("DB ERROR (onboarding):", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update onboarding data",
                code: "DB_ERROR"
            });
        }


        return res.status(200).json({
            success: true,
            message: "Επιτυχής ενημέρωση βήματος"
        });

    } catch (error) {
        console.error("SYNC STEP ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// ENDPOINT 1: Move forward (with data updates)
// ============================================
router.post("/:companyId/onboarding/next", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {

    const { companyId } = req.params;
    const { updates } = req.body;

    try {
        const { data: onboarding, error: onboardingErr } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data, meta')
            .eq("company_id", companyId)
            .single();

        if (onboardingErr) {
            console.error("DB SELECT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση onboarding",
                code: "DB_ERROR",
            });
        }

        if(onboarding.is_completed) {
            console.log("ONBOARDING IS COMPLETED");
            return res.status(403).json({
                success: false,
                message: "Το onboarding εχει ολοκληρωθεί",
                code: "ONBOARDING_IS_COMPLETED"
            });
        }

        // Ensure onboarding.data exists, default to empty object
        const currentData = onboarding.data || {
            company: { name: '', phone: '' },
            industries: [],
            plan: null,
            plugins: []
        };
        
        // Sanitize updates - merges with current data and returns complete schema
        let sanitizedData;
        
        try {
            sanitizedData = sanitizeOnboardingUpdates(updates, currentData);
        } catch (err) {
            return res.status(400).json({
                success: false,
                message: err.message,
                code: "VALIDATION_ERROR"
            });
        }

        // Validate the complete sanitized data
        const validation = validateNextOnboardingData(sanitizedData);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Τα δεδομένα δεν είναι έγκυρα",
                code: "VALIDATION_ERROR",
                errors: validation.errors
            });
        }

        // Update company name immediately if changed
        if (sanitizedData.company.name && sanitizedData.company.name !== currentData.company?.name) {
            const { error: companyUpdateErr } = await supabase
                .from('companies')
                .update({
                    name: sanitizedData.company.name
                })
                .eq('id', companyId);

            if (companyUpdateErr) {
                console.error("Failed to update company name:", companyUpdateErr);
                // Don't fail the request, just log it
            }
        }

        let meta = onboarding.meta || {};
        
        if(onboarding.current_step === ONBOARDING_STEPS.plan && sanitizedData.plan) {
            
            const { data: plan, planErr } = await supabase
                .from('plans')
                .select('is_free')
                .eq("id", sanitizedData.plan.id)
                .single();

            if (planErr) {
                console.error("DB SELECT ERROR (plans):", planErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση plans",
                    code: "DB_ERROR",
                });
            }

            meta.is_free_plan = plan.is_free;
        }

        const nextStep = onboarding.current_step + 1;

        if (nextStep > TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Μη έγκυρο step",
                code: "INVALID_STEP"
            });
        }

        // Update max_step_reached
        let newMaxStepReached = Math.max(onboarding.max_step_reached || 0, nextStep);
        
        // If max_step_reached exceeds TOTAL_STEPS, reset it
        if (newMaxStepReached > TOTAL_STEPS) {
            newMaxStepReached = nextStep;
        }

        const { data: updatedData, error: updateErr } = await supabase
            .from('onboarding')
            .update({
                current_step: nextStep,
                max_step_reached: newMaxStepReached,
                data: sanitizedData, // Store complete sanitized schema
                meta: meta,

                updated_at: new Date().toISOString()
            })
            .eq("company_id", companyId)
            .select("current_step, max_step_reached, data, meta")
            .single();

        if (updateErr) {
            console.error("DB UPDATE ERROR (onboarding):", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση onboarding",
                code: "DB_ERROR",
            });
        }

        return res.json({
            success: true,
            message: "Επιτυχής μετάβαση στο επόμενο step",
            data: {
                // auth context state
                next_step: updatedData.current_step,
                max_step_reached: updatedData.max_step_reached,
                // onboarding context state
                draft_data: updatedData.data,
                meta_data: updatedData.meta
            }
        })

    } catch (err) {
        console.error('Error next step', err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
})

// ============================================
// ENDPOINT: Complete Onboarding
// ============================================
router.post("/:companyId/onboarding/complete", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {

    const { companyId } = req.params;
    const { final_updates } = req.body;

    try {
        // Fetch current onboarding state
        const { data: onboarding, error: onboardingErr } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data')
            .eq("company_id", companyId)
            .single();

        if (onboardingErr) {
            console.error("DB SELECT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση onboarding",
                code: "DB_ERROR",
            });
        }

        // Check if already completed
        if (onboarding.is_completed) {
            return res.status(400).json({
                success: false,
                message: "Το onboarding έχει ήδη ολοκληρωθεί",
                code: "ALREADY_COMPLETED"
            });
        }

        // Verify user is on the final step
        if (onboarding.current_step !== TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Πρέπει να ολοκληρώσετε όλα τα steps",
                code: "NOT_ON_FINAL_STEP",
            });
        }

        // Sanitize the complete data from database
        const sanitizedData = sanitizeOnboardingUpdates(final_updates, onboarding.data);

        // Validate the sanitized data (strict validation for completion)
        const validation = validateCompleteOnboardingData(sanitizedData);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Τα δεδομένα δεν είναι έγκυρα",
                code: "VALIDATION_ERROR",
                // errors: validation.errors
            });
        }
       
        const { data: plan, error: planErr } = await supabase
            .from('plans')
            .select('id, key, is_free, allows_paid_plugins')
            .eq('id', sanitizedData.plan.id)
            .single();

        if (planErr || !plan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan",
                code: "INVALID_PLAN"
            });
        }

        const canUsePaidPlugins = plan.allows_paid_plugins;

        // ---------------------------------------------
        // 1. Update tables with final data
        // ---------------------------------------------

        // ======= clean ups =======
        const { error: deleteError } = await supabase
            .from('company_industries')
            .delete()
            .eq('company_id', companyId);

        if (deleteError) {
            console.error("Failed to delete company_industries:", deleteError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την company industries",
                code: "DB_ERROR"
            });
        }
        
        const { error: deletePluginsErr } = await supabase
            .from('company_plugins')
            .delete()
            .eq('company_id', companyId);

        if (deletePluginsErr) {
            console.error("Failed to delete company_plugins:", deletePluginsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την εκκαθάριση plugins",
                code: "DB_ERROR"
            });
        }

        // ======= companies =======
        const { error: companyUpdateErr } = await supabase
            .from('companies')
            .update({
                name: sanitizedData.company.name,
                phone: sanitizedData.company.phone,
            })
            .eq('id', companyId);

        if (companyUpdateErr) {
            console.error("Failed to update company:", companyUpdateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση της εταιρείας",
                code: "DB_ERROR"
            });
        }
        // ======= company_industries =======

        if(sanitizedData.industries.length > 0) {
            // πάρε valid industries
            const { data: validIndustries, error: validIndustriesError } = await supabase
                .from('industries')
                .select('key')
                .in('key', sanitizedData.industries);

            if (validIndustriesError) {
                console.error("Failed to select industries:", validIndustriesError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση κλάδων",
                    code: "DB_ERROR"
                });
            }

            // insert νέες σχέσεις
            if (validIndustries.length > 0) {

                const rows = validIndustries.map(i => ({
                    company_id: companyId,
                    industry_key: i.key
                }));

                const { error: insertError  } = await supabase
                    .from('company_industries')
                    .insert(rows);

                if (insertError) {
                    console.error("Failed to update company_industries:", insertError);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ενημέρωση company industries",
                        code: "DB_ERROR"
                    });
                }
            }
        }

        // ======= company_plugins =======
        
        if(sanitizedData.plugins.length > 0){

            // πάρε plugins που υπάρχουν και είναι active
            const { data: availablePlugins, error: pluginsSelectErr } = await supabase
                .from('plugins')
                .select('key, is_active, stripe_price_id_monthly, stripe_price_id_yearly')
                .in('key', sanitizedData.plugins)
                .eq('is_active', true);

            if (pluginsSelectErr) {
                console.error("Failed to select plugins:", pluginsSelectErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση plugins",
                    code: "DB_ERROR"
                });
            }

            // φιλτράρισμα βάσει plan
            const allowedPlugins = availablePlugins.filter(plugin => {
                // basic → μόνο free plugins (δεν έχουν stripe price)
                if (!canUsePaidPlugins) {
                    return (
                        plugin.stripe_price_id_monthly === null &&
                        plugin.stripe_price_id_yearly === null
                    );
                }

                // paid plan → όλα
                return true;
            });

            // insert νέες εγγραφές
            if (allowedPlugins.length > 0) {

                const pluginRows = allowedPlugins.map(plugin => ({
                    company_id: companyId,
                    plugin_key: plugin.key,

                    // σωστά για onboarding
                    is_active: true,
                    activated_at: new Date().toISOString(),
                    subscription_item_id: null,
                    settings: null
                }));

                const { error: insertPluginsErr } = await supabase
                    .from('company_plugins')
                    .insert(pluginRows);

                if (insertPluginsErr) {
                    console.error("Failed to insert company_plugins:", insertPluginsErr);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την αποθήκευση plugins",
                        code: "DB_ERROR"
                    });
                }
            }
        }

        // ======= subscriptions =======
        const subscriptionPayload = {
            company_id: companyId,
            plan_id: plan.id,
            subscription_code: generateSubscriptionCode(),

            billing_period: plan.is_free ? null : sanitizedData.plan.billing,

            billing_status: plan.is_free ? 'active' : 'incomplete',

            current_period_start: plan.is_free ? new Date().toISOString() : null,
            current_period_end: null,

            cancel_at_period_end: false,
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString()
        };

        const { error: subscriptionErr } = await supabase
            .from('subscriptions')
            .upsert(subscriptionPayload, {
                onConflict: 'company_id'
            })

        if (subscriptionErr) {
            console.error("Failed to create subscription:", subscriptionErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία συνδρομής",
                code: "DB_ERROR"
            });
        }
        
        // ---------------------------------------------
        // 2. Mark onboarding as completed
        // ---------------------------------------------
        const { data: onboardingUpdate, error: onboardingUpdateErr } = await supabase
            .from('onboarding')
            .update({
                data: sanitizedData,
                is_completed: true,
                updated_at: new Date().toISOString()
            })
            .eq('company_id', companyId)
            .select("is_completed")
            .single();

        if (onboardingUpdateErr) {
            console.error("Failed to complete onboarding:", onboardingUpdateErr);
            // This is a critical error - company is updated but onboarding isn't marked complete
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ολοκλήρωση onboarding",
                code: "DB_ERROR"
            });
        }

        // 4. Post-completion actions (optional)
        try {
            // Send welcome email
            // await sendWelcomeEmail(req.user.email, data.company.name);
            
            // Create default data for the company
            // await createDefaultSettings(companyId);
            
            // Log analytics event
            // await trackEvent('onboarding_completed', { companyId, plan: data.plan.id });
            
            // Trigger webhooks
            // await triggerWebhook('onboarding.completed', { companyId });
            
        } catch (error) {
            // Don't fail the request if post-completion actions fail
            console.error("Post-completion actions failed:", error);
        }

        return res.json({
            success: true,
            message: "Το onboarding ολοκληρώθηκε επιτυχώς!",
            data: {
                is_completed: onboardingUpdate.is_completed
            }
        });

    } catch (err) {
        console.error('Error completing onboarding:', err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// ENDPOINT 2: Move backward (no data updates)
// ============================================
router.post("/:companyId/onboarding/back", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {
    const { companyId } = req.params;

    try {
        const { data: onboarding, error: onboardingErr } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data')
            .eq("company_id", companyId)
            .single();

        if (onboardingErr) {
            console.error("DB SELECT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση onboarding",
                code: "DB_ERROR",
            });
        }

        if(onboarding.is_completed) {
            return res.status(403).json({
                success: false,
                message: "Το onboarding εχει ολοκληρωθεί",
                code: "ONBOARDING_IS_COMPLETED"
            });
        }

        const previousStep = onboarding.current_step - 1;

        if (previousStep < 1) {
            return res.status(400).json({
                success: false,
                message: "Είστε ήδη στο πρώτο step",
                code: "ALREADY_AT_FIRST_STEP"
            });
        }
        
        // Just update current_step, no data changes
        const { data: updatedData, error: updateErr } = await supabase
            .from('onboarding')
            .update({
                current_step: previousStep,
                updated_at: new Date().toISOString()
            })
            .eq("company_id", companyId)
            .select("current_step, max_step_reached, is_completed, data")
            .single();

        if (updateErr) {
            console.error("DB UPDATE ERROR (onboarding):", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση onboarding",
                code: "DB_ERROR",
            });
        }

        return res.json({
            success: true,
            message: "Επιτυχής επιστροφή στο προηγούμενο step",
            data: {
                back_step: updatedData.current_step
            }
        });

    } catch (err) {
        console.error('Error going back:', err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// ENDPOINT 3: Navigate to specific step (optional but useful)
// ============================================
router.post("/:companyId/onboarding/goto/:step", requireAuth, requireActiveCompany, requireOwner, async (req, res) => {
    const { companyId, step } = req.params;
    const targetStep = parseInt(step);

    if (isNaN(targetStep) || targetStep < 1) {
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρο step",
            code: "INVALID_STEP"
        });
    }

    try {
        const { data: onboarding, error: onboardingErr } = await supabase
            .from('onboarding')
            .select('current_step, max_step_reached, is_completed, data')
            .eq("company_id", companyId)
            .single();

        if (onboardingErr) {
            console.error("DB SELECT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση onboarding",
                code: "DB_ERROR",
            });
        }

        if(onboarding.is_completed) {
            return res.status(403).json({
                success: false,
                message: "Το onboarding εχει ολοκληρωθεί",
                code: "ONBOARDING_IS_COMPLETED"
            });
        }

        const maxStepReached = onboarding.max_step_reached || onboarding.current_step;

        // User can only navigate to steps they've already reached
        if (targetStep > maxStepReached) {
            return res.status(403).json({
                success: false,
                message: "Δεν μπορείτε να μεταβείτε σε step που δεν έχετε ξεκλειδώσει",
                code: "STEP_NOT_UNLOCKED"
            });
        }

        if (targetStep > TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Μη έγκυρο step",
                code: "INVALID_STEP"
            });
        }

        // Just update current_step
        const { data: updatedData, error: updateErr } = await supabase
            .from('onboarding')
            .update({
                current_step: targetStep,
                updated_at: new Date().toISOString()
            })
            .eq("company_id", companyId)
            .select("current_step, max_step_reached, is_completed, data")
            .single();

        if (updateErr) {
            console.error("DB UPDATE ERROR (onboarding):", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση onboarding",
                code: "DB_ERROR",
            });
        }

        return res.json({
            success: true,
            message: `Επιτυχής μετάβαση στο step ${targetStep}`,
            data: {
                current_step: updatedData.current_step,
            }
        });

    } catch (err) {
        console.error('Error navigating to step:', err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});




module.exports = router;