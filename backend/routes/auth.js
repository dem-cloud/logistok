require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit');
const supabase = require('../supabaseConfig');
const { generateRefreshToken, hashRefreshToken, setRefreshCookie, generateAccessToken, clearRefreshCookie } = require('../helpers/tokens.js');
const { requireAuth } = require('../middlewares/authMiddleware');
const { Resend } = require('resend');
const verificationRateLimiter = require('../middlewares/verificationRateLimiter.js');
const { generateSixDigitCode } = require('../helpers/generateSixDigitCode.js');
const getCooldownStatus = require('../helpers/getCooldownStatus.js');
const { generateVerificationEmail, generatePasswordResetEmail } = require('../helpers/emailTemplate.js');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode.js');
const { VERIFICATION_TYPES } = require('../helpers/verificationTypes.js');
const Stripe = require('stripe');
// const UAParser = require('ua-parser-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ## Rate Limiting (ανά IP) -> Προστατεύει τον server από spam & network floods από DoS / Botnets
// ## Brute-force ανά Fingerprint -> Προστατεύει τον λογαριασμό από token/password guessing από Account takeover

// TODO: Atomic flow -> Postgres Transaction RPC (Create RPC function in Supabase and call it in NodeJS)
// Atomic flow είναι για να μην μένουν υπολείμματα όταν ένα Supabase query αποτύχει
// TODO: Check rate limiters 
const loginRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 5, // max 5 attempts
    message: { error: "Too many login attempts. Please try again later." },
    // standardHeaders: true,
    // legacyHeaders: false,
});

const refreshRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 10, // max 10 αιτήματα / λεπτό ανά IP
    message: { error: "Too many refresh attempts. Please wait." },
    // standardHeaders: true,
    // legacyHeaders: false,
});

router.post("/check-user", loginRateLimiter, async (req, res) => {

    const { email, type } = req.body;

    if (!email || !type) {
        console.log("MISSING VALUES")
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // 1) Έλεγχος αν υπάρχει χρήστης
        const { data: existingUser, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if(userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        }

        if(type === VERIFICATION_TYPES.PASSWORD_RESET && !existingUser){

            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει χρήστης με αυτό το email",
                code: "PR_USER_NOT_FOUND",
            });

        } else if(type !== VERIFICATION_TYPES.PASSWORD_RESET && existingUser) {
            
            return res.json({
                success: true,
                message: "ΟΚ",
                code: "USER_FOUND",
            });

        }
        

        // 2) Αν δεν υπάρχει χρήστης, έλεγξε cooldown/ενεργό κωδικό
        const { isCoolingDown, remaining, error } = await getCooldownStatus(email, type);

        if(error){
            console.error("DB SELECT ERROR (verification_codes):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        }

        // 3) Επιστροφή αποτελέσματος
        if(type === VERIFICATION_TYPES.PASSWORD_RESET && existingUser){

            return res.json({
                success: true,
                message: "ΟΚ",
                code: "PR_USER_FOUND",
                data: {
                    isCoolingDown, // true/false
                    remaining      // δευτερόλεπτα που απομένουν
                },
            });

        } else if(type !== VERIFICATION_TYPES.PASSWORD_RESET && !existingUser){

            return res.json({
                success: true,
                message: "ΟΚ",
                code: "USER_NOT_FOUND",
                data: {
                    isCoolingDown, // true/false
                    remaining      // δευτερόλεπτα που απομένουν
                },
            });

        }

    } catch (error) {
        console.error('Error checking user', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/send-code", verificationRateLimiter, async (req, res) => {

    const { email, type } = req.body;
    // checking if the values are null or invalid type is happening in middleware

    try {
        const code = generateSixDigitCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + 10 * 60 * 1000);

        // 1. Καθαρισμός παλιών codes αυτού του type
        const { deleteCodesError } = await supabase
            .from("verification_codes")
            .delete()
            .eq("email", email)
            .eq("type", type);

        if(deleteCodesError){
            console.error("DB DELETE ERROR (verification_codes):", deleteCodesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την διαγραφή verification_codes",
                code: "DB_ERROR",
            });
        }

        // 2. Αποθήκευση νέου
        const { insertCodesError } = await supabase
            .from("verification_codes")
            .insert([{ 
                email: email, 
                type, 
                code_hash, 
                created_at: new Date(),
                expires_at 
            }]);

        if(insertCodesError){
            console.error("DB INSERT ERROR (verification_codes):", insertCodesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση verification_codes",
                code: "DB_ERROR",
            });
        }

        const messages = {
            [VERIFICATION_TYPES.EMAIL_VERIFY]: {
                subject: 'Logistok - Verify Your Email',
                html: generateVerificationEmail(code)
            },
            [VERIFICATION_TYPES.PASSWORD_RESET]: {
                subject: 'Logistok - Reset Your Password',
                html: generatePasswordResetEmail(code)
            }
        };

        const msgData = messages[type];

        await resend.emails.send({
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
            to: email,
            ...msgData
        });

        res.json({ 
            success: true, 
            message: 'Ο κωδικός επαλήθευσης στάλθηκε με επιτυχία. Παρακαλώ ελέγξτε το email σας.',
            code: "VERIFICATION_CODE_SENT",
            data: { remaining: 0 }
        });


    } catch (error) {
        console.error('Error sending code', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/password-reset", loginRateLimiter, async (req, res) => {
    const { email, password, confirmPassword, verificationCode, fingerprint } = req.body;

    if (!email || !password || !confirmPassword || !verificationCode || !fingerprint) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // ---------------------------------------------
        // 1. USER EXISTANCE
        // ---------------------------------------------
        const { data: userFound, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if(userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        }

        if(!userFound){
            console.log("USER DOESN'T EXISTS");
            return res.status(400).json({
                success: false,
                message: "Ο χρήστης δεν υπάρχει",
                code: "USER_NOT_FOUND",
            });
        }

        // -----
        // Find subscription id
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('owner_id', userFound.id)
            .maybeSingle();

        if (subError){
            console.error("DB SELECT ERROR (subscriptions):", subError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση subscriptions",
                code: "DB_ERROR",
            });
        };

        let userIsOwner = true;
        if(!sub) userIsOwner = false;
        let needsOnboarding = false;
        let onboardingStep = null;

        if(userIsOwner){
            // Find is_completed on onboarding table
            const { data: onboarding, error: onboardingError } = await supabase
                .from('onboarding')
                .select('step, is_completed')
                .eq('subscription_id', sub.id)
                .maybeSingle();

            if (onboardingError){
                console.error("DB SELECT ERROR (onboarding):", onboardingError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση onboarding",
                    code: "DB_ERROR",
                });
            };

            if(!onboarding){
                console.log("ONBOARDING NOT FOUND");
                return res.status(404).json({
                    success: false,
                    message: "Δεν βρέθηκε onboarding stage",
                    code: "ONBOARDING_NOT_FOUND",
                });
            }

            needsOnboarding = !onboarding.is_completed;
            onboardingStep = onboarding.step || 1;
        }

        // ---------------------------------------------
        // 2. PASSWORD VALIDATION
        // ---------------------------------------------
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

        if (!passwordRegex.test(password)) {
            console.log("INVALID PASSWORD");
            return res.status(400).json({
                success: false,
                message: "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 πεζό και 1 αριθμό.",
                code: "INVALID_PASSWORD",
            });
        }

        if (password !== confirmPassword) {
            console.log("PASSWORD MISMATCH");
            return res.status(400).json({
                success: false,
                message: "Οι κωδικοί δεν ταιριάζουν.",
                code: "PASSWORD_MISMATCH",
            });
        }

        // ---------------------------------------------
        // 3. CHECK OTP (verification_code table)
        // ---------------------------------------------
        const { data: otpRecord, error: otpErr } = await supabase
            .from("verification_codes")
            .select("*")
            .eq("email", email)
            .eq("type", VERIFICATION_TYPES.PASSWORD_RESET)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (otpErr){
            console.error("DB SELECT ERROR (verification_codes):", otpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        };

        if(!otpRecord){
            console.log("NO VERIFICATION CODE RETURNED AFTER SELECT");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "OTP_NOT_FOUND",
            });
        }

        const otpMatch = await bcrypt.compare(verificationCode, otpRecord.code_hash);

        if (!otpMatch) {
            console.log("INVALID OTP");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "INVALID_OTP",
            });
        }

        // Check expiry
        if (new Date(otpRecord.expires_at) < new Date()) {
            console.log("OTP EXPIRED");
            return res.status(400).json({
                success: false,
                message: "Ο κωδικός OTP έχει λήξει.",
                code: "OTP_EXPIRED",
            });
        }

        // ---------------------------------------------
        // 4. UPDATE USER with new password
        // ---------------------------------------------
        const password_hash = await bcrypt.hash(password, 10);

        const { error: updateUserError } = await supabase
            .from("users")
            .update({ 
                password_hash
             })
            .eq("id", userFound.id);

        if (updateUserError) {
            console.error("DB UPDATE ERROR (users):", updateUserError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση users",
                code: "DB_ERROR",
            });
        }

        // ---------------------------------------------
        // 5. CREATE OR UPDATE USER SESSION
        // ---------------------------------------------
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        // 1) Παλιές συσκευές -> revoke
        const { error: revokeOldSessionsError } = await supabase
            .from("user_sessions")
            .update({ 
                revoked: true,
                revoked_at: new Date()
            })
            .eq("user_id", userFound.id)
            .neq("fingerprint", fingerprint);

        if (revokeOldSessionsError){
            console.error("DB UPDATE ERROR (user_sessions):", revokeOldSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση user_sessions",
                code: "DB_ERROR",
            });
        };

        // 2) Έλεγχος υπάρχοντος session για το συγκεκριμένο fingerprint
        const { data: existingSessions, error: existingSessionsError } = await supabase
            .from("user_sessions")
            .select("id")
            .eq("user_id", userFound.id)
            .eq("fingerprint", fingerprint)
            .order("created_at", { ascending: false })
            .limit(1);

        if (existingSessionsError){
            console.error("DB SELECT ERROR (user_sessions):", existingSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        };

        const existingSession = existingSessions?.[0];

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        if (existingSession) {
            // Υπάρχει session για αυτή τη συσκευή -> ανανέωσε το token
            const { error: updateError } = await supabase
                .from("user_sessions")
                .update({
                    refresh_token_hash: refreshTokenHash,
                    revoked: false,
                    revoked_at: null,
                    expires_at: expires_at,
                    last_login_at: new Date(),
                    last_activity_at: new Date(),
                    // user_agent: req.headers["user-agent"],
                    // device: deviceName,
                    // platform: `${browser} on ${os}`,
                })
                .eq("id", existingSession.id);

            if (updateError){
                console.error("DB UPDATE ERROR (user_sessions):", updateError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση user_sessions",
                    code: "DB_ERROR",
                });
            };

        } else {
            // Νέα συσκευή -> δημιουργία session
            const { error: insertError } = await supabase
                .from("user_sessions")
                .insert({
                    user_id: userFound.id,
                    refresh_token_hash: refreshTokenHash,
                    fingerprint,
                    revoked: false,
                    revoked_at: null,
                    expires_at: expires_at,
                    created_at: new Date(),
                    last_login_at: new Date(),
                    last_activity_at: new Date(),
                    // user_agent: req.headers["user-agent"],
                    // device: deviceName,
                    // platform: `${browser} on ${os}`,
                });

            if (insertError){
                console.error("DB INSERT ERROR (user_sessions):", insertError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση user_sessions",
                    code: "DB_ERROR",
                });
            };
        }

        setRefreshCookie(res, refreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------
        return res.json({
            success: true,
            message: "Επιτυχής αλλαγή κωδικού",
            data: {
                access_token: generateAccessToken(userFound.id),
                user: {
                    email: userFound.email,
                    first_name: userFound.first_name,
                    last_name: userFound.last_name,
                    needsOnboarding: needsOnboarding,
                    onboardingStep: onboardingStep
                }
            }
        });
        
    } catch (error) {
        console.error('Error signing up', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

// sign up for owners only
router.post("/signup", loginRateLimiter, async (req, res) => {

    // 1. Check if user exists ✔️
    // 2. Check if passwords meets requirements -> password = confirmPasswors, password.length > 6, at least 1 uppercase, at least 1 lowercase, at least 1 number ✔️
    // 3. Check OTP (db table: verification_code -> id, email, code_hash, type (email_verify), created_at, expires_at) ✔️
    // 4. Create Users -> email, password_hash, status='active', email_verified=true if pass the check otp, created_at ✔️
    // 5. Create Subscriptions -> subscription_code = random string maybe nanoid, created_at, owner_id ✔️
    // 6. Update Users -> subscription_id ✔️
    // 7. Create User_roles -> user_id, subscription_id, role_id = in role table where name = 'Admin' ✔️
    // 8. Create Stations -> name = 'Main Station', subscription_id, created_at ✔️
    // 9. Create User_sessions -> user_id, refresh_token_hash = generateRefreshToken(), fingerprint, revoked = false, expires_at, created_at, last_activity_at, last_login_at ✔️
    // 10. Create Onboarding -> step = 1, is_completed = false, created_at, subscription_id ✔️

    const { email, password, confirmPassword, verificationCode, fingerprint } = req.body;

    if (!email || !password || !confirmPassword || !verificationCode || !fingerprint) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // ---------------------------------------------
        // 1. USER EXISTANCE
        // ---------------------------------------------
        const { data: userFound, error: userError } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .maybeSingle();

        if(userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        }

        if(userFound){
            console.log("USER ALREADY EXISTS");
            return res.status(400).json({
                success: false,
                message: "Ο χρήστης υπάρχει ήδη",
                code: "USER_FOUND",
            });
        }

        // ---------------------------------------------
        // 2. PASSWORD VALIDATION
        // ---------------------------------------------
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

        if (!passwordRegex.test(password)) {
            console.log("INVALID PASSWORD");
            return res.status(400).json({
                success: false,
                message: "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες, 1 κεφαλαίο, 1 πεζό και 1 αριθμό.",
                code: "INVALID_PASSWORD",
            });
        }

        if (password !== confirmPassword) {
            console.log("PASSWORD MISMATCH");
            return res.status(400).json({
                success: false,
                message: "Οι κωδικοί δεν ταιριάζουν.",
                code: "PASSWORD_MISMATCH",
            });
        }

        // ---------------------------------------------
        // 3. CHECK OTP (verification_code table)
        // ---------------------------------------------
        const { data: otpRecord, error: otpErr } = await supabase
            .from("verification_codes")
            .select("*")
            .eq("email", email)
            .eq("type", VERIFICATION_TYPES.EMAIL_VERIFY)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (otpErr){
            console.error("DB SELECT ERROR (verification_codes):", otpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        };

        if(!otpRecord){
            console.log("NO VERIFICATION CODE RETURNED AFTER SELECT");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "OTP_NOT_FOUND",
            });
        }

        const otpMatch = await bcrypt.compare(verificationCode, otpRecord.code_hash);

        if (!otpMatch) {
            console.log("INVALID OTP");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "INVALID_OTP",
            });
        }

        // Check expiry
        if (new Date(otpRecord.expires_at) < new Date()) {
            console.log("OTP EXPIRED");
            return res.status(400).json({
                success: false,
                message: "Ο κωδικός OTP έχει λήξει.",
                code: "OTP_EXPIRED",
            });
        }
        
        // ---------------------------------------------
        // 4. CREATE USER
        // ---------------------------------------------
        const password_hash = await bcrypt.hash(password, 10);

        const { data: userInsert, error: userErr } = await supabase
            .from("users")
            .insert({
                email,
                password_hash,
                status: "active",
                email_verified: true,
                created_at: new Date(),
            })
            .select("*")
            .single();

        if (userErr){
            console.error("DB INSERT ERROR (users):", userErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση users",
                code: "DB_ERROR",
            });
        };

        if(!userInsert){
            console.error("NO USER RETURNED AFTER INSERT");
            return res.status(400).json({
                success: false,
                message: "Δεν επιστράφηκε χρήστης μετά την εισαγωγή",
                code: "DB_NO_DATA",
            });
        }

        const user_id = userInsert.id;

        // ---------------------------------------------
        // 5. CREATE SUBSCRIPTION
        // ---------------------------------------------

        const { data: subscriptionInsert, error: subErr } = await supabase
            .from("subscriptions")
            .insert({
                subscription_code: generateSubscriptionCode(),
                owner_id: user_id,
                created_at: new Date(),
            })
            .select("id")
            .single();

        if (subErr){
            console.error("DB INSERT ERROR (subscriptions):", subErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση subscriptions",
                code: "DB_ERROR",
            });
        };

        if(!subscriptionInsert){
            console.error("NO SUBSCRIPTION RETURNED AFTER INSERT");
            return res.status(400).json({
                success: false,
                message: "Δεν επιστράφηκε subscription μετά την εισαγωγή",
                code: "DB_NO_DATA",
            });
        }

        const subscription_id = subscriptionInsert.id;

        // ---------------------------------------------
        // 6. UPDATE USER with subscription_id
        // ---------------------------------------------
        const { error: updateUserError } = await supabase
            .from("users")
            .update({ subscription_id })
            .eq("id", user_id);

        if (updateUserError) {
            console.error("DB UPDATE ERROR (users):", updateUserError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση users",
                code: "DB_ERROR",
            });
        }

        // ---------------------------------------------
        // 7. ASSIGN OWNER ROLE
        // ---------------------------------------------
        const { data: ownerRole, error: rolesError } = await supabase
            .from("roles")
            .select("id")
            .eq("name", "Admin")
            .single();

        if (rolesError){
            console.error("DB SELECT ERROR (roles):", rolesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση roles",
                code: "DB_ERROR",
            });
        };

        if(!ownerRole){
            console.error("NO ROLE RETURNED AFTER SELECT");
            return res.status(400).json({
                success: false,
                message: "Δεν επιστράφηκε ρόλος μετά την ανάγνωση",
                code: "DB_NO_DATA",
            });
        }

        const owner_role_id = ownerRole.id;

        const { error: userRolesError } = await supabase
            .from("user_roles")
            .insert({
                user_id,
                subscription_id,
                role_id: owner_role_id,
            });

        if (userRolesError){
            console.error("DB INSERT ERROR (user_roles):", userRolesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση user_roles",
                code: "DB_ERROR",
            });
        };

        // ---------------------------------------------
        // 8. CREATE MAIN STATION
        // ---------------------------------------------
        const { error: stationsError } = await supabase
            .from("stations")
            .insert({
                name: "Main Station",
                subscription_id,
                created_at: new Date(),
            });

        if (stationsError){
            console.error("DB INSERT ERROR (stations):", stationsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση stations",
                code: "DB_ERROR",
            });
        };
        
        // ---------------------------------------------
        // 9. CREATE USER SESSION
        // ---------------------------------------------
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        const { error: userSessionsError } = await supabase
            .from("user_sessions")
            .insert({
                user_id,
                refresh_token_hash: refreshTokenHash,
                fingerprint,
                revoked: false,
                revoked_at: null,
                expires_at,
                created_at: new Date(),
                last_activity_at: new Date(),
                last_login_at: new Date()
            });

        if (userSessionsError){
            console.error("DB INSERT ERROR (user_sessions):", userSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση user_sessions",
                code: "DB_ERROR",
            });
        };

        setRefreshCookie(res, refreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        // ---------------------------------------------
        // 10. CREATE ONBOARDING RECORD
        // ---------------------------------------------
        const { error: onboardingError } = await supabase
            .from("onboarding")
            .insert({
                subscription_id,
                step: 1,
                is_completed: false,
                created_at: new Date(),
            });

        if (onboardingError){
            console.error("DB INSERT ERROR (onboarding):", onboardingError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την καταχώρηση onboarding",
                code: "DB_ERROR",
            });
        };

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------
        return res.json({
            success: true,
            message: "Επιτυχής εγγραφή",
            data: {
                access_token: generateAccessToken(user_id),
                user: {
                    email: userInsert.email,
                    first_name: "",
                    last_name: "",
                    needsOnboarding: true,
                    onboardingStep: 1
                }
            }
        });
        
    } catch (error) {
        console.error('Error signing up', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/login", loginRateLimiter, async (req, res) => {

    const { email, password, fingerprint } = req.body;

    if (!email || !password || !fingerprint) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name, password_hash, email_verified, subscription_id')
            .eq('email', email)
            .maybeSingle();

        if (userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        };

        if(!user){
            console.log("USER NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε χρήστης",
                code: "USER_NOT_FOUND",
            });
        }

        if(!user.email_verified){
            console.log("EMAIL NOT VERIFIED");
            return res.status(403).json({
                success: false,
                message: "Δεν έχει γίνει επαλήθευση email",
                code: "EMAIL_NOT_VERIFIED",
            });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            console.log("WRONG PASSWORD");
            return res.status(401).json({ 
                success: false, 
                message: "Λάθος κωδικός", 
                code: "WRONG_PASSWORD" 
            });
        }

        // Find subscription id
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('owner_id', user.id)
            .maybeSingle();

        if (subError){
            console.error("DB SELECT ERROR (subscriptions):", subError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση subscriptions",
                code: "DB_ERROR",
            });
        };

        let userIsOwner = true;
        if(!sub) userIsOwner = false;
        let needsOnboarding = false;
        let onboardingStep = null;

        if(userIsOwner){
            // Find is_completed on onboarding table
            const { data: onboarding, error: onboardingError } = await supabase
                .from('onboarding')
                .select('step, is_completed')
                .eq('subscription_id', sub.id)
                .maybeSingle();

            if (onboardingError){
                console.error("DB SELECT ERROR (onboarding):", onboardingError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση onboarding",
                    code: "DB_ERROR",
                });
            };

            if(!onboarding){
                console.log("ONBOARDING NOT FOUND");
                return res.status(404).json({
                    success: false,
                    message: "Δεν βρέθηκε onboarding stage",
                    code: "ONBOARDING_NOT_FOUND",
                });
            }

            needsOnboarding = !onboarding.is_completed;
            onboardingStep = onboarding.step || 1;
        }

        // TODO: Πάρε info συσκευής
        // const parser = new UAParser(req.headers["user-agent"]);
        // const ua = parser.getResult();

        // const deviceName = ua.device.model || "Desktop";
        // const browser = ua.browser.name || "Unknown Browser";
        // const os = ua.os.name || "Unknown OS";
        
        // create or update session + refresh cookie
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        // 1) Παλιές συσκευές -> revoke
        const { error: revokeOldSessionsError } = await supabase
            .from("user_sessions")
            .update({ 
                revoked: true,
                revoked_at: new Date()
            })
            .eq("user_id", user.id)
            .neq("fingerprint", fingerprint);

        if (revokeOldSessionsError){
            console.error("DB UPDATE ERROR (user_sessions):", revokeOldSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση user_sessions",
                code: "DB_ERROR",
            });
        };

        // 2) Έλεγχος υπάρχοντος session για το συγκεκριμένο fingerprint
        const { data: existingSessions, error: existingSessionsError } = await supabase
            .from("user_sessions")
            .select("id")
            .eq("user_id", user.id)
            .eq("fingerprint", fingerprint)
            .order("created_at", { ascending: false })
            .limit(1);

        if (existingSessionsError){
            console.error("DB SELECT ERROR (user_sessions):", existingSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        };

        const existingSession = existingSessions?.[0];

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        if (existingSession) {
            // Υπάρχει session για αυτή τη συσκευή -> ανανέωσε το token
            const { error: updateError } = await supabase
                .from("user_sessions")
                .update({
                    refresh_token_hash: refreshTokenHash,
                    revoked: false,
                    revoked_at: null,
                    expires_at: expires_at,
                    last_login_at: new Date(),
                    last_activity_at: new Date(),
                    // user_agent: req.headers["user-agent"],
                    // device: deviceName,
                    // platform: `${browser} on ${os}`,
                })
                .eq("id", existingSession.id);

            if (updateError){
                console.error("DB UPDATE ERROR (user_sessions):", updateError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση user_sessions",
                    code: "DB_ERROR",
                });
            };

        } else {
            // Νέα συσκευή -> δημιουργία session
            const { error: insertError } = await supabase
                .from("user_sessions")
                .insert({
                    user_id: user.id,
                    refresh_token_hash: refreshTokenHash,
                    fingerprint,
                    revoked: false,
                    revoked_at: null,
                    expires_at: expires_at,
                    created_at: new Date(),
                    last_login_at: new Date(),
                    last_activity_at: new Date(),
                    // user_agent: req.headers["user-agent"],
                    // device: deviceName,
                    // platform: `${browser} on ${os}`,
                });

            if (insertError){
                console.error("DB INSERT ERROR (user_sessions):", insertError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση user_sessions",
                    code: "DB_ERROR",
                });
            };
        }

        setRefreshCookie(res, refreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        return res.json({
            success: true,
            message: "OK",
            data: {
                access_token: generateAccessToken(user.id),
                user: {
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    needsOnboarding: needsOnboarding,
                    onboardingStep: onboardingStep
                }
            }
        });

        
    } catch (error) {
        console.error('Log in error', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
});

// --- REFRESH (ROTATION) ---
router.post("/refresh", refreshRateLimiter, async (req, res) => {

    // -- Anti-CSRF
    const allowedOrigins = [
        "https://logistok.com",
        "https://logistok.gr",
        "https://app.logistok.com",
        "https://app.logistok.gr",
        "http://localhost:5173",
        "http://localhost:3000"
    ];

    const origin = req.headers.origin || "";
    if (!origin || !allowedOrigins.includes(origin)) {
        console.log("NOT ALLOWED ORIGIN");
        return res.status(403).json({
            success: false,
            message: 'Αποτυχία διακομιστή.',
            code: "SERVER_ERROR"
        });
    }
    // --

    const refreshToken = req.cookies.refresh_token;

    if (!refreshToken) {
        console.log("NO REFRESH TOKEN");
        clearRefreshCookie(res);
        return res.status(401).json({
            success: false,
            message: 'Έληξε η σύνδεση.',
            code: "UNAUTHORIZED"
        });
    }

    try {
        const refreshHash = hashRefreshToken(refreshToken);

        // 1) Find session
        const { data: session, error: sessionError } = await supabase
            .from("user_sessions")
            .select("id, user_id, refresh_token_hash, revoked, expires_at")
            .eq("refresh_token_hash", refreshHash)
            .single();

        if (sessionError) {
            console.error("DB SELECT ERROR:", sessionError);
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: "Έληξε η σύνδεση",
                code: "UNAUTHORIZED",
            });
        }

        // 2) Validate session
        const now = new Date();
        if (session.revoked || new Date(session.expires_at) < now) {
            console.log("SESSION INVALID");
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'Έληξε η σύνδεση',
                code: "UNAUTHORIZED"
            });
        }

        // ------
        // Find user
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('email, first_name, last_name')
            .eq('id', session.user_id)
            .maybeSingle();

        if (userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        };

        if(!user){
            console.log("USER NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε χρήστης",
                code: "USER_NOT_FOUND",
            });
        }

        // Find subscription id
        const { data: sub, error: subError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('owner_id', session.user_id)
            .maybeSingle();

        if (subError){
            console.error("DB SELECT ERROR (subscriptions):", subError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση subscriptions",
                code: "DB_ERROR",
            });
        };

        let userIsOwner = true;
        if(!sub) userIsOwner = false;
        let needsOnboarding = false;
        let onboardingStep = null;

        if(userIsOwner){
            // Find is_completed on onboarding table
            const { data: onboarding, error: onboardingError } = await supabase
                .from('onboarding')
                .select('step, is_completed')
                .eq('subscription_id', sub.id)
                .maybeSingle();

            if (onboardingError){
                console.error("DB SELECT ERROR (onboarding):", onboardingError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση onboarding",
                    code: "DB_ERROR",
                });
            };

            if(!onboarding){
                console.log("ONBOARDING NOT FOUND");
                return res.status(404).json({
                    success: false,
                    message: "Δεν βρέθηκε onboarding stage",
                    code: "ONBOARDING_NOT_FOUND",
                });
            }

            needsOnboarding = !onboarding.is_completed;
            onboardingStep = onboarding.step || 1;
        }
        // ------

        // 3) Rotate token
        const newRefreshToken = generateRefreshToken();
        const newHash = hashRefreshToken(newRefreshToken);

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        const { error: updateError } = await supabase
            .from("user_sessions")
            .update({
                refresh_token_hash: newHash,
                expires_at,
                last_activity_at: now,
            })
            .eq("id", session.id);

        if (updateError) {
            console.error("DB UPDATE ERROR:", updateError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση session",
                code: "DB_ERROR"
            });
        }

        // 4) NEW refresh cookie
        setRefreshCookie(res, newRefreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));


        // 5) Return access token
        return res.json({
            success: true,
            data: {
                access_token: generateAccessToken(session.user_id),
                user: {
                    email: user.email,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    needsOnboarding: needsOnboarding,
                    onboardingStep: onboardingStep
                }
            }
        });

    } catch (err) {
        console.error("Refresh error:", err);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή.",
            code: "SERVER_ERROR"
        });
    }
});


// --- LOGOUT current device ---
router.post("/logout", async (req, res) => {
    try {
        const refreshToken = req.cookies.refresh_token;

        if (!refreshToken) {
            // No cookie → already logged out
            clearRefreshCookie(res);
            return res.json({
                success: true,
                message: "Logged out"
            });
        }

        // 1) Hash incoming refresh token
        const refreshHash = hashRefreshToken(refreshToken);

        // 2) Εύρεση του session στη βάση
        const { data: session, error: sessionError } = await supabase
            .from("user_sessions")
            .select("id, revoked")
            .eq("refresh_token_hash", refreshHash)
            .single();

        if (sessionError && sessionError.code !== "PGRST116") {
            // error other than "no rows"
            console.error("DB SELECT ERROR (user_sessions):", sessionError);
            clearRefreshCookie(res);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        }

        // 3) Αν βρήκαμε session, κάνε revoke (μόνο αν δεν είναι ήδη)
        if (session && !session.revoked) {
            const { error: revokeError } = await supabase
                .from("user_sessions")
                .update({
                    revoked: true,
                    revoked_at: new Date(),
                })
                .eq("id", session.id);

            if (revokeError) {
                console.error("DB UPDATE ERROR (user_sessions):", revokeError);
                clearRefreshCookie(res);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση user_sessions",
                    code: "DB_ERROR",
                });
            }
        }

        // 4) Πάντα καθάρισε το cookie
        clearRefreshCookie(res);

        return res.json({
            success: true,
            message: "Logged out",
        });

    } catch (err) {
        console.error("Logout error:", err);
        clearRefreshCookie(res);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή.",
            code: "SERVER_ERROR"
        });
    }
});

// --- LOGOUT all devices ---
router.post("/logout-all", requireAuth, async (req, res) => {

    const userId = req.user.id; // από το access token

    try {
        const { userSessionsError } = await supabase
            .from("user_sessions")
            .update({ 
                revoked: true,
                revoked_at: new Date()
            })
            .eq("user_id", userId);

        if (userSessionsError){
            console.error("DB UPDATE ERROR (user_sessions):", userSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση user_sessions",
                code: "DB_ERROR",
            });
        };

        clearRefreshCookie(res);

        return res.json({
            success: true,
            message: "Logged out from all devices"
        });

    } catch (err) {
        console.error("Logout-all error:", err);
        return res.status(500).json({
            success: false,
            message: "Αποτυχία διακομιστή.",
            code: "SERVER_ERROR"
        });
    }
});

//  GET User Details
// router.get("/me", requireAuth, async (req, res) => {

//     const userId = req.user.id;

//     try {
//         const { data: user, error: userError } = await supabase
//             .from("users")
//             .select("email, first_name, last_name")
//             .eq("id", userId)
//             .single();

//         if (userError){
//             console.error("DB SELECT ERROR (users):", userError);
//             return res.status(500).json({
//                 success: false,
//                 message: "Σφάλμα κατά την ανάγνωση users",
//                 code: "DB_ERROR",
//             });
//         };

//         if(!user){
//             console.error("USER NOT FOUND");
//             return res.status(404).json({
//                 success: false,
//                 message: "Δεν βρέθηκε χρήστης",
//                 code: "USER_NOT_FOUND",
//             });
//         }

//         res.json({ 
//             success: true,
//             message: "OK",
//             data: {
//                 user: user
//             }
//         });
//     } catch (error) {
//         console.error('Get me error', error);
//         return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
//     }
    
// });

module.exports = router;