require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit');
const supabase = require('../supabaseConfig');
const { generateRefreshToken, hashRefreshToken, setRefreshCookie, generateAccessToken, clearRefreshCookie } = require('../helpers/tokens.js');
const { requireAuth } = require('../middlewares/authRequired.js');
const { Resend } = require('resend');
const { generateSixDigitCode } = require('../helpers/generateSixDigitCode.js');
const getCooldownStatus = require('../helpers/getCooldownStatus.js');
const { generateVerificationEmail, generatePasswordResetEmail } = require('../helpers/emailTemplate.js');
const { VERIFICATION_TYPES, VERIFICATION_DELIVERY_METHODS } = require('../helpers/verificationTypes.js');
const Stripe = require('stripe');
const { checkAuth } = require('../middlewares/authOptional.js');
// const UAParser = require('ua-parser-js');

const resend = new Resend(process.env.RESEND_API_KEY);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ## Rate Limiting (ανά IP) -> Προστατεύει τον server από spam & network floods από DoS / Botnets
// ## Brute-force ανά Fingerprint -> Προστατεύει τον λογαριασμό από token/password guessing από Account takeover

// TODO: Atomic flow -> Postgres Transaction RPC (Create RPC function in Supabase and call it in NodeJS)
// Atomic flow είναι για να μην μένουν υπολείμματα όταν ένα Supabase query αποτύχει
// TODO: Check rate limiters 
// TODO: Check routing in front, 10 refresh requests goes to /auth

const baseRateLimiter = rateLimit({
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

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/check-user", baseRateLimiter, async (req, res) => {

    const { email, type } = req.body;

    const VALID_TYPES = Object.values(VERIFICATION_TYPES);

    if (!email || !type) {
        console.log("MISSING VALUES")
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    if (!emailRegex.test(email) || !VALID_TYPES.includes(type)) {
        console.log("INVALID VALUES");
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρες τιμές",
            code: "INVALID_VALUES"
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
            // console -> Δεν υπάρχει χρήστης
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει χρήστης με αυτό το email",
                code: "PR_USER_NOT_FOUND",
            });

        } else if(type === VERIFICATION_TYPES.SIGNUP && existingUser) {
            // Login
            return res.json({
                success: true,
                message: "ΟΚ",
                code: "USER_FOUND",
            });

        }

        // 2) Ελεγξε cooldown/ενεργό κωδικό
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
            // Reset Password
            return res.json({
                success: true,
                message: "ΟΚ",
                code: "PR_USER_FOUND",
                data: {
                    isCoolingDown, // true/false
                    remaining      // δευτερόλεπτα που απομένουν
                },
            });

        } else if(type === VERIFICATION_TYPES.SIGNUP && !existingUser){
            // Signup
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

        // VERIFICATION_TYPES.EMAIL_CHANGE 
        // VERIFICATION_TYPES.PHONE_CHANGE
        return res.status(400).json({
            success: false,
            message: "Λάθος τύποι",
            code: "INVALID_TYPES"
        });

    } catch (error) {
        console.error('Error checking user', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/send-code", baseRateLimiter, checkAuth, async (req, res) => {

    const { delivery_method, email, phone, type } = req.body;

    const VALID_TYPES = Object.values(VERIFICATION_TYPES);
    const VALID_DELIVERY_METHODS = Object.values(VERIFICATION_DELIVERY_METHODS);

    // -------------------------------
    // Validate inputs
    // -------------------------------
    if (!delivery_method || !type) {
        console.log("MISSING VALUES");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    if (!VALID_TYPES.includes(type) || !VALID_DELIVERY_METHODS.includes(delivery_method)) {
        console.log("INVALID VALUES");
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρες τιμές",
            code: "INVALID_VALUES"
        });
    }

    if (delivery_method === VERIFICATION_DELIVERY_METHODS.EMAIL && !email) {
        return res.status(400).json({
            success: false,
            message: "Το email είναι υποχρεωτικό για επαλήθευση με Email",
            code: "MISSING_EMAIL"
        });
    }

    if (delivery_method === VERIFICATION_DELIVERY_METHODS.SMS && !phone) {
        return res.status(400).json({
            success: false,
            message: "Το τηλέφωνο είναι υποχρεωτικό για επαλήθευση με SMS",
            code: "MISSING_PHONE"
        });
    }


    try {

        const { existedCode, isCoolingDown, remaining, error } = await getCooldownStatus(email, type);

        if(error){
            console.error("DB SELECT ERROR (verification_codes):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        }

        if (existedCode && isCoolingDown) {
            return res.status(200).json({
                success: true,
                message: "Υπάρχει χρόνος αναμονής.",
                code: "COOLDOWN",
                data: { remaining },
            });
        }

        // -------------------------------
        // Determine user_id
        // -------------------------------
        let currentEmail = null;
        let currentPhone = null;

        let userId = null;
        const loggedInUser = req.user;

        if (loggedInUser) {

            // Logged in → trust token
            userId = loggedInUser.id;

            // load full user info safely
            const { data: userData, error: userDataError } = await supabase
                .from("users")
                .select("email, phone")
                .eq("id", userId)
                .maybeSingle();

            if (userDataError || !userData) {
                console.error("DB SELECT ERROR (users):", userDataError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση users",
                    code: "DB_ERROR"
                });
            }

            currentEmail = userData.email;
            currentPhone = userData.phone;

        } else {
            // Not logged in → lookup depending on type
            switch (type) {
            case VERIFICATION_TYPES.SIGNUP:
                const { data: existingUser, error: checkError } = await supabase
                    .from("users")
                    .select("id")
                    .eq("email", email)
                    .maybeSingle();
                
                if (checkError) {
                    console.error("DB SELECT ERROR (users):", checkError);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ανάγνωση users",
                        code: "DB_ERROR",
                    });
                }
                
                if (existingUser) {
                    return res.status(409).json({
                        success: false,
                        message: "Αυτό το email χρησιμοποιείται ήδη",
                        code: "USER_FOUND_VT_SIGNUP"
                    });
                }

                userId = null;  // new user → no lookup
                break;

            case VERIFICATION_TYPES.PASSWORD_RESET:
                const { data: user, error: userError } = await supabase
                    .from("users")
                    .select("id")
                    .eq("email", email)
                    .maybeSingle();

                if(userError) {
                    console.error("DB SELECT ERROR (users):", userError);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ανάγνωση users",
                        code: "DB_ERROR",
                    });
                }

                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: "Δεν βρέθηκε χρήστης με αυτό το email",
                        code: "USER_NOT_FOUND_VT_PASSWORD_RESET"
                    });
                }

                userId = user.id;
                break;

            case VERIFICATION_TYPES.EMAIL_CHANGE:
            case VERIFICATION_TYPES.PHONE_CHANGE:
                return res.status(401).json({
                    success: false,
                    message: "Αυτή η ενέργεια χρειάζεται πιστοποίηση χρήστη",
                    code: "AUTH_REQUIRED"
                });

            default:
                return res.status(400).json({
                    success: false,
                    message: "Μη έγκυρος τύπος αιτήματος",
                    code: "INVALID_TYPE"
                });
            }
        }

        const code = generateSixDigitCode();
        const code_hash = await bcrypt.hash(code, 10);
        const expires_at = new Date(Date.now() + 10 * 60 * 1000);

        // Determine correct email/phone fields
        let dbEmail = null;
        let dbPhone = null;
        
        switch (type) {

            case VERIFICATION_TYPES.EMAIL_CHANGE:
                dbEmail = email;                // νέο email που θέλει να επιβεβαιώσει
                dbPhone = currentPhone ?? null; // ΠΑΝΤΑ από DB
                break;

            case VERIFICATION_TYPES.PHONE_CHANGE:
                dbPhone = phone;                // νέο phone που θέλει να επιβεβαιώσει
                dbEmail = currentEmail ?? null; // ΠΑΝΤΑ από DB
                break;

            default:
                dbEmail = delivery_method === VERIFICATION_DELIVERY_METHODS.EMAIL ? email : null;
                dbPhone = delivery_method === VERIFICATION_DELIVERY_METHODS.SMS ? phone : null;
                
        }

        // Prepare payload for DB
        const basePayload = {
            user_id: userId,
            email: dbEmail,
            phone: dbPhone,
            code_hash,
            delivery_method,
            type,
            expires_at,
            consumed: false,
            consumed_at: null,
            updated_at: new Date().toISOString(),
        };

        if(existedCode){
            // update
            const { error: updateError } = await supabase
                .from("verification_codes")
                .update([basePayload])
                .eq("email", email)
                .eq("type", type);

            if(updateError){
                console.error("DB UPDATE ERROR (verification_codes):", updateError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση verification_codes",
                    code: "DB_ERROR",
                });
            }
        } else {
            // insert
            const { error: insertError } = await supabase
                .from("verification_codes")
                .insert([basePayload]);

            if(insertError){
                console.error("DB INSERT ERROR (verification_codes):", insertError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση verification_codes",
                    code: "DB_ERROR",
                });
            }
        }

        
        if (delivery_method === VERIFICATION_DELIVERY_METHODS.SMS) {

            // TODO: Implement SMS sending with your SMS provider
            // await sendSMS(phone, `Logistok verification code: ${code}`);
            return res.status(501).json({
                success: false,
                message: "Η αποστολή SMS δεν είναι ακόμα διαθέσιμη",
                code: "SMS_NOT_IMPLEMENTED"
            });

        } else {

            const messages = {
                [VERIFICATION_TYPES.SIGNUP]: {
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

        }

        const newCooldownStatus = await getCooldownStatus(email, type);

        if(newCooldownStatus.error){
            console.error("DB SELECT ERROR (verification_codes):", newCooldownStatus.error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        }

        res.json({ 
            success: true, 
            message: `Ο κωδικός επαλήθευσης στάλθηκε με επιτυχία. Παρακαλώ ελέγξτε το ${delivery_method === VERIFICATION_DELIVERY_METHODS.SMS ? "κινητό" : "email"} σας.`,
            code: "VERIFICATION_CODE_SENT",
            data: { remaining: newCooldownStatus.remaining }
        });


    } catch (error) {
        console.error('Error sending code', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/password-reset", baseRateLimiter, async (req, res) => {
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
        if (new Date(otpRecord.expires_at) < new Date().toISOString()) {
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
                revoked_at: new Date().toISOString()
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
                    expires_at: expires_at.toISOString(),
                    last_login_at: new Date().toISOString(),
                    last_activity_at: new Date().toISOString(),
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
                    created_at: new Date().toISOString(),
                    last_login_at: new Date().toISOString(),
                    last_activity_at: new Date().toISOString(),
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

router.post("/signup", baseRateLimiter, async (req, res) => {

    const { email, phone, password, confirmPassword, verificationCode, fingerprint } = req.body;

    if ((!email && !phone) || !password || !confirmPassword || !verificationCode || !fingerprint) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {
        // ---------------------------------------------
        // 1. CHECK IF USER EXISTS
        // ---------------------------------------------

        let userQuery = supabase
            .from("users")
            .select("*");

        if (email) {
            userQuery = userQuery.eq("email", email);
        } else {
            userQuery = userQuery.eq("phone", phone);
        }

        const { data: userFound, error: userError } = await userQuery.maybeSingle();

        if (userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        };

        if(userFound){
            console.log("USER FOUND");
            return res.status(400).json({
                success: false,
                message: "Ο χρήστης υπάρχει",
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
        // 3. CHECK OTP
        // ---------------------------------------------
        let query = supabase
            .from("verification_codes")
            .select("*")
            .eq("type", VERIFICATION_TYPES.SIGNUP);

        // add email filter only if email was provided
        if (email) {
            query = query.eq("email", email);
        }

        // add phone filter only if phone was provided
        if (phone) {
            query = query.eq("phone", phone);
        }

        const { data: otpRecord, error: otpErr } = await query.maybeSingle();

        if (otpErr) {
            console.error("DB SELECT ERROR (verification_codes):", otpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση verification_codes",
                code: "DB_ERROR",
            });
        }

        if (!otpRecord) {
            console.log("NO VERIFICATION CODE RETURNED AFTER SELECT");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "OTP_NOT_FOUND",
            });
        }

        if (otpRecord.attempts >= 5) {
            return res.status(400).json({
                success: false,
                message: "Πάρα πολλές προσπάθειες. Ζητήστε νέο OTP.",
                code: "OTP_TOO_MANY_ATTEMPTS",
            });
        }

        // Always increase attempts immediately
        const { error: attemptsErr } = await supabase
            .from("verification_codes")
            .update({
                attempts: otpRecord.attempts + 1
            })
            .eq("id", otpRecord.id);

        if (attemptsErr) {
            console.error("DB UPDATE ERROR (attempts):", attemptsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση attempts",
                code: "DB_UPDATE_ERROR",
            });
        }

        const otpMatch = await bcrypt.compare(verificationCode, otpRecord.code_hash);

        if (!otpMatch || otpRecord.consumed) {
            console.log("INVALID OTP");
            return res.status(400).json({
                success: false,
                message: "Λάθος κωδικός OTP",
                code: "INVALID_OTP",
            });
        }

        // Check expiry
        if (new Date(otpRecord.expires_at) < new Date().toISOString()) {
            console.log("OTP EXPIRED");
            return res.status(400).json({
                success: false,
                message: "Ο κωδικός OTP έχει λήξει.",
                code: "OTP_EXPIRED",
            });
        }

        // Mark OTP as consumed
        const { error: consumeErr } = await supabase
            .from("verification_codes")
            .update({
                consumed: true,
                consumed_at: new Date().toISOString()
            })
            .eq("id", otpRecord.id);

        if (consumeErr) {
            console.error("DB UPDATE ERROR (consume):", consumeErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την κατανάλωση verification code",
                code: "DB_ERROR",
            });
        }

        // ---------------------------------------------
        // 4. CREATE USER
        // ---------------------------------------------
        
        const passwordHash = await bcrypt.hash(password, 10);

        const { data: userCreated, error: userErr } = await supabase
            .from("users")
            .insert([
                {
                    email: email || null,
                    phone: phone || null,
                    password_hash: passwordHash,
                    email_verified: !!email,
                    phone_verified: !!phone
                }
            ])
            .select()
            .single();

        if (userErr) {
            console.error("DB INSERT ERROR (users):", userErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία χρήστη",
                code: "DB_ERROR",
            });
        }

        console.log("USER CREATED:", userCreated.id);
        const userId = userCreated.id;

        // ---------------------------------------------
        // 5. CREATE USER SESSION
        // ---------------------------------------------
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        const { error: userSessionsError } = await supabase
            .from("user_sessions")
            .insert({
                user_id: userId,
                refresh_token_hash: refreshTokenHash,
                fingerprint,
                expires_at: expires_at.toISOString(),
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
        // SUCCESS
        // ---------------------------------------------
        return res.json({
            success: true,
            message: "Επιτυχής εγγραφή",
            data: {
                access_token: generateAccessToken(userId),

                user: {
                    email: userCreated.email,
                    phone: userCreated.phone,
                },

                companies: [],
            }
        });


    } catch (error) {
        console.error('Error signing up', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
})

router.post("/create-company", requireAuth, async (req, res) => {

    const userId = req.user.id;

    try {
        // ---------------------------------------------
        // 0. CHECK FOR INCOMPLETE ONBOARDING
        // ---------------------------------------------
        
        // Βρες όλες τις εταιρείες όπου ο χρήστης είναι owner
        const { data: ownedCompanies, error: ownedCompaniesError } = await supabase
            .from("company_users")
            .select("company_id")
            .eq("user_id", userId)
            .eq("is_owner", true);

        if (ownedCompaniesError) {
            console.error("DB SELECT ERROR (company_users):", ownedCompaniesError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση company_users",
                code: "DB_ERROR",
            });
        }

        // Αν έχει εταιρείες ως owner, έλεγξε το onboarding τους
        if (ownedCompanies && ownedCompanies.length > 0) {
            const companyIds = ownedCompanies.map(cu => cu.company_id);

            const { data: incompleteOnboarding, error: onboardingCheckError } = await supabase
                .from("onboarding")
                .select("company_id, current_step")
                .in("company_id", companyIds)
                .eq("is_completed", false)
                .limit(1)
                .maybeSingle();

            if (onboardingCheckError) {
                console.error("DB SELECT ERROR (onboarding):", onboardingCheckError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση onboarding",
                    code: "DB_ERROR",
                });
            }

            if (incompleteOnboarding) {
                console.log("USER HAS INCOMPLETE ONBOARDING:", incompleteOnboarding.company_id);
                return res.status(400).json({
                    success: false,
                    message: "Υπάρχει εταιρεία σε εξέλιξη. Παρακαλώ ολοκληρώστε το onboarding πριν δημιουργήσετε νέα εταιρεία.",
                    code: "ONBOARDING_INCOMPLETE",
                    data: {
                        company_id: incompleteOnboarding.company_id,
                        current_step: incompleteOnboarding.current_step
                    }
                });
            }
        }

        // ---------------------------------------------
        // 1. CREATE COMPANY
        // ---------------------------------------------

        const { data: companyCreated, error: companyErr } = await supabase
            .from("companies")
            .insert([{}])
            .select()
            .single();

        if (companyErr) {
            console.error("DB INSERT ERROR (companies):", companyErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία της εταιρείας",
                code: "DB_ERROR",
            });
        }

        console.log("COMPANY CREATED:", companyCreated.id);

        // ---------------------------------------------
        // 2. CREATE STORE
        // ---------------------------------------------
        const { data: storeCreated, error: storeErr } = await supabase
            .from("stores")
            .insert([{
                company_id: companyCreated.id
            }])
            .select()
            .single();

        if (storeErr) {
            console.error("DB INSERT ERROR (stores):", storeErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία αποθήκης",
                code: "DB_ERROR",
            });
        }

        console.log("STORE CREATED:", storeCreated.id);

        // ---------------------------------------------
        // 3. CREATE COMPANY USER
        // ---------------------------------------------
        const { data: cuCreated, error: cuErr } = await supabase
            .from("company_users")
            .insert([
                {
                    company_id: companyCreated.id,
                    user_id: userId,
                    is_owner: true,
                    status: "active"
                }
            ])
            .select("id, is_owner, status")
            .single();

        if (cuErr) {
            console.error("DB INSERT ERROR (company_users):", cuErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία company_users",
                code: "DB_ERROR",
            });
        }

        console.log("COMPANY USER CREATED:", cuCreated.id);

        // ---------------------------------------------
        // 4. SELECT DEFAULT ROLE (KEY=ADMIN)
        // ---------------------------------------------
        const { data: defaultRole, error: defaultRoleErr } = await supabase
            .from("default_roles")
            .select("key, name, description")
            .eq("key", "admin")
            .maybeSingle();

        if (defaultRoleErr) {
            console.error("DB SELECT ERROR (default_roles):", defaultRoleErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση default_roles",
                code: "DB_ERROR",
            });
        }

        if (!defaultRole) {
            console.log("DEFAULT ROLE 'admin' NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Ο default ρόλος admin δεν βρέθηκε",
                code: "ROLE_NOT_FOUND",
            });
        }

        // ---------------------------------------------
        // 5. CREATE ROLE
        // ---------------------------------------------

        const { data: roleCreated, error: roleErr } = await supabase
            .from("roles")
            .insert([
                {
                    company_id: companyCreated.id,
                    key: defaultRole.key,
                    name: defaultRole.name,
                    description: defaultRole.description
                }
            ])
            .select()
            .single();

        if (roleErr) {
            console.error("DB INSERT ERROR (roles):", roleErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία ρόλου",
                code: "DB_ERROR",
            });
        }

        console.log("ROLE CREATED:", roleCreated.id);

        // ---------------------------------------------
        // 6. SELECT DEFAULT ROLE PERMISSIONS (KEYS)
        // ---------------------------------------------
        const { data: defaultPermissions, error: defaultPermErr } = await supabase
            .from("default_role_permissions")
            .select("permission_key")
            .eq("default_role_key", defaultRole.key);

        if (defaultPermErr) {
            console.error("DB SELECT ERROR (default_role_permissions):", defaultPermErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση default_role_permissions",
                code: "DB_ERROR",
            });
        }

        if (!defaultPermissions || defaultPermissions.length === 0) {
            console.log("NO DEFAULT PERMISSIONS FOUND FOR ROLE:", defaultRole.key);
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκαν permissions για αυτόν τον default role",
                code: "PERMISSIONS_NOT_FOUND",
            });
        }

        // ---------------------------------------------
        // 7. SELECT PERMISSIONS (IDS)
        // ---------------------------------------------
        const permissionKeys = defaultPermissions.map(p => p.permission_key);

        const { data: permissions, error: permErr } = await supabase
            .from("permissions")
            .select("id, key")
            .in("key", permissionKeys);

        if (permErr) {
            console.error("DB SELECT ERROR (permissions):", permErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση permissions",
                code: "DB_ERROR",
            });
        }

         if (!permissions || permissions.length === 0) {
            console.log("NO PERMISSIONS FOUND:", permissionKeys);
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκαν permissions με αυτα τα permissionKeys",
                code: "PERMISSIONS_NOT_FOUND",
            });
        }

        // ---------------------------------------------
        // 8. CREATE ROLE PERMISSIONS
        // ---------------------------------------------
        const rolePermissionsData = permissions.map(p => ({
            role_id: roleCreated.id,
            permission_id: p.id,
            source: "default_role"
        }));

        const { error: rpErr } = await supabase
            .from("role_permissions")
            .insert(rolePermissionsData);

        if (rpErr) {
            console.error("DB INSERT ERROR (role_permissions):", rpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία role_permissions",
                code: "DB_ERROR",
            });
        }

        console.log("ROLE PERMISSIONS CREATED:", rolePermissionsData.length);

        // ---------------------------------------------
        // 9. UPDATE COMPANY USER
        // ---------------------------------------------
        const { error: cuUpdateErr } = await supabase
            .from("company_users")
            .update({
                role_id: roleCreated.id
            })
            .eq("company_id", companyCreated.id)
            .eq("user_id", userId);

        if (cuUpdateErr) {
            console.error("DB UPDATE ERROR (company_users):", cuUpdateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση company_users",
                code: "DB_ERROR",
            });
        }

        console.log("COMPANY USER UPDATED WITH ROLE:", roleCreated.id);

        // ---------------------------------------------
        // 10. CREATE ONBOARDING
        // ---------------------------------------------
        const { data: onboarding, error: onboardingErr } = await supabase
            .from("onboarding")
            .insert([
                {
                    company_id: companyCreated.id,
                    current_step: 1,
                    max_step_reached: 1,
                    is_completed: false
                }
            ])
            .select("current_step, max_step_reached, is_completed")
            .single();

        if (onboardingErr) {
            console.error("DB INSERT ERROR (onboarding):", onboardingErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία onboarding",
                code: "DB_ERROR",
            });
        }

        // ---------------------------------------------
        // 11. EXTRACT PERMISSIONS KEYS
        // ---------------------------------------------
        // Τα permissions έχουμε ήδη από το Step 7
        const perms = permissions.map(p => p.key);

        // ---------------------------------------------
        // SUCCESS - RETURN CONTEXTUAL TOKEN WITH PERMISSIONS
        // ---------------------------------------------
        return res.json({
            success: true,
            message: "Επιτυχής δημιουργία εταιρείας",
            data: {
                // Contextual token με permissions
                access_token: generateAccessToken(
                    userId, 
                    roleCreated.key, 
                    companyCreated.id, 
                    perms
                ),

                active_company: {
                    id: companyCreated.id,
                    name: companyCreated.name,

                    onboarding: {
                        current_step: onboarding.current_step,
                        max_step_reached: onboarding.max_step_reached,
                        is_completed: onboarding.is_completed
                    },

                    membership: {
                        is_owner: cuCreated.is_owner,
                        status: cuCreated.status,

                        role: {
                            id: roleCreated.id,
                            key: roleCreated.key,
                            name: roleCreated.name
                        },

                        permissions: perms,
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Error creating company', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
});

router.post("/login", baseRateLimiter, async (req, res) => {

    const { email, phone, password, fingerprint } = req.body;

    if ((!email && !phone) || !password || !fingerprint) {
        console.log("NO DATA RECEIVED");
        return res.status(400).json({
            success: false,
            message: "Δεν δόθηκαν τιμές",
            code: "MISSING_VALUES"
        });
    }

    try {

        // 1) Βρες τον χρήστη με email Ή phone
        let userQuery = supabase
            .from("users")
            .select("id, email, phone, password_hash, email_verified, phone_verified");

        if (email) {
            userQuery = userQuery.eq("email", email);
        } else {
            userQuery = userQuery.eq("phone", phone);
        }

        const { data: user, error: userError } = await userQuery.maybeSingle();

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

        const userId = user.id;

        // 2) Έλεγχος verification
        if(email && !user.email_verified){
            console.log("EMAIL NOT VERIFIED");
            return res.status(403).json({
                success: false,
                message: "Δεν έχει γίνει επαλήθευση email",
                code: "EMAIL_NOT_VERIFIED",
            });
        }

        if(phone && !user.phone_verified){
            console.log("PHONE NOT VERIFIED");
            return res.status(403).json({
                success: false,
                message: "Δεν έχει γίνει επαλήθευση τηλεφώνου",
                code: "PHONE_NOT_VERIFIED",
            });
        }

        // 3) Password check
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            console.log("WRONG PASSWORD");
            return res.status(401).json({ 
                success: false, 
                message: "Λάθος κωδικός", 
                code: "WRONG_PASSWORD" 
            });
        }

        // 4) Φέρε τις εταιρείες του χρήστη
        const { data: companyUsers, error: companyUsersError } = await supabase
            .from('company_users')
            .select('company_id, role_id, is_owner, status')
            .eq('user_id', userId);

        if (companyUsersError){
            console.error("DB SELECT ERROR (company_users):", companyUsersError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση company_users",
                code: "DB_ERROR",
            });
        };

        let companiesPayload = [];
        if(companyUsers){

            const companyIds = companyUsers.map(cu => cu.company_id);
            const roleIds = companyUsers.map(cu => cu.role_id);

            // 5) Φέρε τις εταιρείες
            const { data: companies, error: companiesErr } = await supabase
                .from("companies")
                .select("id, name")
                .in("id", companyIds);

            if (companiesErr) {
                console.error("DB SELECT ERROR (companies):", companiesErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση companies",
                    code: "DB_ERROR",
                });
            }
            
            if(!companies){
                console.log("NONE COMPANY FOUND");
                return res.status(404).json({
                    success: false,
                    message: "Δεν βρέθηκε καμία εταιρεία",
                    code: "COMPANIES_NOT_FOUND",
                });
            }

            // 6) Φέρε roles
            const { data: roles, error: rolesErr } = await supabase
                .from("roles")
                .select("id, key, name")
                .in("id", roleIds);

            if (rolesErr) {
                console.error("DB SELECT ERROR (roles):", rolesErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση roles",
                    code: "DB_ERROR",
                });
            }

            // 7) Φέρε permissions ανά ρόλο
            const { data: rolePermissions, error: rolePermErr } = await supabase
                .from("role_permissions")
                .select("role_id, permissions(key)")
                .in("role_id", roleIds);

            if (rolePermErr) {
                console.error("DB SELECT ERROR (role_permissions):", rolePermErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ανάγνωση role_permissions",
                    code: "DB_ERROR",
                });
            }

            // 8) Φέρε όλα τα onboarding για τις εταιρείες
            const { data: onboardingList, error: onboardingErr } = await supabase
                .from("onboarding")
                .select("company_id, current_step, max_step_reached, is_completed")
                .in("company_id", companyIds);

            if (onboardingErr) {
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα ανάγνωσης onboarding",
                    code: "DB_ERROR_ONBOARDING",
                });
            }

            // ---- LOOKUP MAPS ----

            // Companies lookup
            const companiesById = {};
            companies.forEach(c => {
                companiesById[c.id] = c;
            });

            // Roles lookup
            const rolesById = {};
            roles.forEach(r => {
                rolesById[r.id] = r;
            });

            // Permissions by role lookup
            const permissionsByRole = {};
            rolePermissions.forEach(rp => {
                if (!permissionsByRole[rp.role_id]) {
                    permissionsByRole[rp.role_id] = [];
                }

                // case 1: { permissions: { key: "xxx" } }
                if (rp.permissions?.key) {
                    permissionsByRole[rp.role_id].push(rp.permissions.key);
                    return;
                }

                // case 2: { permissions: [ { key: "xxx" }, { key: "yyy" } ] }
                if (Array.isArray(rp.permissions)) {
                    rp.permissions.forEach(p => permissionsByRole[rp.role_id].push(p.key));
                }
            });

            // Onboarding lookup
            const onboardingMap = {};
            onboardingList?.forEach(o => {
                onboardingMap[o.company_id] = {
                    current_step: o.current_step,
                    max_step_reached: o.max_step_reached,
                    is_completed: o.is_completed
                };
            });

            // ---- BUILD FINAL PAYLOAD ----

            // 9) Χτίσε το τελικό companies payload
            companiesPayload = companyUsers.map(cu => {

                const company = companiesById[cu.company_id];
                const role = rolesById[cu.role_id];
                const permsForRole = permissionsByRole[cu.role_id] ?? [];

                const onboarding = onboardingMap[cu.company_id] ?? {
                    current_step: 1,
                    max_step_reached: 1,
                    is_completed: false
                };

                return {
                    id: company.id,
                    name: company.name,

                    onboarding,

                    membership: {
                        is_owner: cu.is_owner,
                        status: cu.status,

                        role: {
                            id: role.id,
                            key: role.key,
                            name: role.name
                        },

                        permissions: permsForRole
                    }
                };
            });
        }

        // 10) Sessions / refresh token όπως τα είχες

        // TODO: Πάρε info συσκευής
        // const parser = new UAParser(req.headers["user-agent"]);
        // const ua = parser.getResult();

        // const deviceName = ua.device.model || "Desktop";
        // const browser = ua.browser.name || "Unknown Browser";
        // const os = ua.os.name || "Unknown OS";
        
        // create or update session + refresh cookie
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        // Παλιές συσκευές -> revoke
        const { error: revokeOldSessionsError } = await supabase
            .from("user_sessions")
            .update({ 
                revoked: true,
                revoked_at: new Date().toISOString()
            })
            .eq("user_id", userId)
            .neq("fingerprint", fingerprint);

        if (revokeOldSessionsError){
            console.error("DB UPDATE ERROR (user_sessions):", revokeOldSessionsError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση user_sessions",
                code: "DB_ERROR",
            });
        };

        // Έλεγχος υπάρχοντος session για το συγκεκριμένο fingerprint
        const { data: existingSessions, error: existingSessionsError } = await supabase
            .from("user_sessions")
            .select("id")
            .eq("user_id", userId)
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
                    expires_at: expires_at.toISOString(),
                    last_login_at: new Date().toISOString(),
                    last_activity_at: new Date().toISOString(),
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
                    user_id: userId,
                    refresh_token_hash: refreshTokenHash,
                    fingerprint,
                    expires_at: expires_at
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

        // -------------------------------------
        // 11) RETURN RESPONSE
        // -------------------------------------
        return res.json({
            success: true,
            message: "OK",
            data: {
                access_token: generateAccessToken(userId),

                user: {
                    email: user.email,
                    phone: user.phone
                },

                companies: companiesPayload
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
    // const allowedOrigins = [
    //     "https://logistok.com",
    //     "https://logistok.gr",
    //     "https://app.logistok.com",
    //     "https://app.logistok.gr",
    //     "http://localhost:5173",
    //     "http://localhost:3000"
    // ];

    // const origin = req.headers.origin || "";
    // if (!origin || !allowedOrigins.includes(origin)) {
    //     console.log("NOT ALLOWED ORIGIN");
    //     return res.status(403).json({
    //         success: false,
    //         message: 'Αποτυχία διακομιστή.',
    //         code: "SERVER_ERROR"
    //     });
    // }
    // --

    const refreshToken = req.cookies.refresh_token;
    const { companyId } = req.body; // Optional - για contextual refresh

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

        // 1) Find and validate session
        const { data: session, error: sessionError } = await supabase
            .from("user_sessions")
            .select("id, user_id")
            .eq("refresh_token_hash", refreshHash)
            .eq("revoked", false)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();

        if (sessionError) {
            console.error("DB SELECT ERROR (user_sessions):", sessionError);
            clearRefreshCookie(res);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        }

        if (!session) {
            console.log("SESSION INVALID OR EXPIRED");
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'Έληξε η σύνδεση',
                code: "UNAUTHORIZED"
            });
        }

        const userId = session.user_id;

        // 2) Rotate refresh token
        const newRefreshToken = generateRefreshToken();
        const newHash = hashRefreshToken(newRefreshToken);

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        const { error: updateError } = await supabase
            .from("user_sessions")
            .update({
                refresh_token_hash: newHash,
                expires_at: expires_at.toISOString(),
                last_activity_at: new Date().toISOString()
            })
            .eq("id", session.id);

        if (updateError) {
            console.error("DB UPDATE ERROR (user_sessions):", updateError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση session",
                code: "DB_ERROR"
            });
        }

        // 3) Set new refresh cookie
        setRefreshCookie(res, newRefreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        // 4) Check if contextual refresh requested
        if (!companyId) {
            // NAKED TOKEN - No company context
            return res.json({
                success: true,
                data: {
                    access_token: generateAccessToken(userId)
                }
            });
        }

        // 5) CONTEXTUAL TOKEN - Fetch company context
        
        // 5.1) Verify user has access to this company
        const { data: companyUser, error: cuError } = await supabase
            .from("company_users")
            .select("role_id, status")
            .eq("user_id", userId)
            .eq("company_id", companyId)
            .maybeSingle();

        if (cuError) {
            console.error("DB SELECT ERROR (company_users):", cuError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση company_users",
                code: "DB_ERROR",
            });
        }

        if (!companyUser) {
            console.log("USER NOT IN COMPANY:", userId, companyId);
            // User doesn't have access - return naked token
            return res.json({
                success: true,
                data: {
                    access_token: generateAccessToken(userId)
                }
            });
        }

        if (companyUser.status !== 'active') {
            console.log("USER NOT ACTIVE IN COMPANY:", userId, companyId);
            // User is disabled - return naked token
            return res.json({
                success: true,
                data: {
                    access_token: generateAccessToken(userId)
                }
            });
        }

        // 5.2) Get role
        const { data: role, error: roleError } = await supabase
            .from("roles")
            .select("key")
            .eq("id", companyUser.role_id)
            .maybeSingle();

        if (roleError) {
            console.error("DB SELECT ERROR (roles):", roleError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση roles",
                code: "DB_ERROR",
            });
        }

        if (!role) {
            console.log("ROLE NOT FOUND:", companyUser.role_id);
            // No role - return naked token
            return res.json({
                success: true,
                data: {
                    access_token: generateAccessToken(userId)
                }
            });
        }

        // 5.3) Get permissions
        const { data: rolePermissions, error: permError } = await supabase
            .from("role_permissions")
            .select("permissions(key)")
            .eq("role_id", companyUser.role_id);

        if (permError) {
            console.error("DB SELECT ERROR (role_permissions):", permError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση permissions",
                code: "DB_ERROR",
            });
        }

        const permissions = rolePermissions.flatMap(rp => {
            if (!rp.permissions) return [];

            // CASE 1: permissions = { key: "xxx" }
            if (rp.permissions.key) return [rp.permissions.key];

            // CASE 2: permissions = [ {key:"xxx"}, {key:"yyy"} ]
            if (Array.isArray(rp.permissions)) {
                return rp.permissions.map(p => p.key);
            }

            return [];
        });

        // 6) Return CONTEXTUAL access token
        return res.json({
            success: true,
            data: {
                access_token: generateAccessToken(userId, role.key, companyId, permissions)
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
                    revoked_at: new Date().toISOString(),
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
                revoked_at: new Date().toISOString()
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

router.post("/switch-company", requireAuth, async (req, res) => {
    const { companyId } = req.body;
    const userId = req.user.id;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "companyId is required",
            code: "MISSING_COMPANY_ID"
        });
    }

    try {
        // 1) Έλεγξε ότι ο χρήστης ανήκει στην εταιρεία
        const { data: membership, error: membershipErr } = await supabase
            .from("company_users")
            .select("role_id, is_owner")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .maybeSingle();

        if (membershipErr) {
            console.error("DB ERROR (company_users):", membershipErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τον έλεγχο πρόσβασης",
                code: "DB_ERROR"
            });
        }

        if (!membership) {
            return res.status(403).json({
                success: false,
                message: "Δεν έχετε πρόσβαση σε αυτή την εταιρεία",
                code: "FORBIDDEN"
            });
        }

        const roleId = membership.role_id;

        // 2) Πάρε τον ρόλο
        const { data: roleData, error: roleErr } = await supabase
            .from("roles")
            .select("id, key")
            .eq("id", roleId)
            .maybeSingle();

        if (roleErr || !roleData) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση ρόλου",
                code: "DB_ERROR_ROLE"
            });
        }
        
        // 3) Πάρε permissions του ρόλου
        const { data: rolePerms, error: permsErr } = await supabase
            .from("role_permissions")
            .select("permissions(key)")
            .eq("role_id", roleData.id);

        if (permsErr) {
            console.error("DB ERROR (role_permissions):", permsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση permissions",
                code: "DB_ERROR_PERMISSIONS"
            });
        }

        const permissions = rolePerms
            .map(rp => rp.permissions?.key)
            .filter(Boolean); // Χωρίς το .filter(Boolean) μπορεί να επιστρέψει με: ["sales.read", undefined, null]

        // 4) Φτιάξε contextual access token
        const access_token = generateAccessToken(
            userId,
            companyId,
            roleData.key,
            permissions
        );

        // 5) Return response
        return res.json({
            success: true,
            message: "Επιτυχής αλλαγή εταιρείας",
            data: {
                access_token
            }
        });

    } catch (err) {
        console.error("SWITCH-COMPANY SERVER ERROR:", err);

        return res.status(500).json({
            success: false,
            message: "Server Error",
            code: "SERVER_ERROR"
        });
    }
});

router.get("/me", requireAuth, async (req, res) => {

    const userId = req.user.id;

    try {
        // User
        const { data: user, error: userErr } = await supabase
            .from("users")
            .select("id, email, phone")
            .eq("id", userId)
            .maybeSingle();

        if (userErr || !user) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης χρήστη",
                code: "DB_ERROR_USER"
            });
        }

        // 4) Φέρε τις εταιρείες του χρήστη
        const { data: companyUsers, error: companyUsersError } = await supabase
            .from('company_users')
            .select('company_id, role_id, is_owner, status')
            .eq('user_id', userId);

        if (companyUsersError){
            console.error("DB SELECT ERROR (company_users):", companyUsersError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση company_users",
                code: "DB_ERROR",
            });
        };

        if(!companyUsers || companyUsers.length === 0){
            return res.json({
                success: true,
                message: "Επιτυχής λήψη στοιχείων χρήστη με καμία εταιρεία",
                data: {
                    user: {
                        email: user.email,
                        phone: user.phone
                    },
                    companies: []
                }
            });
        }

        const companyIds = companyUsers.map(cu => cu.company_id);
        const roleIds = companyUsers.map(cu => cu.role_id);

        // 5) Φέρε τις εταιρείες
        const { data: companies, error: companiesErr } = await supabase
            .from("companies")
            .select("id, name")
            .in("id", companyIds);

        if (companiesErr) {
            console.error("DB SELECT ERROR (companies):", companiesErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση companies",
                code: "DB_ERROR",
            });
        }
        
        if(!companies){
            console.log("NONE COMPANY FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε καμία εταιρεία",
                code: "COMPANIES_NOT_FOUND",
            });
        }

        // 6) Φέρε roles
        const { data: roles, error: rolesErr } = await supabase
            .from("roles")
            .select("id, key, name")
            .in("id", roleIds);

        if (rolesErr || !roles) {
            console.error("DB SELECT ERROR (roles):", rolesErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση roles",
                code: "DB_ERROR",
            });
        }

        // 7) Φέρε permissions ανά ρόλο
        const { data: rolePermissions, error: rolePermErr } = await supabase
            .from("role_permissions")
            .select("role_id, permissions(key)")
            .in("role_id", roleIds);

        if (rolePermErr || !rolePermissions) {
            console.error("DB SELECT ERROR (role_permissions):", rolePermErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση role_permissions",
                code: "DB_ERROR",
            });
        }

        // 8) Φέρε όλα τα onboarding για τις εταιρείες
        const { data: onboardingList, error: onboardingErr } = await supabase
            .from("onboarding")
            .select("company_id, current_step, max_step_reached, is_completed")
            .in("company_id", companyIds);

        if (onboardingErr) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης onboarding",
                code: "DB_ERROR_ONBOARDING",
            });
        }

        // ---- LOOKUP MAPS ----

        // Companies lookup
        const companiesById = {};
        companies.forEach(c => {
            companiesById[c.id] = c;
        });

        // Roles lookup
        const rolesById = {};
        roles.forEach(r => {
            rolesById[r.id] = r;
        });

        // Permissions by role lookup
        const permissionsByRole = {};
        rolePermissions.forEach(rp => {
            if (!permissionsByRole[rp.role_id]) {
                permissionsByRole[rp.role_id] = [];
            }

            // case 1: { permissions: { key: "xxx" } }
            if (rp.permissions?.key) {
                permissionsByRole[rp.role_id].push(rp.permissions.key);
                return;
            }

            // case 2: { permissions: [ { key: "xxx" }, { key: "yyy" } ] }
            if (Array.isArray(rp.permissions)) {
                rp.permissions.forEach(p => permissionsByRole[rp.role_id].push(p.key));
            }
        });

        // Onboarding lookup
        const onboardingMap = {};
        onboardingList?.forEach(o => {
            onboardingMap[o.company_id] = {
                current_step: o.current_step,
                max_step_reached: o.max_step_reached,
                is_completed: o.is_completed
            };
        });

        // ---- BUILD FINAL PAYLOAD ----

        // 9) Χτίσε το τελικό companies payload
        const companiesPayload = companyUsers.map(cu => {

            const company = companiesById[cu.company_id];
            const role = rolesById[cu.role_id];
            const permsForRole = permissionsByRole[cu.role_id] ?? [];

            const onboarding = onboardingMap[cu.company_id] ?? {
                current_step: 1,
                max_step_reached: 1,
                is_completed: false
            };

            return {
                id: company.id,
                name: company.name,

                onboarding,

                membership: {
                    is_owner: cu.is_owner,
                    status: cu.status,

                    role: {
                        id: role.id,
                        key: role.key,
                        name: role.name
                    },

                    permissions: permsForRole
                }
            };
        });


        // Return only user & companies
        return res.json({
            success: true,
            message: "Επιτυχής λήψη στοιχείων χρήστη με εταρείες",
            data: {
                user: {
                    email: user.email,
                    phone: user.phone
                },
                companies: companiesPayload
            }
        });

    } catch (err) {
        console.error("ME ERROR:", err);

        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});


module.exports = router;