// auth.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authMiddleware');

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit');

const supabase = require('../supabaseConfig');

/* 
    Maybe should do that?
    ## Silent Authentication ##

    Instead of logging out users immediately when the access token expires, you can implement silent authentication:

        - When the access token expires, attempt to refresh it automatically in the background.
        - If refreshing fails, then log the user out.
*/

// Rate limiter to prevent brute-force attacks
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10, // Allow max 5 requests per 15 minutes
    message: { success: false, invalid_credentials: false, email_verified: true, message: "Too many login attempts. Please try again later." }
});

router.post('/login', loginLimiter, async (req, res) => {
    try {
        // Retrieve data from the POST request
        const { email, password, fingerprint } = req.body;
        // console.log(email, password, fingerprint);

        // Fetch user, subscription, and plan details in a single query
        const { data: user, error: userError } = await supabase
            .from('users')
            .select(`
                id, email, password_hash, email_verified, role, subscription_id,
                subscriptions (id, industry_id, company_name, managers_phone, plan_id, plans (max_users))
            `)
            .eq('email', email)
            .single();

        if (userError) {
            return res.status(400).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Δεν βρέθηκε χρήστης.' });
        }

        // Verify password
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(400).json({ success: false, invalid_credentials: true, email_verified: true, message: 'Λάθος στοιχεία. Προσπαθήστε ξανά.' });
        }
        user.password_hash = undefined; // Remove password hash from the user object

        if(!user.email_verified){
            return res.status(400).json({ success: false, invalid_credentials: false, email_verified: false, message: 'Απαιτείται επιβεβαίωση χρήστη.' });
        }

        // Extract subscription & plan data
        const subscription = user.subscriptions;
        if (!subscription) {
            return res.status(400).json({ success: false, invalid_credentials: false, email_verified: true, message: 'No subscription found for user.' });
        }

        const plan = subscription.plans;
        
        // Count active sessions for this subscription
        const { data: activeSessions, error: sessionsError } = await supabase
            .from('subscription_sessions')
            .select('id, user_id, fingerprint')
            .eq('subscription_id', subscription.id);

        if (sessionsError) {
            return res.status(500).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Error fetching sessions data' });
        }


        // Count active sessions for this user for this subscription
        const userSessions = activeSessions.filter(s => s.user_id === user.id).length;

        if (plan && activeSessions.length >= plan.max_users) {
            return res.status(403).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Max users reached for this plan' });
        }

        if (userSessions >= 2) {
            return res.status(403).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Max sessions reached for this user' });
        }
            
        // Generate JWT tokens
        const accessToken = jwt.sign(
            { 
                user_id: user.id, 
                email: user.email, 
                role: user.role,
                subscription_id: user.subscription_id 
            }, 
            process.env.ACCESS_TOKEN_SECRET, 
            { expiresIn: '70m' }
        );

        const refreshToken = jwt.sign(
            { 
                user_id: user.id, 
                email: user.email, 
                role: user.role,
                subscription_id: user.subscription_id 
            }, 
            process.env.REFRESH_TOKEN_SECRET,
            { expiresIn: '7d' }
        );

        // Check if the fingerprint already exists in active sessions for this user
        const existingSession = activeSessions.find(s => s.user_id === user.id && s.fingerprint === fingerprint);

        // console.log('dsdsas')
        if (existingSession) {
            // Set JWT in a cookie
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // true on production (http , https & ssl), false on development
                // sameSite: 'none',
                maxAge: 70 * 60 * 1000 // 1 hour
            });

            return res.status(200).json({
                success: true,
                message: 'Επιτυχής Σύνδεση.' 
            });
        }
        
        // Create a session
        const { error: sessionError } = await supabase
            .from('subscription_sessions')
            .insert({
                user_id: user.id,
                subscription_id: user.subscription_id,
                refresh_token: refreshToken,
                last_active: new Date(),
                fingerprint: fingerprint
            });

        if (sessionError) {
            console.error('Error creating session:', sessionError);
            return res.status(500).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Error creating session' });
        }

        // Set JWT in a cookie
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // true on production (http , https & ssl), false on development
            // sameSite: 'none',
            maxAge: 70 * 60 * 1000 // 1 hour
        });
        // console.log('Set-Cookie:', res.getHeaders()['set-cookie']);

        res.json({ 
            success: true, 
            message: 'Επιτυχής Σύνδεση.' 
        });


    } catch (error) {
        console.error('Error during login:', error);
        return res.status(500).json({ success: false, invalid_credentials: false, email_verified: true, message: 'Internal server error' });
    }
});


router.post('/refresh', authenticateToken, async (req, res) => {

    const { user_id, subscription_id } = req.user;
    const { fingerprint } = req.body;
    
    try {
        const { data: sessions, error: sessionsError } = await supabase
            .from('subscription_sessions')
            .select('refresh_token')
            .eq('user_id', user_id)
            .eq('subscription_id', subscription_id)
            .eq('fingerprint', fingerprint)
            .order('last_active', { ascending: false });

        if (sessionsError) {
            return res.status(500).json({ success: false, message: 'Error fetching sessions data' });
        }

        if (!sessions || sessions.length === 0) {
            return res.status(403).json({ success: false, message: 'No valid refresh token found' });
        }

        const refreshToken = sessions[0].refresh_token;

        try {
            // Verify the refresh token
            const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            const { user_id, email, role, subscription_id } = decoded;

            const { error: updateError } = await supabase
                .from('subscription_sessions')
                .update({ last_active: new Date() })
                .eq('user_id', user_id)
                .eq('subscription_id', subscription_id)
                .eq('fingerprint', fingerprint);

            if (updateError) {
                return res.status(500).json({ success: false, message: 'Error updating last active' });
            }

            // Generate a new access token
            const accessToken = jwt.sign(
                { 
                    user_id: user_id, 
                    email: email, 
                    role: role,
                    subscription_id: subscription_id 
                }, 
                process.env.ACCESS_TOKEN_SECRET, 
                { expiresIn: '70m' }
            );
            // const accessTokenExpiration = Date.now() + 60 * 60 * 1000; // 1 hour
            const accessTokenExpiration = Date.now() + 60 * 1000; // 1 hour // practicly it can be used in the front without needed to send it from the back

            // Clear existing cookie and set a new one
            res.clearCookie("accessToken", {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                // sameSite: "none",
                maxAge: 0
            });
            // Set JWT in a cookie
            res.cookie('accessToken', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // true on production (http , https & ssl), false on development
                // sameSite: 'none',
                maxAge: 70 * 60 * 1000 // 1 hour
            });


            const { data: subscription, error: subscriptionError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('id', subscription_id)
                .single();

            if (subscriptionError) {
                return res.status(500).json({ success: false, message: 'Error fetching subscription data' });
            }

            const industryId = subscription.industry_id
            let industry_name = null;

            if(industryId){
                const { data: industry, error: industryError } = await supabase
                    .from('industries')
                    .select('name')
                    .eq('id', industryId)
                    .single();

                if (industryError) {
                    return res.status(500).json({ success: false, message: 'Error fetching industry data' });
                }

                industry_name = industry.name;
            }

            const { data: user, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', user_id)
                .single();

            if (userError) {
                return res.status(400).json({ success: false, message: 'Δεν βρέθηκε χρήστης.' });
            }

            res.json({ 
                success: true,
                userInfo: {
                    email: email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: role
                }, 
                accessTokenExpiration: accessTokenExpiration, 
                industry: industry_name,
                setupStep: !subscription.industry_id ? 1 : (!subscription.company_name || !subscription.managers_phone) ? 2 : !subscription.plan_id ? 3 : null,
                message: 'Επιτυχής Σύνδεση.' 
            });
            
        } catch (verifyError) {
            console.error('Refresh token verification failed:', verifyError);
            return res.status(403).json({ success: false, message: 'Invalid refresh token' });
        }
    } catch (error) {
        console.error('Error during token refresh:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/logout', async (req, res) => {

    const token = req.cookies["accessToken"]
    const { fingerprint } = req.body;

    // console.log(token, fingerprint)
  
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
        // Verify the token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const { user_id, subscription_id } = decoded;

        // Delete the session for the user
        const { error: sessionsError } = await supabase
            .from("subscription_sessions")
            .delete()
            .eq("user_id", user_id)
            .eq("subscription_id", subscription_id)
            .eq('fingerprint', fingerprint);

        if (sessionsError) {
            return res.status(500).json({ success: false, message: 'Error deleting session' });
        }

        // Clear the access token cookie
        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            // sameSite: "none",
            maxAge: 0
        });
        res.json({ message: "Good Bye!" });
        // res.sendStatus(204)

    } catch (error) {
        console.error('Error during logout:', error);

        // Clear the access token cookie
        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            // sameSite: "none",
            maxAge: 0
        });
        res.json({ message: "Good Bye!" });
    }
});


module.exports = router;