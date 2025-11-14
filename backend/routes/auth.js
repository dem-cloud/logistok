require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs')
const rateLimit = require('express-rate-limit');
const supabase = require('../supabaseConfig');
const { generateRefreshToken, hashRefreshToken, setRefreshCookie, generateAccessToken, verifyRefreshToken, clearRefreshCookie } = require('../helpers/tokens.js');
const requireAuth = require('../middlewares/authMiddleware');
const { Resend } = require('resend');
const verificationRateLimiter = require('../middlewares/verificationRateLimiter.js');
const { generateSixDigitCode } = require('../helpers/generateSixDigitCode.js');
const getCooldownStatus = require('../helpers/getCooldownStatus.js');
const { generateVerificationEmail, generatePasswordResetEmail } = require('../helpers/emailTemplate.js');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode.js');
const { VERIFICATION_TYPES } = require('../helpers/verificationTypes.js');
// const UAParser = require('ua-parser-js');

const resend = new Resend(process.env.RESEND_API_KEY);

// ## Rate Limiting (ανά IP) -> Προστατεύει τον server από spam & network floods από DoS / Botnets
// ## Brute-force ανά Fingerprint -> Προστατεύει τον λογαριασμό από token/password guessing από Account takeover

// TODO: Atomic flow -> Postgres Transaction RPC (Create RPC function in Supabase and call it in NodeJS)
// Atomic flow είναι για να μην μένουν υπολείμματα όταν ένα Supabase query αποτύχει
// TODO: Check rate limiters 
const loginRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 5, // max 5 attempts
    message: { error: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
});

const refreshRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 λεπτό
    max: 10, // max 10 αιτήματα / λεπτό ανά IP
    message: { error: "Too many refresh attempts. Please wait." },
    standardHeaders: true,
    legacyHeaders: false,
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

        if (existingUser) {
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
        return res.json({
            success: true,
            message: "ΟΚ",
            code: "USER_NOT_FOUND",
            data: {
                isCoolingDown, // true/false
                remaining      // δευτερόλεπτα που απομένουν
            },
        });


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
            .eq("type", "email_verify")
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
                    first_name: userInsert.first_name,
                    last_name: userInsert.last_name
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
            .select('id, email, first_name, last_name, password_hash')
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

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            console.log("WRONG PASSWORD");
            return res.status(401).json({ 
                success: false, 
                message: "Λάθος κωδικός", 
                code: "WRONG_PASSWORD" 
            });
        }

        // TODO: Πάρε info συσκευής
        // const parser = new UAParser(req.headers["user-agent"]);
        // const ua = parser.getResult();

        // const deviceName = ua.device.model || "Desktop";
        // const browser = ua.browser.name || "Unknown Browser";
        // const os = ua.os.name || "Unknown OS";
        
        // create session + refresh cookie
        const refreshToken = generateRefreshToken();
        const refreshTokenHash = hashRefreshToken(refreshToken);

        // 1) Παλιές συσκευές → revoke
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
            // Υπάρχει session για αυτή τη συσκευή → ανανέωσε το token
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
            // Νέα συσκευή → δημιουργία session
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
                    last_name: user.last_name
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

    // -- Anti-CSRF: έλεγξε Origin/Referer (προαιρετικό αλλά συνισταται)
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
    const { fingerprint } = req.body || {};

    if ( !refreshToken || !fingerprint ) {
        console.log("UNAUTHORIZED");
        return res.status(401).json({ 
            success: false, 
            message: 'Έληξε η σύνδεση.', 
            code: "UNAUTHORIZED"
        });
    }

    try {
        // 1) Βρες τo πιο πρόσφατo session με αυτό το fingerprint
        const { data: session, error: sessionError } = await supabase
            .from("user_sessions")
            .select("id, user_id, refresh_token_hash, revoked, expires_at")
            .eq("fingerprint", fingerprint)
            .order("created_at", { ascending: false })
            .maybeSingle();

        if (sessionError){
            console.error("DB SELECT ERROR (user_sessions):", sessionError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        };

        // 2) Έλεγχος αν έχει λήξει ή είναι revoked ή δεν υπάρχει
        if (!session || session.revoked || new Date(session.expires_at) < new Date()) {
            console.log("SESSION NOT FOUND OR REVOKED OR EXPIRED");
            return res.status(401).json({ 
                success: false, 
                message: 'Έληξε η σύνδεση', 
                code: "UNAUTHORIZED"
            });
        }

        // 3) Έλεγχος refresh token integrity
        const match = verifyRefreshToken(refreshToken, session.refresh_token_hash);
        if (!match) {
            // πιθανή κλοπή token → revoke όλα τα sessions
            const { error: updateRevokeError } = await supabase
                .from("user_sessions")
                .update({ 
                    revoked: true,
                    revoked_at: new Date()
                })
                .eq("user_id", session.user_id);

            if (updateRevokeError){
                console.error("DB UPDATE ERROR (user_sessions):", updateRevokeError);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση user_sessions",
                    code: "DB_ERROR",
                });
            };

            clearRefreshCookie(res);

            console.log("TOKEN COMPROMIZED");
            return res.status(401).json({ // Token compromised, forced logout
                success: false, 
                message: 'Έληξε η σύνδεση.', 
                code: "UNAUTHORIZED"
            });
        }

        // 4) ROTATION
        const newRefreshToken = generateRefreshToken();
        const newHash = hashRefreshToken(newRefreshToken);

        const expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        const { error: updateError } = await supabase
            .from("user_sessions")
            .update({
                refresh_token_hash: newHash,
                expires_at: expires_at,
                last_activity_at: new Date(),
            })
            .eq("id", session.id);

        if (updateError){
            console.error("DB UPDATE ERROR (user_sessions):", updateError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση user_sessions",
                code: "DB_ERROR",
            });
        };

        // 5) Set updated refresh cookie
        setRefreshCookie(res, newRefreshToken, Number(process.env.REFRESH_TOKEN_LIFETIME_DAYS));

        // 6) Return new access token
        return res.json({
            success: true,
            message: "OK",
            data: {
                access_token: generateAccessToken(session.user_id),
            }
        });

    } catch (error) {
        console.error("Refresh error:", error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
});

// --- LOGOUT current device ---
router.post("/logout", async (req, res) => {

    const refreshToken = req.cookies.refresh_token;
    const { fingerprint } = req.body || {};

    if (!refreshToken || !fingerprint) {
        clearRefreshCookie(res);
        return res.json({ 
            success: true, 
            message: "Logged out" 
        });
    }


    try {
        // Βρες session για τη συσκευή
        const { data: session, error } = await supabase
            .from("user_sessions")
            .select("id, refresh_token_hash, revoked, expires_at")
            .eq("fingerprint", fingerprint)
            .order("created_at", { ascending: false })
            .maybeSingle();

        if (error){
            console.error("DB SELECT ERROR (user_sessions):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση user_sessions",
                code: "DB_ERROR",
            });
        };

        if (session) {
            // 1) Αν το session είναι ήδη revoked ή expired — απλώς προχωράμε
            const expired = new Date(session.expires_at) < new Date();
            if (!session.revoked && !expired) {
                // 2) Επιβεβαίωση ότι ο refresh token ταιριάζει
                const match = verifyRefreshToken(refreshToken, session.refresh_token_hash);
                if (match) {
                    // 3) Κάνε revoke ΜΟΝΟ αν υπάρχει λόγος
                    const { error: sessionUpdateError} = await supabase
                        .from("user_sessions")
                        .update({ 
                            revoked: true,
                            revoked_at: new Date()
                        })
                        .eq("id", session.id);

                    if (sessionUpdateError){
                        console.error("DB UPDATE ERROR (user_sessions):", sessionUpdateError);
                        return res.status(500).json({
                            success: false,
                            message: "Σφάλμα κατά την ενημέρωση user_sessions",
                            code: "DB_ERROR",
                        });
                    };
                }
            }
        }

        // 4) Καθάρισε cookie οπωσδήποτε
        clearRefreshCookie(res);

        return res.json({
            success: true,
            message: "Logged out",
        });

    } catch (err) {
        console.error("Logout error:", err);
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
router.get("/me", requireAuth, async (req, res) => {

    const userId = req.user.id;

    try {
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("email, first_name, last_name")
            .eq("id", userId)
            .single();

        if (userError){
            console.error("DB SELECT ERROR (users):", userError);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση users",
                code: "DB_ERROR",
            });
        };

        if(!user){
            console.error("USER NOT FOUND");
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε χρήστης",
                code: "USER_NOT_FOUND",
            });
        }

        res.json({ 
            success: true,
            message: "OK",
            data: {
                user,
            }
        });
    } catch (error) {
        console.error('Get me error', error);
        return res.status(500).json({ success: false, message: 'Αποτυχία διακομιστή. Προσπαθήστε ξανά.', code: "SERVER_ERROR" });
    }
    
});

module.exports = router;