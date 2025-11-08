// shared.js
require('dotenv').config();
const express = require('express');
const router = express.Router();

const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid'); // Generate unique subscription codes
const jwt = require('jsonwebtoken')

// const sgMail = require('@sendgrid/mail');
const { Resend } = require('resend');
const supabase = require('../supabaseConfig');

// Set up SendGrid API Key
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);

// Routes
router.post('/signup', async (req, res) => {
    try {
        const { email, first_name, last_name, password } = req.body;

        // Check if email already exists
        const { data: existingUser, error: emailCheckError } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (emailCheckError) {
            return res.status(500).json({ success: false, message: 'Error checking existing email' });
        }

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Το email είναι ήδη κατοχυρωμένο.' });
        }

        // Generate a random subscription code (UUID)
        const subscriptionCode = uuidv4(); 

        // 1. Create Subscription with subscription_code directly
        const { data: subscription, error: subscriptionError } = await supabase
            .from('subscriptions')
            .insert([{ subscription_code: subscriptionCode }])
            .select('id')
            .single();

        if (subscriptionError || !subscription) {
            return res.status(500).json({ success: false, message: 'Error inserting subscription data' });
        }

        const subscriptionId = subscription.id;

        // Generate JWT Token for email verification
        const verificationToken = jwt.sign(
            { email, subscriptionId },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        // Send verification email with Resend
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

        const msg = {
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
            to: email,
            subject: 'Your Logistok Account - Verify Your Email Address',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Click the button below to verify your email address for your Logistok account:</p>
                <a href="${verificationLink}" 
                    style="
                    display: inline-block;
                    background-color: #1e40af;
                    color: #ffffff;
                    padding: 12px 20px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    ">
                    Verify Email
                </a>
                <p style="margin-top: 20px;">This link will expire in 24 hours.</p>
                <p>If the button doesn’t work, copy and paste this link into your browser:</p>
                <p><a href="${verificationLink}">${verificationLink}</a></p>
                </div>
            `,
        };

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Create User
        const { error: usersError } = await supabase
            .from('users')
            .insert([
                {
                    email,
                    email_verified: false,
                    password_hash: hashedPassword,
                    first_name,
                    last_name,
                    role: "Admin",
                    subscription_id: subscriptionId
                }
            ]);

        if (usersError) {
            // Rollback: Delete subscription if user creation fails
            // await supabase.from('subscriptions').delete().eq('id', subscriptionId);
            return res.status(500).json({ success: false, message: 'Error inserting user data' });
        }

        try {
            // await sgMail.send(msg);
            await resend.emails.send(msg);
            res.json({ success: true, message: 'Επιτυχής δημιουργία λογαριασμού! Παρακαλώ ελέγξτε το email σας για επιβεβαίωση.' });
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            res.status(500).json({ success: false, message: 'Failed to send email. Please try again.' });
        }


    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

router.post('/resend-verification-link', async (req, res) => {
    try {
        const { email } = req.body;

        // Check if email already exists
        const { data: existingUser, error: emailCheckError } = await supabase
            .from('users')
            .select('id, subscription_id, email_verified')
            .eq('email', email)
            .maybeSingle();

        if (emailCheckError) {
            return res.status(500).json({ success: false, message: 'Error checking existing email' });
        }

        if (!existingUser) {
            return res.status(400).json({ success: false, message: 'Το email δεν είναι κατοχυρωμένο.' });
        }

        if (existingUser.email_verified) {
            return res.status(400).json({ success: false, message: 'Το email έχει ήδη επαληθευτεί.' });
        }

        // Generate JWT Token for email verification
        const verificationToken = jwt.sign(
            { email, subscriptionId: existingUser.subscription_id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } // Token expires in 24 hours
        );

        // Send verification email with Resend
        const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

        const msg = {
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
            to: email,
            subject: 'Your Logistok Account - Verify Your Email Address',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <p>Click the button below to verify your email address for your Logistok account:</p>
                <a href="${verificationLink}" 
                    style="
                    display: inline-block;
                    background-color: #1e40af;
                    color: #ffffff;
                    padding: 12px 20px;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                    ">
                    Verify Email
                </a>
                <p style="margin-top: 20px;">This link will expire in 24 hours.</p>
                <p>If the button doesn’t work, copy and paste this link into your browser:</p>
                <p><a href="${verificationLink}">${verificationLink}</a></p>
                </div>
            `,
        };


        try {
            // await sgMail.send(msg);
            await resend.emails.send(msg);
            res.json({ success: true, message: 'Ο σύνδεσμος επαλήθευσης email στάλθηκε με επιτυχία. Παρακαλώ ελέγξτε το email σας.' });
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            res.status(500).json({ success: false, message: 'Failed to send email. Please try again.' });
        }

    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        // const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(400).json({ success: false, message: 'Missing token' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { email, subscriptionId } = decoded;

        // Check if the user exists
        const { data: user, error: userCheckError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', email)
            .eq('subscription_id', subscriptionId)
            .single();

        if (!user || userCheckError) {
            return res.status(400).json({ success: false, message: 'Invalid verification link' });
        }

        // Check if email is already verified
        if (user.email_verified) {
            return res.status(200).json({ success: true, message: 'Το email έχει ήδη επαληθευτεί.' });
        }

        // const supabase2 = createClient(SUPABASE_URL, SUPABASE_KEY, {
        //     global: {
        //       headers: {
        //         Authorization: `Bearer ${req.token}`,  // Pass the token here
        //       },
        //     },
        // });

        // Update email_verified status
        const { data, error: updateError } = await supabase
            .from('users')
            .update({ email_verified: true })
            .eq('id', user.id)
            .eq('subscription_id', subscriptionId);

        if (updateError) {
            return res.status(500).json({ success: false, message: 'Error verifying email' });
        }

        res.status(200).json({ success: true, message: 'Το email επαληθεύτηκε επιτυχώς. Μπορείτε τώρα να συνδεθείτε.' });

    } catch (error) {
        // console.error('Email verification error:', error);
        res.status(500).json({ success: false, message: 'Invalid or expired token' });
    }
});


router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        // Check if email already exists
        const { data: existingUser, error: emailCheckError } = await supabase
            .from('users')
            .select('id, subscription_id')
            .eq('email', email)
            .maybeSingle();

        if (emailCheckError) {
            return res.status(500).json({ success: false, message: 'Error checking existing email' });
        }

        if (!existingUser) {
            return res.status(400).json({ success: false, message: 'Το email δεν είναι κατοχυρωμένο.' });
        }

        const subscriptionId = existingUser.subscription_id;

        // Generate JWT Token for reset password
        const tokenId = crypto.randomUUID();
        const resetToken = jwt.sign(
            { 
                email, 
                subscriptionId,
                // action: 'password-reset',
                tokenId
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // TODO: Store in database
        // await db.resetTokens.create({
        //     tokenId,
        //     email: user.email,
        //     subscriptionId: user.subscriptionId,
        //     used: false,
        //     createdAt: new Date()
        // });

        // Send reset password email with Resend
        const resetLink = `${process.env.FRONTEND_URL}/recover-access?token=${resetToken}`;

        const msg = { 
            from: `Logistok <${process.env.RESEND_EMAIL}>`,
            to: email,
            subject: 'Reset Your Logistok Account Password',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <p>We received a request to reset your password. Click the button below to set a new password:</p>
                    <a href="${resetLink}" 
                        style="
                        display: inline-block;
                        background-color: #1e40af;
                        color: #ffffff;
                        padding: 12px 20px;
                        text-decoration: none;
                        border-radius: 6px;
                        font-weight: bold;
                        ">
                        Reset Password
                    </a>
                    <p style="margin-top: 20px;">If you didn’t request this, you can safely ignore this email.</p>
                    <p>This link will expire in <b>1 hour</b> for security reasons.</p>
                    <p>If the button doesn’t work, copy and paste this link into your browser:</p>
                    <p><a href="${resetLink}">${resetLink}</a></p>
                </div>
            `,
        };

        try {
            // await sgMail.send(msg);
            await resend.emails.send(msg);
            res.json({ success: true, message: 'Το email επαναφοράς κωδικού στάλθηκε με επιτυχία. Παρακαλώ ελέγξτε το email σας.' });
        } catch (emailError) {
            console.error('Error sending reset email:', emailError);
            res.status(500).json({ success: false, message: 'Failed to send reset email. Please try again.' });
        }

    } catch (error) {
        console.error('Error creating account:', error);
        res.status(500).json({ error: 'Σφάλμα κατά την εισαγωγή δεδομένων' });
    }
});

router.get('/reset-password', async (req, res) => {
    try {
        const { token } = req.query;
        // const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(400).json({ success: false, message: 'Missing token' });
        }

        // TODO: Check if token exists and not used
        // const tokenRecord = await db.resetTokens.findOne({ 
        //     tokenId: decoded.tokenId 
        // });
        
        // if (!tokenRecord) {
        //     return res.status(401).json({ 
        //         success: false, 
        //         message: 'Invalid token' 
        //     });
        // }
        
        // if (tokenRecord.used) {
        //     return res.status(403).json({ 
        //         success: false, 
        //         message: 'This reset link has already been used. Please request a new one.' 
        //     });
        // }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { email, subscriptionId } = decoded;

        // Check if the user exists
        const { data: user, error: userCheckError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', email)
            .eq('subscription_id', subscriptionId)
            .single();

        if (!user || userCheckError) {
            return res.status(400).json({ success: false, message: 'Invalid verification link' });
        }

        if(!user.email_verified){
            return res.status(400).json({ success: false, message: 'Email is not verified.' });
        }

        res.status(200).json({ success: true, message: 'Μπορείτε να αλλάξετε τον κωδικό σας.' });

    } catch (error) {
        // console.error('Email verification error:', error);
        return res.status(500).json({ success: false, message: 'Invalid or expired token' });
    }
});

router.post('/create-new-password', async (req, res) => {
    try {
        const { token } = req.query;
        // const token = req.headers.authorization?.split(' ')[1];
        const { password, confirmPassword } = req.body;

        if (!token) {
            return res.status(400).json({ success: false, password_not_match: false, message: 'Missing token' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { email, subscriptionId } = decoded;

        // Check if the user exists
        const { data: user, error: userCheckError } = await supabase
            .from('users')
            .select('id, email_verified')
            .eq('email', email)
            .eq('subscription_id', subscriptionId)
            .single();

        if (!user || userCheckError) {
            return res.status(400).json({ success: false, password_not_match: false, message: 'Invalid verification link.' });
        }

        if(!user.email_verified){
            return res.status(400).json({ success: false, password_not_match: false, message: 'Email is not verified.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, password_not_match: true, message: "Passwords do not match." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const { data, error: updateError } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('id', user.id)
            .eq('subscription_id', subscriptionId);
            
        if (updateError) {
            return res.status(500).json({ success: false, password_not_match: false, message: 'Error updating password.' });
        }

        res.status(200).json({ success: true, password_not_match: false, message: 'Επιτυχής αλλαγή κωδικού πρόσβασης. Συνδεθείτε ξανά.' });

    } catch (error) {
        // console.error('Email verification error:', error);
        return res.status(500).json({ success: false, password_not_match: false, message: 'Invalid or expired token.' });
    }
});



module.exports = router;