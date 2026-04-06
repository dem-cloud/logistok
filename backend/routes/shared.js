// shared.js
require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');
const supabase = require('../supabaseConfig');
const { requireAuth, requireActiveCompany, requireOwner, requireAnyPermission } = require('../middlewares/authRequired');
const { generateAccessToken } = require('../helpers/tokens');
const Stripe = require('stripe');

const resend = new Resend(process.env.RESEND_API_KEY);
const { ONBOARDING_STEPS, TOTAL_STEPS } = require('../helpers/onboarding/onboardingSteps');
const { sanitizeOnboardingUpdates, validateNextOnboardingData, validateCompleteOnboardingData } = require('../helpers/onboarding/onboardingValidation');
const { generateSubscriptionCode } = require('../helpers/generateSubscriptionCode');
const { sendWelcomeEmail, shouldSendNotification } = require('../helpers/emailService');
const { mapInvoiceStatus } = require('../helpers/mapInvoiceStatus');
const { canAddUser, canAddStore } = require('../helpers/planLimits');
const { checkStockAvailability } = require('../helpers/stockAvailability');
const { generateSalePdf } = require('../helpers/generateSalePdf');
const { generatePurchasePdf } = require('../helpers/generatePurchasePdf');
const { getNextSequence, isInvoiceNumberUnique } = require('../helpers/documentSequences');
const { recomputeSalePaymentStatus, recomputePurchasePaymentStatus } = require("../helpers/paymentStatus");
const { getAllowedPurchaseStatuses, getAllowedSalesStatuses } = require('../helpers/documentTransitions');
const { reserveStockForSO, releaseReservedStock } = require('../helpers/stockReservation');
const {
    getReceivedTotalsByPoLine,
    syncPurchaseOrderStatusFromGrns,
    syncPurchaseOrderStatusAfterGrnRemoved,
} = require('../helpers/poGrnSync');
const { getPoCancelBlockReason, getSoCancelBlockReason } = require('../helpers/documentCancelGuards');
const { normalizePurchaseDocType, normalizePurchaseStatus } = require('../helpers/purchaseNormalize');

const multer = require('multer');
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const uploadLogoMw = (req, res, next) => {
    upload.single("logo")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    success: false,
                    message: "Μέγιστο μέγεθος αρχείου: 2MB",
                    code: "FILE_TOO_LARGE"
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message || "Αποτυχία μεταφόρτωσης",
                code: "UPLOAD_ERROR"
            });
        }
        next();
    });
};


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
        // 1. Check if invitee already in company (by email)
        const { data: inviteeUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (inviteeUser) {
            const { data: existingCu } = await supabase
                .from("company_users")
                .select("id")
                .eq("company_id", companyId)
                .eq("user_id", inviteeUser.id)
                .maybeSingle();

            if (existingCu) {
                return res.status(400).json({
                    success: false,
                    message: "Ο χρήστης ανήκει ήδη στην εταιρεία ή είναι απενεργοποιημένος. Χρησιμοποιήστε «Επανενεργοποίηση» για απενεργοποιημένους.",
                    code: "USER_ALREADY_IN_COMPANY"
                });
            }
        }

        // 2. Check plan user limit
        const { allowed: canInvite, reason } = await canAddUser(companyId);
        if (!canInvite) {
            return res.status(403).json({
                success: false,
                message: "Έφτασες το όριο χρηστών του πλάνου σου. Αναβάθμιση για πρόσκληση νέων.",
                code: reason || "PLAN_USER_LIMIT"
            });
        }

        // 3. Create invitation (explicit token so email always has valid link)
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const inviteToken = crypto.randomUUID();
        const { data: invitation, error: invErr } = await supabase
            .from("invitations")
            .insert({
                invited_email: email,
                company_id: companyId,
                role_id,
                invited_by: userId,
                token: inviteToken,
                created_at: now.toISOString(),
                expires_at: expiresAt.toISOString()
            })
            .select()
            .single();

        if (invErr) throw invErr;

        // 4. Send email via RESEND (respect notification preferences for existing users)
        const { data: inviteeForPrefs } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle();

        const shouldSend = inviteeForPrefs
            ? await shouldSendNotification(inviteeForPrefs.id, 'email_invitations')
            : true; // New user: always send so they can accept

        if (shouldSend) {
            const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173";
            const inviteLink = `${appUrl.replace(/\/$/, "")}/invite/${inviteToken}`;
            await resend.emails.send({
                from: `Olyntos <${process.env.RESEND_EMAIL}>`,
                to: email,
                subject: "Olyntos – You've been invited",
                html: `
                    <p>You have been invited to join a company on Olyntos.</p>
                    <p><a href="${inviteLink}">Click here to accept the invitation</a></p>
                `
            });
        } else {
            console.log(`Invitation email skipped (user ${inviteeForPrefs.id} has email_invitations disabled)`);
        }

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

// --------------------------------
// Roles & Permissions
// --------------------------------

// GET /company/roles - List company roles with permissions
router.get("/company/roles", requireAuth, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: roles, error: rolesErr } = await supabase
            .from("roles")
            .select("id, key, name, description, created_at")
            .eq("company_id", companyId);

        // Sort: admin first, then by created_at (oldest first, so new roles appear at end)
        if (roles && roles.length > 0) {
            roles.sort((a, b) => {
                if (a.key === "admin") return -1;
                if (b.key === "admin") return 1;
                const aTime = new Date(a.created_at || 0).getTime();
                const bTime = new Date(b.created_at || 0).getTime();
                return aTime - bTime;
            });
        }

        if (rolesErr) {
            console.error("DB ERROR (roles):", rolesErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης ρόλων",
                code: "DB_ERROR"
            });
        }

        if (!roles || roles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const roleIds = roles.map(r => r.id);
        const { data: rolePerms, error: rpErr } = await supabase
            .from("role_permissions")
            .select("role_id, permission_key")
            .in("role_id", roleIds);

        if (rpErr) {
            console.error("DB ERROR (role_permissions):", rpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης permissions",
                code: "DB_ERROR"
            });
        }

        const permsByRole = {};
        (rolePerms || []).forEach(rp => {
            if (!permsByRole[rp.role_id]) permsByRole[rp.role_id] = [];
            permsByRole[rp.role_id].push(rp.permission_key);
        });

        const result = roles.map(r => ({
            ...r,
            permission_keys: permsByRole[r.id] || []
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /company/roles ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /permissions - List all permissions grouped by module
router.get("/permissions", requireAuth, async (req, res) => {
    try {
        const { data: perms, error } = await supabase
            .from("permissions")
            .select("key, name, description")
            .order("key");

        if (error) {
            console.error("DB ERROR (permissions):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης permissions",
                code: "DB_ERROR"
            });
        }

        // Group by module (first part of key)
        const byModule = {};
        (perms || []).forEach(p => {
            const module = p.key.split('.')[0];
            if (!byModule[module]) byModule[module] = [];
            byModule[module].push({ key: p.key, name: p.name, description: p.description });
        });

        return res.json({ success: true, data: byModule });
    } catch (err) {
        console.error("GET /permissions ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /default-roles - List default role templates (for create-from-template UI)
router.get("/default-roles", requireAuth, async (req, res) => {
    try {
        const { data: defaultRoles, error: rolesErr } = await supabase
            .from("default_roles")
            .select("key, name, description")
            .neq("key", "admin")
            .order("key");

        if (rolesErr) {
            console.error("DB ERROR (default_roles):", rolesErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης default roles",
                code: "DB_ERROR"
            });
        }

        if (!defaultRoles || defaultRoles.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const keys = defaultRoles.map(r => r.key);
        const { data: drp, error: drpErr } = await supabase
            .from("default_role_permissions")
            .select("default_role_key, permission_key")
            .in("default_role_key", keys);

        if (drpErr) {
            console.error("DB ERROR (default_role_permissions):", drpErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης default role permissions",
                code: "DB_ERROR"
            });
        }

        const permsByKey = {};
        (drp || []).forEach(r => {
            if (!permsByKey[r.default_role_key]) permsByKey[r.default_role_key] = [];
            permsByKey[r.default_role_key].push(r.permission_key);
        });

        const result = defaultRoles.map(r => ({
            ...r,
            permission_keys: permsByKey[r.key] || []
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /default-roles ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/roles - Create role from template or custom
router.post("/company/roles", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { default_role_key, name, key, permission_keys } = req.body;

    try {
        if (default_role_key) {
            // Create from default template (permission_keys override template if provided)
            const { data: defaultRole, error: drErr } = await supabase
                .from("default_roles")
                .select("key, name, description")
                .eq("key", default_role_key)
                .maybeSingle();

            if (drErr || !defaultRole) {
                return res.status(404).json({
                    success: false,
                    message: "Ο προεπιλεγμένος ρόλος δεν βρέθηκε",
                    code: "DEFAULT_ROLE_NOT_FOUND"
                });
            }

            let permKeys;
            if (permission_keys !== undefined && Array.isArray(permission_keys)) {
                permKeys = permission_keys.filter(pk => pk && typeof pk === "string");
            } else {
                const { data: defaultPerms, error: dpErr } = await supabase
                    .from("default_role_permissions")
                    .select("permission_key")
                    .eq("default_role_key", default_role_key);

                if (dpErr) {
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα ανάγνωσης permissions",
                        code: "DB_ERROR"
                    });
                }
                permKeys = (defaultPerms || []).map(p => p.permission_key);
            }

            const { data: newRole, error: roleErr } = await supabase
                .from("roles")
                .insert({
                    company_id: companyId,
                    key: defaultRole.key,
                    name: defaultRole.name,
                    description: defaultRole.description
                })
                .select()
                .single();

            if (roleErr) {
                if (roleErr.code === "23505") {
                    return res.status(400).json({
                        success: false,
                        message: "Ο ρόλος υπάρχει ήδη στην εταιρεία",
                        code: "ROLE_ALREADY_EXISTS"
                    });
                }
                throw roleErr;
            }

            if (permKeys.length > 0) {
                const rpRows = permKeys.map(pk => ({
                    role_id: newRole.id,
                    permission_key: pk,
                    source: "default_role"
                }));
                const { error: rpErr } = await supabase
                    .from("role_permissions")
                    .insert(rpRows);
                if (rpErr) throw rpErr;
            }

            const { data: rpData } = await supabase
                .from("role_permissions")
                .select("permission_key")
                .eq("role_id", newRole.id);

            return res.json({
                success: true,
                data: { ...newRole, permission_keys: (rpData || []).map(p => p.permission_key) }
            });
        }

        // Custom role
        if (!name || !permission_keys || !Array.isArray(permission_keys)) {
            return res.status(400).json({
                success: false,
                message: "Απαιτούνται name και permission_keys",
                code: "MISSING_VALUES"
            });
        }

        const roleKey = key || name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        const { data: newRole, error: roleErr } = await supabase
            .from("roles")
            .insert({
                company_id: companyId,
                key: roleKey,
                name,
                description: req.body.description || null
            })
            .select()
            .single();

        if (roleErr) {
            if (roleErr.code === "23505") {
                return res.status(400).json({
                    success: false,
                    message: "Ο ρόλος με αυτό το key υπάρχει ήδη",
                    code: "ROLE_ALREADY_EXISTS"
                });
            }
            throw roleErr;
        }

        const rpRows = permission_keys
            .filter(pk => pk && typeof pk === "string")
            .map(pk => ({ role_id: newRole.id, permission_key: pk, source: "custom" }));

        if (rpRows.length > 0) {
            const { error: rpErr } = await supabase.from("role_permissions").insert(rpRows);
            if (rpErr) throw rpErr;
        }

        return res.json({
            success: true,
            data: { ...newRole, permission_keys }
        });
    } catch (err) {
        console.error("POST /company/roles ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PUT /company/roles/:id - Update role name/description
router.put("/company/roles/:id", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { id } = req.params;
    const { name, description } = req.body;

    try {
        const { data: role, error: fetchErr } = await supabase
            .from("roles")
            .select("id, key, company_id")
            .eq("id", id)
            .eq("company_id", companyId)
            .maybeSingle();

        if (fetchErr || !role) {
            return res.status(404).json({
                success: false,
                message: "Ο ρόλος δεν βρέθηκε",
                code: "ROLE_NOT_FOUND"
            });
        }

        const updates = {};
        if (name != null) updates.name = name;
        if (description != null) updates.description = description;
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχουν αλλαγές",
                code: "NO_CHANGES"
            });
        }

        const { data: updated, error } = await supabase
            .from("roles")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, data: updated });
    } catch (err) {
        console.error("PUT /company/roles/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PUT /company/roles/:id/permissions - Replace role permissions
router.put("/company/roles/:id/permissions", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { id } = req.params;
    const { permission_keys } = req.body;

    if (!Array.isArray(permission_keys)) {
        return res.status(400).json({
            success: false,
            message: "Απαιτείται permission_keys (array)",
            code: "MISSING_VALUES"
        });
    }

    try {
        const { data: role, error: fetchErr } = await supabase
            .from("roles")
            .select("id, company_id")
            .eq("id", id)
            .eq("company_id", companyId)
            .maybeSingle();

        if (fetchErr || !role) {
            return res.status(404).json({
                success: false,
                message: "Ο ρόλος δεν βρέθηκε",
                code: "ROLE_NOT_FOUND"
            });
        }

        const { error: delErr } = await supabase
            .from("role_permissions")
            .delete()
            .eq("role_id", id);

        if (delErr) throw delErr;

        const validKeys = permission_keys.filter(pk => pk && typeof pk === "string");
        if (validKeys.length > 0) {
            const rpRows = validKeys.map(pk => ({
                role_id: id,
                permission_key: pk,
                source: "custom"
            }));
            const { error: insErr } = await supabase.from("role_permissions").insert(rpRows);
            if (insErr) throw insErr;
        }

        return res.json({
            success: true,
            data: { permission_keys: validKeys }
        });
    } catch (err) {
        console.error("PUT /company/roles/:id/permissions ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// DELETE /company/roles/:id - Delete role if not in use
router.delete("/company/roles/:id", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { id } = req.params;

    try {
        const { data: role, error: fetchErr } = await supabase
            .from("roles")
            .select("id, key, company_id")
            .eq("id", id)
            .eq("company_id", companyId)
            .maybeSingle();

        if (fetchErr || !role) {
            return res.status(404).json({
                success: false,
                message: "Ο ρόλος δεν βρέθηκε",
                code: "ROLE_NOT_FOUND"
            });
        }

        if (role.key === "admin") {
            return res.status(400).json({
                success: false,
                message: "Δεν επιτρέπεται διαγραφή του ρόλου Admin",
                code: "CANNOT_DELETE_ADMIN"
            });
        }

        const { data: inUse } = await supabase
            .from("company_users")
            .select("id")
            .eq("role_id", id)
            .limit(1)
            .maybeSingle();

        if (inUse) {
            return res.status(400).json({
                success: false,
                message: "Ο ρόλος χρησιμοποιείται από μέλη. Αλλάξτε πρώτα τους ρόλους τους.",
                code: "ROLE_IN_USE"
            });
        }

        const { data: storeRoleInUse } = await supabase
            .from("user_store_roles")
            .select("id")
            .eq("role_id", id)
            .limit(1)
            .maybeSingle();

        if (storeRoleInUse) {
            return res.status(400).json({
                success: false,
                message: "Ο ρόλος χρησιμοποιείται σε store assignments.",
                code: "ROLE_IN_USE"
            });
        }

        const { error: delErr } = await supabase
            .from("role_permissions")
            .delete()
            .eq("role_id", id);

        if (delErr) throw delErr;

        const { error: roleDelErr } = await supabase
            .from("roles")
            .delete()
            .eq("id", id);

        if (roleDelErr) throw roleDelErr;

        return res.json({ success: true, message: "Ο ρόλος διαγράφηκε" });
    } catch (err) {
        console.error("DELETE /company/roles/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// --------------------------------
// Company Profile (Settings)
// --------------------------------

// GET /company - Fetch full company profile (owner only)
router.get("/company", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("id, name, display_name, tax_id, tax_office, address, city, postal_code, country, phone, email, logo_url, settings, allow_negative_stock")
            .eq("id", companyId)
            .single();

        if (companyErr || !company) {
            return res.status(404).json({
                success: false,
                message: "Η εταιρεία δεν βρέθηκε",
                code: "COMPANY_NOT_FOUND"
            });
        }

        const { data: industryRows, error: indErr } = await supabase
            .from("company_industries")
            .select("industry_key")
            .eq("company_id", companyId);

        if (indErr) {
            console.error("DB ERROR (company_industries):", indErr);
        }
        const industries = (industryRows || []).map(r => r.industry_key);

        return res.json({
            success: true,
            data: {
                company,
                industries
            }
        });
    } catch (err) {
        console.error("GET /company ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/settings/allow-negative-stock - Update allow_negative_stock (owner only)
router.patch("/company/settings/allow-negative-stock", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { allow_negative_stock } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (typeof allow_negative_stock !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "Η τιμή allow_negative_stock πρέπει να είναι boolean",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { error } = await supabase
            .from("companies")
            .update({ allow_negative_stock })
            .eq("id", companyId);

        if (error) {
            console.error("PATCH /company/settings/allow-negative-stock:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης ρυθμίσεων",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: { allow_negative_stock }
        });
    } catch (err) {
        console.error("PATCH /company/settings/allow-negative-stock ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/stores-capacity - Store capacity for StoresSettings (owner or stores.manage)
router.get("/company/stores-capacity", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const capacity = await canAddStore(companyId);

        const { data: sub, error: subErr } = await supabase
            .from('subscriptions')
            .select(`
                id,
                plan_id,
                billing_period,
                plans (
                    id,
                    key,
                    included_branches,
                    cached_extra_store_price_monthly,
                    cached_extra_store_price_yearly
                )
            `)
            .eq('company_id', companyId)
            .in('billing_status', ['active', 'trialing', 'past_due'])
            .maybeSingle();

        if (subErr || !sub) {
            return res.json({
                success: true,
                data: {
                    included_branches: 0,
                    active_store_count: 0,
                    extra_store_quantity: 0,
                    free_slots: 0,
                    max_stores: 0,
                    extra_store_unit_price_monthly: 0,
                    extra_store_unit_price_yearly: 0,
                    plan_id: null,
                    plan_key: null,
                    canAddExtraStores: false
                }
            });
        }

        const plan = sub.plans || {};
        const extraStorePriceMonthly = plan.cached_extra_store_price_monthly ?? 0;
        const extraStorePriceYearly = plan.cached_extra_store_price_yearly ?? 0;

        const { count: activeCount } = await supabase
            .from('stores')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('is_active', true);

        const { data: extraStoreItem } = await supabase
            .from('subscription_items')
            .select('quantity')
            .eq('subscription_id', sub.id)
            .eq('item_type', 'extra_store')
            .maybeSingle();

        const extraStoreQuantity = extraStoreItem?.quantity ?? 0;
        const includedBranches = plan.included_branches ?? 0;
        const maxStores = includedBranches + extraStoreQuantity;

        return res.json({
            success: true,
            data: {
                included_branches: includedBranches,
                active_store_count: activeCount ?? 0,
                extra_store_quantity: extraStoreQuantity,
                free_slots: capacity.freeSlots ?? 0,
                max_stores: maxStores,
                extra_store_unit_price_monthly: extraStorePriceMonthly,
                extra_store_unit_price_yearly: extraStorePriceYearly,
                plan_id: plan.id,
                plan_key: plan.key,
                canAddExtraStores: plan.key !== 'basic'
            }
        });
    } catch (err) {
        console.error("GET /company/stores-capacity ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/stores - Create store (free slot only; paid adds use POST /billing/add-extra-store)
router.post("/company/stores", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const { name, address, city, postal_code, country, phone, email } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα καταστήματος είναι υποχρεωτικό",
            code: "MISSING_NAME"
        });
    }

    const trimmedName = name.trim();

    try {
        const capacity = await canAddStore(companyId);

        if (!capacity.allowed) {
            if (capacity.reason === 'PLAN_UPGRADE_REQUIRED') {
                return res.status(403).json({
                    success: false,
                    message: "Δεν μπορείτε να προσθέσετε περισσότερα καταστήματα με το τρέχον πλάνο. Αναβαθμίστε για πρόσβαση.",
                    code: "PLAN_UPGRADE_REQUIRED"
                });
            }
            // PLAN_STORE_LIMIT: at limit. Pro/Business can buy more → return NEEDS_PAYMENT
            if (capacity.reason === 'PLAN_STORE_LIMIT') {
                const { data: sub } = await supabase
                    .from('subscriptions')
                    .select('plans (key)')
                    .eq('company_id', companyId)
                    .in('billing_status', ['active', 'trialing', 'past_due'])
                    .maybeSingle();
                const planKey = (sub?.plans?.key || '').toLowerCase();
                if (planKey !== 'basic') {
                    return res.status(402).json({
                        success: false,
                        message: "Δεν υπάρχουν δωρεάν θέσεις. Απαιτείται πληρωμή για προσθήκη.",
                        code: "NEEDS_PAYMENT",
                        needsPayment: true
                    });
                }
            }
            return res.status(403).json({
                success: false,
                message: "Έχετε φτάσει το όριο καταστημάτων.",
                code: "PLAN_STORE_LIMIT"
            });
        }

        if (capacity.freeSlots <= 0) {
            return res.status(402).json({
                success: false,
                message: "Δεν υπάρχουν δωρεάν θέσεις. Απαιτείται πληρωμή για προσθήκη.",
                code: "NEEDS_PAYMENT",
                needsPayment: true
            });
        }

        const storePayload = {
            company_id: companyId,
            name: trimmedName,
            address: address ? String(address).trim() : null,
            city: city ? String(city).trim() : null,
            postal_code: postal_code ? String(postal_code).trim() : null,
            country: country ? String(country).trim() : null,
            phone: phone ? String(phone).trim() : null,
            email: email ? String(email).trim() : null,
            is_main: false,
            is_active: true
        };

        const { data: createdStore, error: storeErr } = await supabase
            .from('stores')
            .insert(storePayload)
            .select('id, name, address, city, postal_code, country, phone, email, is_main')
            .single();

        if (storeErr) {
            if (storeErr.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη κατάστημα με αυτό το όνομα",
                    code: "DUPLICATE_STORE_NAME"
                });
            }
            console.error("POST /company/stores insert error:", storeErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία καταστήματος",
                code: "DB_ERROR"
            });
        }

        // Create store_plugins for each company_plugin (mirror onboarding)
        const { data: companyPlugins } = await supabase
            .from('company_plugins')
            .select('id')
            .eq('company_id', companyId)
            .eq('status', 'active');

        if (companyPlugins && companyPlugins.length > 0) {
            const storePluginsToInsert = companyPlugins.map(cp => ({
                company_plugin_id: cp.id,
                store_id: createdStore.id,
                settings: null,
                is_active: false
            }));
            await supabase.from('store_plugins').insert(storePluginsToInsert);
        }

        return res.json({
            success: true,
            message: "Το κατάστημα δημιουργήθηκε επιτυχώς",
            data: createdStore
        });
    } catch (err) {
        console.error("POST /company/stores ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/stores/:storeId - Fetch single store (for edit form)
router.get("/company/stores/:storeId", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { storeId } = req.params;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το storeId",
            code: "MISSING_STORE_ID"
        });
    }

    try {
        const { data: store, error } = await supabase
            .from('stores')
            .select('id, name, address, city, postal_code, country, phone, email, is_main, is_active, scheduled_deactivate_at')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (error || !store) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            data: store
        });
    } catch (err) {
        console.error("GET /company/stores/:storeId ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/stores/:storeId - Update store
router.patch("/company/stores/:storeId", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { storeId } = req.params;
    const { name, phone, email, address, city, postal_code, country } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το storeId",
            code: "MISSING_STORE_ID"
        });
    }

    try {
        const { data: existingStore, error: fetchErr } = await supabase
            .from('stores')
            .select('id')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (fetchErr || !existingStore) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        const updates = {};
        if (name !== undefined) {
            const trimmed = typeof name === 'string' ? name.trim() : '';
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    message: "Το όνομα καταστήματος είναι υποχρεωτικό",
                    code: "MISSING_NAME"
                });
            }
            updates.name = trimmed;
        }
        if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
        if (email !== undefined) updates.email = email ? String(email).trim() : null;
        if (address !== undefined) updates.address = address ? String(address).trim() : null;
        if (city !== undefined) updates.city = city ? String(city).trim() : null;
        if (postal_code !== undefined) updates.postal_code = postal_code ? String(postal_code).trim() : null;
        if (country !== undefined) updates.country = country ? String(country).trim() : null;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχουν αλλαγές για αποθήκευση",
                code: "NO_UPDATES"
            });
        }

        const { data: updatedStore, error: updateErr } = await supabase
            .from('stores')
            .update(updates)
            .eq('id', storeId)
            .eq('company_id', companyId)
            .select('id, name, address, city, postal_code, country, phone, email, is_main')
            .single();

        if (updateErr) {
            if (updateErr.code === '23505') {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη κατάστημα με αυτό το όνομα",
                    code: "DUPLICATE_STORE_NAME"
                });
            }
            console.error("PATCH /company/stores/:storeId update error:", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση καταστήματος",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Το κατάστημα ενημερώθηκε επιτυχώς",
            data: updatedStore
        });
    } catch (err) {
        console.error("PATCH /company/stores/:storeId ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/stores/:storeId/schedule-remove - Schedule store for removal at period end
router.patch("/company/stores/:storeId/schedule-remove", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { storeId } = req.params;

    if (!companyId || !storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει company ή storeId",
            code: "MISSING_PARAMETER"
        });
    }

    try {
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('id, is_main, is_active, scheduled_deactivate_at')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (storeErr || !store) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        if (store.is_main) {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να αφαιρέσετε το κεντρικό κατάστημα",
                code: "CANNOT_REMOVE_MAIN"
            });
        }

        if (store.is_active === false) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα είναι ήδη ανενεργό",
                code: "STORE_INACTIVE"
            });
        }

        if (store.scheduled_deactivate_at) {
            return res.status(400).json({
                success: false,
                message: "Η αφαίρεση είναι ήδη προγραμματισμένη",
                code: "ALREADY_SCHEDULED"
            });
        }

        const { data: sub, error: subErr } = await supabase
            .from('subscriptions')
            .select('current_period_end')
            .eq('company_id', companyId)
            .in('billing_status', ['active', 'trialing', 'past_due'])
            .maybeSingle();

        if (subErr || !sub?.current_period_end) {
            return res.status(400).json({
                success: false,
                message: "Δεν βρέθηκε ενεργή συνδρομή",
                code: "NO_ACTIVE_SUBSCRIPTION"
            });
        }

        const { data: updated, error: updateErr } = await supabase
            .from('stores')
            .update({ scheduled_deactivate_at: sub.current_period_end })
            .eq('id', storeId)
            .eq('company_id', companyId)
            .select('id, scheduled_deactivate_at')
            .single();

        if (updateErr) {
            console.error("PATCH schedule-remove error:", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τον προγραμματισμό αφαίρεσης",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Η αφαίρεση προγραμματίστηκε επιτυχώς",
            data: { scheduled_deactivate_at: updated.scheduled_deactivate_at }
        });
    } catch (err) {
        console.error("PATCH /company/stores/:storeId/schedule-remove ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/stores/:storeId/cancel-schedule-remove - Cancel scheduled removal
router.patch("/company/stores/:storeId/cancel-schedule-remove", requireAuth, requireAnyPermission(['stores.manage', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { storeId } = req.params;

    if (!companyId || !storeId) {
        return res.status(400).json({
            success: false,
            message: "Λείπει company ή storeId",
            code: "MISSING_PARAMETER"
        });
    }

    try {
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('id, is_active, scheduled_deactivate_at')
            .eq('id', storeId)
            .eq('company_id', companyId)
            .single();

        if (storeErr || !store) {
            return res.status(404).json({
                success: false,
                message: "Δεν βρέθηκε το κατάστημα",
                code: "STORE_NOT_FOUND"
            });
        }

        if (!store.scheduled_deactivate_at) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει προγραμματισμένη αφαίρεση",
                code: "NOT_SCHEDULED"
            });
        }

        const { data: updated, error: updateErr } = await supabase
            .from('stores')
            .update({ scheduled_deactivate_at: null })
            .eq('id', storeId)
            .eq('company_id', companyId)
            .select('id, name, address, city, postal_code, country, phone, email, is_main, is_active, scheduled_deactivate_at')
            .single();

        if (updateErr) {
            console.error("PATCH cancel-schedule-remove error:", updateErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ακύρωση",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Η αφαίρεση ακυρώθηκε επιτυχώς",
            data: updated
        });
    } catch (err) {
        console.error("PATCH /company/stores/:storeId/cancel-schedule-remove ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/general - Update general/contact info and industries (owner only)
router.patch("/company/general", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const { name, display_name, phone, email, industries } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = String(name).trim() || null;
        if (display_name !== undefined) updates.display_name = display_name ? String(display_name).trim() : null;
        if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
        if (email !== undefined) {
            const trimmed = email ? String(email).trim() : null;
            if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                return res.status(400).json({
                    success: false,
                    message: "Μη έγκυρη διεύθυνση email",
                    code: "INVALID_EMAIL"
                });
            }
            updates.email = trimmed;
        }

        if (Object.keys(updates).length > 0) {
            const { error: updErr } = await supabase
                .from("companies")
                .update(updates)
                .eq("id", companyId);
            if (updErr) throw updErr;
        }

        if (Array.isArray(industries)) {
            await supabase
                .from("company_industries")
                .delete()
                .eq("company_id", companyId);

            const validKeys = industries.filter(k => typeof k === "string" && k.trim());
            if (validKeys.length > 0) {
                const { data: validIndustries } = await supabase
                    .from("industries")
                    .select("key")
                    .in("key", validKeys);
                if (validIndustries && validIndustries.length > 0) {
                    const rows = validIndustries.map(i => ({
                        company_id: companyId,
                        industry_key: i.key
                    }));
                    const { error: insErr } = await supabase
                        .from("company_industries")
                        .insert(rows);
                    if (insErr) {
                        console.error("company_industries insert:", insErr);
                    }
                }
            }
        }

        return res.json({ success: true, message: "Οι γενικές πληροφορίες ενημερώθηκαν" });
    } catch (err) {
        console.error("PATCH /company/general ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/logo-upload - Upload logo file to Supabase Storage (owner only)
// Requires Supabase Storage bucket "company-logos" (public) to exist
router.post("/company/logo-upload", requireAuth, requireOwner, uploadLogoMw, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({
            success: false,
            message: "Δεν επιλέχθηκε αρχείο",
            code: "NO_FILE"
        });
    }
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({
            success: false,
            message: "Μόνο εικόνες (JPEG, PNG, GIF, WebP) επιτρέπονται",
            code: "INVALID_FILE_TYPE"
        });
    }
    const ext = req.file.originalname?.match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "png";
    const path = `${companyId}/${Date.now()}-logo.${ext}`;
    try {
        const { data, error } = await supabase.storage
            .from("company-logos")
            .upload(path, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(data.path);
        return res.json({
            success: true,
            data: { logo_url: urlData.publicUrl }
        });
    } catch (err) {
        console.error("POST /company/logo-upload ERROR:", err);
        return res.status(500).json({
            success: false,
            message: err.message || "Αποτυχία μεταφόρτωσης",
            code: "UPLOAD_ERROR"
        });
    }
});

// PATCH /company/branding - Update logo (owner only)
router.patch("/company/branding", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const { logo_url } = req.body;
    const value = logo_url === null || logo_url === undefined || logo_url === ""
        ? null
        : String(logo_url).trim();

    try {
        const { error } = await supabase
            .from("companies")
            .update({ logo_url: value })
            .eq("id", companyId);
        if (error) throw error;

        return res.json({ success: true, message: "Το branding ενημερώθηκε" });
    } catch (err) {
        console.error("PATCH /company/branding ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/legal - Update legal/tax/address (owner only)
router.patch("/company/legal", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const { tax_id, tax_office, address, city, postal_code, country } = req.body;

    try {
        const updates = {};
        if (tax_id !== undefined) updates.tax_id = tax_id ? String(tax_id).trim() : null;
        if (tax_office !== undefined) updates.tax_office = tax_office ? String(tax_office).trim() : null;
        if (address !== undefined) updates.address = address ? String(address).trim() : null;
        if (city !== undefined) updates.city = city ? String(city).trim() : null;
        if (postal_code !== undefined) updates.postal_code = postal_code ? String(postal_code).trim() : null;
        if (country !== undefined) updates.country = country ? String(country).trim() : null;

        if (Object.keys(updates).length === 0) {
            return res.json({ success: true, message: "Δεν υπάρχουν αλλαγές" });
        }

        if (updates.tax_id) {
            const { data: existing } = await supabase
                .from("companies")
                .select("id")
                .eq("tax_id", updates.tax_id)
                .neq("id", companyId)
                .maybeSingle();
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: "Το ΑΦΜ υπάρχει ήδη σε άλλη εταιρεία",
                    code: "TAX_ID_TAKEN"
                });
            }
        }

        const { data: company, error: updErr } = await supabase
            .from("companies")
            .update(updates)
            .eq("id", companyId)
            .select("stripe_customer_id")
            .single();

        if (updErr) throw updErr;

        if (company?.stripe_customer_id && (updates.tax_id !== undefined || updates.address !== undefined)) {
            const stripeUpdates = {};
            if (updates.tax_id !== undefined) stripeUpdates.tax_id = updates.tax_id;
            if (updates.address !== undefined) stripeUpdates.address = { line1: updates.address };
            try {
                await stripe.customers.update(company.stripe_customer_id, stripeUpdates);
            } catch (stripeErr) {
                console.error("Stripe customer update:", stripeErr);
            }
        }

        return res.json({ success: true, message: "Τα νομικά στοιχεία ενημερώθηκαν" });
    } catch (err) {
        console.error("PATCH /company/legal ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// --------------------------------
// Team Members & Invitations
// --------------------------------

// GET /company/members - List company members with user and role
router.get("/company/members", requireAuth, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: members, error } = await supabase
            .from("company_users")
            .select(`
                id, user_id, role_id, is_owner, status,
                users (id, email, first_name, last_name),
                roles (id, key, name)
            `)
            .eq("company_id", companyId)
            .in("status", ["active", "disabled"])
            .order("is_owner", { ascending: false })
            .order("status", { ascending: true });

        if (error) {
            console.error("DB ERROR (company_members):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης μελών",
                code: "DB_ERROR"
            });
        }

        const result = (members || []).map(m => ({
            id: m.id,
            user_id: m.user_id,
            is_owner: m.is_owner,
            status: m.status,
            user: m.users,
            role: m.roles
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /company/members ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PUT /company/members/:userId/role - Change member role (users.edit or owner; only owner can assign admin)
router.put("/company/members/:userId/role", requireAuth, requireAnyPermission(['users.edit', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({ success: false, message: "Δεν έχει επιλεχθεί ενεργή εταιρεία", code: "NO_ACTIVE_COMPANY" });
    }
    const { userId } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
        return res.status(400).json({
            success: false,
            message: "Απαιτείται role_id",
            code: "MISSING_VALUES"
        });
    }

    try {
        const { data: member, error: fetchErr } = await supabase
            .from("company_users")
            .select("id, user_id, is_owner")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .maybeSingle();

        if (fetchErr || !member) {
            return res.status(404).json({
                success: false,
                message: "Το μέλος δεν βρέθηκε",
                code: "MEMBER_NOT_FOUND"
            });
        }

        if (member.is_owner) {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να αλλάξετε τον ρόλο ενός owner",
                code: "CANNOT_CHANGE_OWNER_ROLE"
            });
        }

        const { data: role, error: roleErr } = await supabase
            .from("roles")
            .select("id, key")
            .eq("id", role_id)
            .eq("company_id", companyId)
            .maybeSingle();

        if (roleErr || !role) {
            return res.status(404).json({
                success: false,
                message: "Ο ρόλος δεν βρέθηκε",
                code: "ROLE_NOT_FOUND"
            });
        }

        // Only owner can assign the admin role
        if (role.key === "admin") {
            const { data: requesterCu } = await supabase
                .from("company_users")
                .select("is_owner")
                .eq("company_id", companyId)
                .eq("user_id", req.user.id)
                .maybeSingle();
            if (!requesterCu?.is_owner) {
                return res.status(403).json({
                    success: false,
                    message: "Μόνο ο owner μπορεί να αναθέσει τον ρόλο Admin",
                    code: "ADMIN_ROLE_OWNER_ONLY"
                });
            }
        }

        const { error: updateErr } = await supabase
            .from("company_users")
            .update({ role_id })
            .eq("id", member.id);

        if (updateErr) throw updateErr;

        return res.json({ success: true, message: "Ο ρόλος ενημερώθηκε", data: { role_id } });
    } catch (err) {
        console.error("PUT /company/members/:userId/role ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/members/:userId/disable - Disable member (keeps in table, can reactivate)
router.patch("/company/members/:userId/disable", requireAuth, requireAnyPermission(['users.edit', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) return res.status(400).json({ success: false, message: "Δεν έχει επιλεχθεί ενεργή εταιρεία", code: "NO_ACTIVE_COMPANY" });
    const { userId } = req.params;

    try {
        const { data: member, error: fetchErr } = await supabase
            .from("company_users")
            .select("id, is_owner")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle();

        if (fetchErr || !member) {
            return res.status(404).json({ success: false, message: "Το μέλος δεν βρέθηκε", code: "MEMBER_NOT_FOUND" });
        }
        if (member.is_owner) {
            return res.status(400).json({ success: false, message: "Δεν μπορείτε να απενεργοποιήσετε έναν owner", code: "CANNOT_DISABLE_OWNER" });
        }

        const { error: updErr } = await supabase
            .from("company_users")
            .update({ status: "disabled" })
            .eq("id", member.id);
        if (updErr) throw updErr;

        return res.json({ success: true, message: "Το μέλος απενεργοποιήθηκε" });
    } catch (err) {
        console.error("PATCH /company/members/:userId/disable ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// PATCH /company/members/:userId/reactivate - Reactivate disabled member
router.patch("/company/members/:userId/reactivate", requireAuth, requireAnyPermission(['users.edit', 'company.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) return res.status(400).json({ success: false, message: "Δεν έχει επιλεχθεί ενεργή εταιρεία", code: "NO_ACTIVE_COMPANY" });
    const { userId } = req.params;

    try {
        const { data: member, error: fetchErr } = await supabase
            .from("company_users")
            .select("id")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .eq("status", "disabled")
            .maybeSingle();

        if (fetchErr || !member) {
            return res.status(404).json({ success: false, message: "Το μέλος δεν βρέθηκε", code: "MEMBER_NOT_FOUND" });
        }

        const { error: updErr } = await supabase
            .from("company_users")
            .update({ status: "active" })
            .eq("id", member.id);
        if (updErr) throw updErr;

        return res.json({ success: true, message: "Το μέλος επανενεργοποιήθηκε" });
    } catch (err) {
        console.error("PATCH /company/members/:userId/reactivate ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// PATCH /company/members/:userId/transfer-owner - Transfer ownership to another member (owner only)
router.patch("/company/members/:userId/transfer-owner", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { userId: newOwnerUserId } = req.params;

    if (!companyId) {
        return res.status(400).json({ success: false, message: "Δεν έχει επιλεχθεί ενεργή εταιρεία", code: "NO_ACTIVE_COMPANY" });
    }

    try {
        const currentUserId = req.user.id;

        const { data: newOwnerCu, error: fetchNewErr } = await supabase
            .from("company_users")
            .select("id, user_id, is_owner, role_id")
            .eq("company_id", companyId)
            .eq("user_id", newOwnerUserId)
            .in("status", ["active", "disabled"])
            .maybeSingle();

        if (fetchNewErr || !newOwnerCu) {
            return res.status(404).json({
                success: false,
                message: "Το μέλος δεν βρέθηκε",
                code: "MEMBER_NOT_FOUND"
            });
        }

        if (newOwnerCu.is_owner) {
            return res.status(400).json({
                success: false,
                message: "Ο χρήστης είναι ήδη owner",
                code: "ALREADY_OWNER"
            });
        }

        // Get admin role for the company (new owner will get it)
        const { data: adminRole } = await supabase
            .from("roles")
            .select("id")
            .eq("company_id", companyId)
            .eq("key", "admin")
            .maybeSingle();

        const adminRoleId = adminRole?.id;

        // 1. Unset is_owner on current owner, give them admin role
        const unsetUpdate = { is_owner: false };
        if (adminRoleId) unsetUpdate.role_id = adminRoleId;
        const { error: unsetErr } = await supabase
            .from("company_users")
            .update(unsetUpdate)
            .eq("company_id", companyId)
            .eq("user_id", currentUserId);

        if (unsetErr) throw unsetErr;

        // 2. Set is_owner on new owner and assign admin role
        const setUpdate = { is_owner: true };
        if (adminRoleId) setUpdate.role_id = adminRoleId;
        const { error: setErr } = await supabase
            .from("company_users")
            .update(setUpdate)
            .eq("id", newOwnerCu.id);

        if (setErr) throw setErr;

        return res.json({ success: true, message: "Η μεταβίβαση ownership ολοκληρώθηκε" });
    } catch (err) {
        console.error("PATCH /company/members/:userId/transfer-owner ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// DELETE /company/members/:userId - Remove member completely (delete row; can invite again) - owner only
router.delete("/company/members/:userId", requireAuth, requireOwner, async (req, res) => {
    const companyId = req.companyId || req.user.companyId;
    const { userId } = req.params;

    try {
        const { data: member, error: fetchErr } = await supabase
            .from("company_users")
            .select("id, is_owner")
            .eq("company_id", companyId)
            .eq("user_id", userId)
            .maybeSingle();

        if (fetchErr || !member) {
            return res.status(404).json({
                success: false,
                message: "Το μέλος δεν βρέθηκε",
                code: "MEMBER_NOT_FOUND"
            });
        }

        if (member.is_owner) {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να αφαιρέσετε έναν owner",
                code: "CANNOT_REMOVE_OWNER"
            });
        }

        const { error: deleteErr } = await supabase
            .from("company_users")
            .delete()
            .eq("id", member.id);

        if (deleteErr) throw deleteErr;

        return res.json({ success: true, message: "Το μέλος αφαιρέθηκε" });
    } catch (err) {
        console.error("DELETE /company/members/:userId ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/invitations - List pending invitations (owner or users.invite)
router.get("/company/invitations", requireAuth, requireAnyPermission(['users.invite', 'company.manage', '*']), async (req, res) => {
    const companyId = req.companyId || req.user.companyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: invites, error } = await supabase
            .from("invitations")
            .select("id, invited_email, token, status, expires_at, created_at, invited_by, role_id")
            .eq("company_id", companyId)
            .eq("status", "pending")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("DB ERROR (invitations):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης προσκλήσεων",
                code: "DB_ERROR"
            });
        }

        const roleIds = [...new Set((invites || []).map((i) => i.role_id).filter(Boolean))];
        let rolesMap = {};
        if (roleIds.length > 0) {
            const { data: roles } = await supabase
                .from("roles")
                .select("id, key, name")
                .in("id", roleIds);
            rolesMap = (roles || []).reduce((acc, r) => {
                acc[r.id] = r;
                return acc;
            }, {});
        }

        const result = (invites || []).map((inv) => ({
            id: inv.id,
            invited_email: inv.invited_email,
            token: inv.token,
            status: inv.status,
            expires_at: inv.expires_at,
            created_at: inv.created_at,
            role: rolesMap[inv.role_id] || null,
            invited_by: inv.invited_by
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /company/invitations ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/invitations/:id/revoke - Cancel a pending invitation (admin)
router.post("/company/invitations/:id/revoke", requireAuth, requireAnyPermission(['users.invite', 'company.manage', '*']), async (req, res) => {
    const { id } = req.params;
    const companyId = req.companyId || req.user.companyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: invite, error } = await supabase
            .from("invitations")
            .select("id, company_id, status")
            .eq("id", id)
            .maybeSingle();

        if (error || !invite) {
            return res.status(404).json({
                success: false,
                message: "Η πρόσκληση δεν βρέθηκε",
                code: "INVITE_NOT_FOUND"
            });
        }

        if (invite.company_id !== companyId) {
            return res.status(403).json({
                success: false,
                message: "Δεν έχετε δικαίωμα να ακυρώσετε αυτή την πρόσκληση",
                code: "FORBIDDEN"
            });
        }

        if (invite.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Η πρόσκληση δεν είναι ενεργή",
                code: "INVITE_NOT_ACTIVE"
            });
        }

        await supabase
            .from("invitations")
            .update({ status: "revoked" })
            .eq("id", id);

        return res.json({
            success: true,
            message: "Η πρόσκληση ακυρώθηκε",
            data: {}
        });
    } catch (err) {
        console.error("POST /company/invitations/:id/revoke ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

router.get("/invite/:token", async (req, res) => {
    const param = req.params.token;

    try {
        // Look up by token first, then by id (for backwards compatibility)
        let { data: invite, error } = await supabase
            .from("invitations")
            .select("id, invited_email, status, expires_at, company_id, role_id")
            .eq("token", param)
            .maybeSingle();

        if (!invite && !error) {
            const byId = await supabase
                .from("invitations")
                .select("id, invited_email, status, expires_at, company_id, role_id")
                .eq("id", param)
                .maybeSingle();
            invite = byId.data;
            error = byId.error;
        }

        if (error || !invite) {
            console.error("GET /invite/:token - Not found.", { param, error: error?.message });
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

        // Fetch company and role separately (avoids relation/join issues)
        const [companyRes, roleRes] = await Promise.all([
            supabase.from("companies").select("id, name").eq("id", invite.company_id).maybeSingle(),
            supabase.from("roles").select("id, key, name").eq("id", invite.role_id).maybeSingle()
        ]);
        const company = companyRes.data;
        const role = roleRes.data;

        // Check if user exists (for existing_user flag)
        const { data: inviteeUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", invite.invited_email)
            .maybeSingle();

        return res.json({
            success: true,
            data: {
                email: invite.invited_email,
                company: company || null,
                role: role || null,
                existing_user: !!inviteeUser
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
        // 1. Validate invitation (look up by token first, then by id)
        let { data: invite, error } = await supabase
            .from("invitations")
            .select("*")
            .eq("token", token)
            .maybeSingle();

        if (!invite && !error) {
            const byId = await supabase.from("invitations").select("*").eq("id", token).maybeSingle();
            invite = byId.data;
            error = byId.error;
        }

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

        // 2. Check if user exists (POST /invite/accept is only for new users; existing users accept via /my-invitations/:id/accept)
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", invite.invited_email)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists. Please log in and accept from the company selector.",
                code: "USER_ALREADY_EXISTS"
            });
        }

        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password required (min 6 characters)",
                code: "MISSING_PASSWORD"
            });
        }

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
        const userId = newUser.id;

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

// GET /my-invitations - Invitations sent to the current user (for company selector)
router.get("/my-invitations", requireAuth, async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
            code: "UNAUTHORIZED"
        });
    }

    const { data: userRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

    const userEmail = userRow?.email;
    if (!userEmail) {
        return res.status(401).json({
            success: false,
            message: "User email not found",
            code: "UNAUTHORIZED"
        });
    }

    try {
        const { data: invites, error } = await supabase
            .from("invitations")
            .select("id, token, invited_email, status, expires_at, created_at, company_id, role_id")
            .eq("invited_email", userEmail)
            .eq("status", "pending")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false });

        if (error) {
            console.error("DB ERROR (my-invitations):", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης προσκλήσεων",
                code: "DB_ERROR"
            });
        }

        if (!invites || invites.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const companyIds = [...new Set(invites.map((i) => i.company_id).filter(Boolean))];
        const roleIds = [...new Set(invites.map((i) => i.role_id).filter(Boolean))];

        const [companiesRes, rolesRes] = await Promise.all([
            companyIds.length ? supabase.from("companies").select("id, name").in("id", companyIds) : { data: [] },
            roleIds.length ? supabase.from("roles").select("id, name").in("id", roleIds) : { data: [] }
        ]);

        const companiesMap = Object.fromEntries((companiesRes.data || []).map((c) => [c.id, c]));
        const rolesMap = Object.fromEntries((rolesRes.data || []).map((r) => [r.id, r]));

        const result = invites.map((inv) => ({
            id: inv.id,
            token: inv.token,
            company: companiesMap[inv.company_id] || null,
            role: rolesMap[inv.role_id] || null,
            expires_at: inv.expires_at,
            created_at: inv.created_at
        }));

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /my-invitations ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /my-invitations/:id/accept - Accept invitation (authenticated; for existing users)
router.post("/my-invitations/:id/accept", requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const { data: userRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", userId)
        .maybeSingle();

    const userEmail = userRow?.email;
    if (!userEmail) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
            code: "UNAUTHORIZED"
        });
    }

    try {
        const { data: invite, error } = await supabase
            .from("invitations")
            .select("id, company_id, role_id, invited_email, status, expires_at")
            .eq("id", id)
            .maybeSingle();

        if (error || !invite) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
                code: "INVITE_NOT_FOUND"
            });
        }

        if (invite.invited_email !== userEmail) {
            return res.status(403).json({
                success: false,
                message: "This invitation is for a different email address",
                code: "INVITE_EMAIL_MISMATCH"
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

        const { error: cuErr } = await supabase
            .from("company_users")
            .insert({
                user_id: userId,
                company_id: invite.company_id,
                role_id: invite.role_id,
                is_owner: false
            });

        if (cuErr) throw cuErr;

        await supabase
            .from("invitations")
            .update({
                status: "accepted",
                accepted_at: new Date()
            })
            .eq("id", invite.id);

        return res.json({
            success: true,
            message: "Invitation accepted",
            data: { company_id: invite.company_id }
        });
    } catch (err) {
        console.error("POST /my-invitations/:id/accept ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /my-invitations/:id/reject - Reject/revoke invitation (authenticated)
router.post("/my-invitations/:id/reject", requireAuth, async (req, res) => {
    const { id } = req.params;

    const { data: userRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", req.user.id)
        .maybeSingle();

    const userEmail = userRow?.email;
    if (!userEmail) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized",
            code: "UNAUTHORIZED"
        });
    }

    try {
        const { data: invite, error } = await supabase
            .from("invitations")
            .select("id, invited_email, status")
            .eq("id", id)
            .maybeSingle();

        if (error || !invite) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found",
                code: "INVITE_NOT_FOUND"
            });
        }

        if (invite.invited_email !== userEmail) {
            return res.status(403).json({
                success: false,
                message: "This invitation is for a different email address",
                code: "INVITE_EMAIL_MISMATCH"
            });
        }

        if (invite.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Invitation is not active",
                code: "INVITE_NOT_ACTIVE"
            });
        }

        await supabase
            .from("invitations")
            .update({ status: "revoked" })
            .eq("id", invite.id);

        return res.json({
            success: true,
            message: "Invitation rejected",
            data: {}
        });
    } catch (err) {
        console.error("POST /my-invitations/:id/reject ERROR:", err);
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

// ============================================
// FOUNDATION APIs (product_categories, units, payment_methods)
// ============================================

// GET /company/product-categories - List categories for the company
router.get("/company/product-categories", requireAuth, requireAnyPermission(['products.view', 'products.categories.manage', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    try {
        const { data: categories, error } = await supabase
            .from("product_categories")
            .select("id, name, parent_id, company_id, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: true });

        if (error) {
            console.error("GET /company/product-categories:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των κατηγοριών",
                code: "DB_ERROR"
            });
        }

        const cats = categories ?? [];
        const parentIds = [...new Set(cats.map((c) => c.parent_id).filter(Boolean))];
        let parentMap = {};
        if (parentIds.length > 0) {
            const { data: parents } = await supabase
                .from("product_categories")
                .select("id, name")
                .in("id", parentIds);
            parentMap = Object.fromEntries((parents ?? []).map((p) => [p.id, p]));
        }
        const withParent = cats.map((c) => ({
            ...c,
            parent: c.parent_id && parentMap[c.parent_id] ? { id: parentMap[c.parent_id].id, name: parentMap[c.parent_id].name } : null
        }));

        return res.json({
            success: true,
            data: withParent
        });
    } catch (err) {
        console.error("GET /company/product-categories ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/product-categories - Create category
router.post("/company/product-categories", requireAuth, requireAnyPermission(['products.categories.manage', 'products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    const { name, parent_id } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα κατηγορίας είναι υποχρεωτικό",
            code: "MISSING_NAME"
        });
    }

    const resolvedParentId = parent_id != null && Number.isInteger(Number(parent_id)) ? Number(parent_id) : null;

    try {
        if (resolvedParentId) {
            const { data: parentCat } = await supabase
                .from("product_categories")
                .select("id, company_id")
                .eq("id", resolvedParentId)
                .single();
            if (!parentCat || parentCat.company_id !== companyId) {
                return res.status(400).json({
                    success: false,
                    message: "Η γονική κατηγορία δεν βρέθηκε ή δεν ανήκει στην εταιρεία σας",
                    code: "INVALID_PARENT"
                });
            }
        }

        const payload = {
            company_id: companyId,
            name: name.trim(),
            parent_id: resolvedParentId
        };

        const { data: created, error } = await supabase
            .from("product_categories")
            .insert(payload)
            .select("id, name, parent_id, company_id, created_at")
            .single();

        if (error) {
            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη κατηγορία με αυτό το όνομα",
                    code: "DUPLICATE_CATEGORY"
                });
            }
            console.error("POST /company/product-categories:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία κατηγορίας",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Η κατηγορία δημιουργήθηκε επιτυχώς",
            data: created
        });
    } catch (err) {
        console.error("POST /company/product-categories ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/product-categories/:id - Update category
router.patch("/company/product-categories/:id", requireAuth, requireAnyPermission(['products.categories.manage', 'products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { name, parent_id } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το id κατηγορίας",
            code: "MISSING_ID"
        });
    }

    const updates = {};
    if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Το όνομα κατηγορίας δεν μπορεί να είναι κενό",
                code: "INVALID_NAME"
            });
        }
        updates.name = name.trim();
    }
    if (parent_id !== undefined) {
        const newParentId = parent_id == null || parent_id === "" ? null : Number(parent_id);
        if (newParentId) {
            const { data: parentCat } = await supabase
                .from("product_categories")
                .select("id, company_id")
                .eq("id", newParentId)
                .single();
            if (!parentCat || parentCat.company_id !== companyId) {
                return res.status(400).json({
                    success: false,
                    message: "Η γονική κατηγορία δεν βρέθηκε ή δεν ανήκει στην εταιρεία σας",
                    code: "INVALID_PARENT"
                });
            }
            if (Number(id) === newParentId) {
                return res.status(400).json({
                    success: false,
                    message: "Η κατηγορία δεν μπορεί να είναι γονική του εαυτού της",
                    code: "SELF_REFERENCE"
                });
            }
        }
        updates.parent_id = newParentId;
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            success: false,
            message: "Δεν υπάρχουν αλλαγές προς ενημέρωση",
            code: "NO_UPDATES"
        });
    }

    try {
        const { data: updated, error } = await supabase
            .from("product_categories")
            .update(updates)
            .eq("id", id)
            .eq("company_id", companyId)
            .select("id, name, parent_id, company_id, created_at")
            .single();

        if (error) {
            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη κατηγορία με αυτό το όνομα",
                    code: "DUPLICATE_CATEGORY"
                });
            }
            console.error("PATCH /company/product-categories:", error);
            return res.status(404).json({
                success: false,
                message: "Η κατηγορία δεν βρέθηκε",
                code: "CATEGORY_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Η κατηγορία ενημερώθηκε επιτυχώς",
            data: updated
        });
    } catch (err) {
        console.error("PATCH /company/product-categories ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// DELETE /company/product-categories/:id - Delete category
router.delete("/company/product-categories/:id", requireAuth, requireAnyPermission(['products.categories.manage', 'products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    if (!id) {
        return res.status(400).json({
            success: false,
            message: "Λείπει το id κατηγορίας",
            code: "MISSING_ID"
        });
    }

    try {
        // Check if any products reference this category
        const { data: productsUsing, error: checkErr } = await supabase
            .from("products")
            .select("id")
            .eq("product_category_id", id)
            .limit(1);

        if (checkErr) {
            console.error("DELETE /company/product-categories check:", checkErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τον έλεγχο κατηγορίας",
                code: "DB_ERROR"
            });
        }
        if (productsUsing && productsUsing.length > 0) {
            return res.status(400).json({
                success: false,
                message: "Η κατηγορία χρησιμοποιείται από προϊόντα. Αφαιρέστε τη συνέχεια από τα προϊόντα πρώτα.",
                code: "CATEGORY_IN_USE"
            });
        }

        const { error } = await supabase
            .from("product_categories")
            .delete()
            .eq("id", id)
            .eq("company_id", companyId);

        if (error) {
            console.error("DELETE /company/product-categories:", error);
            return res.status(404).json({
                success: false,
                message: "Η κατηγορία δεν βρέθηκε",
                code: "CATEGORY_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Η κατηγορία διαγράφηκε επιτυχώς"
        });
    } catch (err) {
        console.error("DELETE /company/product-categories ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /units - List all units (global, no company filter)
router.get("/units", requireAuth, async (req, res) => {
    try {
        const { data: units, error } = await supabase
            .from("units")
            .select("id, unit_key, name_singular, name_plural, symbol, decimals, is_system")
            .order("id", { ascending: true });

        if (error) {
            console.error("GET /units:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των μονάδων",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: units ?? []
        });
    } catch (err) {
        console.error("GET /units ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/vat-rates - List VAT rates filtered by company country
router.get("/company/vat-rates", requireAuth, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    try {
        const { data: company, error: companyErr } = await supabase
            .from("companies")
            .select("country")
            .eq("id", companyId)
            .single();

        if (companyErr || !company) {
            return res.status(400).json({
                success: false,
                message: "Η εταιρεία δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const countryMap = { "Ελλάδα": "GR", "Greece": "GR", "GR": "GR", "EL": "GR" };
        const countryCode = countryMap[company.country] || (company.country && company.country.length === 2 ? company.country : "GR");

        const { data: rates, error } = await supabase
            .from("vat_rates")
            .select("id, name, rate, country_code, is_default")
            .eq("country_code", countryCode)
            .order("is_default", { ascending: false })
            .order("rate", { ascending: true });

        if (error) {
            console.error("GET /company/vat-rates:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των συντελεστών ΦΠΑ",
                code: "DB_ERROR"
            });
        }

        const validRates = (rates ?? []).filter(
            r => r != null && r.rate != null && r.country_code != null && r.country_code !== ""
        );
        const invalidCount = (rates ?? []).length - validRates.length;
        if (invalidCount > 0) {
            return res.status(500).json({
                success: false,
                message: `Υπάρχουν συντελεστές ΦΠΑ με ελλιπή rate ή country_code. Επικοινωνήστε με τον διαχειριστή.`,
                code: "INVALID_VAT_RATES"
            });
        }

        return res.json({
            success: true,
            data: validRates
        });
    } catch (err) {
        console.error("GET /company/vat-rates ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/payment-methods - List global + company-specific payment methods
router.get("/company/payment-methods", requireAuth, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }
    try {
        const { data: methods, error } = await supabase
            .from("payment_methods")
            .select("id, key, name, type, priority, is_active")
            .or(`company_id.is.null,company_id.eq.${companyId}`)
            .eq("is_active", true)
            .order("priority", { ascending: true });

        if (error) {
            console.error("GET /company/payment-methods:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των τρόπων πληρωμής",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: methods ?? []
        });
    } catch (err) {
        console.error("GET /company/payment-methods ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// PRODUCTS (with variants)
// ============================================

// Helper: barcode NOT NULL in schema - use placeholder when empty
function barcodeOrPlaceholder(val) {
    const v = val == null ? "" : String(val).trim();
    return v || `__nb_${crypto.randomUUID()}`;
}

// GET /company/products - List products with variants
router.get("/company/products", requireAuth, requireAnyPermission(['products.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { category_id, search } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        let query = supabase
            .from("products")
            .select(`
                id,
                name,
                description,
                product_category_id,
                unit_id,
                company_id,
                vat_rate_id,
                vat_exempt,
                created_at,
                product_categories (id, name),
                units (id, unit_key, symbol),
                vat_rates (id, name, rate),
                product_variants (id, product_id, name, sku, barcode, cost_price, sale_price, created_at)
            `)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (category_id && Number(category_id)) {
            query = query.eq("product_category_id", Number(category_id));
        }
        if (search && typeof search === "string" && search.trim()) {
            query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
        }

        const { data: products, error } = await query;

        if (error) {
            console.error("GET /company/products:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των προϊόντων",
                code: "DB_ERROR"
            });
        }

        const normalized = (products ?? []).map(p => ({
            ...p,
            category: p.product_categories ? { id: p.product_categories.id, name: p.product_categories.name } : null,
            unit: p.units ? { id: p.units.id, unit_key: p.units.unit_key, symbol: p.units.symbol } : null,
            vat_rate: p.vat_rates ? { id: p.vat_rates.id, name: p.vat_rates.name, rate: Number(p.vat_rates.rate) } : null,
            variants: p.product_variants ?? [],
            product_categories: undefined,
            units: undefined,
            vat_rates: undefined
        }));

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/products/:id - Single product with variants
router.get("/company/products/:id", requireAuth, requireAnyPermission(['products.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: product, error } = await supabase
            .from("products")
            .select(`
                id,
                name,
                description,
                product_category_id,
                unit_id,
                company_id,
                vat_rate_id,
                vat_exempt,
                created_at,
                product_categories (id, name),
                units (id, unit_key, symbol),
                vat_rates (id, name, rate),
                product_variants (id, product_id, name, sku, barcode, cost_price, sale_price, created_at)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !product) {
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        const normalized = {
            ...product,
            category: product.product_categories ? { id: product.product_categories.id, name: product.product_categories.name } : null,
            unit: product.units ? { id: product.units.id, unit_key: product.units.unit_key, symbol: product.units.symbol } : null,
            vat_rate: product.vat_rates ? { id: product.vat_rates.id, name: product.vat_rates.name, rate: Number(product.vat_rates.rate) } : null,
            variants: product.product_variants ?? [],
            product_categories: undefined,
            units: undefined,
            vat_rates: undefined
        };

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/products/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/products - Create product with variants
router.post("/company/products", requireAuth, requireAnyPermission(['products.create', 'products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const { name, description, product_category_id, unit_id, vat_rate_id, vat_exempt, variants } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα προϊόντος είναι υποχρεωτικό",
            code: "MISSING_NAME"
        });
    }

    if (!Array.isArray(variants) || variants.length < 1) {
        return res.status(400).json({
            success: false,
            message: "Χρειάζεται τουλάχιστον μία παραλλαγή",
            code: "MISSING_VARIANTS"
        });
    }

    for (const v of variants) {
        if (!v.name || typeof v.name !== "string" || !v.name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Κάθε παραλλαγή πρέπει να έχει όνομα",
                code: "INVALID_VARIANT"
            });
        }
    }

    try {
        const productPayload = {
            company_id: companyId,
            name: name.trim(),
            description: description ? String(description).trim() || null : null,
            product_category_id: product_category_id != null && Number(product_category_id) ? Number(product_category_id) : null,
            unit_id: unit_id != null && Number(unit_id) ? Number(unit_id) : null,
            vat_rate_id: vat_exempt === true ? null : (vat_rate_id != null && Number(vat_rate_id) ? Number(vat_rate_id) : null),
            vat_exempt: vat_exempt === true
        };

        const { data: createdProduct, error: productErr } = await supabase
            .from("products")
            .insert(productPayload)
            .select(`
                id, name, description, product_category_id, unit_id, company_id, vat_rate_id, vat_exempt, created_at,
                product_categories (id, name),
                units (id, unit_key, symbol),
                vat_rates (id, name, rate)
            `)
            .single();

        if (productErr) {
            console.error("POST /company/products:", productErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία προϊόντος",
                code: "DB_ERROR"
            });
        }

        const variantRows = variants.map(v => ({
            product_id: createdProduct.id,
            name: String(v.name).trim(),
            sku: v.sku != null && String(v.sku).trim() ? String(v.sku).trim() : null,
            barcode: barcodeOrPlaceholder(v.barcode),
            cost_price: v.cost_price != null && !isNaN(Number(v.cost_price)) ? Number(v.cost_price) : null,
            sale_price: v.sale_price != null && !isNaN(Number(v.sale_price)) ? Number(v.sale_price) : null
        }));

        const { data: createdVariants, error: variantsErr } = await supabase
            .from("product_variants")
            .insert(variantRows)
            .select("id, product_id, name, sku, barcode, cost_price, sale_price, created_at");

        if (variantsErr) {
            await supabase.from("products").delete().eq("id", createdProduct.id);
            if (variantsErr.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη προϊόν με αυτό το SKU ή barcode",
                    code: "DUPLICATE_SKU_OR_BARCODE"
                });
            }
            console.error("POST /company/products variants:", variantsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία παραλλαγών",
                code: "DB_ERROR"
            });
        }

        const result = {
            ...createdProduct,
            category: createdProduct.product_categories ? { id: createdProduct.product_categories.id, name: createdProduct.product_categories.name } : null,
            unit: createdProduct.units ? { id: createdProduct.units.id, unit_key: createdProduct.units.unit_key, symbol: createdProduct.units.symbol } : null,
            vat_rate: createdProduct.vat_rates ? { id: createdProduct.vat_rates.id, name: createdProduct.vat_rates.name, rate: Number(createdProduct.vat_rates.rate) } : null,
            variants: createdVariants ?? [],
            product_categories: undefined,
            units: undefined,
            vat_rates: undefined
        };

        return res.json({
            success: true,
            message: "Το προϊόν δημιουργήθηκε επιτυχώς",
            data: result
        });
    } catch (err) {
        console.error("POST /company/products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/products/:id - Update product
router.patch("/company/products/:id", requireAuth, requireAnyPermission(['products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { name, description, product_category_id, unit_id, vat_rate_id, vat_exempt } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    const updates = {};
    if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Το όνομα προϊόντος δεν μπορεί να είναι κενό",
                code: "INVALID_NAME"
            });
        }
        updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description ? String(description).trim() || null : null;
    if (product_category_id !== undefined) updates.product_category_id = product_category_id == null || product_category_id === "" ? null : Number(product_category_id);
    if (unit_id !== undefined) updates.unit_id = unit_id == null || unit_id === "" ? null : Number(unit_id);
    if (vat_exempt !== undefined) {
        updates.vat_exempt = vat_exempt === true;
        updates.vat_rate_id = vat_exempt === true ? null : (vat_rate_id != null && Number(vat_rate_id) ? Number(vat_rate_id) : null);
    } else if (vat_rate_id !== undefined) {
        updates.vat_rate_id = vat_rate_id == null || vat_rate_id === "" ? null : Number(vat_rate_id);
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            success: false,
            message: "Δεν υπάρχουν αλλαγές προς ενημέρωση",
            code: "NO_UPDATES"
        });
    }

    try {
        const { data: updated, error } = await supabase
            .from("products")
            .update(updates)
            .eq("id", id)
            .eq("company_id", companyId)
            .select(`
                id, name, description, product_category_id, unit_id, company_id, vat_rate_id, vat_exempt, created_at,
                product_categories (id, name),
                units (id, unit_key, symbol),
                vat_rates (id, name, rate),
                product_variants (id, product_id, name, sku, barcode, cost_price, sale_price, created_at)
            `)
            .single();

        if (error) {
            console.error("PATCH /company/products:", error);
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        const normalized = {
            ...updated,
            category: updated.product_categories ? { id: updated.product_categories.id, name: updated.product_categories.name } : null,
            unit: updated.units ? { id: updated.units.id, unit_key: updated.units.unit_key, symbol: updated.units.symbol } : null,
            vat_rate: updated.vat_rates ? { id: updated.vat_rates.id, name: updated.vat_rates.name, rate: Number(updated.vat_rates.rate) } : null,
            variants: updated.product_variants ?? [],
            product_categories: undefined,
            units: undefined,
            vat_rates: undefined,
            product_variants: undefined
        };

        return res.json({
            success: true,
            message: "Το προϊόν ενημερώθηκε επιτυχώς",
            data: normalized
        });
    } catch (err) {
        console.error("PATCH /company/products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// DELETE /company/products/:id
router.delete("/company/products/:id", requireAuth, requireAnyPermission(['products.delete', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: saleItems } = await supabase
            .from("sale_items")
            .select("id")
            .eq("product_id", id)
            .limit(1);

        const { data: purchaseItems } = await supabase
            .from("purchase_items")
            .select("id")
            .eq("product_id", id)
            .limit(1);

        if ((saleItems && saleItems.length > 0) || (purchaseItems && purchaseItems.length > 0)) {
            return res.status(400).json({
                success: false,
                message: "Το προϊόν χρησιμοποιείται σε πωλήσεις ή αγορές. Δεν μπορεί να διαγραφεί.",
                code: "PRODUCT_IN_USE"
            });
        }

        const { error: variantsErr } = await supabase
            .from("product_variants")
            .delete()
            .eq("product_id", id);

        if (variantsErr) {
            console.error("DELETE /company/products variants:", variantsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη διαγραφή",
                code: "DB_ERROR"
            });
        }

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", id)
            .eq("company_id", companyId);

        if (error) {
            console.error("DELETE /company/products:", error);
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Το προϊόν διαγράφηκε επιτυχώς"
        });
    } catch (err) {
        console.error("DELETE /company/products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/products/:productId/variants
router.post("/company/products/:productId/variants", requireAuth, requireAnyPermission(['products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { productId } = req.params;
    const { name, sku, barcode, cost_price, sale_price } = req.body;

    if (!companyId || !productId) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα παραλλαγής είναι υποχρεωτικό",
            code: "MISSING_NAME"
        });
    }

    try {
        const { data: product, error: prodErr } = await supabase
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("company_id", companyId)
            .single();

        if (prodErr || !product) {
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        const payload = {
            product_id: Number(productId),
            name: name.trim(),
            sku: sku != null && String(sku).trim() ? String(sku).trim() : null,
            barcode: barcodeOrPlaceholder(barcode),
            cost_price: cost_price != null && !isNaN(Number(cost_price)) ? Number(cost_price) : null,
            sale_price: sale_price != null && !isNaN(Number(sale_price)) ? Number(sale_price) : null
        };

        const { data: created, error } = await supabase
            .from("product_variants")
            .insert(payload)
            .select("id, product_id, name, sku, barcode, cost_price, sale_price, created_at")
            .single();

        if (error) {
            if (error.code === "23505") {
                return res.status(409).json({
                    success: false,
                    message: "Υπάρχει ήδη παραλλαγή με αυτό το SKU ή barcode",
                    code: "DUPLICATE_SKU_OR_BARCODE"
                });
            }
            console.error("POST /company/products/:productId/variants:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία παραλλαγής",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Η παραλλαγή δημιουργήθηκε επιτυχώς",
            data: created
        });
    } catch (err) {
        console.error("POST /company/products/:productId/variants ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/products/:productId/variants/:variantId
router.patch("/company/products/:productId/variants/:variantId", requireAuth, requireAnyPermission(['products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { productId, variantId } = req.params;
    const { name, sku, barcode, cost_price, sale_price } = req.body;

    if (!companyId || !productId || !variantId) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    const updates = {};
    if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "Το όνομα παραλλαγής δεν μπορεί να είναι κενό",
                code: "INVALID_NAME"
            });
        }
        updates.name = name.trim();
    }
    if (sku !== undefined) updates.sku = sku != null && String(sku).trim() ? String(sku).trim() : null;
    if (barcode !== undefined) {
        const b = barcode == null || String(barcode).trim() === "" ? null : String(barcode).trim();
        updates.barcode = barcodeOrPlaceholder(b);
    }
    if (cost_price !== undefined) updates.cost_price = cost_price == null || cost_price === "" ? null : (isNaN(Number(cost_price)) ? null : Number(cost_price));
    if (sale_price !== undefined) updates.sale_price = sale_price == null || sale_price === "" ? null : (isNaN(Number(sale_price)) ? null : Number(sale_price));

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            success: false,
            message: "Δεν υπάρχουν αλλαγές προς ενημέρωση",
            code: "NO_UPDATES"
        });
    }

    try {
        const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("company_id", companyId)
            .single();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        const { data: updated, error } = await supabase
            .from("product_variants")
            .update(updates)
            .eq("id", variantId)
            .eq("product_id", productId)
            .select("id, product_id, name, sku, barcode, cost_price, sale_price, created_at")
            .single();

        if (error || !updated) {
            return res.status(404).json({
                success: false,
                message: "Η παραλλαγή δεν βρέθηκε",
                code: "VARIANT_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Η παραλλαγή ενημερώθηκε επιτυχώς",
            data: updated
        });
    } catch (err) {
        console.error("PATCH /company/products/:productId/variants ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// DELETE /company/products/:productId/variants/:variantId
router.delete("/company/products/:productId/variants/:variantId", requireAuth, requireAnyPermission(['products.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { productId, variantId } = req.params;

    if (!companyId || !productId || !variantId) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: product } = await supabase
            .from("products")
            .select("id")
            .eq("id", productId)
            .eq("company_id", companyId)
            .single();

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε",
                code: "PRODUCT_NOT_FOUND"
            });
        }

        const { count: saleCount } = await supabase
            .from("sale_items")
            .select("id", { count: "exact", head: true })
            .eq("product_variant_id", variantId)
            .limit(1);

        const { count: purchaseCount } = await supabase
            .from("purchase_items")
            .select("id", { count: "exact", head: true })
            .eq("product_variant_id", variantId)
            .limit(1);

        const { count: storeProductsCount } = await supabase
            .from("store_products")
            .select("id", { count: "exact", head: true })
            .eq("product_variant_id", variantId)
            .limit(1);

        if ((saleCount > 0) || (purchaseCount > 0) || (storeProductsCount > 0)) {
            return res.status(400).json({
                success: false,
                message: "Η παραλλαγή χρησιμοποιείται. Δεν μπορεί να διαγραφεί.",
                code: "VARIANT_IN_USE"
            });
        }

        const { count: variantCount } = await supabase
            .from("product_variants")
            .select("id", { count: "exact", head: true })
            .eq("product_id", productId);

        if (variantCount <= 1) {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να διαγράψετε τη τελευταία παραλλαγή. Διαγράψτε το προϊόν αντίθετα.",
                code: "LAST_VARIANT"
            });
        }

        const { error } = await supabase
            .from("product_variants")
            .delete()
            .eq("id", variantId)
            .eq("product_id", productId);

        if (error) {
            console.error("DELETE /company/products/:productId/variants:", error);
            return res.status(404).json({
                success: false,
                message: "Η παραλλαγή δεν βρέθηκε",
                code: "VARIANT_NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            message: "Η παραλλαγή διαγράφηκε επιτυχώς"
        });
    } catch (err) {
        console.error("DELETE /company/products/:productId/variants ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// CUSTOMERS APIs
// ============================================

// GET /company/customers - List customers for active company
router.get("/company/customers", requireAuth, requireAnyPermission(['customers.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { search } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        let query = supabase
            .from("customers")
            .select("id, full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (search && typeof search === "string" && search.trim()) {
            const term = search.trim();
            query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
        }

        const { data: customers, error } = await query;

        if (error) {
            console.error("GET /company/customers:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των πελατών",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: customers ?? []
        });
    } catch (err) {
        console.error("GET /company/customers ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/customers/:id - Single customer
router.get("/company/customers/:id", requireAuth, requireAnyPermission(['customers.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: customer, error } = await supabase
            .from("customers")
            .select("id, full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !customer) {
            return res.status(404).json({
                success: false,
                message: "Ο πελάτης δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        console.error("GET /company/customers/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/customers - Create customer
router.post("/company/customers", requireAuth, requireAnyPermission(['customers.create', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα πελάτη είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    const validPaymentTerms = ["immediate", "15", "30", "60", "90"];
    const paymentTermsVal = payment_terms && validPaymentTerms.includes(String(payment_terms).toLowerCase()) ? String(payment_terms).toLowerCase() : "immediate";

    try {
        const insertData = {
            company_id: companyId,
            full_name: full_name.trim(),
            payment_terms: paymentTermsVal,
            phone: phone && typeof phone === "string" ? phone.trim() || null : null,
            email: email && typeof email === "string" ? email.trim() || null : null,
            tax_id: tax_id && typeof tax_id === "string" ? tax_id.trim() || null : null,
            address: address && typeof address === "string" ? address.trim() || null : null,
            city: city && typeof city === "string" ? city.trim() || null : null,
            postal_code: postal_code && typeof postal_code === "string" ? postal_code.trim() || null : null,
            country: country && typeof country === "string" ? country.trim() || null : null,
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            created_by: userId || null
        };

        const { data: customer, error } = await supabase
            .from("customers")
            .insert(insertData)
            .select("id, full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .single();

        if (error) {
            console.error("POST /company/customers:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία πελάτη",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        console.error("POST /company/customers ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/customers/:id - Update customer
router.patch("/company/customers/:id", requireAuth, requireAnyPermission(['customers.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    const validPaymentTerms = ["immediate", "15", "30", "60", "90"];

    try {
        const updates = {};
        if (full_name !== undefined) updates.full_name = typeof full_name === "string" ? full_name.trim() : full_name;
        if (phone !== undefined) updates.phone = phone && typeof phone === "string" ? phone.trim() || null : phone;
        if (email !== undefined) updates.email = email && typeof email === "string" ? email.trim() || null : email;
        if (tax_id !== undefined) updates.tax_id = tax_id && typeof tax_id === "string" ? tax_id.trim() || null : tax_id;
        if (address !== undefined) updates.address = address && typeof address === "string" ? address.trim() || null : address;
        if (city !== undefined) updates.city = city && typeof city === "string" ? city.trim() || null : city;
        if (postal_code !== undefined) updates.postal_code = postal_code && typeof postal_code === "string" ? postal_code.trim() || null : postal_code;
        if (country !== undefined) updates.country = country && typeof country === "string" ? country.trim() || null : country;
        if (notes !== undefined) updates.notes = notes && typeof notes === "string" ? notes.trim() || null : notes;
        if (payment_terms !== undefined && validPaymentTerms.includes(String(payment_terms).toLowerCase())) {
            updates.payment_terms = String(payment_terms).toLowerCase();
        }

        if (updates.full_name !== undefined && (!updates.full_name || !String(updates.full_name).trim())) {
            return res.status(400).json({
                success: false,
                message: "Το όνομα πελάτη δεν μπορεί να είναι κενό",
                code: "VALIDATION_ERROR"
            });
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχουν αλλαγές προς ενημέρωση",
                code: "NO_UPDATES"
            });
        }

        const { data: customer, error } = await supabase
            .from("customers")
            .update(updates)
            .eq("id", id)
            .eq("company_id", companyId)
            .select("id, full_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .single();

        if (error) {
            console.error("PATCH /company/customers:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση πελάτη",
                code: "DB_ERROR"
            });
        }

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Ο πελάτης δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            data: customer
        });
    } catch (err) {
        console.error("PATCH /company/customers ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/customers/:id/outstanding - Sum of amount_due for unpaid/partial INV
router.get("/company/customers/:id/outstanding", requireAuth, requireAnyPermission(['customers.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    }

    try {
        const { data: rows } = await supabase
            .from("sales")
            .select("amount_due")
            .eq("company_id", companyId)
            .eq("customer_id", id)
            .in("invoice_type", ["INV"])
            .in("payment_status", ["unpaid", "partial"]);
        const amount = (rows || []).reduce((s, r) => s + (Number(r.amount_due) || 0), 0);
        return res.json({ success: true, data: { amount: Math.round(amount * 100) / 100 } });
    } catch (err) {
        console.error("GET /company/customers/:id/outstanding ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// DELETE /company/customers/:id
router.delete("/company/customers/:id", requireAuth, requireAnyPermission(['customers.delete', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { error } = await supabase
            .from("customers")
            .delete()
            .eq("id", id)
            .eq("company_id", companyId);

        if (error) {
            console.error("DELETE /company/customers:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη διαγραφή",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Ο πελάτης διαγράφηκε επιτυχώς"
        });
    } catch (err) {
        console.error("DELETE /company/customers ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// VENDORS APIs
// ============================================

// GET /company/vendors - List vendors for active company
router.get("/company/vendors", requireAuth, requireAnyPermission(['vendors.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { search } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        let query = supabase
            .from("vendors")
            .select("id, name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (search && typeof search === "string" && search.trim()) {
            const term = search.trim();
            query = query.or(`name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
        }

        const { data: vendors, error } = await query;

        if (error) {
            console.error("GET /company/vendors:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των προμηθευτών",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: vendors ?? []
        });
    } catch (err) {
        console.error("GET /company/vendors ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/vendors/:id - Single vendor
router.get("/company/vendors/:id", requireAuth, requireAnyPermission(['vendors.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: vendor, error } = await supabase
            .from("vendors")
            .select("id, name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !vendor) {
            return res.status(404).json({
                success: false,
                message: "Ο προμηθευτής δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            data: vendor
        });
    } catch (err) {
        console.error("GET /company/vendors/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/vendors - Create vendor
router.post("/company/vendors", requireAuth, requireAnyPermission(['vendors.create', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το όνομα προμηθευτή είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    const validPaymentTerms = ["immediate", "15", "30", "60", "90"];
    const paymentTermsVal = payment_terms && validPaymentTerms.includes(String(payment_terms).toLowerCase()) ? String(payment_terms).toLowerCase() : "immediate";

    try {
        const insertData = {
            company_id: companyId,
            name: name.trim(),
            payment_terms: paymentTermsVal,
            contact_name: contact_name && typeof contact_name === "string" ? contact_name.trim() || null : null,
            phone: phone && typeof phone === "string" ? phone.trim() || null : null,
            email: email && typeof email === "string" ? email.trim() || null : null,
            tax_id: tax_id && typeof tax_id === "string" ? tax_id.trim() || null : null,
            address: address && typeof address === "string" ? address.trim() || null : null,
            city: city && typeof city === "string" ? city.trim() || null : null,
            postal_code: postal_code && typeof postal_code === "string" ? postal_code.trim() || null : null,
            country: country && typeof country === "string" ? country.trim() || null : null,
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            created_by: userId || null
        };

        const { data: vendor, error } = await supabase
            .from("vendors")
            .insert(insertData)
            .select("id, name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .single();

        if (error) {
            console.error("POST /company/vendors:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία προμηθευτή",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: vendor
        });
    } catch (err) {
        console.error("POST /company/vendors ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/vendors/:id - Update vendor
router.patch("/company/vendors/:id", requireAuth, requireAnyPermission(['vendors.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    const validPaymentTerms = ["immediate", "15", "30", "60", "90"];

    try {
        const updates = {};
        if (name !== undefined) updates.name = typeof name === "string" ? name.trim() : name;
        if (contact_name !== undefined) updates.contact_name = contact_name && typeof contact_name === "string" ? contact_name.trim() || null : contact_name;
        if (phone !== undefined) updates.phone = phone && typeof phone === "string" ? phone.trim() || null : phone;
        if (email !== undefined) updates.email = email && typeof email === "string" ? email.trim() || null : email;
        if (tax_id !== undefined) updates.tax_id = tax_id && typeof tax_id === "string" ? tax_id.trim() || null : tax_id;
        if (address !== undefined) updates.address = address && typeof address === "string" ? address.trim() || null : address;
        if (city !== undefined) updates.city = city && typeof city === "string" ? city.trim() || null : city;
        if (postal_code !== undefined) updates.postal_code = postal_code && typeof postal_code === "string" ? postal_code.trim() || null : postal_code;
        if (country !== undefined) updates.country = country && typeof country === "string" ? country.trim() || null : country;
        if (notes !== undefined) updates.notes = notes && typeof notes === "string" ? notes.trim() || null : notes;
        if (payment_terms !== undefined && validPaymentTerms.includes(String(payment_terms).toLowerCase())) {
            updates.payment_terms = String(payment_terms).toLowerCase();
        }

        if (updates.name !== undefined && (!updates.name || !String(updates.name).trim())) {
            return res.status(400).json({
                success: false,
                message: "Το όνομα προμηθευτή δεν μπορεί να είναι κενό",
                code: "VALIDATION_ERROR"
            });
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχουν αλλαγές προς ενημέρωση",
                code: "NO_UPDATES"
            });
        }

        const { data: vendor, error } = await supabase
            .from("vendors")
            .update(updates)
            .eq("id", id)
            .eq("company_id", companyId)
            .select("id, name, contact_name, phone, email, tax_id, address, city, postal_code, country, notes, payment_terms, company_id, created_at")
            .single();

        if (error) {
            console.error("PATCH /company/vendors:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση προμηθευτή",
                code: "DB_ERROR"
            });
        }

        if (!vendor) {
            return res.status(404).json({
                success: false,
                message: "Ο προμηθευτής δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        return res.json({
            success: true,
            data: vendor
        });
    } catch (err) {
        console.error("PATCH /company/vendors ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/vendors/:id/outstanding - Sum of amount_due for unpaid/partial PUR
router.get("/company/vendors/:id/outstanding", requireAuth, requireAnyPermission(['vendors.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    }

    try {
        const { data: rows } = await supabase
            .from("purchases")
            .select("amount_due")
            .eq("company_id", companyId)
            .eq("vendor_id", id)
            .in("document_type", ["PUR"])
            .in("payment_status", ["unpaid", "partial"]);
        const amount = (rows || []).reduce((s, r) => s + (Number(r.amount_due) || 0), 0);
        return res.json({ success: true, data: { amount: Math.round(amount * 100) / 100 } });
    } catch (err) {
        console.error("GET /company/vendors/:id/outstanding ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// DELETE /company/vendors/:id
router.delete("/company/vendors/:id", requireAuth, requireAnyPermission(['vendors.delete', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { error } = await supabase
            .from("vendors")
            .delete()
            .eq("id", id)
            .eq("company_id", companyId);

        if (error) {
            console.error("DELETE /company/vendors:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη διαγραφή",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            message: "Ο προμηθευτής διαγράφηκε επιτυχώς"
        });
    } catch (err) {
        console.error("DELETE /company/vendors ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// INVENTORY APIs
// ============================================

// GET /company/store-products - List ALL products and variants for the company, joined with store_products for the selected store
router.get("/company/store-products", requireAuth, requireAnyPermission(['inventory.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, search } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "MISSING_STORE"
        });
    }

    const storeId = store_id.trim();

    try {
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", storeId)
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        // Fetch company product ids, then all variants for those products
        const { data: companyProducts, error: prodErr } = await supabase
            .from("products")
            .select("id")
            .eq("company_id", companyId);

        if (prodErr) {
            console.error("GET /company/store-products products:", prodErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση αποθεμάτων",
                code: "DB_ERROR"
            });
        }

        const productIds = (companyProducts ?? []).map(p => p.id);
        if (productIds.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const { data: variants, error: varErr } = await supabase
            .from("product_variants")
            .select(`
                id,
                product_id,
                name,
                sku,
                products (id, name, unit_id, company_id)
            `)
            .in("product_id", productIds);

        if (varErr) {
            console.error("GET /company/store-products variants:", varErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση αποθεμάτων",
                code: "DB_ERROR"
            });
        }

        // Fetch store_products for this store
        const { data: storeProducts, error: spErr } = await supabase
            .from("store_products")
            .select("id, product_id, product_variant_id, stock_quantity, store_sale_price")
            .eq("store_id", storeId);

        if (spErr) {
            console.error("GET /company/store-products store_products:", spErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση αποθεμάτων",
                code: "DB_ERROR"
            });
        }

        const spByVariant = (storeProducts ?? []).reduce((acc, sp) => {
            acc[sp.product_variant_id] = sp;
            return acc;
        }, {});

        const searchTerm = (search && typeof search === "string" && search.trim()) ? search.trim().toLowerCase() : null;

        let results = (variants ?? []).map(v => {
            const product = v.products;
            if (!product || product.company_id !== companyId) return null;

            const sp = spByVariant[v.id];
            const stock_quantity = sp ? Number(sp.stock_quantity) : 0;
            const store_sale_price = sp && sp.store_sale_price != null ? Number(sp.store_sale_price) : null;

            const productName = (product.name || "").toLowerCase();
            const variantName = (v.name || "").toLowerCase();
            const sku = (v.sku || "").toLowerCase();

            if (searchTerm && !productName.includes(searchTerm) && !variantName.includes(searchTerm) && !sku.includes(searchTerm)) {
                return null;
            }

            return {
                id: sp ? sp.id : null,
                store_id: storeId,
                product_id: v.product_id,
                product_variant_id: v.id,
                stock_quantity,
                store_sale_price,
                product: { id: product.id, name: product.name, unit_id: product.unit_id },
                variant: { id: v.id, name: v.name, sku: v.sku }
            };
        }).filter(Boolean);

        const unitIds = [...new Set(results.map(r => r.product?.unit_id).filter(Boolean))];
        const unitsMap = {};
        if (unitIds.length > 0) {
            const { data: units } = await supabase.from("units").select("id, unit_key, symbol").in("id", unitIds);
            (units ?? []).forEach(u => { unitsMap[u.id] = u; });
        }
        results = results.map(r => {
            const u = r.product?.unit_id ? unitsMap[r.product.unit_id] : null;
            const { product, ...rest } = r;
            return {
                ...rest,
                product: product ? { id: product.id, name: product.name } : null,
                unit: u ? { id: u.id, unit_key: u.unit_key, symbol: u.symbol } : null
            };
        });

        return res.json({
            success: true,
            data: results
        });
    } catch (err) {
        console.error("GET /company/store-products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/store-products - Create or update store_product (for setting sale price when no record exists)
router.post("/company/store-products", requireAuth, requireAnyPermission(['inventory.edit', 'inventory.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, product_id, product_variant_id, store_sale_price } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof product_id !== "number" || typeof product_variant_id !== "number") {
        return res.status(400).json({
            success: false,
            message: "Λείπουν store_id, product_id ή product_variant_id",
            code: "VALIDATION_ERROR"
        });
    }

    const priceVal = store_sale_price === null || store_sale_price === undefined
        ? null
        : (typeof store_sale_price === "number" ? store_sale_price : Number(store_sale_price));
    if (priceVal !== null && (isNaN(priceVal) || priceVal < 0)) {
        return res.status(400).json({
            success: false,
            message: "Το store_sale_price πρέπει να είναι αριθμός >= 0 ή null",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", String(store_id).trim())
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        const { data: variant } = await supabase
            .from("product_variants")
            .select("id, product_id")
            .eq("id", product_variant_id)
            .eq("product_id", product_id)
            .single();

        if (!variant) {
            return res.status(400).json({
                success: false,
                message: "Η παραλλαγή δεν αντιστοιχεί στο προϊόν",
                code: "INVALID_PRODUCT_VARIANT"
            });
        }

        const { data: productRow } = await supabase
            .from("products")
            .select("id, company_id")
            .eq("id", product_id)
            .eq("company_id", companyId)
            .single();

        if (!productRow) {
            return res.status(400).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_PRODUCT"
            });
        }

        const storeId = String(store_id).trim();

        const { data: existing } = await supabase
            .from("store_products")
            .select("id, stock_quantity, store_sale_price")
            .eq("store_id", storeId)
            .eq("product_variant_id", product_variant_id)
            .maybeSingle();

        let result;
        if (existing) {
            const { data: updated, error: updErr } = await supabase
                .from("store_products")
                .update({ store_sale_price: priceVal })
                .eq("id", existing.id)
                .select()
                .single();

            if (updErr) {
                console.error("POST /company/store-products update:", updErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση",
                    code: "DB_ERROR"
                });
            }
            result = updated;
        } else {
            const { data: inserted, error: insErr } = await supabase
                .from("store_products")
                .insert({
                    store_id: storeId,
                    product_id,
                    product_variant_id,
                    stock_quantity: 0,
                    store_sale_price: priceVal
                })
                .select()
                .single();

            if (insErr) {
                console.error("POST /company/store-products insert:", insErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη δημιουργία",
                    code: "DB_ERROR"
                });
            }
            result = inserted;
        }

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        console.error("POST /company/store-products ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// PATCH /company/store-products/:id - Update store_sale_price only
router.patch("/company/store-products/:id", requireAuth, requireAnyPermission(['inventory.edit', 'inventory.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { store_sale_price } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    const spId = parseInt(id, 10);
    if (isNaN(spId)) {
        return res.status(400).json({
            success: false,
            message: "Μη έγκυρο αναγνωριστικό",
            code: "VALIDATION_ERROR"
        });
    }

    const priceVal = store_sale_price === null || store_sale_price === undefined
        ? null
        : (typeof store_sale_price === "number" ? store_sale_price : Number(store_sale_price));
    if (priceVal !== null && (isNaN(priceVal) || priceVal < 0)) {
        return res.status(400).json({
            success: false,
            message: "Το store_sale_price πρέπει να είναι αριθμός >= 0 ή null",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: sp, error: spErr } = await supabase
            .from("store_products")
            .select("id, store_id, product_id, product_variant_id, stock_quantity, store_sale_price")
            .eq("id", spId)
            .single();

        if (spErr || !sp) {
            return res.status(404).json({
                success: false,
                message: "Το store product δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", sp.store_id)
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(403).json({
                success: false,
                message: "Το κατάστημα δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        const { data: updated, error: updErr } = await supabase
            .from("store_products")
            .update({ store_sale_price: priceVal })
            .eq("id", spId)
            .select()
            .single();

        if (updErr) {
            console.error("PATCH /company/store-products/:id:", updErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ενημέρωση",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: updated
        });
    } catch (err) {
        console.error("PATCH /company/store-products/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/inventory/adjust - Set physical quantity (adjustment = physical_quantity - current_stock_quantity)
router.post("/company/inventory/adjust", requireAuth, requireAnyPermission(['inventory.adjust', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const { store_id, product_id, product_variant_id, physical_quantity, confirm_negative_stock } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    if (typeof product_id !== "number" || typeof product_variant_id !== "number") {
        return res.status(400).json({
            success: false,
            message: "Λείπουν product_id ή product_variant_id",
            code: "VALIDATION_ERROR"
        });
    }

    const physicalQty = Number(physical_quantity);
    if (isNaN(physicalQty) || physicalQty < 0) {
        return res.status(400).json({
            success: false,
            message: "Η physical_quantity πρέπει να είναι αριθμός >= 0",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", store_id.trim())
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        const { data: variant, error: variantErr } = await supabase
            .from("product_variants")
            .select("id, product_id")
            .eq("id", product_variant_id)
            .eq("product_id", product_id)
            .single();

        if (variantErr || !variant) {
            return res.status(400).json({
                success: false,
                message: "Η παραλλαγή προϊόντος δεν αντιστοιχεί στο προϊόν",
                code: "INVALID_PRODUCT_VARIANT"
            });
        }

        const { data: productRow } = await supabase
            .from("products")
            .select("id, company_id")
            .eq("id", product_id)
            .eq("company_id", companyId)
            .single();

        if (!productRow) {
            return res.status(400).json({
                success: false,
                message: "Το προϊόν δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_PRODUCT"
            });
        }

        const { data: existing } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", store_id.trim())
            .eq("product_variant_id", product_variant_id)
            .maybeSingle();

        const currentQty = existing ? Number(existing.stock_quantity) : 0;
        const adjustment = physicalQty - currentQty;

        if (adjustment < 0) {
            const reduceQty = Math.abs(adjustment);
            const checkItems = [{ store_id: store_id.trim(), product_variant_id, product_id, quantity: reduceQty }];
            const result = await checkStockAvailability(companyId, checkItems, { userPermissions });
            if (result.block && !confirm_negative_stock) {
                const code = result.message && result.message.includes("δικαίωμα") ? "NO_PERMISSION_NEGATIVE_STOCK" : "INSUFFICIENT_STOCK";
                return res.status(400).json({
                    success: false,
                    code,
                    message: result.message || "Ανεπαρκές απόθεμα",
                    insufficientItems: result.insufficientItems || []
                });
            }
            if (result.warning && !confirm_negative_stock) {
                return res.status(200).json({
                    success: false,
                    code: "REQUIRES_CONFIRMATION",
                    requires_negative_stock_confirmation: true,
                    insufficientItems: result.insufficientItems || [],
                    message: result.message || "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;"
                });
            }
        }

        if (adjustment === 0 && !(physicalQty === 0 && !existing)) {
            return res.json({
                success: true,
                data: existing || {
                    id: null,
                    store_id: store_id.trim(),
                    product_id,
                    product_variant_id,
                    stock_quantity: physicalQty,
                    store_sale_price: existing?.store_sale_price ?? null
                },
                message: "Δεν απαιτείται προσαρμογή"
            });
        }

        let storeProduct;
        const newQty = physicalQty;

        if (existing) {
            const { data: updated, error: updateErr } = await supabase
                .from("store_products")
                .update({ stock_quantity: newQty })
                .eq("id", existing.id)
                .select()
                .single();

            if (updateErr) {
                console.error("POST /company/inventory/adjust update:", updateErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την ενημέρωση αποθέματος",
                    code: "DB_ERROR"
                });
            }
            storeProduct = updated;
        } else {
            if (newQty > 0) {
                const { data: inserted, error: insertErr } = await supabase
                    .from("store_products")
                    .insert({
                        store_id: store_id.trim(),
                        product_id,
                        product_variant_id,
                        stock_quantity: newQty
                    })
                    .select()
                    .single();

                if (insertErr) {
                    console.error("POST /company/inventory/adjust insert:", insertErr);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά τη δημιουργία εγγραφής αποθέματος",
                        code: "DB_ERROR"
                    });
                }
                storeProduct = inserted;
            } else {
                storeProduct = null;
            }
        }

        const { error: moveErr } = await supabase
            .from("stock_movements")
            .insert({
                company_id: companyId,
                store_id: store_id.trim(),
                product_id,
                product_variant_id,
                quantity: adjustment,
                movement_type: "adjustment",
                source: "manual",
                related_document_type: "adjustment",
                created_by: userId || null
            });

        if (moveErr) {
            console.error("POST /company/inventory/adjust stock_movement:", moveErr);
        }

        return res.json({
            success: true,
            data: storeProduct
        });
    } catch (err) {
        console.error("POST /company/inventory/adjust ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/stock-movements - List stock movements for a store with filters
router.get("/company/stock-movements", requireAuth, requireAnyPermission(['inventory.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, date_from, date_to, movement_type } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το store_id είναι υποχρεωτικό",
            code: "MISSING_STORE"
        });
    }

    const storeId = store_id.trim();

    try {
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", storeId)
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        let query = supabase
            .from("stock_movements")
            .select(`
                id,
                created_at,
                product_id,
                product_variant_id,
                quantity,
                movement_type,
                source,
                related_document_type,
                related_document_id,
                created_by,
                products (id, name),
                product_variants (id, name, sku)
            `)
            .eq("store_id", storeId)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (date_from && typeof date_from === "string" && date_from.trim()) {
            query = query.gte("created_at", date_from.trim());
        }
        if (date_to && typeof date_to === "string" && date_to.trim()) {
            const d = new Date(date_to.trim());
            d.setUTCDate(d.getUTCDate() + 1);
            query = query.lt("created_at", d.toISOString());
        }
        if (movement_type && typeof movement_type === "string" && movement_type.trim()) {
            query = query.eq("movement_type", movement_type.trim());
        }

        const { data: rows, error } = await query;

        if (error) {
            console.error("GET /company/stock-movements:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση κινήσεων αποθήκης",
                code: "DB_ERROR"
            });
        }

        const results = (rows ?? []).map(r => ({
            id: r.id,
            created_at: r.created_at,
            product_id: r.product_id,
            product_variant_id: r.product_variant_id,
            quantity: Number(r.quantity),
            movement_type: r.movement_type,
            source: r.source,
            related_document_type: r.related_document_type,
            related_document_id: r.related_document_id,
            created_by: r.created_by,
            product_name: r.products?.name ?? null,
            variant_name: r.product_variants?.name ?? null,
            variant_sku: r.product_variants?.sku ?? null
        }));

        return res.json({
            success: true,
            data: results
        });
    } catch (err) {
        console.error("GET /company/stock-movements ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/inventory/transfer - Transfer stock between stores
router.post("/company/inventory/transfer", requireAuth, requireAnyPermission(['inventory.transfer', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const { from_store_id, to_store_id, product_id, product_variant_id, quantity, confirm_negative_stock } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!from_store_id || !to_store_id || typeof product_id !== "number" || typeof product_variant_id !== "number") {
        return res.status(400).json({
            success: false,
            message: "Λείπουν υποχρεωτικά πεδία",
            code: "VALIDATION_ERROR"
        });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({
            success: false,
            message: "Η ποσότητα πρέπει να είναι θετική",
            code: "VALIDATION_ERROR"
        });
    }

    const fromId = String(from_store_id).trim();
    const toId = String(to_store_id).trim();

    if (fromId === toId) {
        return res.status(400).json({
            success: false,
            message: "Το προέλευση και ο προορισμός πρέπει να είναι διαφορετικά καταστήματα",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: fromStore, error: fromErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", fromId)
            .eq("company_id", companyId)
            .single();

        const { data: toStore, error: toErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", toId)
            .eq("company_id", companyId)
            .single();

        if (fromErr || !fromStore || toErr || !toStore) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        const { data: variant, error: variantErr } = await supabase
            .from("product_variants")
            .select("id, product_id")
            .eq("id", product_variant_id)
            .eq("product_id", product_id)
            .single();

        if (variantErr || !variant) {
            return res.status(400).json({
                success: false,
                message: "Η παραλλαγή προϊόντος δεν αντιστοιχεί στο προϊόν",
                code: "INVALID_PRODUCT_VARIANT"
            });
        }

        const { data: fromSp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", fromId)
            .eq("product_variant_id", product_variant_id)
            .maybeSingle();

        const fromQty = fromSp ? Number(fromSp.stock_quantity) : 0;
        if (fromQty < qty) {
            const checkItems = [{ store_id: fromId, product_variant_id, product_id, quantity: qty }];
            const result = await checkStockAvailability(companyId, checkItems, { userPermissions });
            if (result.block && !confirm_negative_stock) {
                const code = result.message && result.message.includes("δικαίωμα") ? "NO_PERMISSION_NEGATIVE_STOCK" : "INSUFFICIENT_STOCK";
                return res.status(400).json({
                    success: false,
                    code,
                    message: result.message || "Ανεπαρκές απόθεμα",
                    insufficientItems: result.insufficientItems || []
                });
            }
            if (result.warning && !confirm_negative_stock) {
                return res.status(200).json({
                    success: false,
                    code: "REQUIRES_CONFIRMATION",
                    requires_negative_stock_confirmation: true,
                    insufficientItems: result.insufficientItems || [],
                    message: result.message || "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;"
                });
            }
        }

        const fromNewQty = fromQty - qty;

        if (fromSp) {
            const { error: updFrom } = await supabase
                .from("store_products")
                .update({ stock_quantity: fromNewQty })
                .eq("id", fromSp.id);

            if (updFrom) {
                console.error("POST /company/inventory/transfer from:", updFrom);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη μεταφορά",
                    code: "DB_ERROR"
                });
            }
        } else {
            const { error: insFrom } = await supabase
                .from("store_products")
                .insert({
                    store_id: fromId,
                    product_id,
                    product_variant_id,
                    stock_quantity: fromNewQty
                });

            if (insFrom) {
                console.error("POST /company/inventory/transfer from insert:", insFrom);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη μεταφορά",
                    code: "DB_ERROR"
                });
            }
        }

        const { error: outMove } = await supabase
            .from("stock_movements")
            .insert({
                company_id: companyId,
                store_id: fromId,
                product_id,
                product_variant_id,
                quantity: -qty,
                movement_type: "out",
                source: "manual",
                related_document_type: "transfer",
                related_document_id: null,
                created_by: userId || null
            });

        if (outMove) {
            console.error("POST /company/inventory/transfer out movement:", outMove);
        }

        const { data: toSp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", toId)
            .eq("product_variant_id", product_variant_id)
            .maybeSingle();

        const toQty = toSp ? Number(toSp.stock_quantity) : 0;
        const toNewQty = toQty + qty;

        if (toSp) {
            const { error: updTo } = await supabase
                .from("store_products")
                .update({ stock_quantity: toNewQty })
                .eq("id", toSp.id);

            if (updTo) {
                await supabase.from("store_products").update({ stock_quantity: fromQty }).eq("id", fromSp?.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη μεταφορά",
                    code: "DB_ERROR"
                });
            }
        } else {
            const { error: insTo } = await supabase
                .from("store_products")
                .insert({
                    store_id: toId,
                    product_id,
                    product_variant_id,
                    stock_quantity: toNewQty
                });

            if (insTo) {
                await supabase.from("store_products").update({ stock_quantity: fromQty }).eq("id", fromSp?.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά τη μεταφορά",
                    code: "DB_ERROR"
                });
            }
        }

        const { error: inMove } = await supabase
            .from("stock_movements")
            .insert({
                company_id: companyId,
                store_id: toId,
                product_id,
                product_variant_id,
                quantity: qty,
                movement_type: "in",
                source: "manual",
                related_document_type: "transfer",
                related_document_id: null,
                created_by: userId || null
            });

        if (inMove) {
            console.error("POST /company/inventory/transfer in movement:", inMove);
        }

        const { data: fromResult } = await supabase.from("store_products").select("*").eq("store_id", fromId).eq("product_variant_id", product_variant_id).maybeSingle();
        const { data: toResult } = await supabase.from("store_products").select("*").eq("store_id", toId).eq("product_variant_id", product_variant_id).maybeSingle();

        return res.json({
            success: true,
            data: { from_store_product: fromResult, to_store_product: toResult }
        });
    } catch (err) {
        console.error("POST /company/inventory/transfer ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// Ενδοδιακίνηση (Transfers) - multi-line, reversible
// ============================================
router.post("/company/transfers", requireAuth, requireAnyPermission(['inventory.transfer', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { source_store_id, dest_store_id, lines, status } = req.body;

    if (!companyId) {
        return res.status(400).json({ success: false, message: "Δεν έχει επιλεχθεί ενεργή εταιρεία", code: "NO_ACTIVE_COMPANY" });
    }
    if (!source_store_id || !dest_store_id) {
        return res.status(400).json({ success: false, message: "Λείπουν προέλευση ή προορισμός", code: "VALIDATION_ERROR" });
    }
    const srcId = String(source_store_id).trim();
    const destId = String(dest_store_id).trim();
    if (srcId === destId) {
        return res.status(400).json({ success: false, message: "Προέλευση και προορισμός πρέπει να διαφέρουν", code: "VALIDATION_ERROR" });
    }
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ success: false, message: "Χρειάζεται τουλάχιστον μία γραμμή", code: "VALIDATION_ERROR" });
    }

    const validLines = lines.filter(l => l && typeof l.product_id === "number" && typeof l.product_variant_id === "number" && Number(l.quantity) > 0);
    if (validLines.length === 0) {
        return res.status(400).json({ success: false, message: "Άκυρες γραμμές", code: "VALIDATION_ERROR" });
    }

    try {
        const { data: srcStore } = await supabase.from("stores").select("id").eq("id", srcId).eq("company_id", companyId).single();
        const { data: destStore } = await supabase.from("stores").select("id").eq("id", destId).eq("company_id", companyId).single();
        if (!srcStore || !destStore) {
            return res.status(400).json({ success: false, message: "Το κατάστημα δεν βρέθηκε", code: "INVALID_STORE" });
        }

        const isFinalize = (status || "draft") === "posted";
        if (isFinalize) {
            for (const l of validLines) {
                const { data: sp } = await supabase.from("store_products").select("stock_quantity").eq("store_id", srcId).eq("product_variant_id", l.product_variant_id).maybeSingle();
                const avail = sp ? Number(sp.stock_quantity) : 0;
                if (avail < Number(l.quantity)) {
                    return res.status(400).json({ success: false, message: `Ανεπαρκές απόθεμα για variant ${l.product_variant_id}`, code: "INSUFFICIENT_STOCK" });
                }
            }
        }

        const { data: transfer, error: trErr } = await supabase
            .from("transfers")
            .insert({ company_id: companyId, source_store_id: srcId, dest_store_id: destId, status: isFinalize ? "posted" : "draft", created_by: userId })
            .select("id")
            .single();

        if (trErr) {
            if (trErr.code === "42P01") {
                return res.status(501).json({ success: false, message: "Ο πίνακας transfers δεν υπάρχει. Εκτελέστε το migration add_transfers_table.sql", code: "MIGRATION_NEEDED" });
            }
            return res.status(500).json({ success: false, message: trErr.message, code: "DB_ERROR" });
        }

        const lineRows = validLines.map(l => ({ transfer_id: transfer.id, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: Number(l.quantity) }));
        const { error: linesErr } = await supabase.from("transfer_lines").insert(lineRows);
        if (linesErr) {
            await supabase.from("transfers").delete().eq("id", transfer.id);
            return res.status(500).json({ success: false, message: linesErr.message, code: "DB_ERROR" });
        }

        if (isFinalize) {
            for (const l of validLines) {
                const qty = Number(l.quantity);
                const { data: srcSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", srcId).eq("product_variant_id", l.product_variant_id).maybeSingle();
                const { data: destSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", destId).eq("product_variant_id", l.product_variant_id).maybeSingle();

                if (srcSp) {
                    await supabase.from("store_products").update({ stock_quantity: Number(srcSp.stock_quantity) - qty }).eq("id", srcSp.id);
                }
                if (destSp) {
                    await supabase.from("store_products").update({ stock_quantity: Number(destSp.stock_quantity) + qty }).eq("id", destSp.id);
                } else {
                    await supabase.from("store_products").insert({ store_id: destId, product_id: l.product_id, product_variant_id: l.product_variant_id, stock_quantity: qty });
                }

                await supabase.from("stock_movements").insert([
                    { company_id: companyId, store_id: srcId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: -qty, movement_type: "out", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId },
                    { company_id: companyId, store_id: destId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: qty, movement_type: "in", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId }
                ]);
            }
        }

        const { data: full } = await supabase.from("transfers").select("*, transfer_lines(*)").eq("id", transfer.id).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("POST /company/transfers ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

router.post("/company/transfers/:id/finalize", requireAuth, requireAnyPermission(['inventory.transfer', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data: transfer, error: trErr } = await supabase.from("transfers").select("*, transfer_lines(*)").eq("id", id).eq("company_id", companyId).single();
        if (trErr || !transfer || transfer.status !== "draft") {
            return res.status(400).json({ success: false, message: "Το μεταφορά δεν βρέθηκε ή δεν είναι πρόχειρο", code: "INVALID_STATE" });
        }

        const srcId = transfer.source_store_id;
        const destId = transfer.dest_store_id;
        const lines = transfer.transfer_lines || [];

        for (const l of lines) {
            const qty = Number(l.quantity);
            const { data: srcSp } = await supabase.from("store_products").select("stock_quantity").eq("store_id", srcId).eq("product_variant_id", l.product_variant_id).maybeSingle();
            const avail = srcSp ? Number(srcSp.stock_quantity) : 0;
            if (avail < qty) {
                return res.status(400).json({ success: false, message: `Ανεπαρκές απόθεμα για variant ${l.product_variant_id}`, code: "INSUFFICIENT_STOCK" });
            }
        }

        await supabase.from("transfers").update({ status: "posted" }).eq("id", id);

        for (const l of lines) {
            const qty = Number(l.quantity);
            const { data: srcSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", srcId).eq("product_variant_id", l.product_variant_id).maybeSingle();
            const { data: destSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", destId).eq("product_variant_id", l.product_variant_id).maybeSingle();

            if (srcSp) await supabase.from("store_products").update({ stock_quantity: Number(srcSp.stock_quantity) - qty }).eq("id", srcSp.id);
            if (destSp) await supabase.from("store_products").update({ stock_quantity: Number(destSp.stock_quantity) + qty }).eq("id", destSp.id);
            else await supabase.from("store_products").insert({ store_id: destId, product_id: l.product_id, product_variant_id: l.product_variant_id, stock_quantity: qty });

            await supabase.from("stock_movements").insert([
                { company_id: companyId, store_id: srcId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: -qty, movement_type: "out", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId },
                { company_id: companyId, store_id: destId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: qty, movement_type: "in", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId }
            ]);
        }

        return res.json({ success: true, data: { id: transfer.id, status: "posted" } });
    } catch (err) {
        console.error("POST /company/transfers/:id/finalize ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

router.post("/company/transfers/:id/reverse", requireAuth, requireAnyPermission(['inventory.transfer', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data: transfer, error } = await supabase.from("transfers").select("*, transfer_lines(*)").eq("id", id).eq("company_id", companyId).single();
        if (error || !transfer || transfer.status !== "posted") {
            return res.status(400).json({ success: false, message: "Το μεταφορά δεν βρέθηκε ή δεν μπορεί να αντιστραφεί", code: "INVALID_STATE" });
        }

        const srcId = transfer.source_store_id;
        const destId = transfer.dest_store_id;
        const lines = transfer.transfer_lines || [];

        for (const l of lines) {
            const qty = Number(l.quantity);
            const { data: destSp } = await supabase.from("store_products").select("stock_quantity").eq("store_id", destId).eq("product_variant_id", l.product_variant_id).maybeSingle();
            const avail = destSp ? Number(destSp.stock_quantity) : 0;
            if (avail < qty) {
                return res.status(400).json({ success: false, message: `Ανεπαρκές απόθεμα στο προορισμό για αντιστροφή`, code: "INSUFFICIENT_STOCK" });
            }
        }

        await supabase.from("transfers").update({ status: "reversed" }).eq("id", id);

        for (const l of lines) {
            const qty = Number(l.quantity);
            const { data: srcSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", srcId).eq("product_variant_id", l.product_variant_id).maybeSingle();
            const { data: destSp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", destId).eq("product_variant_id", l.product_variant_id).maybeSingle();

            if (destSp) await supabase.from("store_products").update({ stock_quantity: Number(destSp.stock_quantity) - qty }).eq("id", destSp.id);
            if (srcSp) await supabase.from("store_products").update({ stock_quantity: Number(srcSp.stock_quantity) + qty }).eq("id", srcSp.id);

            await supabase.from("stock_movements").insert([
                { company_id: companyId, store_id: destId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: -qty, movement_type: "out", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId },
                { company_id: companyId, store_id: srcId, product_id: l.product_id, product_variant_id: l.product_variant_id, quantity: qty, movement_type: "in", source: "manual", related_document_type: "transfer", related_document_id: transfer.id, created_by: userId }
            ]);
        }

        return res.json({ success: true, data: { id: transfer.id, status: "reversed" } });
    } catch (err) {
        console.error("POST /company/transfers/:id/reverse ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// ============================================
// Απογραφή (Stock Count)
// ============================================
router.post("/company/stock-counts", requireAuth, requireAnyPermission(['inventory.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { store_id } = req.body;

    if (!companyId || !store_id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "VALIDATION_ERROR" });
    }
    const storeId = String(store_id).trim();

    try {
        const { data: store } = await supabase.from("stores").select("id").eq("id", storeId).eq("company_id", companyId).single();
        if (!store) {
            return res.status(400).json({ success: false, message: "Το κατάστημα δεν βρέθηκε", code: "INVALID_STORE" });
        }

        const { data: spList } = await supabase.from("store_products").select("product_id, product_variant_id, stock_quantity").eq("store_id", storeId);
        const { data: session, error: sessErr } = await supabase
            .from("stock_count_sessions")
            .insert({ company_id: companyId, store_id: storeId, status: "draft", created_by: userId })
            .select("id")
            .single();

        if (sessErr) {
            if (sessErr.code === "42P01") return res.status(501).json({ success: false, message: "Εκτελέστε το migration add_stock_count_tables.sql", code: "MIGRATION_NEEDED" });
            return res.status(500).json({ success: false, message: sessErr.message, code: "DB_ERROR" });
        }

        const lineRows = (spList || []).map(sp => ({ session_id: session.id, product_id: sp.product_id, product_variant_id: sp.product_variant_id, system_quantity: sp.stock_quantity, counted_quantity: null }));
        if (lineRows.length > 0) {
            await supabase.from("stock_count_lines").insert(lineRows);
        }

        const { data: full } = await supabase.from("stock_count_sessions").select("*, stock_count_lines(*)").eq("id", session.id).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("POST /company/stock-counts ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

router.get("/company/stock-counts/:id", requireAuth, requireAnyPermission(['inventory.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    try {
        const { data: session, error } = await supabase.from("stock_count_sessions").select("*, stock_count_lines(*)").eq("id", id).eq("company_id", companyId).single();
        if (error || !session) return res.status(404).json({ success: false, message: "Η απογραφή δεν βρέθηκε", code: "NOT_FOUND" });
        return res.json({ success: true, data: session });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

router.put("/company/stock-counts/:id/lines", requireAuth, requireAnyPermission(['inventory.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { lines } = req.body;
    if (!lines || !Array.isArray(lines)) return res.status(400).json({ success: false, message: "Λείπουν γραμμές", code: "VALIDATION_ERROR" });

    try {
        const { data: session } = await supabase.from("stock_count_sessions").select("id").eq("id", id).eq("company_id", companyId).eq("status", "draft").single();
        if (!session) return res.status(400).json({ success: false, message: "Η απογραφή δεν βρέθηκε ή δεν είναι editable", code: "INVALID_STATE" });

        for (const l of lines) {
            if (l.id != null && (l.counted_quantity !== undefined && l.counted_quantity !== null)) {
                await supabase.from("stock_count_lines").update({ counted_quantity: Number(l.counted_quantity) }).eq("id", l.id).eq("session_id", id);
            }
        }
        const { data: full } = await supabase.from("stock_count_sessions").select("*, stock_count_lines(*)").eq("id", id).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

router.post("/company/stock-counts/:id/finalize", requireAuth, requireAnyPermission(['inventory.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data: session, error } = await supabase.from("stock_count_sessions").select("*, stock_count_lines(*)").eq("id", id).eq("company_id", companyId).single();
        if (error || !session || session.status !== "draft") {
            return res.status(400).json({ success: false, message: "Η απογραφή δεν βρέθηκε ή δεν είναι draft", code: "INVALID_STATE" });
        }

        const storeId = session.store_id;
        const lines = session.stock_count_lines || [];

        for (const l of lines) {
            const counted = l.counted_quantity != null ? Number(l.counted_quantity) : null;
            if (counted === null) continue;
            const system = Number(l.system_quantity) || 0;
            const diff = counted - system;
            if (diff === 0) continue;

            const reason = diff > 0 ? "Πλεόνασμα Απογραφής" : "Έλλειμμα Απογραφής";
            const absQty = Math.abs(diff);
            const movementType = diff > 0 ? "in" : "out";
            const qty = diff > 0 ? absQty : -absQty;

            const { data: sp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", storeId).eq("product_variant_id", l.product_variant_id).maybeSingle();
            const newQty = (sp ? Number(sp.stock_quantity) : 0) + diff;

            if (sp) {
                await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
            } else {
                await supabase.from("store_products").insert({ store_id: storeId, product_id: l.product_id, product_variant_id: l.product_variant_id, stock_quantity: newQty });
            }

            await supabase.from("stock_movements").insert({
                company_id: companyId,
                store_id: storeId,
                product_id: l.product_id,
                product_variant_id: l.product_variant_id,
                quantity: qty,
                movement_type: "adjustment",
                source: "stock_count",
                related_document_type: "adjustment",
                related_document_id: id,
                created_by: userId
            });
        }

        await supabase.from("stock_count_sessions").update({ status: "finalized" }).eq("id", id);

        return res.json({ success: true, data: { id: parseInt(id, 10), status: "finalized" } });
    } catch (err) {
        console.error("POST /company/stock-counts/:id/finalize ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// ============================================
// SALES APIs
// ============================================

const SALES_DOC_TYPES = ["QUO", "SO", "REC", "INV", "CRN", "DNO"];
const SALES_DECREASES_STOCK = ["REC", "INV", "DNO"];
const SALES_INCREASES_STOCK = ["CRN"];
const SALES_NO_STOCK = ["QUO", "SO"];

// GET /company/sales - List sales for company with filters
router.get("/company/sales", requireAuth, requireAnyPermission(['sales.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, customer_id, date_from, date_to, search, document_type, status } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        let query = supabase
            .from("sales")
            .select(`
                id,
                created_at,
                store_id,
                customer_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                invoice_type,
                invoice_number,
                invoice_date,
                converted_from_id,
                expiry_date,
                payment_terms,
                due_date,
                payment_status,
                amount_due,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt),
                stores (id, name),
                customers (id, full_name)
            `)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (document_type && typeof document_type === "string" && document_type.trim()) {
            query = query.eq("invoice_type", document_type.trim());
        }
        if (status && typeof status === "string" && status.trim()) {
            query = query.eq("status", status.trim());
        }
        if (store_id && typeof store_id === "string" && store_id.trim()) {
            query = query.eq("store_id", store_id.trim());
        }
        if (customer_id && typeof customer_id === "string" && customer_id.trim()) {
            query = query.eq("customer_id", customer_id.trim());
        }
        if (date_from && typeof date_from === "string" && date_from.trim()) {
            query = query.gte("created_at", date_from.trim());
        }
        if (date_to && typeof date_to === "string" && date_to.trim()) {
            const d = new Date(date_to.trim());
            d.setUTCDate(d.getUTCDate() + 1);
            query = query.lt("created_at", d.toISOString());
        }
        if (search && typeof search === "string" && search.trim()) {
            const term = search.trim();
            const { data: matchingCustomers } = await supabase
                .from("customers")
                .select("id")
                .eq("company_id", companyId)
                .ilike("full_name", "%" + term + "%");
            const customerIds = (matchingCustomers || []).map((c) => String(c.id));
            if (customerIds.length > 0) {
                const orParts = [`invoice_number.ilike.%${term}%`];
                customerIds.forEach((cid) => orParts.push(`customer_id.eq.${cid}`));
                query = query.or(orParts.join(","));
            } else {
                query = query.ilike("invoice_number", "%" + term + "%");
            }
        }

        const { data: sales, error } = await query;

        if (error) {
            console.error("GET /company/sales:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των πωλήσεων",
                code: "DB_ERROR"
            });
        }

        const soIds = (sales ?? []).filter((s) => (s.invoice_type || "").toUpperCase() === "SO").map((s) => s.id);
        const dnoBySoId = {};
        if (soIds.length > 0) {
            const { data: dnoRows } = await supabase
                .from("sales")
                .select("id, converted_from_id, invoice_type, invoice_number, status")
                .eq("company_id", companyId)
                .eq("invoice_type", "DNO")
                .in("converted_from_id", soIds);
            for (const d of dnoRows || []) {
                const sid = d.converted_from_id;
                if (!dnoBySoId[sid]) dnoBySoId[sid] = [];
                dnoBySoId[sid].push({
                    id: d.id,
                    invoice_type: d.invoice_type || "DNO",
                    invoice_number: d.invoice_number,
                    status: d.status,
                });
            }
        }

        const now = new Date();
        const normalized = (sales ?? []).map(s => {
            let effectiveStatus = s.status;
            // Quote expiry: Draft or Sent + past expiry_date => Expired
            if (s.invoice_type === "QUO" && s.expiry_date && ["draft", "sent"].includes((s.status || "").toLowerCase())) {
                const expiry = new Date(s.expiry_date);
                if (expiry < now) effectiveStatus = "expired";
            }
            // Overdue: unpaid/partial + due_date < now => overdue
            let paymentStatus = s.payment_status || null;
            if (paymentStatus && ["unpaid", "partial"].includes(paymentStatus) && s.due_date && new Date(s.due_date) < now) {
                paymentStatus = "overdue";
            }
            const isSo = (s.invoice_type || "").toUpperCase() === "SO";
            return {
                ...s,
                status: effectiveStatus,
                payment_status: paymentStatus,
                linked_documents: isSo ? (dnoBySoId[s.id] || []) : [],
                store: s.stores ? { id: s.stores.id, name: s.stores.name } : null,
                customer: s.customers ? { id: s.customers.id, full_name: s.customers.full_name } : null,
                stores: undefined,
                customers: undefined
            };
        });

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/sales ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/sales/:id - Single sale with items
router.get("/company/sales/:id", requireAuth, requireAnyPermission(['sales.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: sale, error } = await supabase
            .from("sales")
            .select(`
                id,
                created_at,
                store_id,
                customer_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                amount_paid,
                change_returned,
                invoice_type,
                invoice_number,
                converted_from_id,
                expiry_date,
                invoice_date,
                payment_terms,
                due_date,
                payment_status,
                amount_due,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt),
                stores (id, name, address),
                customers (id, full_name, phone, email, tax_id, address, city, postal_code, country)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !sale) {
            return res.status(404).json({
                success: false,
                message: "Η πώληση δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const effectiveStatus = sale.invoice_type === "QUO" && sale.expiry_date && ["draft", "sent"].includes((sale.status || "").toLowerCase())
            ? (new Date(sale.expiry_date) < new Date() ? "expired" : sale.status)
            : sale.status;

        // Overdue: unpaid/partial + due_date < now => overdue
        let paymentStatus = sale.payment_status || null;
        if (paymentStatus && ["unpaid", "partial"].includes(paymentStatus) && sale.due_date && new Date(sale.due_date) < new Date()) {
            paymentStatus = "overdue";
        }

        // Receipts for this sale
        let receipts = [];
        if (sale.id) {
            const { data: receiptRows } = await supabase
                .from("receipts")
                .select("id, amount, payment_method_id, payment_date, notes, is_auto")
                .eq("sale_id", sale.id)
                .eq("company_id", companyId)
                .order("payment_date", { ascending: false });
            receipts = (receiptRows || []).map(r => ({
                id: r.id,
                amount: Number(r.amount),
                payment_method_id: r.payment_method_id,
                payment_date: r.payment_date,
                notes: r.notes,
                is_auto: r.is_auto
            }));
        }

        let converted_to = null;
        if ((sale.invoice_type || "").toUpperCase() === "QUO" && (effectiveStatus || "").toLowerCase() === "converted") {
            const { data: convertedSale } = await supabase
                .from("sales")
                .select("id, invoice_type, invoice_number")
                .eq("company_id", companyId)
                .eq("converted_from_id", id)
                .single();
            if (convertedSale) {
                converted_to = {
                    id: convertedSale.id,
                    invoice_type: convertedSale.invoice_type || "REC",
                    invoice_number: convertedSale.invoice_number || `#${convertedSale.id}`
                };
            }
        } else if (["REC", "INV"].includes((sale.invoice_type || "").toUpperCase()) && (effectiveStatus || "").toLowerCase() === "cancelled") {
            const { data: crnSale } = await supabase
                .from("sales")
                .select("id, invoice_type, invoice_number")
                .eq("company_id", companyId)
                .eq("converted_from_id", id)
                .eq("invoice_type", "CRN")
                .single();
            if (crnSale) {
                converted_to = {
                    id: crnSale.id,
                    invoice_type: crnSale.invoice_type || "CRN",
                    invoice_number: crnSale.invoice_number || `#${crnSale.id}`
                };
            }
        }

        let return_from = null;
        if ((sale.invoice_type || "").toUpperCase() === "CRN" && sale.converted_from_id) {
            const { data: sourceSale } = await supabase
                .from("sales")
                .select("id, invoice_type, invoice_number")
                .eq("id", sale.converted_from_id)
                .eq("company_id", companyId)
                .single();
            if (sourceSale) {
                return_from = {
                    id: sourceSale.id,
                    invoice_type: sourceSale.invoice_type || "INV",
                    invoice_number: sourceSale.invoice_number || `#${sourceSale.id}`
                };
            }
        }

        let linked_documents = [];
        if ((sale.invoice_type || "").toUpperCase() === "SO") {
            const { data: dnoRows } = await supabase
                .from("sales")
                .select("id, invoice_type, invoice_number, status")
                .eq("company_id", companyId)
                .eq("converted_from_id", id)
                .eq("invoice_type", "DNO");
            linked_documents = dnoRows || [];
        }

        const normalized = {
            ...sale,
            status: effectiveStatus,
            payment_status: paymentStatus,
            receipts,
            converted_to,
            return_from,
            linked_documents,
            store: sale.stores ? { id: sale.stores.id, name: sale.stores.name, address: sale.stores.address } : null,
            customer: sale.customers ? { id: sale.customers.id, full_name: sale.customers.full_name, phone: sale.customers.phone, email: sale.customers.email, tax_id: sale.customers.tax_id, address: sale.customers.address, city: sale.customers.city, postal_code: sale.customers.postal_code, country: sale.customers.country } : null,
            stores: undefined,
            customers: undefined
        };

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/sales/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/sales/:id/pdf - Download sale as PDF
router.get("/company/sales/:id/pdf", requireAuth, requireAnyPermission(['sales.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: sale, error } = await supabase
            .from("sales")
            .select(`
                id,
                created_at,
                store_id,
                customer_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                amount_paid,
                change_returned,
                invoice_type,
                invoice_number,
                company_id,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt),
                stores (id, name, address),
                customers (id, full_name, phone, email, tax_id, address, city, postal_code, country)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !sale) {
            return res.status(404).json({
                success: false,
                message: "Η πώληση δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const statusLower = (sale.status || "").toLowerCase();
        if (statusLower === "draft") {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει PDF για πωλήσεις σε κατάσταση Πρόχειρο",
                code: "DRAFT_NO_PDF"
            });
        }

        const { data: company } = await supabase
            .from("companies")
            .select("id, name, display_name, tax_id, tax_office, address, city, postal_code, country, phone, email")
            .eq("id", sale.company_id)
            .single();

        const { data: pm } = await supabase
            .from("payment_methods")
            .select("name")
            .eq("id", sale.payment_method_id)
            .maybeSingle();

        const productIds = [...new Set((sale.sale_items || []).map((it) => it.product_id))];
        const variantIds = [...new Set((sale.sale_items || []).map((it) => it.product_variant_id))];

        let productsMap = {};
        let variantsMap = {};
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name")
                .in("id", productIds);
            if (products) productsMap = Object.fromEntries(products.map((p) => [p.id, p]));
        }
        if (variantIds.length > 0) {
            const { data: variants } = await supabase
                .from("product_variants")
                .select("id, name")
                .in("id", variantIds);
            if (variants) variantsMap = Object.fromEntries(variants.map((v) => [v.id, v]));
        }

        const saleItemsWithLabels = (sale.sale_items || []).map((it) => {
            const p = productsMap[it.product_id];
            const v = variantsMap[it.product_variant_id];
            const label = p && v ? `${p.name} — ${v.name}` : null;
            return { ...it, product_label: label };
        });

        const pdfData = {
            id: sale.id,
            company: company || {},
            store: sale.stores ? { id: sale.stores.id, name: sale.stores.name, address: sale.stores.address } : {},
            customer: sale.customers
                ? {
                    id: sale.customers.id,
                    full_name: sale.customers.full_name,
                    phone: sale.customers.phone,
                    email: sale.customers.email,
                    tax_id: sale.customers.tax_id,
                    address: sale.customers.address,
                    city: sale.customers.city,
                    postal_code: sale.customers.postal_code,
                    country: sale.customers.country,
                }
                : null,
            sale_items: saleItemsWithLabels,
            subtotal: sale.subtotal ?? 0,
            vat_total: sale.vat_total ?? 0,
            total_amount: sale.total_amount,
            amount_paid: sale.amount_paid ?? null,
            change_returned: sale.change_returned ?? null,
            payment_method_name: pm?.name ?? "",
            invoice_type: sale.invoice_type || "receipt",
            invoice_number: sale.invoice_number ?? `#${sale.id}`,
            created_at: sale.created_at,
            status: sale.status || "completed",
        };

        const pdfBuffer = await generateSalePdf(pdfData);

        const filename = `${sale.invoice_type === "invoice" ? "timologio" : "apodeixi"}-${sale.invoice_number || sale.id}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("GET /company/sales/:id/pdf ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά τη δημιουργία PDF",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/sales/:id/send-email - Send sale PDF by email
router.post("/company/sales/:id/send-email", requireAuth, requireAnyPermission(['sales.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;
    const { email, update_customer_email } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    const toEmail = email && typeof email === "string" ? email.trim() : "";
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail);
    if (!toEmail || !validEmail) {
        return res.status(400).json({
            success: false,
            message: "Παρακαλώ εισάγετε έγκυρη διεύθυνση email",
            code: "INVALID_EMAIL"
        });
    }

    try {
        const { data: sale, error } = await supabase
            .from("sales")
            .select(`
                id,
                created_at,
                store_id,
                customer_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                amount_paid,
                change_returned,
                invoice_type,
                invoice_number,
                company_id,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt),
                stores (id, name, address),
                customers (id, full_name, phone, email, tax_id, address, city, postal_code, country)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !sale) {
            return res.status(404).json({
                success: false,
                message: "Η πώληση δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const statusLower = (sale.status || "").toLowerCase();
        const docType = (sale.invoice_type || "").toUpperCase();
        if (statusLower === "draft") {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορεί να αποσταλεί email για πώληση σε κατάσταση Πρόχειρο",
                code: "DRAFT_NO_EMAIL"
            });
        }
        if (docType === "QUO") {
            return res.status(400).json({
                success: false,
                message: "Δεν υποστηρίζεται αποστολή email για Προσφορά (QUO)",
                code: "QUO_NO_EMAIL"
            });
        }

        const { data: company } = await supabase
            .from("companies")
            .select("id, name, display_name, tax_id, tax_office, address, city, postal_code, country, phone, email")
            .eq("id", sale.company_id)
            .single();

        const { data: pm } = await supabase
            .from("payment_methods")
            .select("name")
            .eq("id", sale.payment_method_id)
            .maybeSingle();

        const productIds = [...new Set((sale.sale_items || []).map((it) => it.product_id))];
        const variantIds = [...new Set((sale.sale_items || []).map((it) => it.product_variant_id))];

        let productsMap = {};
        let variantsMap = {};
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name")
                .in("id", productIds);
            if (products) productsMap = Object.fromEntries(products.map((p) => [p.id, p]));
        }
        if (variantIds.length > 0) {
            const { data: variants } = await supabase
                .from("product_variants")
                .select("id, name")
                .in("id", variantIds);
            if (variants) variantsMap = Object.fromEntries(variants.map((v) => [v.id, v]));
        }

        const saleItemsWithLabels = (sale.sale_items || []).map((it) => {
            const p = productsMap[it.product_id];
            const v = variantsMap[it.product_variant_id];
            const label = p && v ? `${p.name} — ${v.name}` : null;
            return { ...it, product_label: label };
        });

        const pdfData = {
            id: sale.id,
            company: company || {},
            store: sale.stores ? { id: sale.stores.id, name: sale.stores.name, address: sale.stores.address } : {},
            customer: sale.customers
                ? {
                    id: sale.customers.id,
                    full_name: sale.customers.full_name,
                    phone: sale.customers.phone,
                    email: sale.customers.email,
                    tax_id: sale.customers.tax_id,
                    address: sale.customers.address,
                    city: sale.customers.city,
                    postal_code: sale.customers.postal_code,
                    country: sale.customers.country,
                }
                : null,
            sale_items: saleItemsWithLabels,
            subtotal: sale.subtotal ?? 0,
            vat_total: sale.vat_total ?? 0,
            total_amount: sale.total_amount,
            amount_paid: sale.amount_paid ?? null,
            change_returned: sale.change_returned ?? null,
            payment_method_name: pm?.name ?? "",
            invoice_type: sale.invoice_type || "receipt",
            invoice_number: sale.invoice_number ?? `#${sale.id}`,
            created_at: sale.created_at,
            status: sale.status || "completed",
        };

        const pdfBuffer = await generateSalePdf(pdfData);
        const FILE_PREFIX = { REC: "apodeixi", INV: "timologio", CRN: "pistotiko", DNO: "deltio-apostolis", receipt: "apodeixi", invoice: "timologio" };
        const prefix = FILE_PREFIX[docType] || FILE_PREFIX[sale.invoice_type] || "parastatiko";
        const filename = `${prefix}-${sale.invoice_number || sale.id}.pdf`;

        const companyName = company?.display_name || company?.name || "Εταιρεία";
        const invoiceNum = sale.invoice_number || sale.id;
        const subject = `Παραστατικό #${invoiceNum}`;

        const htmlBody = `
<!DOCTYPE html>
<html lang="el">
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px;">
  <p>Γεια σας,</p>
  <p>Ανατρέξτε στο συνημμένο αρχείο PDF για να δείτε το παραστατικό <strong>#${invoiceNum}</strong> της εταιρείας <strong>${companyName}</strong>.</p>
  <p>Με εκτίμηση,<br>Olyntos</p>
</body>
</html>`;

        const { data: emailData, error: emailErr } = await resend.emails.send({
            from: `Olyntos <${process.env.RESEND_EMAIL || "noreply@example.com"}>`,
            to: toEmail,
            subject,
            html: htmlBody,
            attachments: [
                {
                    filename,
                    content: pdfBuffer,
                },
            ],
        });

        if (emailErr) {
            console.error("POST /company/sales/:id/send-email Resend error:", emailErr);
            return res.status(500).json({
                success: false,
                message: emailErr.message || "Σφάλμα κατά την αποστολή email",
                code: "EMAIL_ERROR"
            });
        }

        if (update_customer_email === true && sale.customer_id && sale.customers) {
            const { error: updErr } = await supabase
                .from("customers")
                .update({ email: toEmail })
                .eq("id", sale.customer_id)
                .eq("company_id", companyId);

            if (updErr) {
                console.error("POST /company/sales/:id/send-email customer update:", updErr);
            }
        }

        return res.json({
            success: true,
            message: "Το email στάλθηκε επιτυχώς",
            data: { id: emailData?.id }
        });
    } catch (err) {
        console.error("POST /company/sales/:id/send-email ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά την αποστολή email",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/sales - Create sale with items
router.post("/company/sales", requireAuth, requireAnyPermission(['sales.create', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const { store_id, customer_id, payment_method_id, notes, items, confirm_negative_stock, invoice_type, invoice_number, amount_paid, status, expiry_date, converted_from_id, invoice_date, payment_terms: bodyPaymentTerms } = req.body;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    if (!payment_method_id || typeof payment_method_id !== "string" || !payment_method_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Ο τρόπος πληρωμής είναι υποχρεωτικός",
            code: "VALIDATION_ERROR"
        });
    }

    // Normalize invoice_type: support QUO, REC, INV, CRN, DNO (legacy receipt→REC, invoice→INV)
    let invoiceType = (invoice_type && typeof invoice_type === "string" ? invoice_type.trim().toUpperCase() : "REC");
    if (invoiceType === "RECEIPT") invoiceType = "REC";
    if (invoiceType === "INVOICE") invoiceType = "INV";
    if (!SALES_DOC_TYPES.includes(invoiceType)) {
        return res.status(400).json({
            success: false,
            message: "Ο τύπος παραστατικού πρέπει να είναι QUO, SO, REC, INV, CRN ή DNO",
            code: "VALIDATION_ERROR"
        });
    }

    if (invoiceType === "CRN" && (!converted_from_id || (typeof converted_from_id !== "number" && typeof converted_from_id !== "string"))) {
        return res.status(400).json({
            success: false,
            message: "Το πιστωτικό απαιτεί αναφορά στην αρχική πώληση (converted_from_id)",
            code: "VALIDATION_ERROR"
        });
    }

    if (["INV", "CRN"].includes(invoiceType)) {
        if (!customer_id || typeof customer_id !== "string" || !customer_id.trim()) {
            return res.status(400).json({
                success: false,
                message: "Για τιμολόγιο απαιτείται πελάτης",
                code: "VALIDATION_ERROR"
            });
        }
        const { data: customerRow } = await supabase
            .from("customers")
            .select("id, tax_id, payment_terms")
            .eq("id", customer_id.trim())
            .eq("company_id", companyId)
            .single();
        if (!customerRow) {
            return res.status(400).json({
                success: false,
                message: "Ο πελάτης δεν βρέθηκε",
                code: "INVALID_CUSTOMER"
            });
        }
        if (!customerRow.tax_id || typeof customerRow.tax_id !== "string" || !customerRow.tax_id.trim()) {
            return res.status(400).json({
                success: false,
                message: "Ο πελάτης πρέπει να έχει ΑΦΜ για τιμολόγιο",
                code: "VALIDATION_ERROR"
            });
        }
    }

    let invPaymentTerms = "immediate";
    if (invoiceType === "INV" && customer_id && typeof customer_id === "string" && customer_id.trim()) {
        const { data: custPt } = await supabase.from("customers").select("payment_terms").eq("id", customer_id.trim()).eq("company_id", companyId).single();
        const validTerms = ["immediate", "15", "30", "60", "90"];
        invPaymentTerms = (bodyPaymentTerms && validTerms.includes(String(bodyPaymentTerms).toLowerCase())) ? String(bodyPaymentTerms).toLowerCase() : (custPt?.payment_terms || "immediate");
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Χρειάζεται τουλάχιστον μία γραμμή προϊόντος",
            code: "VALIDATION_ERROR"
        });
    }

    const validItems = items.filter(it =>
        it &&
        typeof it.product_id === "number" &&
        typeof it.product_variant_id === "number" &&
        typeof it.quantity === "number" &&
        it.quantity > 0 &&
        typeof it.sale_price === "number" &&
        it.sale_price >= 0
    );

    if (validItems.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Οι γραμμές προϊόντων δεν είναι έγκυρες",
            code: "VALIDATION_ERROR"
        });
    }

    for (const it of validItems) {
        const vatExempt = it.vat_exempt === true;
        const vatRate = vatExempt ? 0 : (typeof it.vat_rate === "number" ? Math.min(1, Math.max(0, it.vat_rate)) : 0);
        if (vatExempt && vatRate !== 0) {
            return res.status(400).json({
                success: false,
                message: "Γραμμή με απαλλαγή ΦΠΑ πρέπει να έχει vat_rate = 0",
                code: "VALIDATION_ERROR"
            });
        }
    }

    try {
        // Verify store belongs to company
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", store_id.trim())
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        // Validate each product_variant_id belongs to its product_id
        for (const it of validItems) {
            const { data: variant, error: variantErr } = await supabase
                .from("product_variants")
                .select("id, product_id")
                .eq("id", it.product_variant_id)
                .eq("product_id", it.product_id)
                .single();
            if (variantErr || !variant) {
                return res.status(400).json({
                    success: false,
                    message: "Η παραλλαγή προϊόντος δεν αντιστοιχεί στο προϊόν",
                    code: "INVALID_PRODUCT_VARIANT"
                });
            }
        }

        // Compute totals (sale_price is without VAT)
        let subtotal = 0;
        let vatTotal = 0;
        const saleItemsData = validItems.map(it => {
            const qty = Number(it.quantity);
            const price = Number(it.sale_price);
            const total = Math.round(qty * price * 100) / 100;
            const vatExempt = it.vat_exempt === true;
            const vatRate = vatExempt ? 0 : (typeof it.vat_rate === "number" ? Math.min(1, Math.max(0, it.vat_rate)) : 0);
            const lineVat = Math.round(total * vatRate * 100) / 100;
            subtotal += total;
            vatTotal += lineVat;
            return {
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                quantity: qty,
                sale_price: price,
                total_price: total,
                vat_rate: vatRate,
                vat_exempt: vatExempt
            };
        });

        subtotal = Math.round(subtotal * 100) / 100;
        vatTotal = Math.round(vatTotal * 100) / 100;
        const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;
        const amountPaid = (amount_paid != null && typeof amount_paid === "number" && amount_paid >= 0)
            ? Math.round(amount_paid * 100) / 100
            : totalAmount;
        const changeReturned = Math.round((amountPaid - totalAmount) * 100) / 100;

        // Status per doc type: QUO default draft, can be sent; REC/INV/DNO/CRN default draft or completed
        let saleStatus = (status && typeof status === "string" ? status.toLowerCase() : null);
        if (invoiceType === "QUO") {
            saleStatus = (saleStatus && ["draft", "sent"].includes(saleStatus)) ? saleStatus : "draft";
        } else {
            saleStatus = (saleStatus && ["draft", "completed"].includes(saleStatus)) ? saleStatus : "draft";
        }

        // User-provided invoice_number: validate uniqueness
        const userInvoiceNumber = invoice_number && typeof invoice_number === "string" ? invoice_number.trim() || null : null;
        if (userInvoiceNumber) {
            const unique = await isInvoiceNumberUnique(companyId, userInvoiceNumber);
            if (!unique) {
                return res.status(400).json({
                    success: false,
                    message: "Ο αριθμός παραστατικού υπάρχει ήδη",
                    code: "INVOICE_NUMBER_EXISTS"
                });
            }
        }

        // Stock check only when creating as completed for types that decrease stock (REC, INV, DNO)
        const needsStockOnComplete = saleStatus === "completed" && SALES_DECREASES_STOCK.includes(invoiceType);
        if (needsStockOnComplete) {
            const stockCheckItems = saleItemsData.map(it => ({
                store_id: store_id.trim(),
                product_variant_id: it.product_variant_id,
                product_id: it.product_id,
                quantity: it.quantity
            }));
            const stockResult = await checkStockAvailability(companyId, stockCheckItems, { userPermissions });
            if (stockResult.block) {
                const code = stockResult.message && stockResult.message.includes("δικαίωμα") ? "NO_PERMISSION_NEGATIVE_STOCK" : "INSUFFICIENT_STOCK";
                return res.status(400).json({
                    success: false,
                    code,
                    message: stockResult.message || "Ανεπαρκές απόθεμα",
                    insufficientItems: stockResult.insufficientItems || []
                });
            }
            if (stockResult.warning && !confirm_negative_stock) {
                return res.status(200).json({
                    success: false,
                    code: "REQUIRES_CONFIRMATION",
                    requires_negative_stock_confirmation: true,
                    insufficientItems: stockResult.insufficientItems || [],
                    message: stockResult.message || "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;"
                });
            }
        }

        // Payment terms, due_date, payment_status, amount_due (only for INV with customer, else immediate)
        const validTerms = ["immediate", "15", "30", "60", "90"];
        let salePaymentTerms = "immediate";
        if (invoiceType === "INV" && customer_id && typeof customer_id === "string" && customer_id.trim()) {
            const { data: cust } = await supabase.from("customers").select("payment_terms").eq("id", customer_id.trim()).eq("company_id", companyId).single();
            const custTerms = cust?.payment_terms && validTerms.includes(String(cust.payment_terms).toLowerCase()) ? String(cust.payment_terms).toLowerCase() : "immediate";
            salePaymentTerms = bodyPaymentTerms && validTerms.includes(String(bodyPaymentTerms).toLowerCase()) ? String(bodyPaymentTerms).toLowerCase() : custTerms;
        }
        const invDateStr = invoice_date && typeof invoice_date === "string" && invoice_date.trim() ? invoice_date.trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const daysToAdd = salePaymentTerms === "immediate" ? 0 : parseInt(salePaymentTerms, 10) || 0;
        const dueDate = (invoiceType === "INV" && daysToAdd > 0) ? (() => { const d = new Date(invDateStr); d.setDate(d.getDate() + daysToAdd); return d.toISOString(); })() : null;
        let salePaymentStatus = null;
        let saleAmountDue = null;
        if (saleStatus === "completed" && (invoiceType === "REC" || invoiceType === "INV")) {
            if (invoiceType === "REC" || salePaymentTerms === "immediate") {
                salePaymentStatus = "paid";
                saleAmountDue = 0;
            } else {
                salePaymentStatus = "unpaid";
                saleAmountDue = totalAmount;
            }
        }

        const saleData = {
            company_id: companyId,
            store_id: store_id.trim(),
            customer_id: customer_id && typeof customer_id === "string" && customer_id.trim() ? customer_id.trim() : null,
            payment_method_id: payment_method_id.trim(),
            total_amount: totalAmount,
            subtotal,
            vat_total: vatTotal,
            amount_paid: amountPaid,
            change_returned: changeReturned,
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            source: "manual",
            status: saleStatus,
            invoice_type: invoiceType,
            invoice_number: userInvoiceNumber || null,
            converted_from_id: invoiceType === "CRN" && converted_from_id != null ? (typeof converted_from_id === "number" ? converted_from_id : parseInt(String(converted_from_id), 10)) : null,
            expiry_date: invoiceType === "QUO" && expiry_date ? (typeof expiry_date === "string" ? expiry_date : expiry_date) : null,
            invoice_date: invDateStr,
            payment_terms: salePaymentTerms,
            due_date: dueDate,
            ...(salePaymentStatus != null && { payment_status: salePaymentStatus }),
            ...(saleAmountDue != null && { amount_due: saleAmountDue }),
            created_by: userId || null
        };

        const { data: sale, error: saleErr } = await supabase
            .from("sales")
            .insert(saleData)
            .select("id")
            .single();

        if (saleErr || !sale) {
            console.error("POST /company/sales:", saleErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία πώλησης",
                code: "DB_ERROR"
            });
        }

        const itemsToInsert = saleItemsData.map(it => ({
            sale_id: sale.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            sale_price: it.sale_price,
            total_price: it.total_price,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));

        const { error: itemsErr } = await supabase
            .from("sale_items")
            .insert(itemsToInsert);

        if (itemsErr) {
            console.error("POST /company/sales sale_items:", itemsErr);
            await supabase.from("sales").delete().eq("id", sale.id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την αποθήκευση των γραμμών πώλησης",
                code: "DB_ERROR"
            });
        }

        // Auto-number when status reaches completed/sent and no user-provided number
        const needsAutoNumber = (saleStatus === "completed" || saleStatus === "sent") && !userInvoiceNumber;
        if (needsAutoNumber) {
            try {
                const autoNum = await getNextSequence(companyId, invoiceType);
                await supabase.from("sales").update({ invoice_number: autoNum }).eq("id", sale.id).eq("company_id", companyId);
                saleData.invoice_number = autoNum;
            } catch (seqErr) {
                console.error("POST /company/sales auto-number:", seqErr);
                await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                await supabase.from("sales").delete().eq("id", sale.id);
                return res.status(500).json({ success: false, message: "Σφάλμα καταχώρησης αριθμού παραστατικού", code: "DB_ERROR" });
            }
        }

        // Stock movements only when creating as completed for types that decrease stock
        if (needsStockOnComplete) {
            for (let i = 0; i < saleItemsData.length; i++) {
            const it = saleItemsData[i];
            const { data: sp } = await supabase
                .from("store_products")
                .select("id, stock_quantity")
                .eq("store_id", store_id.trim())
                .eq("product_variant_id", it.product_variant_id)
                .maybeSingle();

            const currentQty = sp ? Number(sp.stock_quantity) : 0;
            const newQty = currentQty - it.quantity;

            if (sp) {
                const { error: updErr } = await supabase
                    .from("store_products")
                    .update({ stock_quantity: newQty })
                    .eq("id", sp.id);
                if (updErr) {
                    console.error("POST /company/sales stock reduction:", updErr);
                    await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                    await supabase.from("sales").delete().eq("id", sale.id);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ενημέρωση αποθέματος",
                        code: "DB_ERROR"
                    });
                }
            } else {
                const { error: insErr } = await supabase
                    .from("store_products")
                    .insert({
                        store_id: store_id.trim(),
                        product_id: it.product_id,
                        product_variant_id: it.product_variant_id,
                        stock_quantity: newQty
                    });
                if (insErr) {
                    console.error("POST /company/sales store_products insert:", insErr);
                    await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                    await supabase.from("sales").delete().eq("id", sale.id);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ενημέρωση αποθέματος",
                        code: "DB_ERROR"
                    });
                }
            }

            const { error: moveErr } = await supabase
                .from("stock_movements")
                .insert({
                    company_id: companyId,
                    store_id: store_id.trim(),
                    product_id: it.product_id,
                    product_variant_id: it.product_variant_id,
                    quantity: -it.quantity,
                    movement_type: "sale",
                    source: "sale",
                    related_document_type: "sale",
                    related_document_id: sale.id,
                    created_by: userId || null
                });
            if (moveErr) {
                console.error("POST /company/sales stock_movement:", moveErr);
                if (sp) {
                    await supabase.from("store_products").update({ stock_quantity: currentQty }).eq("id", sp.id);
                } else {
                    await supabase
                        .from("store_products")
                        .delete()
                        .eq("store_id", store_id.trim())
                        .eq("product_variant_id", it.product_variant_id);
                }
                for (let j = i - 1; j >= 0; j--) {
                    const prev = saleItemsData[j];
                    const { data: prevSp } = await supabase
                        .from("store_products")
                        .select("id, stock_quantity")
                        .eq("store_id", store_id.trim())
                        .eq("product_variant_id", prev.product_variant_id)
                        .maybeSingle();
                    if (prevSp) {
                        const prevRestore = Number(prevSp.stock_quantity) + prev.quantity;
                        await supabase.from("store_products").update({ stock_quantity: prevRestore }).eq("id", prevSp.id);
                    } else {
                        await supabase
                            .from("store_products")
                            .delete()
                            .eq("store_id", store_id.trim())
                            .eq("product_variant_id", prev.product_variant_id);
                    }
                }
                await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                await supabase.from("sales").delete().eq("id", sale.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση κίνησης αποθέματος",
                    code: "DB_ERROR"
                });
            }
        }
    }

        // DNO create (completed): release reserved stock (delivery consumes SO reservation)
        if (invoiceType === "DNO" && saleStatus === "completed" && saleItemsData && saleItemsData.length > 0) {
            await releaseReservedStock(store_id.trim(), saleItemsData);
        }

        // SO finalize: reserve stock (SO holds stock for the order)
        if (invoiceType === "SO" && saleStatus === "completed") {
            const res = await reserveStockForSO(store_id.trim(), saleItemsData);
            if (!res.ok) {
                console.error("POST /company/sales SO reserve:", res.error);
                await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                await supabase.from("sales").delete().eq("id", sale.id);
                return res.status(500).json({
                    success: false,
                    message: res.error || "Σφάλμα κατά την κράτηση αποθέματος",
                    code: "DB_ERROR"
                });
            }
        }

        // Auto-receipt for completed REC or INV with immediate payment
        if (saleStatus === "completed" && (invoiceType === "REC" || (invoiceType === "INV" && salePaymentTerms === "immediate"))) {
            const receiptData = {
                company_id: companyId,
                store_id: store_id.trim(),
                sale_id: sale.id,
                customer_id: customer_id && typeof customer_id === "string" && customer_id.trim() ? customer_id.trim() : null,
                amount: totalAmount,
                payment_method_id: payment_method_id.trim(),
                is_auto: true,
                created_by: userId || null
            };
            const { error: receiptErr } = await supabase.from("receipts").insert(receiptData);
            if (receiptErr) {
                console.error("POST /company/sales auto-receipt:", receiptErr);
                if (needsStockOnComplete) {
                    await reverseSaleStock(companyId, store_id.trim(), sale.id, userId);
                }
                await supabase.from("sale_items").delete().eq("sale_id", sale.id);
                await supabase.from("sales").delete().eq("id", sale.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση απόδειξης πληρωμής",
                    code: "DB_ERROR"
                });
            }
        }

        const { data: saleRow } = await supabase
            .from("sales")
            .select("id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes, subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned")
            .eq("id", sale.id)
            .single();

        const { data: itemsRows } = await supabase
            .from("sale_items")
            .select("id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt")
            .eq("sale_id", sale.id)
            .order("id", { ascending: true });

        const fullSale = saleRow ? { ...saleRow, sale_items: itemsRows || [] } : sale;
        return res.json({
            success: true,
            data: fullSale
        });
    } catch (err) {
        console.error("POST /company/sales ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// Reverses sale stock by adding compensating movements (does NOT delete existing movements)
async function reverseSaleStock(companyId, storeId, saleId, userId) {
    const { data: movements } = await supabase
        .from("stock_movements")
        .select("id, product_id, product_variant_id, quantity")
        .eq("company_id", companyId)
        .eq("store_id", storeId)
        .eq("related_document_type", "sale")
        .eq("related_document_id", saleId);

    if (!movements || movements.length === 0) return;

    for (const m of movements) {
        const qty = Math.abs(Number(m.quantity));
        if (qty <= 0) continue;
        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", m.product_variant_id)
            .maybeSingle();

        const currentQty = sp ? Number(sp.stock_quantity) : 0;
        const newQty = currentQty + qty;

        if (sp) {
            await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
        } else {
            await supabase.from("store_products").insert({
                store_id: storeId,
                product_id: m.product_id,
                product_variant_id: m.product_variant_id,
                stock_quantity: newQty
            });
        }
        await supabase.from("stock_movements").insert({
            company_id: companyId,
            store_id: storeId,
            product_id: m.product_id,
            product_variant_id: m.product_variant_id,
            quantity: qty,
            movement_type: "in",
            source: "sale_reversal",
            related_document_type: "sale",
            related_document_id: saleId,
            created_by: userId || null
        });
    }
}

/**
 * Create an accounting-only CRN when a REC or INV is fully cancelled.
 * Stock is already reversed by reverseSaleStock - do NOT call applyCreditNoteStock.
 */
async function createAutoCrnOnCancellation(companyId, originalSale, userId) {
    const docType = String(originalSale.invoice_type || "").toUpperCase();
    if (docType !== "REC" && docType !== "INV") return;

    const items = originalSale.sale_items || [];
    if (items.length === 0) return;

    const crnItems = items.map(it => ({
        product_id: it.product_id,
        product_variant_id: it.product_variant_id,
        quantity: Number(it.quantity),
        sale_price: -Number(it.sale_price),
        total_price: -Number(it.total_price),
        vat_rate: Number(it.vat_rate) || 0,
        vat_exempt: it.vat_exempt === true
    }));

    const subtotal = crnItems.reduce((s, it) => s + it.total_price, 0);
    const vatTotal = Math.round(subtotal * 0.2 * 100) / 100; // approximate for CRN
    const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

    const crnNumber = await getNextSequence(companyId, "CRN");

    const { data: crnSale, error: crnErr } = await supabase
        .from("sales")
        .insert({
            company_id: companyId,
            store_id: originalSale.store_id,
            customer_id: originalSale.customer_id,
            payment_method_id: originalSale.payment_method_id || null,
            total_amount: totalAmount,
            subtotal,
            vat_total: vatTotal,
            amount_paid: 0,
            change_returned: 0,
            notes: originalSale.notes ? `Ακύρωση: ${originalSale.invoice_number || originalSale.id}` : null,
            source: "manual",
            status: "completed",
            invoice_type: "CRN",
            invoice_number: crnNumber,
            converted_from_id: originalSale.id,
            created_by: userId || null
        })
        .select("id")
        .single();

    if (crnErr || !crnSale) {
        console.error("createAutoCrnOnCancellation:", crnErr);
        return;
    }

    const vatRates = {};
    for (const it of items) {
        const r = Number(it.vat_rate) || 0;
        vatRates[it.product_variant_id] = r;
    }
    const recalcCrnItems = crnItems.map(it => {
        const total = it.quantity * it.sale_price;
        const vatRate = vatRates[it.product_variant_id] || 0;
        const lineVat = Math.round(total * vatRate * 100) / 100;
        return {
            sale_id: crnSale.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            sale_price: it.sale_price,
            total_price: total,
            vat_rate: vatRate,
            vat_exempt: it.vat_exempt
        };
    });
    let crnSubtotal = 0;
    let crnVatTotal = 0;
    for (const it of recalcCrnItems) {
        crnSubtotal += it.total_price;
        crnVatTotal += Math.round(it.total_price * it.vat_rate * 100) / 100;
    }
    crnSubtotal = Math.round(crnSubtotal * 100) / 100;
    crnVatTotal = Math.round(crnVatTotal * 100) / 100;
    const crnTotal = Math.round((crnSubtotal + crnVatTotal) * 100) / 100;

    await supabase.from("sale_items").insert(recalcCrnItems);
    await supabase.from("sales").update({ subtotal: crnSubtotal, vat_total: crnVatTotal, total_amount: crnTotal }).eq("id", crnSale.id).eq("company_id", companyId);
}

// PATCH /company/sales/:id - Update sale with items
router.patch("/company/sales/:id", requireAuth, requireAnyPermission(['sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const { id } = req.params;
    const { customer_id, payment_method_id, notes, items, confirm_negative_stock, invoice_type, invoice_number, amount_paid, status: reqStatus, invoice_date, expiry_date, payment_terms: bodyPaymentTerms } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: existing, error: fetchErr } = await supabase
            .from("sales")
            .select("id, store_id, status, invoice_type, payment_status")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !existing) {
            return res.status(404).json({
                success: false,
                message: "Η πώληση δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const currentStatus = (existing.status || "completed").toLowerCase();
        const targetStatus = (reqStatus && typeof reqStatus === "string" ? reqStatus.trim().toLowerCase() : null) || currentStatus;

        const existingDocType = (existing.invoice_type || "REC").toString().toUpperCase().replace(/^(RECEIPT|INVOICE)$/, m => m === "RECEIPT" ? "REC" : "INV");

        // invoice_type is immutable for non-draft sales
        if (currentStatus !== "draft" && invoice_type != null) {
            const requestedType = (typeof invoice_type === "string" ? invoice_type.trim().toUpperCase() : "").replace(/^(RECEIPT|INVOICE)$/, m => m === "RECEIPT" ? "REC" : "INV");
            if (requestedType && requestedType !== existingDocType) {
                return res.status(400).json({
                    success: false,
                    message: "Ο τύπος παραστατικού δεν μπορεί να αλλάξει μετά την ολοκλήρωση της πώλησης",
                    code: "INVOICE_TYPE_IMMUTABLE"
                });
            }
        }

        // Build context for spec-driven transitions
        const { data: receiptsList } = await supabase
            .from("receipts")
            .select("id")
            .eq("sale_id", id)
            .eq("company_id", companyId)
            .eq("is_auto", false);
        const hasReceipts = (receiptsList || []).length > 0;

        let hasLinkedInvoice = false;
        if (existingDocType === "DNO") {
            const { data: invRec } = await supabase
                .from("sales")
                .select("id")
                .eq("company_id", companyId)
                .eq("converted_from_id", id)
                .limit(1)
                .maybeSingle();
            hasLinkedInvoice = !!invRec;
        }

        const allowedStatuses = getAllowedSalesStatuses(existingDocType, currentStatus, {
            paymentStatus: existing.payment_status,
            hasReceipts,
            hasLinkedInvoice
        });
        if (!allowedStatuses.includes(targetStatus)) {
            return res.status(403).json({
                success: false,
                message: "Μη επιτρεπτή μετάβαση κατάστασης",
                code: "INVALID_STATUS_TRANSITION"
            });
        }

        if (existingDocType === "SO" && targetStatus === "cancelled") {
            const blockSo = await getSoCancelBlockReason(supabase, companyId, parseInt(id, 10));
            if (blockSo) {
                return res.status(400).json({
                    success: false,
                    message: blockSo.message,
                    code: blockSo.code,
                    blocking_children: blockSo.blockingChildren,
                });
            }
        }

        const storeId = existing.store_id;

        // QUO converted/expired/cancelled and REC/INV/etc cancelled cannot be edited
        if (currentStatus === "cancelled") {
            return res.status(403).json({
                success: false,
                message: "Δεν επιτρέπεται επεξεργασία ακυρωμένης πώλησης",
                code: "CANNOT_EDIT_CANCELLED"
            });
        }
        if (existingDocType === "QUO" && ["converted", "expired"].includes(currentStatus)) {
            return res.status(403).json({
                success: false,
                message: "Δεν επιτρέπεται επεξεργασία προσφοράς που μετατράπηκε ή έληξε",
                code: "CANNOT_EDIT_QUO_READONLY"
            });
        }

        // completed → cancelled: reverse stock, release SO reservation, delete non-auto receipts, update status, auto-create CRN for REC/INV
        if (currentStatus === "completed" && targetStatus === "cancelled") {
            const existingType = (existing.invoice_type || "").toUpperCase();
            const affectsStock = ["REC", "INV", "DNO"].includes(existingType);

            if (affectsStock) {
                await reverseSaleStock(companyId, storeId, parseInt(id, 10), userId);
            }
            if (existingType === "SO") {
                const { data: soItems } = await supabase
                    .from("sale_items")
                    .select("product_id, product_variant_id, quantity")
                    .eq("sale_id", id);
                if (soItems && soItems.length > 0) {
                    await releaseReservedStock(storeId, soItems);
                }
            }
            if (existingType === "DNO") {
                const { data: dnoItems } = await supabase
                    .from("sale_items")
                    .select("product_id, product_variant_id, quantity")
                    .eq("sale_id", id);
                if (dnoItems && dnoItems.length > 0) {
                    await releaseReservedStock(storeId, dnoItems);
                }
            }

            // Delete non-auto receipts linked to this sale
            await supabase.from("receipts").delete().eq("sale_id", id).eq("company_id", companyId).eq("is_auto", false);

            const { error: updErr } = await supabase
                .from("sales")
                .update({ status: "cancelled", payment_status: null, amount_due: null })
                .eq("id", id)
                .eq("company_id", companyId);
            if (updErr) {
                console.error("PATCH sales cancel:", updErr);
                return res.status(500).json({ success: false, message: "Σφάλμα ακύρωσης", code: "DB_ERROR" });
            }

            // Auto-create CRN (accounting only) for REC/INV; no extra stock (reverseSaleStock already did it)
            if (existingType === "REC" || existingType === "INV") {
                const { data: fullSaleForCrn } = await supabase.from("sales")
                    .select("id, store_id, customer_id, payment_method_id, subtotal, vat_total, total_amount, amount_paid, change_returned, notes, invoice_type, invoice_number")
                    .eq("id", id)
                    .eq("company_id", companyId)
                    .single();
                const { data: saleItems } = await supabase.from("sale_items")
                    .select("product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt")
                    .eq("sale_id", id);
                if (fullSaleForCrn && saleItems && saleItems.length > 0) {
                    await createAutoCrnOnCancellation(companyId, { ...fullSaleForCrn, sale_items: saleItems }, userId);
                }
            }

            const { data: fullSale } = await supabase.from("sales").select(`
                id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)
            `).eq("id", id).eq("company_id", companyId).single();
            return res.json({ success: true, data: fullSale });
        }

        const { data: oldItems } = await supabase
            .from("sale_items")
            .select("product_id, product_variant_id, quantity")
            .eq("sale_id", id);
        const oldItemsList = oldItems || [];

    let invoiceType = (invoice_type && typeof invoice_type === "string" ? invoice_type.trim().toUpperCase() : existing.invoice_type || "REC");
    if (invoiceType === "RECEIPT") invoiceType = "REC";
    if (invoiceType === "INVOICE") invoiceType = "INV";
    if (!SALES_DOC_TYPES.includes(invoiceType)) {
            return res.status(400).json({
                success: false,
                message: "Ο τύπος παραστατικού πρέπει να είναι QUO, SO, REC, INV, CRN ή DNO",
                code: "VALIDATION_ERROR"
            });
        }

        if (["INV", "CRN"].includes(invoiceType)) {
            if (!customer_id || typeof customer_id !== "string" || !customer_id.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Για τιμολόγιο απαιτείται πελάτης",
                    code: "VALIDATION_ERROR"
                });
            }
            const { data: customerRow } = await supabase
                .from("customers")
                .select("id, tax_id")
                .eq("id", customer_id.trim())
                .eq("company_id", companyId)
                .single();
            if (!customerRow || !customerRow.tax_id || !String(customerRow.tax_id).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Ο πελάτης πρέπει να έχει ΑΦΜ για τιμολόγιο",
                    code: "VALIDATION_ERROR"
                });
            }
        }

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Χρειάζεται τουλάχιστον μία γραμμή προϊόντος",
                code: "VALIDATION_ERROR"
            });
        }

        const validItems = items.filter(it =>
            it &&
            typeof it.product_id === "number" &&
            typeof it.product_variant_id === "number" &&
            typeof it.quantity === "number" &&
            it.quantity > 0 &&
            typeof it.sale_price === "number" &&
            it.sale_price >= 0
        );

        if (validItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Οι γραμμές προϊόντων δεν είναι έγκυρες",
                code: "VALIDATION_ERROR"
            });
        }

        for (const it of validItems) {
            const vatExempt = it.vat_exempt === true;
            const vatRate = vatExempt ? 0 : (typeof it.vat_rate === "number" ? Math.min(1, Math.max(0, it.vat_rate)) : 0);
            if (vatExempt && vatRate !== 0) {
                return res.status(400).json({
                    success: false,
                    message: "Γραμμή με απαλλαγή ΦΠΑ πρέπει να έχει vat_rate = 0",
                    code: "VALIDATION_ERROR"
                });
            }
        }

        if (!payment_method_id || typeof payment_method_id !== "string" || !payment_method_id.trim()) {
            return res.status(400).json({
                success: false,
                message: "Ο τρόπος πληρωμής είναι υποχρεωτικός",
                code: "VALIDATION_ERROR"
            });
        }

        let subtotal = 0;
        let vatTotal = 0;
        const saleItemsData = validItems.map(it => {
            const qty = Number(it.quantity);
            const price = Number(it.sale_price);
            const total = Math.round(qty * price * 100) / 100;
            const vatExempt = it.vat_exempt === true;
            const vatRate = vatExempt ? 0 : (typeof it.vat_rate === "number" ? Math.min(1, Math.max(0, it.vat_rate)) : 0);
            const lineVat = Math.round(total * vatRate * 100) / 100;
            subtotal += total;
            vatTotal += lineVat;
            return {
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                quantity: qty,
                sale_price: price,
                total_price: total,
                vat_rate: vatRate,
                vat_exempt: vatExempt
            };
        });
        subtotal = Math.round(subtotal * 100) / 100;
        vatTotal = Math.round(vatTotal * 100) / 100;
        const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;
        const amountPaid = (amount_paid != null && typeof amount_paid === "number" && amount_paid >= 0)
            ? Math.round(amount_paid * 100) / 100
            : totalAmount;
        const changeReturned = Math.round((amountPaid - totalAmount) * 100) / 100;

        // Stock check only when transitioning draft→completed (completed edits are now forbidden via 403)
        const shouldCheckStock = currentStatus === "draft" && targetStatus === "completed";
        const stockCheckItems = saleItemsData.map(it => ({ store_id: storeId, product_variant_id: it.product_variant_id, product_id: it.product_id, quantity: it.quantity }));
        if (shouldCheckStock && stockCheckItems.length > 0 && !confirm_negative_stock) {
            const result = await checkStockAvailability(companyId, stockCheckItems, { userPermissions });
            if (result.block) {
                const code = result.message && result.message.includes("δικαίωμα") ? "NO_PERMISSION_NEGATIVE_STOCK" : "INSUFFICIENT_STOCK";
                return res.status(400).json({
                    success: false,
                    code,
                    message: result.message || "Ανεπαρκές απόθεμα",
                    insufficientItems: result.insufficientItems || []
                });
            }
            if (result.warning) {
                return res.status(200).json({
                    success: false,
                    code: "REQUIRES_CONFIRMATION",
                    requires_negative_stock_confirmation: true,
                    insufficientItems: result.insufficientItems || [],
                    message: result.message || "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;"
                });
            }
        }

        // No reverse for draft edit - reverseSaleStock only used for completed→cancelled (handled above)
        const { error: delItemsErr } = await supabase
            .from("sale_items")
            .delete()
            .eq("sale_id", id);

        if (delItemsErr) {
            console.error("PATCH sales delete items:", delItemsErr);
            for (const it of oldItemsList) {
                const qty = Number(it.quantity);
                const { data: sp } = await supabase
                    .from("store_products")
                    .select("id, stock_quantity")
                    .eq("store_id", storeId)
                    .eq("product_variant_id", it.product_variant_id)
                    .maybeSingle();
                if (sp) {
                    const cur = Number(sp.stock_quantity);
                    await supabase.from("store_products").update({ stock_quantity: cur - qty }).eq("id", sp.id);
                }
                await supabase.from("stock_movements").insert({
                    company_id: companyId,
                    store_id: storeId,
                    product_id: it.product_id,
                    product_variant_id: it.product_variant_id,
                    quantity: -qty,
                    movement_type: "sale",
                    source: "sale",
                    related_document_type: "sale",
                    related_document_id: parseInt(id, 10),
                    created_by: userId || null
                });
            }
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης πώλησης",
                code: "DB_ERROR"
            });
        }

        const itemsToInsert = saleItemsData.map(it => ({
            sale_id: parseInt(id, 10),
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            sale_price: it.sale_price,
            total_price: it.total_price,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));

        const { error: itemsErr } = await supabase.from("sale_items").insert(itemsToInsert);
        if (itemsErr) {
            console.error("PATCH sales insert items:", itemsErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης γραμμών πώλησης",
                code: "DB_ERROR"
            });
        }

        // SO finalize (draft→completed): reserve stock
        if (invoiceType === "SO" && currentStatus === "draft" && targetStatus === "completed") {
            const res = await reserveStockForSO(storeId, saleItemsData);
            if (!res.ok) {
                return res.status(500).json({
                    success: false,
                    message: res.error || "Σφάλμα κατά την κράτηση αποθέματος",
                    code: "DB_ERROR"
                });
            }
        }

        // Apply stock only for REC, INV, DNO when transitioning to/completing as completed
        const needStockApply = SALES_DECREASES_STOCK.includes(invoiceType) && (
            (currentStatus === "draft" && targetStatus === "completed") || (currentStatus === "completed" && targetStatus === "completed")
        );
        if (needStockApply) {
            if (currentStatus === "draft" && targetStatus === "completed") {
                for (const it of saleItemsData) {
                    const { data: sp } = await supabase
                        .from("store_products")
                        .select("id, stock_quantity")
                        .eq("store_id", storeId)
                        .eq("product_variant_id", it.product_variant_id)
                        .maybeSingle();
                    const currentQty = sp ? Number(sp.stock_quantity) : 0;
                    const newQty = currentQty - it.quantity;
                    if (sp) {
                        await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
                    } else {
                        await supabase.from("store_products").insert({
                            store_id: storeId,
                            product_id: it.product_id,
                            product_variant_id: it.product_variant_id,
                            stock_quantity: newQty
                        });
                    }
                    await supabase.from("stock_movements").insert({
                        company_id: companyId,
                        store_id: storeId,
                        product_id: it.product_id,
                        product_variant_id: it.product_variant_id,
                        quantity: -it.quantity,
                        movement_type: "sale",
                        source: "sale",
                        related_document_type: "sale",
                        related_document_id: parseInt(id, 10),
                        created_by: userId || null
                    });
                }
            } else {
                for (const vid of allVariants) {
                    const oldQty = oldByVariant[vid] ? oldByVariant[vid].quantity : 0;
                    const newQty = newByVariant[vid] ? newByVariant[vid].quantity : 0;
                    const delta = newQty - oldQty;
                    if (delta === 0) continue;
                    const info = newByVariant[vid] || oldByVariant[vid];
                    const { data: sp } = await supabase
                        .from("store_products")
                        .select("id, stock_quantity")
                        .eq("store_id", storeId)
                        .eq("product_variant_id", parseInt(vid, 10))
                        .maybeSingle();
                    const curQty = sp ? Number(sp.stock_quantity) : 0;
                    if (delta > 0) {
                        const newStock = curQty - delta;
                        if (sp) {
                            await supabase.from("store_products").update({ stock_quantity: newStock }).eq("id", sp.id);
                        } else {
                            await supabase.from("store_products").insert({
                                store_id: storeId,
                                product_id: info.product_id,
                                product_variant_id: parseInt(vid, 10),
                                stock_quantity: newStock
                            });
                        }
                        await supabase.from("stock_movements").insert({
                            company_id: companyId,
                            store_id: storeId,
                            product_id: info.product_id,
                            product_variant_id: parseInt(vid, 10),
                            quantity: -delta,
                            movement_type: "sale",
                            source: "sale",
                            related_document_type: "sale",
                            related_document_id: parseInt(id, 10),
                            created_by: userId || null
                        });
                    } else {
                        const newStock = curQty + Math.abs(delta);
                        if (sp) {
                            await supabase.from("store_products").update({ stock_quantity: newStock }).eq("id", sp.id);
                        } else {
                            await supabase.from("store_products").insert({
                                store_id: storeId,
                                product_id: info.product_id,
                                product_variant_id: parseInt(vid, 10),
                                stock_quantity: newStock
                            });
                        }
                        await supabase.from("stock_movements").insert({
                            company_id: companyId,
                            store_id: storeId,
                            product_id: info.product_id,
                            product_variant_id: parseInt(vid, 10),
                            quantity: Math.abs(delta),
                            movement_type: "in",
                            source: "sale_reversal",
                            related_document_type: "sale",
                            related_document_id: parseInt(id, 10),
                            created_by: userId || null
                        });
                    }
                }
            }
        }

        const updateData = {
            customer_id: customer_id && typeof customer_id === "string" && customer_id.trim() ? customer_id.trim() : null,
            payment_method_id: payment_method_id.trim(),
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            invoice_type: invoiceType,
            invoice_number: invoice_number && typeof invoice_number === "string" ? invoice_number.trim() || null : null,
            subtotal,
            vat_total: vatTotal,
            total_amount: totalAmount,
            amount_paid: amountPaid,
            change_returned: changeReturned
        };
        if (invoice_date != null) {
            updateData.invoice_date = (invoice_date && typeof invoice_date === "string" && invoice_date.trim()) ? invoice_date.trim().slice(0, 10) : null;
        }
        if (existingDocType === "QUO" && expiry_date != null) {
            updateData.expiry_date = (expiry_date && typeof expiry_date === "string" && expiry_date.trim()) ? expiry_date.trim().slice(0, 10) : null;
        }
        // Payment terms, due_date, payment_status, amount_due when transitioning to completed (REC/INV)
        if (targetStatus === "completed" && (invoiceType === "REC" || invoiceType === "INV")) {
            const validTerms = ["immediate", "15", "30", "60", "90"];
            let salePaymentTerms = "immediate";
            if (invoiceType === "INV" && customer_id && typeof customer_id === "string" && customer_id.trim()) {
                const { data: cust } = await supabase.from("customers").select("payment_terms").eq("id", customer_id.trim()).eq("company_id", companyId).single();
                const custTerms = cust?.payment_terms && validTerms.includes(String(cust.payment_terms).toLowerCase()) ? String(cust.payment_terms).toLowerCase() : "immediate";
                salePaymentTerms = bodyPaymentTerms && validTerms.includes(String(bodyPaymentTerms).toLowerCase()) ? String(bodyPaymentTerms).toLowerCase() : custTerms;
            }
            const invDateStr = (invoice_date && typeof invoice_date === "string" && invoice_date.trim()) ? invoice_date.trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
            const daysToAdd = salePaymentTerms === "immediate" ? 0 : parseInt(salePaymentTerms, 10) || 0;
            updateData.payment_terms = salePaymentTerms;
            updateData.due_date = (invoiceType === "INV" && daysToAdd > 0) ? (() => { const d = new Date(invDateStr); d.setDate(d.getDate() + daysToAdd); return d.toISOString(); })() : null;
            if (invoiceType === "REC" || salePaymentTerms === "immediate") {
                updateData.payment_status = "paid";
                updateData.amount_due = 0;
            } else {
                updateData.payment_status = "unpaid";
                updateData.amount_due = totalAmount;
            }
        }
        // QUO draft → sent: auto-assign invoice number (QUO-2026-0001)
        if (existingDocType === "QUO" && currentStatus === "draft" && targetStatus === "sent") {
            const quoNum = await getNextSequence(companyId, "QUO");
            updateData.invoice_number = quoNum;
        }
        if (targetStatus === "completed" && (invoiceType === "REC" || invoiceType === "INV")) {
            const validTerms = ["immediate", "15", "30", "60", "90"];
            let salePaymentTerms = "immediate";
            if (invoiceType === "INV" && updateData.customer_id) {
                const { data: cust } = await supabase.from("customers").select("payment_terms").eq("id", updateData.customer_id).eq("company_id", companyId).single();
                const custTerms = cust?.payment_terms && validTerms.includes(String(cust.payment_terms).toLowerCase()) ? String(cust.payment_terms).toLowerCase() : "immediate";
                salePaymentTerms = bodyPaymentTerms && validTerms.includes(String(bodyPaymentTerms).toLowerCase()) ? String(bodyPaymentTerms).toLowerCase() : custTerms;
            }
            const invDateStr = updateData.invoice_date || new Date().toISOString().slice(0, 10);
            const daysToAdd = salePaymentTerms === "immediate" ? 0 : parseInt(salePaymentTerms, 10) || 0;
            updateData.payment_terms = salePaymentTerms;
            updateData.due_date = (invoiceType === "INV" && daysToAdd > 0) ? (() => { const d = new Date(invDateStr); d.setDate(d.getDate() + daysToAdd); return d.toISOString(); })() : null;
            if (invoiceType === "REC" || salePaymentTerms === "immediate") {
                updateData.payment_status = "paid";
                updateData.amount_due = 0;
            } else {
                updateData.payment_status = "unpaid";
                updateData.amount_due = totalAmount;
            }
        }
        if (targetStatus === "completed") updateData.status = "completed";
        else if (targetStatus === "sent") updateData.status = "sent";
        else if (targetStatus === "invoiced") updateData.status = "invoiced";
        else if (targetStatus === "cancelled") updateData.status = "cancelled";
        else if (targetStatus === "expired") updateData.status = "expired";

        const { error: updErr } = await supabase
            .from("sales")
            .update(updateData)
            .eq("id", id)
            .eq("company_id", companyId);

        if (updErr) {
            console.error("PATCH sales update:", updErr);
            await supabase.from("sale_items").delete().eq("sale_id", id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης πώλησης",
                code: "DB_ERROR"
            });
        }

        const { data: fullSale } = await supabase
            .from("sales")
            .select(`
                id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned,
                invoice_date, expiry_date,
                sale_items (id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        return res.json({ success: true, data: fullSale });
    } catch (err) {
        console.error("PATCH /company/sales ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/sales/:id/accept-quote - QUO (sent) → create SO from QUO, set quote to converted
router.post("/company/sales/:id/accept-quote", requireAuth, requireAnyPermission(['sales.create', 'sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;
    if (!companyId || !id) return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    try {
        const { data: quo, error: e } = await supabase.from("sales").select("id, store_id, customer_id, payment_method_id, subtotal, vat_total, total_amount, notes, invoice_type, status, expiry_date").eq("id", id).eq("company_id", companyId).single();
        if (e || !quo) return res.status(404).json({ success: false, message: "Η πώληση δεν βρέθηκε", code: "NOT_FOUND" });
        if (quo.invoice_type !== "QUO" || quo.status !== "sent") {
            return res.status(400).json({ success: false, message: "Μόνο προσφορά με κατάσταση «απεσταλμένη» μπορεί να αποδοθεί και να δημιουργήσει παραγγελία", code: "INVALID_STATE" });
        }
        const { data: items } = await supabase.from("sale_items").select("product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt").eq("sale_id", id);
        if (!items || items.length === 0) return res.status(400).json({ success: false, message: "Χρειάζονται γραμμές", code: "VALIDATION_ERROR" });
        const soNum = await getNextSequence(companyId, "SO");
        const { data: so, error: insErr } = await supabase.from("sales").insert({
            company_id: companyId,
            store_id: quo.store_id,
            customer_id: quo.customer_id,
            payment_method_id: quo.payment_method_id,
            subtotal: quo.subtotal,
            vat_total: quo.vat_total,
            total_amount: quo.total_amount,
            amount_paid: 0,
            change_returned: 0,
            notes: quo.notes,
            source: "manual",
            status: "draft",
            invoice_type: "SO",
            invoice_number: soNum,
            converted_from_id: parseInt(id, 10),
            expiry_date: quo.expiry_date,
            created_by: userId
        }).select("id").single();
        if (insErr || !so) return res.status(500).json({ success: false, message: "Σφάλμα δημιουργίας παραγγελίας", code: "DB_ERROR" });
        const soItems = items.map(it => ({ sale_id: so.id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: it.quantity, sale_price: it.sale_price, total_price: it.total_price, vat_rate: it.vat_rate, vat_exempt: it.vat_exempt }));
        const { error: itemsErr } = await supabase.from("sale_items").insert(soItems);
        if (itemsErr) {
            await supabase.from("sales").delete().eq("id", so.id);
            return res.status(500).json({ success: false, message: "Σφάλμα γραμμών", code: "DB_ERROR" });
        }
        await supabase.from("sales").update({ status: "converted" }).eq("id", id).eq("company_id", companyId);
        const { data: full } = await supabase.from("sales").select("id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes, subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned, converted_from_id, sale_items(id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)").eq("id", so.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("accept-quote:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/sales/:id/convert-to-receipt - QUO (sent) → create REC, set quote to converted
router.post("/company/sales/:id/convert-to-receipt", requireAuth, requireAnyPermission(['sales.create', 'sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;
    if (!companyId || !id) return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    try {
        const { data: quo, error: e } = await supabase.from("sales").select("id, store_id, customer_id, payment_method_id, subtotal, vat_total, total_amount, notes, invoice_type, status").eq("id", id).eq("company_id", companyId).single();
        if (e || !quo || quo.invoice_type !== "QUO" || quo.status !== "sent") {
            return res.status(400).json({ success: false, message: "Μόνο προσφορά με κατάσταση «απεσταλμένη» μπορεί να μετατραπεί σε απόδειξη", code: "INVALID_STATE" });
        }
        const { data: items } = await supabase.from("sale_items").select("product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt").eq("sale_id", id);
        if (!items || items.length === 0) return res.status(400).json({ success: false, message: "Χρειάζονται γραμμές", code: "VALIDATION_ERROR" });
        const recNum = await getNextSequence(companyId, "REC");
        const { data: rec, error: insErr } = await supabase.from("sales").insert({
            company_id: companyId,
            store_id: quo.store_id,
            customer_id: quo.customer_id,
            payment_method_id: quo.payment_method_id,
            subtotal: quo.subtotal,
            vat_total: quo.vat_total,
            total_amount: quo.total_amount,
            amount_paid: quo.total_amount,
            change_returned: 0,
            notes: quo.notes,
            source: "manual",
            status: "completed",
            invoice_type: "REC",
            invoice_number: recNum,
            converted_from_id: parseInt(id, 10),
            created_by: userId
        }).select("id").single();
        if (insErr || !rec) return res.status(500).json({ success: false, message: "Σφάλμα δημιουργίας απόδειξης", code: "DB_ERROR" });
        const recItems = items.map(it => ({ sale_id: rec.id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: it.quantity, sale_price: it.sale_price, total_price: it.total_price, vat_rate: it.vat_rate, vat_exempt: it.vat_exempt }));
        const { error: itemsErr } = await supabase.from("sale_items").insert(recItems);
        if (itemsErr) {
            await supabase.from("sales").delete().eq("id", rec.id);
            return res.status(500).json({ success: false, message: "Σφάλμα γραμμών", code: "DB_ERROR" });
        }
        for (const it of items) {
            const { data: sp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", quo.store_id).eq("product_variant_id", it.product_variant_id).maybeSingle();
            const cur = sp ? Number(sp.stock_quantity) : 0;
            const newQty = cur - it.quantity;
            if (sp) await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
            else await supabase.from("store_products").insert({ store_id: quo.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, stock_quantity: newQty });
            await supabase.from("stock_movements").insert({ company_id: companyId, store_id: quo.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: -it.quantity, movement_type: "sale", source: "sale", related_document_type: "sale", related_document_id: rec.id, created_by: userId });
        }
        await supabase.from("sales").update({ status: "converted" }).eq("id", id).eq("company_id", companyId);
        const { data: full } = await supabase.from("sales").select("id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes, subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned, converted_from_id, sale_items(id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)").eq("id", rec.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("convert-to-receipt:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/sales/:id/convert-to-invoice - QUO (sent) or DNO (completed) → create INV
router.post("/company/sales/:id/convert-to-invoice", requireAuth, requireAnyPermission(['sales.create', 'sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;
    if (!companyId || !id) return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    try {
        const { data: src, error: e } = await supabase.from("sales").select("id, store_id, customer_id, payment_method_id, subtotal, vat_total, total_amount, notes, invoice_type, status").eq("id", id).eq("company_id", companyId).single();
        if (e || !src) return res.status(404).json({ success: false, message: "Η πώληση δεν βρέθηκε", code: "NOT_FOUND" });
        const ok = (src.invoice_type === "QUO" && src.status === "sent") || (src.invoice_type === "DNO" && src.status === "completed");
        if (!ok) return res.status(400).json({ success: false, message: "Μόνο προσφορά (απεσταλμένη) ή δελτίο αποστολής (ολοκληρωμένο) μπορούν να μετατραπούν σε τιμολόγιο", code: "INVALID_STATE" });
        if (!src.customer_id) return res.status(400).json({ success: false, message: "Για τιμολόγιο απαιτείται πελάτης", code: "VALIDATION_ERROR" });
        const { data: items } = await supabase.from("sale_items").select("product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt").eq("sale_id", id);
        if (!items || items.length === 0) return res.status(400).json({ success: false, message: "Χρειάζονται γραμμές", code: "VALIDATION_ERROR" });
        const invNum = await getNextSequence(companyId, "INV");
        const { data: inv, error: insErr } = await supabase.from("sales").insert({
            company_id: companyId,
            store_id: src.store_id,
            customer_id: src.customer_id,
            payment_method_id: src.payment_method_id,
            subtotal: src.subtotal,
            vat_total: src.vat_total,
            total_amount: src.total_amount,
            amount_paid: src.total_amount,
            change_returned: 0,
            notes: src.notes,
            source: "manual",
            status: "completed",
            invoice_type: "INV",
            invoice_number: invNum,
            converted_from_id: parseInt(id, 10),
            created_by: userId
        }).select("id").single();
        if (insErr || !inv) return res.status(500).json({ success: false, message: "Σφάλμα δημιουργίας τιμολογίου", code: "DB_ERROR" });
        const invItems = items.map(it => ({ sale_id: inv.id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: it.quantity, sale_price: it.sale_price, total_price: it.total_price, vat_rate: it.vat_rate, vat_exempt: it.vat_exempt }));
        const { error: itemsErr } = await supabase.from("sale_items").insert(invItems);
        if (itemsErr) {
            await supabase.from("sales").delete().eq("id", inv.id);
            return res.status(500).json({ success: false, message: "Σφάλμα γραμμών", code: "DB_ERROR" });
        }
        for (const it of items) {
            const { data: sp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", src.store_id).eq("product_variant_id", it.product_variant_id).maybeSingle();
            const cur = sp ? Number(sp.stock_quantity) : 0;
            const newQty = cur - it.quantity;
            if (sp) await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
            else await supabase.from("store_products").insert({ store_id: src.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, stock_quantity: newQty });
            await supabase.from("stock_movements").insert({ company_id: companyId, store_id: src.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: -it.quantity, movement_type: "sale", source: "sale", related_document_type: "sale", related_document_id: inv.id, created_by: userId });
        }
        if (src.invoice_type === "QUO") await supabase.from("sales").update({ status: "converted" }).eq("id", id).eq("company_id", companyId);
        else await supabase.from("sales").update({ status: "invoiced" }).eq("id", id).eq("company_id", companyId);
        const { data: full } = await supabase.from("sales").select("id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes, subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned, converted_from_id, sale_items(id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)").eq("id", inv.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("convert-to-invoice:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/sales/:id/partial-return - REC/INV (completed) → create CRN with selected items, apply IN stock
router.post("/company/sales/:id/partial-return", requireAuth, requireAnyPermission(['sales.create', 'sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;
    const { items } = req.body || {};
    if (!companyId || !id) return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: "Χρειάζονται γραμμές επιστροφής (items: [{sale_item_id, quantity}])", code: "VALIDATION_ERROR" });
    try {
        const { data: orig, error: e } = await supabase.from("sales").select("id, store_id, customer_id, payment_method_id, subtotal, vat_total, total_amount, notes, invoice_type, status").eq("id", id).eq("company_id", companyId).single();
        if (e || !orig) return res.status(404).json({ success: false, message: "Η πώληση δεν βρέθηκε", code: "NOT_FOUND" });
        if (orig.invoice_type !== "REC" && orig.invoice_type !== "INV") return res.status(400).json({ success: false, message: "Μόνο απόδειξη ή τιμολόγιο μπορεί να έχει μερική επιστροφή", code: "INVALID_STATE" });
        if (orig.status !== "completed") return res.status(400).json({ success: false, message: "Η πώληση πρέπει να είναι ολοκληρωμένη", code: "INVALID_STATE" });
        const { data: allItems } = await supabase.from("sale_items").select("id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt").eq("sale_id", id);
        const byId = (allItems || []).reduce((acc, it) => { acc[it.id] = it; return acc; }, {});
        const returnLines = [];
        let crnSubtotal = 0, crnVat = 0;
        for (const r of items) {
            const sid = r.sale_item_id != null ? Number(r.sale_item_id) : null;
            const qty = r.quantity != null ? Number(r.quantity) : 0;
            if (!sid || qty <= 0 || !byId[sid]) continue;
            const origItem = byId[sid];
            const maxQty = origItem.quantity;
            const returnQty = Math.min(qty, maxQty);
            if (returnQty <= 0) continue;
            const total = -returnQty * Number(origItem.sale_price);
            const vatRate = Number(origItem.vat_rate) || 0;
            const lineVat = origItem.vat_exempt ? 0 : Math.round(total * vatRate * 100) / 100;
            returnLines.push({ ...origItem, quantity: returnQty, sale_price: -Number(origItem.sale_price), total_price: total, lineVat });
            crnSubtotal += total;
            crnVat += lineVat;
        }
        if (returnLines.length === 0) return res.status(400).json({ success: false, message: "Δεν υπάρχουν έγκυρες γραμμές επιστροφής", code: "VALIDATION_ERROR" });
        const crnTotal = Math.round((crnSubtotal + crnVat) * 100) / 100;
        const crnNum = await getNextSequence(companyId, "CRN");
        const { data: crn, error: insErr } = await supabase.from("sales").insert({
            company_id: companyId,
            store_id: orig.store_id,
            customer_id: orig.customer_id,
            payment_method_id: orig.payment_method_id,
            subtotal: Math.round(crnSubtotal * 100) / 100,
            vat_total: Math.round(crnVat * 100) / 100,
            total_amount: crnTotal,
            amount_paid: 0,
            change_returned: 0,
            notes: orig.notes ? `Μερική επιστροφή από ${orig.invoice_number || id}` : null,
            source: "manual",
            status: "completed",
            invoice_type: "CRN",
            invoice_number: crnNum,
            converted_from_id: parseInt(id, 10),
            created_by: userId
        }).select("id").single();
        if (insErr || !crn) return res.status(500).json({ success: false, message: "Σφάλμα δημιουργίας πιστωτικού", code: "DB_ERROR" });
        const crnItems = returnLines.map(it => ({ sale_id: crn.id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: it.quantity, sale_price: it.sale_price, total_price: it.total_price, vat_rate: it.vat_rate, vat_exempt: it.vat_exempt }));
        const { error: itemsErr } = await supabase.from("sale_items").insert(crnItems);
        if (itemsErr) {
            await supabase.from("sales").delete().eq("id", crn.id);
            return res.status(500).json({ success: false, message: "Σφάλμα γραμμών", code: "DB_ERROR" });
        }
        for (const it of returnLines) {
            const { data: sp } = await supabase.from("store_products").select("id, stock_quantity").eq("store_id", orig.store_id).eq("product_variant_id", it.product_variant_id).maybeSingle();
            const cur = sp ? Number(sp.stock_quantity) : 0;
            const newQty = cur + it.quantity;
            if (sp) await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
            else await supabase.from("store_products").insert({ store_id: orig.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, stock_quantity: newQty });
            await supabase.from("stock_movements").insert({ company_id: companyId, store_id: orig.store_id, product_id: it.product_id, product_variant_id: it.product_variant_id, quantity: it.quantity, movement_type: "in", source: "credit_note", related_document_type: "credit_note", related_document_id: crn.id, created_by: userId });
        }
        const { data: full } = await supabase.from("sales").select("id, created_at, store_id, customer_id, payment_method_id, total_amount, status, notes, subtotal, vat_total, invoice_type, invoice_number, amount_paid, change_returned, converted_from_id, sale_items(id, product_id, product_variant_id, quantity, sale_price, total_price, vat_rate, vat_exempt)").eq("id", crn.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("partial-return:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// DELETE /company/sales/:id - Delete sale
router.delete("/company/sales/:id", requireAuth, requireAnyPermission(['sales.delete', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userPermissions = req.user.permissions || [];
    const { id } = req.params;
    const { confirm_negative_stock } = req.body || {};

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: existing, error: fetchErr } = await supabase
            .from("sales")
            .select("id, store_id, status, invoice_type")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !existing) {
            return res.status(404).json({
                success: false,
                message: "Η πώληση δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const currentStatus = (existing.status || "completed").toLowerCase();
        if (currentStatus !== "draft") {
            return res.status(400).json({
                success: false,
                message: "Μόνο πρόχειρες πωλήσεις μπορούν να διαγραφούν",
                code: "CANNOT_DELETE_NON_DRAFT"
            });
        }

        await supabase.from("sale_items").delete().eq("sale_id", id);
        const { error: delErr } = await supabase.from("sales").delete().eq("id", id).eq("company_id", companyId);

        if (delErr) {
            console.error("DELETE /company/sales:", delErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη διαγραφή πώλησης",
                code: "DB_ERROR"
            });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error("DELETE /company/sales ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// ============================================
// RECEIPTS APIs
// ============================================

// GET /company/receipts - List receipts for company with filters
router.get("/company/receipts", requireAuth, requireAnyPermission(['sales.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, from, to, payment_method_id, payment_status } = req.query;

    if (!companyId || !store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        let query = supabase
            .from("receipts")
            .select(`
                id, created_at, store_id, sale_id, customer_id, amount, payment_method_id, payment_date, notes, is_auto,
                sales (invoice_type, invoice_number),
                customers (full_name),
                payment_methods (name)
            `)
            .eq("company_id", companyId)
            .eq("store_id", store_id.trim())
            .order("payment_date", { ascending: false });

        if (from && typeof from === "string" && from.trim()) {
            query = query.gte("payment_date", from.trim());
        }
        if (to && typeof to === "string" && to.trim()) {
            const d = new Date(to.trim());
            d.setUTCDate(d.getUTCDate() + 1);
            query = query.lt("payment_date", d.toISOString());
        }
        if (payment_method_id && typeof payment_method_id === "string" && payment_method_id.trim()) {
            query = query.eq("payment_method_id", payment_method_id.trim());
        }

        const { data: receipts, error } = await query;

        if (error) {
            console.error("GET /company/receipts:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση εισπράξεων",
                code: "DB_ERROR"
            });
        }

        // Resolve payment_status from linked sale when filter applied
        let result = (receipts ?? []).map(r => ({
            ...r,
            payment_method_name: r.payment_methods?.name ?? null,
            customer_name: r.customers?.full_name ?? null,
            invoice_number: r.sales?.invoice_number ? `${r.sales.invoice_type || "INV"}-${r.sales.invoice_number}` : null
        }));

        if (payment_status && typeof payment_status === "string" && payment_status.trim()) {
            const saleIds = [...new Set(result.filter(r => r.sale_id).map(r => r.sale_id))];
            if (saleIds.length > 0) {
                const { data: sales } = await supabase.from("sales").select("id, payment_status, due_date").in("id", saleIds);
                const saleMap = (sales || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
                const statusFilter = payment_status.trim().toLowerCase();
                result = result.filter(r => {
                    if (!r.sale_id) return statusFilter === "paid";
                    const sale = saleMap[r.sale_id];
                    let ps = sale?.payment_status || "paid";
                    if ((ps === "unpaid" || ps === "partial") && sale?.due_date && new Date(sale.due_date) < new Date()) ps = "overdue";
                    return ps === statusFilter;
                });
            }
        }

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /company/receipts ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/receipts - Create manual receipt
router.post("/company/receipts", requireAuth, requireAnyPermission(['sales.create', 'sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { store_id, sale_id, customer_id, amount, payment_method_id, payment_date, notes } = req.body;

    if (!companyId || !store_id || !sale_id || amount == null || !payment_method_id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν απαραίτητα πεδία (store_id, sale_id, amount, payment_method_id)",
            code: "VALIDATION_ERROR"
        });
    }

    const amt = Math.round(Number(amount) * 100) / 100;
    if (amt <= 0) {
        return res.status(400).json({
            success: false,
            message: "Το ποσό πρέπει να είναι θετικό",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: sale, error: saleErr } = await supabase
            .from("sales")
            .select("id, store_id, customer_id, total_amount, status, invoice_type, amount_due")
            .eq("id", sale_id)
            .eq("company_id", companyId)
            .single();

        if (saleErr || !sale) {
            return res.status(404).json({ success: false, message: "Η πώληση δεν βρέθηκε", code: "NOT_FOUND" });
        }
        if (sale.invoice_type !== "INV") {
            return res.status(400).json({
                success: false,
                message: "Οι χειροκίνητες εισπράξεις ισχύουν μόνο για τιμολόγια",
                code: "INVALID_STATE"
            });
        }
        if (sale.status !== "completed") {
            return res.status(400).json({
                success: false,
                message: "Η πώληση πρέπει να είναι ολοκληρωμένη",
                code: "INVALID_STATE"
            });
        }

        const amountDue = Number(sale.amount_due ?? sale.total_amount) || 0;
        if (amt > amountDue) {
            return res.status(400).json({
                success: false,
                message: `Το ποσό δεν μπορεί να υπερβαίνει το υπόλοιπο (${amountDue} €)`,
                code: "VALIDATION_ERROR"
            });
        }

        const { error: insErr } = await supabase.from("receipts").insert({
            company_id: companyId,
            store_id: store_id,
            sale_id: sale_id,
            customer_id: customer_id || sale.customer_id,
            amount: amt,
            payment_method_id: payment_method_id,
            payment_date: payment_date && typeof payment_date === "string" ? payment_date : new Date().toISOString(),
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            created_by: userId,
            is_auto: false
        });

        if (insErr) {
            console.error("POST /company/receipts:", insErr);
            return res.status(500).json({ success: false, message: "Σφάλμα καταχώρησης εισπράξης", code: "DB_ERROR" });
        }

        await recomputeSalePaymentStatus(supabase, companyId, parseInt(sale_id, 10));

        const { data: receipts } = await supabase.from("receipts").select("id, created_at, amount, payment_method_id, payment_date").eq("sale_id", sale_id);
        return res.json({ success: true, data: receipts });
    } catch (err) {
        console.error("POST /company/receipts ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// DELETE /company/receipts/:id - Delete manual receipt only
router.delete("/company/receipts/:id", requireAuth, requireAnyPermission(['sales.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    }

    try {
        const { data: rec, error: fetchErr } = await supabase
            .from("receipts")
            .select("id, sale_id, is_auto")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !rec) {
            return res.status(404).json({ success: false, message: "Η εισπραξη δεν βρέθηκε", code: "NOT_FOUND" });
        }
        if (rec.is_auto) {
            return res.status(403).json({
                success: false,
                message: "Δεν επιτρέπεται η διαγραφή αυτόματων εισπράξεων",
                code: "CANNOT_DELETE_AUTO"
            });
        }

        const saleId = rec.sale_id;
        const { error: delErr } = await supabase.from("receipts").delete().eq("id", id).eq("company_id", companyId);
        if (delErr) {
            console.error("DELETE /company/receipts:", delErr);
            return res.status(500).json({ success: false, message: "Σφάλμα διαγραφής", code: "DB_ERROR" });
        }

        if (saleId) await recomputeSalePaymentStatus(supabase, companyId, saleId);

        return res.json({ success: true });
    } catch (err) {
        console.error("DELETE /company/receipts ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// ============================================
// PAYMENTS APIs
// ============================================

// GET /company/payments - List payments for company with filters
router.get("/company/payments", requireAuth, requireAnyPermission(['purchases.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, from, to, payment_method_id, payment_status } = req.query;

    if (!companyId || !store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        let query = supabase
            .from("payments")
            .select(`
                id, created_at, store_id, purchase_id, vendor_id, amount, payment_method_id, payment_date, notes, is_auto,
                purchases (invoice_number, document_type),
                vendors (name),
                payment_methods (name)
            `)
            .eq("company_id", companyId)
            .eq("store_id", store_id.trim())
            .order("payment_date", { ascending: false });

        if (from && typeof from === "string" && from.trim()) {
            query = query.gte("payment_date", from.trim());
        }
        if (to && typeof to === "string" && to.trim()) {
            const d = new Date(to.trim());
            d.setUTCDate(d.getUTCDate() + 1);
            query = query.lt("payment_date", d.toISOString());
        }
        if (payment_method_id && typeof payment_method_id === "string" && payment_method_id.trim()) {
            query = query.eq("payment_method_id", payment_method_id.trim());
        }

        const { data: payments, error } = await query;

        if (error) {
            console.error("GET /company/payments:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση πληρωμών",
                code: "DB_ERROR"
            });
        }

        let result = (payments ?? []).map(p => ({
            ...p,
            payment_method_name: p.payment_methods?.name ?? null,
            vendor_name: p.vendors?.name ?? null,
            purchase_number: p.purchases ? `${p.purchases.document_type || "PUR"}-${p.purchases.invoice_number}` : null
        }));

        if (payment_status && typeof payment_status === "string" && payment_status.trim()) {
            const purchaseIds = [...new Set(result.filter(p => p.purchase_id).map(p => p.purchase_id))];
            if (purchaseIds.length > 0) {
                const { data: purchases } = await supabase.from("purchases").select("id, payment_status, due_date").in("id", purchaseIds);
                const purMap = (purchases || []).reduce((acc, pur) => { acc[pur.id] = pur; return acc; }, {});
                const statusFilter = payment_status.trim().toLowerCase();
                result = result.filter(p => {
                    if (!p.purchase_id) return statusFilter === "paid";
                    const pur = purMap[p.purchase_id];
                    let ps = pur?.payment_status || "paid";
                    if ((ps === "unpaid" || ps === "partial") && pur?.due_date && new Date(pur.due_date) < new Date()) ps = "overdue";
                    return ps === statusFilter;
                });
            }
        }

        return res.json({ success: true, data: result });
    } catch (err) {
        console.error("GET /company/payments ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/payments - Create manual payment
router.post("/company/payments", requireAuth, requireAnyPermission(['purchases.create', 'purchases.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { store_id, purchase_id, vendor_id, amount, payment_method_id, payment_date, notes } = req.body;

    if (!companyId || !store_id || !purchase_id || amount == null || !payment_method_id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν απαραίτητα πεδία (store_id, purchase_id, amount, payment_method_id)",
            code: "VALIDATION_ERROR"
        });
    }

    const amt = Math.round(Number(amount) * 100) / 100;
    if (amt <= 0) {
        return res.status(400).json({
            success: false,
            message: "Το ποσό πρέπει να είναι θετικό",
            code: "VALIDATION_ERROR"
        });
    }

    try {
        const { data: purchase, error: purErr } = await supabase
            .from("purchases")
            .select("id, store_id, vendor_id, total_amount, status, document_type, amount_due")
            .eq("id", purchase_id)
            .eq("company_id", companyId)
            .single();

        if (purErr || !purchase) {
            return res.status(404).json({ success: false, message: "Η αγορά δεν βρέθηκε", code: "NOT_FOUND" });
        }
        const docType = (purchase.document_type || "PUR").toUpperCase();
        if (!["PUR", "GRN"].includes(docType)) {
            return res.status(400).json({
                success: false,
                message: "Οι χειροκίνητες πληρωμές ισχύουν μόνο για αγορές ή δελτία προμήθειας",
                code: "INVALID_STATE"
            });
        }
        if (!["received", "completed"].includes((purchase.status || "").toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: "Η αγορά πρέπει να είναι παραληφθείσα ή ολοκληρωμένη",
                code: "INVALID_STATE"
            });
        }

        const amountDue = Number(purchase.amount_due ?? purchase.total_amount) || 0;
        if (amt > amountDue) {
            return res.status(400).json({
                success: false,
                message: `Το ποσό δεν μπορεί να υπερβαίνει το υπόλοιπο (${amountDue} €)`,
                code: "VALIDATION_ERROR"
            });
        }

        const { error: insErr } = await supabase.from("payments").insert({
            company_id: companyId,
            store_id: store_id,
            purchase_id: purchase_id,
            vendor_id: vendor_id || purchase.vendor_id,
            amount: amt,
            payment_method_id: payment_method_id,
            payment_date: payment_date && typeof payment_date === "string" ? payment_date : new Date().toISOString(),
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            created_by: userId,
            is_auto: false
        });

        if (insErr) {
            console.error("POST /company/payments:", insErr);
            return res.status(500).json({ success: false, message: "Σφάλμα καταχώρησης πληρωμής", code: "DB_ERROR" });
        }

        await recomputePurchasePaymentStatus(supabase, companyId, parseInt(purchase_id, 10));

        const { data: payments } = await supabase.from("payments").select("id, created_at, amount, payment_method_id, payment_date").eq("purchase_id", purchase_id);
        return res.json({ success: true, data: payments });
    } catch (err) {
        console.error("POST /company/payments ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// DELETE /company/payments/:id - Delete manual payment only
router.delete("/company/payments/:id", requireAuth, requireAnyPermission(['purchases.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    }

    try {
        const { data: pay, error: fetchErr } = await supabase
            .from("payments")
            .select("id, purchase_id, is_auto")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !pay) {
            return res.status(404).json({ success: false, message: "Η πληρωμή δεν βρέθηκε", code: "NOT_FOUND" });
        }
        if (pay.is_auto) {
            return res.status(403).json({
                success: false,
                message: "Δεν επιτρέπεται η διαγραφή αυτόματων πληρωμών",
                code: "CANNOT_DELETE_AUTO"
            });
        }

        const purchaseId = pay.purchase_id;
        const { error: delErr } = await supabase.from("payments").delete().eq("id", id).eq("company_id", companyId);
        if (delErr) {
            console.error("DELETE /company/payments:", delErr);
            return res.status(500).json({ success: false, message: "Σφάλμα διαγραφής", code: "DB_ERROR" });
        }

        if (purchaseId) await recomputePurchasePaymentStatus(supabase, companyId, purchaseId);

        return res.json({ success: true });
    } catch (err) {
        console.error("DELETE /company/payments ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// ============================================
// PURCHASES APIs
// ============================================

const PURCHASE_DOC_TYPES = ["PUR", "GRN", "DBN", "PO"];

// GET /company/purchases - List purchases for company with filters
router.get("/company/purchases", requireAuth, requireAnyPermission(['purchases.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { store_id, vendor_id, date_from, date_to, search, document_type, status } = req.query;

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        let query = supabase
            .from("purchases")
            .select(`
                id,
                created_at,
                store_id,
                vendor_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                invoice_number,
                invoice_date,
                document_type,
                converted_from_id,
                payment_terms,
                due_date,
                payment_status,
                amount_due,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra),
                stores (id, name),
                vendors (id, name)
            `)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false });

        if (document_type && typeof document_type === "string" && document_type.trim()) {
            query = query.eq("document_type", normalizePurchaseDocType(document_type));
        }
        if (status && typeof status === "string" && status.trim()) {
            query = query.eq("status", normalizePurchaseStatus(status));
        }
        if (store_id && typeof store_id === "string" && store_id.trim()) {
            query = query.eq("store_id", store_id.trim());
        }
        if (vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            query = query.eq("vendor_id", vendor_id.trim());
        }
        if (date_from && typeof date_from === "string" && date_from.trim()) {
            query = query.gte("created_at", date_from.trim());
        }
        if (date_to && typeof date_to === "string" && date_to.trim()) {
            const d = new Date(date_to.trim());
            d.setUTCDate(d.getUTCDate() + 1);
            query = query.lt("created_at", d.toISOString());
        }
        if (search && typeof search === "string" && search.trim()) {
            query = query.ilike("invoice_number", "%" + search.trim() + "%");
        }

        const { data: purchases, error } = await query;

        if (error) {
            console.error("GET /company/purchases:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση των αγορών",
                code: "DB_ERROR"
            });
        }

        const poIds = (purchases ?? []).filter((p) => (p.document_type || "").toUpperCase() === "PO").map((p) => p.id);
        const grnByPoId = {};
        if (poIds.length > 0) {
            const { data: grnRows } = await supabase
                .from("purchases")
                .select("id, converted_from_id, document_type, invoice_number, status")
                .eq("company_id", companyId)
                .eq("document_type", "GRN")
                .in("converted_from_id", poIds);
            for (const g of grnRows || []) {
                const pid = g.converted_from_id;
                if (!grnByPoId[pid]) grnByPoId[pid] = [];
                grnByPoId[pid].push({
                    id: g.id,
                    document_type: g.document_type || "GRN",
                    invoice_number: g.invoice_number,
                    status: g.status,
                });
            }
        }

        const now = new Date();
        const normalized = (purchases ?? []).map(p => {
            let paymentStatus = p.payment_status || null;
            if (paymentStatus && ["unpaid", "partial"].includes(paymentStatus) && p.due_date && new Date(p.due_date) < now) {
                paymentStatus = "overdue";
            }
            const isPo = (p.document_type || "").toUpperCase() === "PO";
            return {
                ...p,
                payment_status: paymentStatus,
                linked_documents: isPo ? (grnByPoId[p.id] || []) : [],
                store: p.stores ? { id: p.stores.id, name: p.stores.name } : null,
                vendor: p.vendors ? { id: p.vendors.id, name: p.vendors.name } : null,
                stores: undefined,
                vendors: undefined
            };
        });

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/purchases ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/purchases/:id - Single purchase with items
router.get("/company/purchases/:id", requireAuth, requireAnyPermission(['purchases.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: purchase, error } = await supabase
            .from("purchases")
            .select(`
                id,
                created_at,
                store_id,
                vendor_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                invoice_number,
                invoice_date,
                document_type,
                converted_from_id,
                payment_terms,
                due_date,
                payment_status,
                amount_due,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra),
                stores (id, name, address),
                vendors (id, name, phone, email)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !purchase) {
            return res.status(404).json({
                success: false,
                message: "Η αγορά δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        let paymentStatus = purchase.payment_status || null;
        if (paymentStatus && ["unpaid", "partial"].includes(paymentStatus) && purchase.due_date && new Date(purchase.due_date) < new Date()) {
            paymentStatus = "overdue";
        }

        let payments = [];
        if (purchase.id) {
            const { data: paymentRows } = await supabase
                .from("payments")
                .select("id, amount, payment_method_id, payment_date, notes, is_auto")
                .eq("purchase_id", purchase.id)
                .eq("company_id", companyId)
                .order("payment_date", { ascending: false });
            payments = (paymentRows || []).map(r => ({
                id: r.id,
                amount: Number(r.amount),
                payment_method_id: r.payment_method_id,
                payment_date: r.payment_date,
                notes: r.notes,
                is_auto: r.is_auto
            }));
        }

        let converted_to = null;
        if (["PUR", "GRN"].includes((purchase.document_type || "PUR").toUpperCase()) && (purchase.status || "").toLowerCase() === "cancelled") {
            const { data: dbnPurchase } = await supabase
                .from("purchases")
                .select("id, document_type, invoice_number")
                .eq("company_id", companyId)
                .eq("converted_from_id", id)
                .eq("document_type", "DBN")
                .single();
            if (dbnPurchase) {
                converted_to = {
                    id: dbnPurchase.id,
                    document_type: dbnPurchase.document_type || "DBN",
                    invoice_number: dbnPurchase.invoice_number || `#${dbnPurchase.id}`
                };
            }
        }

        let return_from = null;
        if ((purchase.document_type || "PUR").toUpperCase() === "DBN" && purchase.converted_from_id) {
            const { data: sourcePurchase } = await supabase
                .from("purchases")
                .select("id, document_type, invoice_number")
                .eq("id", purchase.converted_from_id)
                .eq("company_id", companyId)
                .single();
            if (sourcePurchase) {
                return_from = {
                    id: sourcePurchase.id,
                    document_type: sourcePurchase.document_type || "PUR",
                    invoice_number: sourcePurchase.invoice_number || `#${sourcePurchase.id}`
                };
            }
        }

        let linked_documents = [];
        if ((purchase.document_type || "").toUpperCase() === "PO") {
            const { data: direct } = await supabase
                .from("purchases")
                .select("id, document_type, invoice_number, status")
                .eq("converted_from_id", id)
                .eq("company_id", companyId);
            const directRows = direct || [];
            linked_documents = [...directRows];
            const grnIds = directRows
                .filter((d) => (d.document_type || "").toUpperCase() === "GRN")
                .map((d) => d.id);
            if (grnIds.length > 0) {
                const { data: fromGrn } = await supabase
                    .from("purchases")
                    .select("id, document_type, invoice_number, status")
                    .in("converted_from_id", grnIds)
                    .eq("company_id", companyId);
                linked_documents = linked_documents.concat(fromGrn || []);
            }
        }

        let source_purchase = null;
        let po_line_received_totals = null;
        if ((purchase.document_type || "").toUpperCase() === "GRN" && purchase.converted_from_id) {
            const { data: srcPo } = await supabase
                .from("purchases")
                .select(`
                    id,
                    invoice_number,
                    status,
                    document_type,
                    vendor_id,
                    purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
                `)
                .eq("id", purchase.converted_from_id)
                .eq("company_id", companyId)
                .single();
            if (srcPo) {
                source_purchase = srcPo;
                po_line_received_totals = await getReceivedTotalsByPoLine(
                    supabase,
                    companyId,
                    purchase.converted_from_id,
                    parseInt(id, 10)
                );
            }
        }

        const normalized = {
            ...purchase,
            payment_status: paymentStatus,
            payments,
            converted_to,
            return_from,
            linked_documents,
            source_purchase,
            po_line_received_totals,
            store: purchase.stores ? { id: purchase.stores.id, name: purchase.stores.name, address: purchase.stores.address } : null,
            vendor: purchase.vendors ? { id: purchase.vendors.id, name: purchase.vendors.name, phone: purchase.vendors.phone, email: purchase.vendors.email } : null,
            stores: undefined,
            vendors: undefined
        };

        return res.json({
            success: true,
            data: normalized
        });
    } catch (err) {
        console.error("GET /company/purchases/:id ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// GET /company/purchases/:id/pdf - Download purchase as PDF (PO/GRN/PUR/DBN)
router.get("/company/purchases/:id/pdf", requireAuth, requireAnyPermission(['purchases.view', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: purchase, error } = await supabase
            .from("purchases")
            .select(`
                id,
                created_at,
                store_id,
                vendor_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                invoice_number,
                invoice_date,
                document_type,
                company_id,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt),
                stores (id, name, address),
                vendors (id, name, phone, email)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (error || !purchase) {
            return res.status(404).json({
                success: false,
                message: "Η αγορά δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const statusLower = (purchase.status || "").toLowerCase();
        const docType = (purchase.document_type || "PUR").toUpperCase();
        if (statusLower === "draft") {
            return res.status(400).json({
                success: false,
                message: "Δεν υπάρχει PDF για έγγραφα σε κατάσταση Πρόχειρο",
                code: "DRAFT_NO_PDF"
            });
        }

        const { data: company } = await supabase
            .from("companies")
            .select("id, name, display_name, tax_id, tax_office, address, city, postal_code, country, phone, email")
            .eq("id", purchase.company_id)
            .single();

        const { data: pm } = await supabase
            .from("payment_methods")
            .select("name")
            .eq("id", purchase.payment_method_id)
            .maybeSingle();

        const productIds = [...new Set((purchase.purchase_items || []).map((it) => it.product_id))];
        const variantIds = [...new Set((purchase.purchase_items || []).map((it) => it.product_variant_id))];

        let productsMap = {};
        let variantsMap = {};
        if (productIds.length > 0) {
            const { data: products } = await supabase
                .from("products")
                .select("id, name")
                .in("id", productIds);
            if (products) productsMap = Object.fromEntries(products.map((p) => [p.id, p]));
        }
        if (variantIds.length > 0) {
            const { data: variants } = await supabase
                .from("product_variants")
                .select("id, name")
                .in("id", variantIds);
            if (variants) variantsMap = Object.fromEntries(variants.map((v) => [v.id, v]));
        }

        const purchaseItemsWithLabels = (purchase.purchase_items || []).map((it) => {
            const p = productsMap[it.product_id];
            const v = variantsMap[it.product_variant_id];
            const label = p && v ? `${p.name} — ${v.name}` : null;
            return { ...it, product_label: label };
        });

        const pdfData = {
            id: purchase.id,
            company: company || {},
            store: purchase.stores ? { id: purchase.stores.id, name: purchase.stores.name, address: purchase.stores.address } : {},
            vendor: purchase.vendors
                ? {
                    id: purchase.vendors.id,
                    name: purchase.vendors.name,
                    phone: purchase.vendors.phone,
                    email: purchase.vendors.email,
                }
                : null,
            purchase_items: purchaseItemsWithLabels,
            subtotal: purchase.subtotal ?? 0,
            vat_total: purchase.vat_total ?? 0,
            total_amount: purchase.total_amount,
            payment_method_name: pm?.name ?? "",
            document_type: docType,
            invoice_number: purchase.invoice_number ?? `#${purchase.id}`,
            invoice_date: purchase.invoice_date,
            created_at: purchase.created_at,
            status: purchase.status || "",
            notes: purchase.notes,
        };

        const pdfBuffer = await generatePurchasePdf(pdfData);

        const prefix = docType === "PO" ? "paraggelia" : docType === "GRN" ? "paralavi" : docType === "DBN" ? "pistotiko" : "agora";
        const filename = `${prefix}-${purchase.invoice_number || purchase.id}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error("GET /company/purchases/:id/pdf ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Σφάλμα κατά τη δημιουργία PDF",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/purchases - Create purchase with items
router.post("/company/purchases", requireAuth, requireAnyPermission(['purchases.create', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { store_id, vendor_id, payment_method_id, invoice_number, invoice_date, status, notes, items, document_type: reqDocType, converted_from_id: reqConvertedFromId, payment_terms: bodyPaymentTerms } = req.body;

    const docType = (reqDocType && typeof reqDocType === "string" && PURCHASE_DOC_TYPES.includes(reqDocType.trim().toUpperCase()))
        ? normalizePurchaseDocType(reqDocType) : normalizePurchaseDocType("PUR");
    const isDBN = docType === "DBN";

    if (isDBN && (!reqConvertedFromId || (typeof reqConvertedFromId !== "number" && typeof reqConvertedFromId !== "string"))) {
        return res.status(400).json({
            success: false,
            message: "Το χρεωστικό σημείωμα απαιτεί αναφορά στην αρχική αγορά (converted_from_id)",
            code: "VALIDATION_ERROR"
        });
    }

    if (!companyId) {
        return res.status(400).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    if (!store_id || typeof store_id !== "string" || !store_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Το κατάστημα είναι υποχρεωτικό",
            code: "VALIDATION_ERROR"
        });
    }

    if (!payment_method_id || typeof payment_method_id !== "string" || !payment_method_id.trim()) {
        return res.status(400).json({
            success: false,
            message: "Ο τρόπος πληρωμής είναι υποχρεωτικός",
            code: "VALIDATION_ERROR"
        });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Χρειάζεται τουλάχιστον μία γραμμή προϊόντος",
            code: "VALIDATION_ERROR"
        });
    }

    const validItems = items.filter(it => {
        if (!it || typeof it.product_id !== "number" || typeof it.product_variant_id !== "number" || typeof it.quantity !== "number" || it.quantity <= 0 || typeof it.cost_price !== "number" || typeof it.vat_exempt !== "boolean") return false;
        if (isDBN) return it.cost_price <= 0;
        return it.cost_price >= 0;
    });

    if (validItems.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Οι γραμμές προϊόντων δεν είναι έγκυρες",
            code: "VALIDATION_ERROR"
        });
    }

    for (const it of validItems) {
        if (it.vat_exempt === true) {
            if (it.vat_rate != null && it.vat_rate !== 0) {
                return res.status(400).json({
                    success: false,
                    message: "Γραμμή με απαλλαγή ΦΠΑ πρέπει να έχει vat_rate = 0",
                    code: "VALIDATION_ERROR"
                });
            }
        } else {
            if (it.vat_rate == null || typeof it.vat_rate !== "number" || it.vat_rate < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Γραμμή χωρίς απαλλαγή ΦΠΑ πρέπει να έχει έγκυρο vat_rate (δεν επιτρέπεται τιμή null ή προεπιλογή)",
                    code: "VALIDATION_ERROR"
                });
            }
        }
    }

    try {
        // Verify store belongs to company
        const { data: storeRow, error: storeErr } = await supabase
            .from("stores")
            .select("id")
            .eq("id", store_id.trim())
            .eq("company_id", companyId)
            .single();

        if (storeErr || !storeRow) {
            return res.status(400).json({
                success: false,
                message: "Το κατάστημα δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                code: "INVALID_STORE"
            });
        }

        // Validate payment method exists and is active
        const { data: pmRow, error: pmErr } = await supabase
            .from("payment_methods")
            .select("id")
            .eq("id", payment_method_id.trim())
            .or("company_id.is.null,company_id.eq." + companyId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

        if (pmErr || !pmRow) {
            return res.status(400).json({
                success: false,
                message: "Ο τρόπος πληρωμής δεν βρέθηκε ή δεν είναι ενεργός",
                code: "INVALID_PAYMENT_METHOD"
            });
        }

        // Validate vendor if provided
        if (vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            const { data: vendorRow, error: vendorErr } = await supabase
                .from("vendors")
                .select("id")
                .eq("id", vendor_id.trim())
                .eq("company_id", companyId)
                .single();

            if (vendorErr || !vendorRow) {
                return res.status(400).json({
                    success: false,
                    message: "Ο προμηθευτής δεν βρέθηκε ή δεν ανήκει στην εταιρεία",
                    code: "INVALID_VENDOR"
                });
            }
        }

        // Validate each product_variant_id belongs to its product_id
        for (const it of validItems) {
            const { data: variant, error: variantErr } = await supabase
                .from("product_variants")
                .select("id, product_id")
                .eq("id", it.product_variant_id)
                .eq("product_id", it.product_id)
                .single();
            if (variantErr || !variant) {
                return res.status(400).json({
                    success: false,
                    message: "Η παραλλαγή προϊόντος δεν αντιστοιχεί στο προϊόν",
                    code: "INVALID_PRODUCT_VARIANT"
                });
            }
        }

        // Compute totals (cost_price = without VAT, total_cost = qty * cost_price)
        let subtotal = 0;
        let vatTotal = 0;
        const purchaseItemsData = validItems.map(it => {
            const qty = Number(it.quantity);
            const cost = Number(it.cost_price);
            const lineTotal = Math.round(qty * cost * 100) / 100;
            const vatExempt = it.vat_exempt === true;
            const vatRate = vatExempt ? 0 : Math.min(1, Math.max(0, Number(it.vat_rate)));
            const lineVat = Math.round(lineTotal * vatRate * 100) / 100;
            subtotal += lineTotal;
            vatTotal += lineVat;
            return {
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                quantity: qty,
                cost_price: cost,
                total_cost: lineTotal,
                vat_rate: vatRate,
                vat_exempt: vatExempt
            };
        });

        subtotal = Math.round(subtotal * 100) / 100;
        vatTotal = Math.round(vatTotal * 100) / 100;
        const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

        const isGrn = docType === "GRN";
        const isPO = docType === "PO";
        // PUR invoice (and legacy non-typed rows): must not use PO-only statuses here
        const validStatusesPUR = ["draft", "ordered", "received", "completed", "cancelled"];
        // PO lifecycle: finalize (draft → sent / phase 3) and other states allowed by DB constraint
        const validStatusesPO = [
            "draft",
            "sent",
            "ordered",
            "partially_received",
            "closed",
            "cancelled",
            "received",
            "completed",
            "invoiced",
            "pending_invoice",
            "reversed",
            "credited",
            "posted",
        ];
        const validStatusesGrn = ["draft", "completed"];
        const validStatusesDBN = ["draft", "completed"];
        const validStatuses = isDBN
            ? validStatusesDBN
            : isGrn
              ? validStatusesGrn
              : isPO
                ? validStatusesPO
                : validStatusesPUR;
        const purchaseStatus = (status && typeof status === "string" && validStatuses.includes(status.trim().toLowerCase()))
            ? normalizePurchaseStatus(status)
            : "draft";

        if (purchaseStatus === "cancelled") {
            return res.status(400).json({
                success: false,
                message: "Δεν μπορείτε να δημιουργήσετε νέα αγορά με κατάσταση «Ακυρώθηκε». Η κατάσταση αυτή είναι διαθέσιμη μόνο κατά την επεξεργασία υπαρχουσών αγορών.",
                code: "VALIDATION_ERROR"
            });
        }

        const dbnConvertedFromId = isDBN && reqConvertedFromId != null
            ? (typeof reqConvertedFromId === "number" ? reqConvertedFromId : parseInt(String(reqConvertedFromId), 10))
            : null;

        const isPUR = docType === "PUR";
        const validTerms = ["immediate", "15", "30", "60", "90"];
        let purchasePaymentTerms = "immediate";
        let purchaseDueDate = null;
        let purchasePaymentStatus = null;
        let purchaseAmountDue = null;
        if (isPUR && purchaseStatus === "completed" && vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            const { data: vend } = await supabase.from("vendors").select("payment_terms").eq("id", vendor_id.trim()).eq("company_id", companyId).single();
            const vendTerms = vend?.payment_terms && validTerms.includes(String(vend.payment_terms).toLowerCase()) ? String(vend.payment_terms).toLowerCase() : "immediate";
            purchasePaymentTerms = bodyPaymentTerms && validTerms.includes(String(bodyPaymentTerms).toLowerCase()) ? String(bodyPaymentTerms).toLowerCase() : vendTerms;
            const invDateStr = invoice_date && typeof invoice_date === "string" && invoice_date.trim() ? invoice_date.trim().slice(0, 10) : new Date().toISOString().slice(0, 10);
            const daysToAdd = purchasePaymentTerms === "immediate" ? 0 : parseInt(purchasePaymentTerms, 10) || 0;
            purchaseDueDate = daysToAdd > 0 ? (() => { const d = new Date(invDateStr); d.setDate(d.getDate() + daysToAdd); return d.toISOString(); })() : null;
            if (purchasePaymentTerms === "immediate") {
                purchasePaymentStatus = "paid";
                purchaseAmountDue = 0;
            } else {
                purchasePaymentStatus = "unpaid";
                purchaseAmountDue = totalAmount;
            }
        }

        const purchaseData = {
            company_id: companyId,
            store_id: store_id.trim(),
            vendor_id: vendor_id && typeof vendor_id === "string" && vendor_id.trim() ? vendor_id.trim() : null,
            payment_method_id: payment_method_id.trim(),
            total_amount: totalAmount,
            subtotal,
            vat_total: vatTotal,
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            invoice_number: (isDBN && (!invoice_number || !String(invoice_number).trim())) ? (await getNextSequence(companyId, "DBN")) : (invoice_number && typeof invoice_number === "string" ? invoice_number.trim() || null : null),
            invoice_date: invoice_date && typeof invoice_date === "string" && invoice_date.trim() ? invoice_date.trim() : null,
            status: purchaseStatus,
            document_type: docType,
            converted_from_id: isDBN ? dbnConvertedFromId : null,
            created_by: userId || null,
            ...(isPUR && purchasePaymentTerms && { payment_terms: purchasePaymentTerms }),
            ...(purchaseDueDate != null && { due_date: purchaseDueDate }),
            ...(purchasePaymentStatus != null && { payment_status: purchasePaymentStatus }),
            ...(purchaseAmountDue != null && { amount_due: purchaseAmountDue })
        };

        const { data: purchase, error: purchaseErr } = await supabase
            .from("purchases")
            .insert(purchaseData)
            .select("id")
            .single();

        if (purchaseErr || !purchase) {
            console.error("POST /company/purchases:", purchaseErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία αγοράς",
                code: "DB_ERROR"
            });
        }

        const itemsToInsert = purchaseItemsData.map(it => ({
            purchase_id: purchase.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: it.cost_price,
            total_cost: it.total_cost,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));

        const { error: itemsErr } = await supabase
            .from("purchase_items")
            .insert(itemsToInsert);

        if (itemsErr) {
            console.error("POST /company/purchases purchase_items:", itemsErr);
            await supabase.from("purchases").delete().eq("id", purchase.id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την αποθήκευση των γραμμών αγοράς",
                code: "DB_ERROR"
            });
        }

        const shouldApplyStock = !isDBN && (isGrn
            ? purchaseStatus === "completed"
            : (purchaseStatus === "received" || purchaseStatus === "completed"));
        if (shouldApplyStock) {
        for (let i = 0; i < purchaseItemsData.length; i++) {
            const it = purchaseItemsData[i];
            const { data: sp } = await supabase
                .from("store_products")
                .select("id, stock_quantity")
                .eq("store_id", store_id.trim())
                .eq("product_variant_id", it.product_variant_id)
                .maybeSingle();

            const currentQty = sp ? Number(sp.stock_quantity) : 0;
            const newQty = currentQty + it.quantity;

            if (sp) {
                const { error: updErr } = await supabase
                    .from("store_products")
                    .update({ stock_quantity: newQty })
                    .eq("id", sp.id);
                if (updErr) {
                    console.error("POST /company/purchases stock increase:", updErr);
                    await supabase.from("purchase_items").delete().eq("purchase_id", purchase.id);
                    await supabase.from("purchases").delete().eq("id", purchase.id);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ενημέρωση αποθέματος",
                        code: "DB_ERROR"
                    });
                }
            } else {
                const { error: insErr } = await supabase
                    .from("store_products")
                    .insert({
                        store_id: store_id.trim(),
                        product_id: it.product_id,
                        product_variant_id: it.product_variant_id,
                        stock_quantity: newQty
                    });
                if (insErr) {
                    console.error("POST /company/purchases store_products insert:", insErr);
                    await supabase.from("purchase_items").delete().eq("purchase_id", purchase.id);
                    await supabase.from("purchases").delete().eq("id", purchase.id);
                    return res.status(500).json({
                        success: false,
                        message: "Σφάλμα κατά την ενημέρωση αποθέματος",
                        code: "DB_ERROR"
                    });
                }
            }

            const { error: moveErr } = await supabase
                .from("stock_movements")
                .insert({
                    company_id: companyId,
                    store_id: store_id.trim(),
                    product_id: it.product_id,
                    product_variant_id: it.product_variant_id,
                    quantity: it.quantity,
                    movement_type: "in",
                    source: "purchase",
                    related_document_type: "purchase",
                    related_document_id: purchase.id,
                    created_by: userId || null
                });
            if (moveErr) {
                console.error("POST /company/purchases stock_movement:", moveErr);
                if (sp) {
                    await supabase.from("store_products").update({ stock_quantity: currentQty }).eq("id", sp.id);
                } else {
                    await supabase
                        .from("store_products")
                        .delete()
                        .eq("store_id", store_id.trim())
                        .eq("product_variant_id", it.product_variant_id);
                }
                for (let j = i - 1; j >= 0; j--) {
                    const prev = purchaseItemsData[j];
                    const { data: prevSp } = await supabase
                        .from("store_products")
                        .select("id, stock_quantity")
                        .eq("store_id", store_id.trim())
                        .eq("product_variant_id", prev.product_variant_id)
                        .maybeSingle();
                    if (prevSp) {
                        const prevRestore = Number(prevSp.stock_quantity) - prev.quantity;
                        await supabase.from("store_products").update({ stock_quantity: prevRestore }).eq("id", prevSp.id);
                    } else {
                        await supabase
                            .from("store_products")
                            .delete()
                            .eq("store_id", store_id.trim())
                            .eq("product_variant_id", prev.product_variant_id);
                    }
                }
                await supabase.from("purchase_items").delete().eq("purchase_id", purchase.id);
                await supabase.from("purchases").delete().eq("id", purchase.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση κίνησης αποθέματος",
                    code: "DB_ERROR"
                });
            }
        }
        }

        // Auto-payment for completed PUR with immediate payment terms
        if (isPUR && purchaseStatus === "completed" && purchasePaymentTerms === "immediate" && vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            const { error: payErr } = await supabase.from("payments").insert({
                company_id: companyId,
                store_id: store_id.trim(),
                purchase_id: purchase.id,
                vendor_id: vendor_id.trim(),
                amount: totalAmount,
                payment_method_id: payment_method_id.trim(),
                is_auto: true,
                created_by: userId || null
            });
            if (payErr) {
                console.error("POST /company/purchases auto-payment:", payErr);
                if (shouldApplyStock) {
                    await reversePurchaseStock(companyId, store_id.trim(), purchase.id, userId);
                }
                await supabase.from("purchase_items").delete().eq("purchase_id", purchase.id);
                await supabase.from("purchases").delete().eq("id", purchase.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση αυτόματης πληρωμής",
                    code: "DB_ERROR"
                });
            }
        }

        const { data: fullPurchase } = await supabase
            .from("purchases")
            .select(`
                id,
                created_at,
                store_id,
                vendor_id,
                payment_method_id,
                total_amount,
                status,
                notes,
                subtotal,
                vat_total,
                invoice_number,
                invoice_date,
                document_type,
                converted_from_id,
                payment_terms,
                due_date,
                payment_status,
                amount_due,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
            `)
            .eq("id", purchase.id)
            .single();

        return res.json({
            success: true,
            data: fullPurchase || purchase
        });
    } catch (err) {
        console.error("POST /company/purchases ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

async function reversePurchaseStock(companyId, storeId, purchaseId) {
    const { data: movements } = await supabase
        .from("stock_movements")
        .select("id, product_id, product_variant_id, quantity")
        .eq("company_id", companyId)
        .eq("store_id", storeId)
        .eq("related_document_type", "purchase")
        .eq("related_document_id", purchaseId);

    if (!movements || movements.length === 0) return;

    for (const m of movements) {
        const qty = Number(m.quantity);
        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", m.product_variant_id)
            .maybeSingle();

        if (sp) {
            const currentQty = Number(sp.stock_quantity);
            const newQty = currentQty - qty;
            if (newQty < 0) throw new Error("Ανεπαρκές απόθεμα για αναστροφή αγοράς");
            await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
        }
        await supabase.from("stock_movements").delete().eq("id", m.id);
    }
}

async function applyPurchaseStock(companyId, storeId, purchaseId, userId, items) {
    for (const it of items) {
        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", it.product_variant_id)
            .maybeSingle();

        const currentQty = sp ? Number(sp.stock_quantity) : 0;
        const newQty = currentQty + it.quantity;

        if (sp) {
            await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
        } else {
            await supabase.from("store_products").insert({
                store_id: storeId,
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                stock_quantity: newQty
            });
        }

        await supabase.from("stock_movements").insert({
            company_id: companyId,
            store_id: storeId,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            movement_type: "in",
            source: "purchase",
            related_document_type: "purchase",
            related_document_id: purchaseId,
            created_by: userId || null
        });
    }
}

/**
 * Apply stock OUT (decrease) for DBN when completed.
 * Used for manual DBN completion and partial returns.
 */
async function applyDbnStock(companyId, storeId, purchaseId, userId, items) {
    for (const it of items) {
        const qty = Math.abs(Number(it.quantity));
        if (qty <= 0) continue;
        const { data: sp } = await supabase
            .from("store_products")
            .select("id, stock_quantity")
            .eq("store_id", storeId)
            .eq("product_variant_id", it.product_variant_id)
            .maybeSingle();

        if (sp) {
            const currentQty = Number(sp.stock_quantity);
            const newQty = currentQty - qty;
            await supabase.from("store_products").update({ stock_quantity: newQty }).eq("id", sp.id);
        }

        await supabase.from("stock_movements").insert({
            company_id: companyId,
            store_id: storeId,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: -qty,
            movement_type: "out",
            source: "debit_note",
            related_document_type: "debit_note",
            related_document_id: purchaseId,
            created_by: userId || null
        });
    }
}

/**
 * Create an accounting-only DBN when a PUR or GRN is fully cancelled.
 * Stock is already reversed by reversePurchaseStock - do NOT call applyDbnStock.
 */
async function createAutoDbnOnCancellation(companyId, originalPurchase, userId) {
    const docType = String(originalPurchase.document_type || "").toUpperCase();
    if (docType !== "PUR" && docType !== "GRN") return;

    const items = originalPurchase.purchase_items || [];
    if (items.length === 0) return;

    const dbnItems = items.map(it => ({
        product_id: it.product_id,
        product_variant_id: it.product_variant_id,
        quantity: Number(it.quantity),
        cost_price: -Number(it.cost_price),
        total_cost: -Number(it.total_cost),
        vat_rate: Number(it.vat_rate) || 0,
        vat_exempt: it.vat_exempt === true
    }));

    const subtotal = dbnItems.reduce((s, it) => s + it.total_cost, 0);
    const vatTotal = Math.round(subtotal * 0.2 * 100) / 100;
    const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

    const dbnNumber = await getNextSequence(companyId, "DBN");

    const { data: dbnPurchase, error: dbnErr } = await supabase
        .from("purchases")
        .insert({
            company_id: companyId,
            store_id: originalPurchase.store_id,
            vendor_id: originalPurchase.vendor_id,
            payment_method_id: originalPurchase.payment_method_id || null,
            total_amount: totalAmount,
            subtotal,
            vat_total: vatTotal,
            notes: originalPurchase.notes ? `Ακύρωση: ${originalPurchase.invoice_number || originalPurchase.id}` : null,
            status: "completed",
            document_type: "DBN",
            invoice_number: dbnNumber,
            converted_from_id: originalPurchase.id,
            created_by: userId || null
        })
        .select("id")
        .single();

    if (dbnErr || !dbnPurchase) {
        console.error("createAutoDbnOnCancellation:", dbnErr);
        return;
    }

    const recalcDbnItems = dbnItems.map(it => {
        const total = it.quantity * it.cost_price;
        const vatRate = it.vat_exempt ? 0 : (it.vat_rate || 0);
        const lineVat = Math.round(total * vatRate * 100) / 100;
        return {
            purchase_id: dbnPurchase.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: it.cost_price,
            total_cost: total,
            vat_rate: vatRate,
            vat_exempt: it.vat_exempt
        };
    });

    await supabase.from("purchase_items").insert(recalcDbnItems);
    let dbnSubtotal = 0;
    let dbnVatTotal = 0;
    for (const it of recalcDbnItems) {
        dbnSubtotal += it.total_cost;
        dbnVatTotal += Math.round(it.total_cost * it.vat_rate * 100) / 100;
    }
    dbnSubtotal = Math.round(dbnSubtotal * 100) / 100;
    dbnVatTotal = Math.round(dbnVatTotal * 100) / 100;
    const dbnTotal = Math.round((dbnSubtotal + dbnVatTotal) * 100) / 100;
    await supabase.from("purchases").update({ subtotal: dbnSubtotal, vat_total: dbnVatTotal, total_amount: dbnTotal }).eq("id", dbnPurchase.id).eq("company_id", companyId);
}

// PATCH /company/purchases/:id - Update purchase
router.patch("/company/purchases/:id", requireAuth, requireAnyPermission(['purchases.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const { id } = req.params;
    const { vendor_id, payment_method_id, invoice_number, invoice_date, status, notes, items, confirm_negative_stock, document_type: reqDocType, payment_terms: bodyPaymentTerms } = req.body;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: existing, error: fetchErr } = await supabase
            .from("purchases")
            .select("id, store_id, status, invoice_number, invoice_date, document_type, payment_terms, converted_from_id")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !existing) {
            return res.status(404).json({
                success: false,
                message: "Η αγορά δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        const existingDt = String(existing.document_type || "").trim().toUpperCase();
        const docType = PURCHASE_DOC_TYPES.includes(existingDt) ? existingDt : "PUR";
        const isGrn = docType === "GRN";

        const oldStatus = (existing.status || "draft").toLowerCase();

        // invoice_number and invoice_date are immutable once purchase moves past draft
        if (oldStatus !== "draft") {
            const existingNum = existing.invoice_number ?? "";
            const existingDate = (existing.invoice_date && String(existing.invoice_date).slice(0, 10)) || "";
            const reqNum = (invoice_number != null && typeof invoice_number === "string" ? invoice_number.trim() : null) ?? existingNum;
            const reqDate = (invoice_date != null && typeof invoice_date === "string" && invoice_date.trim()
                ? invoice_date.trim().slice(0, 10)
                : null) ?? existingDate;
            if (reqNum !== existingNum || reqDate !== existingDate) {
                return res.status(400).json({
                    success: false,
                    message: "Ο αριθμός και η ημερομηνία τιμολογίου δεν μπορούν να αλλάξουν μετά την έξοδο από πρόχειρο",
                    code: "INVOICE_FIELDS_IMMUTABLE"
                });
            }
        }

        const storeId = existing.store_id;
        const isDBN = docType === "DBN";
        const isPO = docType === "PO";
        const isPUR = docType === "PUR";
        const validPurchaseTerms = ["immediate", "15", "30", "60", "90"];
        let effectivePaymentTerms = "immediate";
        if (isPUR) {
            if (bodyPaymentTerms != null && validPurchaseTerms.includes(String(bodyPaymentTerms).toLowerCase())) {
                effectivePaymentTerms = String(bodyPaymentTerms).toLowerCase();
            } else if (existing.payment_terms && validPurchaseTerms.includes(String(existing.payment_terms).toLowerCase())) {
                effectivePaymentTerms = String(existing.payment_terms).toLowerCase();
            }
        }
        // Stock applied: GRN when pending_invoice/completed/received; PUR when received/completed/ordered (legacy); PO never
        const wasStockApplied = isPO ? false : (isGrn ? ["pending_invoice", "completed", "invoiced", "reversed"].includes(oldStatus) : ["ordered", "received", "completed"].includes(oldStatus));

        // Fetch context for documentTransitions validation
        let purchasePaymentStatus = null;
        let hasPayments = false;
        let hasLinkedInvoice = false;
        if (docType === "PUR" || docType === "DBN") {
            const { data: purRow } = await supabase.from("purchases").select("payment_status").eq("id", id).eq("company_id", companyId).single();
            purchasePaymentStatus = purRow?.payment_status;
            const { count: payCount } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("purchase_id", id).eq("company_id", companyId);
            hasPayments = (payCount || 0) > 0;
        }
        if (docType === "GRN") {
            const { data: purFromGrn } = await supabase.from("purchases").select("id").eq("converted_from_id", id).eq("company_id", companyId).maybeSingle();
            hasLinkedInvoice = !!purFromGrn;
        }

        const { data: oldItems } = await supabase
            .from("purchase_items")
            .select("product_id, product_variant_id, quantity")
            .eq("purchase_id", id);
        const oldItemsList = oldItems || [];

        const purchaseContext = { paymentStatus: purchasePaymentStatus, hasPayments, hasLinkedInvoice };
        const allowedStatuses = getAllowedPurchaseStatuses(docType, oldStatus, purchaseContext);

        const requestedStatus = status && typeof status === "string" ? status.trim().toLowerCase() : null;
        let newStatus = oldStatus;
        if (requestedStatus && requestedStatus !== oldStatus) {
            if (!allowedStatuses.includes(requestedStatus)) {
                return res.status(400).json({
                    success: false,
                    message: `Μη επιτρεπόμενη μετάβαση κατάστασης: από «${oldStatus}» σε «${requestedStatus}». Οι επιτρεπόμενες: ${allowedStatuses.join(", ")}.`,
                    code: "INVALID_STATUS_TRANSITION"
                });
            }
            newStatus = requestedStatus;
        }
        const willApplyStock = isPO ? false : (isGrn ? ["pending_invoice", "completed"].includes(newStatus) : ["ordered", "received", "completed"].includes(newStatus));

        if (isPO && newStatus === "cancelled") {
            const blockPo = await getPoCancelBlockReason(supabase, companyId, parseInt(id, 10));
            if (blockPo) {
                return res.status(400).json({
                    success: false,
                    message: blockPo.message,
                    code: blockPo.code,
                    blocking_children: blockPo.blockingChildren,
                });
            }
        }

        // PUR/GRN with stock applied: only allow status change to cancelled (PUR) or reversed (GRN)
        if (wasStockApplied && newStatus !== "cancelled" && newStatus !== "reversed") {
            return res.status(403).json({
                success: false,
                message: "Ολοκληρωμένη/παραληφθείσα αγορά δεν μπορεί να επεξεργαστεί. Μόνο ακύρωση ή αντιλογισμός επιτρέπεται.",
                code: "CANNOT_EDIT_COMPLETED_PURCHASE"
            });
        }

        // Cancel short-circuit (PUR/GRN): reverse stock, create DBN for PUR, update status, return
        if (wasStockApplied && newStatus === "cancelled") {
            await reversePurchaseStock(companyId, storeId, parseInt(id, 10));

            // Delete non-auto payments and clear payment fields for PUR
            if (docType === "PUR") {
                await supabase
                    .from("payments")
                    .delete()
                    .eq("purchase_id", id)
                    .eq("company_id", companyId)
                    .eq("is_auto", false);
            }
            const cancelPayload = { status: "cancelled" };
            if (docType === "PUR") {
                cancelPayload.payment_terms = null;
                cancelPayload.due_date = null;
                cancelPayload.payment_status = null;
                cancelPayload.amount_due = null;
            }
            const { error: updErr } = await supabase
                .from("purchases")
                .update(cancelPayload)
                .eq("id", id)
                .eq("company_id", companyId);
            if (updErr) {
                console.error("PATCH purchases cancel:", updErr);
                return res.status(500).json({ success: false, message: "Σφάλμα ακύρωσης", code: "DB_ERROR" });
            }

            const { data: fullPurchaseForDbn } = await supabase.from("purchases")
                .select("id, store_id, vendor_id, payment_method_id, subtotal, vat_total, total_amount, notes, document_type, invoice_number")
                .eq("id", id)
                .eq("company_id", companyId)
                .single();
            const { data: purchaseItemsForDbn } = await supabase.from("purchase_items")
                .select("product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt")
                .eq("purchase_id", id);
            if (fullPurchaseForDbn && purchaseItemsForDbn && purchaseItemsForDbn.length > 0) {
                await createAutoDbnOnCancellation(companyId, { ...fullPurchaseForDbn, purchase_items: purchaseItemsForDbn }, userId);
            }

            const { data: fullPurchase } = await supabase.from("purchases").select(`
                id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
            `).eq("id", id).eq("company_id", companyId).single();
            return res.json({ success: true, data: fullPurchase });
        }

        // GRN reversal (Αντιλογισμός): reverse stock, update status, no DBN
        if (wasStockApplied && newStatus === "reversed" && docType === "GRN") {
            try {
                await reversePurchaseStock(companyId, storeId, parseInt(id, 10));
            } catch (revErr) {
                const msg = revErr && typeof revErr.message === "string" && revErr.message.trim()
                    ? revErr.message
                    : "Σφάλμα αντιλογισμού δελτίου";
                return res.status(400).json({
                    success: false,
                    message: msg,
                    code: "STOCK_REVERSAL_FAILED",
                });
            }
            const { error: updErr } = await supabase
                .from("purchases")
                .update({ status: "reversed" })
                .eq("id", id)
                .eq("company_id", companyId);
            if (updErr) {
                console.error("PATCH purchases GRN reverse:", updErr);
                return res.status(500).json({ success: false, message: "Σφάλμα αντιλογισμού", code: "DB_ERROR" });
            }
            if (existing.converted_from_id) {
                await syncPurchaseOrderStatusAfterGrnRemoved(supabase, companyId, existing.converted_from_id);
            }
            const { data: fullPurchase } = await supabase.from("purchases").select(`
                id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra)
            `).eq("id", id).eq("company_id", companyId).single();
            return res.json({ success: true, data: fullPurchase });
        }

        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                message: "Λείπουν γραμμές προϊόντος",
                code: "VALIDATION_ERROR"
            });
        }

        const allowEmptyDraftGrn = isGrn && oldStatus === "draft";
        if (items.length === 0 && !allowEmptyDraftGrn) {
            return res.status(400).json({
                success: false,
                message: "Χρειάζεται τουλάχιστον μία γραμμή προϊόντος",
                code: "VALIDATION_ERROR"
            });
        }

    const validItems = items.filter(it => {
        if (!it || typeof it.product_id !== "number" || typeof it.product_variant_id !== "number" ||
            typeof it.quantity !== "number" || it.quantity <= 0 || typeof it.cost_price !== "number" ||
            typeof it.vat_exempt !== "boolean") return false;
        if (isDBN) return it.cost_price <= 0;
        return it.cost_price >= 0;
    });

    if (validItems.length === 0) {
            if (!allowEmptyDraftGrn || newStatus !== "draft") {
                return res.status(400).json({
                    success: false,
                    message: newStatus === "pending_invoice" && isGrn
                        ? "Προσθέστε τουλάχιστον μία γραμμή με ποσότητα πριν την οριστικοποίηση παραλαβής"
                        : "Οι γραμμές προϊόντων δεν είναι έγκυρες",
                    code: "VALIDATION_ERROR"
                });
            }
        }

    let totalAmount = 0;

    if (validItems.length > 0) {

        for (const it of validItems) {
            if (it.vat_exempt === true) {
                if (it.vat_rate != null && it.vat_rate !== 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Γραμμή με απαλλαγή ΦΠΑ πρέπει να έχει vat_rate = 0",
                        code: "VALIDATION_ERROR"
                    });
                }
            } else {
                if (it.vat_rate == null || typeof it.vat_rate !== "number" || it.vat_rate < 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Γραμμή χωρίς απαλλαγή ΦΠΑ πρέπει να έχει έγκυρο vat_rate (δεν επιτρέπεται τιμή null ή προεπιλογή)",
                        code: "VALIDATION_ERROR"
                    });
                }
            }
        }

        if (!payment_method_id || typeof payment_method_id !== "string" || !payment_method_id.trim()) {
            return res.status(400).json({
                success: false,
                message: "Ο τρόπος πληρωμής είναι υποχρεωτικός",
                code: "VALIDATION_ERROR"
            });
        }

        const { data: pmRow, error: pmErr } = await supabase
            .from("payment_methods")
            .select("id")
            .eq("id", payment_method_id.trim())
            .or("company_id.is.null,company_id.eq." + companyId)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

        if (pmErr || !pmRow) {
            return res.status(400).json({
                success: false,
                message: "Ο τρόπος πληρωμής δεν βρέθηκε ή δεν είναι ενεργός",
                code: "INVALID_PAYMENT_METHOD"
            });
        }

        if (vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            const { data: vendorRow, error: vendorErr } = await supabase
                .from("vendors")
                .select("id")
                .eq("id", vendor_id.trim())
                .eq("company_id", companyId)
                .single();
            if (vendorErr || !vendorRow) {
                return res.status(400).json({
                    success: false,
                    message: "Ο προμηθευτής δεν βρέθηκε",
                    code: "INVALID_VENDOR"
                });
            }
        }

        for (const it of validItems) {
            const { data: variant, error: variantErr } = await supabase
                .from("product_variants")
                .select("id, product_id")
                .eq("id", it.product_variant_id)
                .eq("product_id", it.product_id)
                .single();
            if (variantErr || !variant) {
                return res.status(400).json({
                    success: false,
                    message: "Η παραλλαγή προϊόντος δεν αντιστοιχεί στο προϊόν",
                    code: "INVALID_PRODUCT_VARIANT"
                });
            }
        }

        if (isGrn && existing.converted_from_id) {
            const { data: poLinesForVal } = await supabase
                .from("purchase_items")
                .select("id, product_id, product_variant_id")
                .eq("purchase_id", existing.converted_from_id);
            const poLineById = {};
            for (const pl of poLinesForVal || []) {
                poLineById[pl.id] = pl;
            }
            for (const it of validItems) {
                if (it.is_extra === true || it.po_line_id == null) continue;
                const pol = poLineById[it.po_line_id];
                if (!pol || pol.product_id !== it.product_id || pol.product_variant_id !== it.product_variant_id) {
                    return res.status(400).json({
                        success: false,
                        message: "Η γραμμή παραλαβής δεν αντιστοιχεί στη γραμμή της παραγγελίας",
                        code: "INVALID_PO_LINE_LINK"
                    });
                }
            }
        }

        let subtotal = 0;
        let vatTotal = 0;
        const purchaseItemsData = validItems.map(it => {
            const qty = Number(it.quantity);
            const cost = Number(it.cost_price);
            const lineTotal = Math.round(qty * cost * 100) / 100;
            const vatExempt = it.vat_exempt === true;
            const vatRate = vatExempt ? 0 : Math.min(1, Math.max(0, Number(it.vat_rate)));
            const lineVat = Math.round(lineTotal * vatRate * 100) / 100;
            subtotal += lineTotal;
            vatTotal += lineVat;
            return {
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                quantity: qty,
                cost_price: cost,
                total_cost: lineTotal,
                vat_rate: vatRate,
                vat_exempt: vatExempt,
                po_line_id: typeof it.po_line_id === "number" ? it.po_line_id : null,
                is_extra: it.is_extra === true,
            };
        });
        subtotal = Math.round(subtotal * 100) / 100;
        vatTotal = Math.round(vatTotal * 100) / 100;
        totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

        const { error: delItemsErr } = await supabase
            .from("purchase_items")
            .delete()
            .eq("purchase_id", id);

        if (delItemsErr) {
            console.error("PATCH purchases delete items:", delItemsErr);
            if (wasStockApplied && !willApplyStock) {
                try {
                    await applyPurchaseStock(companyId, storeId, id, userId, oldItemsList);
                } catch (_) {}
            }
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης αγοράς",
                code: "DB_ERROR"
            });
        }

        const itemsToInsert = purchaseItemsData.map(it => ({
            purchase_id: parseInt(id, 10),
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: it.cost_price,
            total_cost: it.total_cost,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt,
            po_line_id: it.po_line_id,
            is_extra: it.is_extra,
        }));

        const { error: itemsErr } = await supabase.from("purchase_items").insert(itemsToInsert);
        if (itemsErr) {
            console.error("PATCH purchases insert items:", itemsErr);
            if (wasStockApplied && !willApplyStock && oldItemsList.length) {
                try {
                    await applyPurchaseStock(companyId, storeId, id, userId, oldItemsList);
                } catch (_) {}
            }
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης γραμμών αγοράς",
                code: "DB_ERROR"
            });
        }

        let resolvedVendorId = vendor_id && typeof vendor_id === "string" && vendor_id.trim() ? vendor_id.trim() : null;
        if (isGrn && existing.converted_from_id) {
            const { data: srcPoV } = await supabase
                .from("purchases")
                .select("vendor_id")
                .eq("id", existing.converted_from_id)
                .eq("company_id", companyId)
                .single();
            if (srcPoV) resolvedVendorId = srcPoV.vendor_id;
        }

        const updateData = {
            vendor_id: resolvedVendorId,
            payment_method_id: payment_method_id.trim(),
            invoice_number: invoice_number && typeof invoice_number === "string" ? invoice_number.trim() || null : null,
            invoice_date: invoice_date && typeof invoice_date === "string" && invoice_date.trim() ? invoice_date.trim() : null,
            document_type: docType,
            status: newStatus,
            notes: notes && typeof notes === "string" ? notes.trim() || null : null,
            subtotal,
            vat_total: vatTotal,
            total_amount: totalAmount,
            ...(isPUR && { payment_terms: effectivePaymentTerms })
        };

        const { error: updErr } = await supabase
            .from("purchases")
            .update(updateData)
            .eq("id", id)
            .eq("company_id", companyId);

        if (updErr) {
            console.error("PATCH purchases update:", updErr);
            await supabase.from("purchase_items").delete().eq("purchase_id", id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης αγοράς",
                code: "DB_ERROR"
            });
        }

        if (willApplyStock && !wasStockApplied) {
            try {
                await applyPurchaseStock(companyId, storeId, parseInt(id, 10), userId, purchaseItemsData);
                if (isGrn && existing.converted_from_id) {
                    await syncPurchaseOrderStatusFromGrns(supabase, companyId, existing.converted_from_id);
                }
            } catch (stockErr) {
                console.error("PATCH purchases apply stock:", stockErr);
                await supabase.from("purchase_items").delete().eq("purchase_id", id);
                return res.status(400).json({
                    success: false,
                    message: stockErr.message || "Σφάλμα εφαρμογής αποθέματος",
                    code: "STOCK_ERROR"
                });
            }
        } else if (willApplyStock && wasStockApplied) {
            const oldByVariant = {};
            for (const it of oldItemsList) {
                const vid = it.product_variant_id;
                if (!oldByVariant[vid]) oldByVariant[vid] = { product_id: it.product_id, quantity: 0 };
                oldByVariant[vid].quantity += Number(it.quantity);
            }
            const newByVariant = {};
            for (const it of purchaseItemsData) {
                const vid = it.product_variant_id;
                if (!newByVariant[vid]) newByVariant[vid] = { product_id: it.product_id, quantity: 0 };
                newByVariant[vid].quantity += it.quantity;
            }
            const allVariants = new Set([...Object.keys(oldByVariant), ...Object.keys(newByVariant)]);
            const purchaseIdInt = parseInt(id, 10);
            for (const vid of allVariants) {
                const oldQty = oldByVariant[vid] ? oldByVariant[vid].quantity : 0;
                const newQty = newByVariant[vid] ? newByVariant[vid].quantity : 0;
                const delta = newQty - oldQty;
                if (delta === 0) continue;
                const info = newByVariant[vid] || oldByVariant[vid];
                const productId = info.product_id;
                const variantIdInt = parseInt(vid, 10);
                const { data: sp } = await supabase
                    .from("store_products")
                    .select("id, stock_quantity")
                    .eq("store_id", storeId)
                    .eq("product_variant_id", variantIdInt)
                    .maybeSingle();
                if (delta > 0) {
                    const currentQty = sp ? Number(sp.stock_quantity) : 0;
                    const newStock = currentQty + delta;
                    if (sp) {
                        await supabase.from("store_products").update({ stock_quantity: newStock }).eq("id", sp.id);
                    } else {
                        await supabase.from("store_products").insert({
                            store_id: storeId,
                            product_id: productId,
                            product_variant_id: variantIdInt,
                            stock_quantity: newStock
                        });
                    }
                    await supabase.from("stock_movements").insert({
                        company_id: companyId,
                        store_id: storeId,
                        product_id: productId,
                        product_variant_id: variantIdInt,
                        quantity: delta,
                        movement_type: "in",
                        source: "purchase",
                        related_document_type: "purchase",
                        related_document_id: purchaseIdInt,
                        created_by: userId || null
                    });
                } else {
                    const absDelta = Math.abs(delta);
                    const currentQty = sp ? Number(sp.stock_quantity) : 0;
                    const newStock = currentQty - absDelta;
                    if (sp) {
                        await supabase.from("store_products").update({ stock_quantity: newStock }).eq("id", sp.id);
                    }
                    await supabase.from("stock_movements").insert({
                        company_id: companyId,
                        store_id: storeId,
                        product_id: productId,
                        product_variant_id: variantIdInt,
                        quantity: -absDelta,
                        movement_type: "purchase",
                        source: "purchase",
                        related_document_type: "purchase",
                        related_document_id: purchaseIdInt,
                        created_by: userId || null
                    });
                }
            }
        }
        } else {
            if (!payment_method_id || typeof payment_method_id !== "string" || !payment_method_id.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Ο τρόπος πληρωμής είναι υποχρεωτικός",
                    code: "VALIDATION_ERROR"
                });
            }
            const { data: pmRowEmpty, error: pmErrEmpty } = await supabase
                .from("payment_methods")
                .select("id")
                .eq("id", payment_method_id.trim())
                .or("company_id.is.null,company_id.eq." + companyId)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle();
            if (pmErrEmpty || !pmRowEmpty) {
                return res.status(400).json({
                    success: false,
                    message: "Ο τρόπος πληρωμής δεν βρέθηκε ή δεν είναι ενεργός",
                    code: "INVALID_PAYMENT_METHOD"
                });
            }
            let resolvedVendorIdEmpty = vendor_id && typeof vendor_id === "string" && vendor_id.trim() ? vendor_id.trim() : null;
            if (isGrn && existing.converted_from_id) {
                const { data: srcPoVE } = await supabase
                    .from("purchases")
                    .select("vendor_id")
                    .eq("id", existing.converted_from_id)
                    .eq("company_id", companyId)
                    .single();
                if (srcPoVE) resolvedVendorIdEmpty = srcPoVE.vendor_id;
            }
            await supabase.from("purchase_items").delete().eq("purchase_id", id);
            const { error: updEmptyErr } = await supabase
                .from("purchases")
                .update({
                    vendor_id: resolvedVendorIdEmpty,
                    payment_method_id: payment_method_id.trim(),
                    invoice_number: invoice_number && typeof invoice_number === "string" ? invoice_number.trim() || null : null,
                    invoice_date: invoice_date && typeof invoice_date === "string" && invoice_date.trim() ? invoice_date.trim() : null,
                    document_type: docType,
                    status: newStatus,
                    notes: notes && typeof notes === "string" ? notes.trim() || null : null,
                    subtotal: 0,
                    vat_total: 0,
                    total_amount: 0,
                    ...(isPUR && { payment_terms: effectivePaymentTerms })
                })
                .eq("id", id)
                .eq("company_id", companyId);
            if (updEmptyErr) {
                console.error("PATCH purchases empty draft update:", updEmptyErr);
                return res.status(500).json({ success: false, message: "Σφάλμα ενημέρωσης αγοράς", code: "DB_ERROR" });
            }
        }

        // Auto-payment for completed PUR with immediate payment terms
        if (isPUR && newStatus === "completed" && effectivePaymentTerms === "immediate" && vendor_id && typeof vendor_id === "string" && vendor_id.trim()) {
            const { error: payErr } = await supabase.from("payments").insert({
                company_id: companyId,
                store_id: storeId,
                purchase_id: parseInt(id, 10),
                vendor_id: vendor_id.trim(),
                amount: totalAmount,
                payment_method_id: payment_method_id.trim(),
                is_auto: true,
                created_by: userId || null
            });
            if (payErr) {
                console.error("PATCH /company/purchases auto-payment:", payErr);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την καταχώρηση αυτόματης πληρωμής",
                    code: "DB_ERROR"
                });
            }
        }

        const { data: fullPurchase } = await supabase
            .from("purchases")
            .select(`
                id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        return res.json({ success: true, data: fullPurchase });
    } catch (err) {
        console.error("PATCH /company/purchases ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

// POST /company/purchases/:id/partial-return - PUR/GRN (received/completed) → create DBN with selected items, apply stock OUT
router.post("/company/purchases/:id/partial-return", requireAuth, requireAnyPermission(['purchases.create', 'purchases.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;
    const { items } = req.body || {};
    if (!companyId || !id) return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: "Χρειάζονται γραμμές επιστροφής (items: [{purchase_item_id, quantity}])", code: "VALIDATION_ERROR" });
    try {
        const { data: orig, error: e } = await supabase.from("purchases").select("id, store_id, vendor_id, payment_method_id, subtotal, vat_total, total_amount, notes, document_type, status").eq("id", id).eq("company_id", companyId).single();
        if (e || !orig) return res.status(404).json({ success: false, message: "Η αγορά δεν βρέθηκε", code: "NOT_FOUND" });
        const dt = (orig.document_type || "").toUpperCase();
        if (dt !== "PUR" && dt !== "GRN") return res.status(400).json({ success: false, message: "Μόνο τιμολόγιο αγοράς ή δελτίο αποστολής προμηθευτή μπορεί να έχει μερική επιστροφή", code: "INVALID_STATE" });
        const statusLower = (orig.status || "").toLowerCase();
        if (statusLower !== "received" && statusLower !== "completed") return res.status(400).json({ success: false, message: "Η αγορά πρέπει να είναι παραληφθείσα ή ολοκληρωμένη", code: "INVALID_STATE" });
        const { data: allItems } = await supabase.from("purchase_items").select("id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt").eq("purchase_id", id);
        const byId = (allItems || []).reduce((acc, it) => { acc[it.id] = it; return acc; }, {});
        const returnLines = [];
        let dbnSubtotal = 0, dbnVat = 0;
        for (const r of items) {
            const pid = r.purchase_item_id != null ? Number(r.purchase_item_id) : null;
            const qty = r.quantity != null ? Number(r.quantity) : 0;
            if (!pid || qty <= 0 || !byId[pid]) continue;
            const origItem = byId[pid];
            const maxQty = origItem.quantity;
            const returnQty = Math.min(qty, maxQty);
            if (returnQty <= 0) continue;
            const total = -returnQty * Number(origItem.cost_price);
            const vatRate = Number(origItem.vat_rate) || 0;
            const lineVat = origItem.vat_exempt ? 0 : Math.round(total * vatRate * 100) / 100;
            returnLines.push({
                product_id: origItem.product_id,
                product_variant_id: origItem.product_variant_id,
                quantity: returnQty,
                cost_price: -Number(origItem.cost_price),
                total_cost: total,
                vat_rate: origItem.vat_rate,
                vat_exempt: origItem.vat_exempt,
                lineVat
            });
            dbnSubtotal += total;
            dbnVat += lineVat;
        }
        if (returnLines.length === 0) return res.status(400).json({ success: false, message: "Δεν υπάρχουν έγκυρες γραμμές επιστροφής", code: "VALIDATION_ERROR" });
        const dbnTotal = Math.round((dbnSubtotal + dbnVat) * 100) / 100;
        const dbnNum = await getNextSequence(companyId, "DBN");
        const { data: dbn, error: insErr } = await supabase.from("purchases").insert({
            company_id: companyId,
            store_id: orig.store_id,
            vendor_id: orig.vendor_id,
            payment_method_id: orig.payment_method_id,
            subtotal: Math.round(dbnSubtotal * 100) / 100,
            vat_total: Math.round(dbnVat * 100) / 100,
            total_amount: dbnTotal,
            notes: orig.notes ? `Μερική επιστροφή από ${orig.invoice_number || id}` : null,
            document_type: "DBN",
            invoice_number: dbnNum,
            converted_from_id: parseInt(id, 10),
            status: "completed",
            created_by: userId
        }).select("id").single();
        if (insErr || !dbn) return res.status(500).json({ success: false, message: "Σφάλμα δημιουργίας χρεωστικού", code: "DB_ERROR" });
        const dbnItems = returnLines.map(it => ({
            purchase_id: dbn.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: it.cost_price,
            total_cost: it.total_cost,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));
        const { error: itemsErr } = await supabase.from("purchase_items").insert(dbnItems);
        if (itemsErr) {
            await supabase.from("purchases").delete().eq("id", dbn.id);
            return res.status(500).json({ success: false, message: "Σφάλμα γραμμών", code: "DB_ERROR" });
        }
        const dbnItemsForStock = returnLines.map(it => ({
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: Math.abs(it.cost_price),
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));
        await applyDbnStock(companyId, orig.store_id, dbn.id, userId, dbnItemsForStock);
        const { data: full } = await supabase.from("purchases").select(`
            id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
            subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
            purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
        `).eq("id", dbn.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("partial-return purchases:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST /company/purchases/:id/create-grn - PO (sent/ordered/partially_received) → create GRN linked to PO
router.post("/company/purchases/:id/create-grn", requireAuth, requireAnyPermission(['purchases.create', 'purchases.edit', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({ success: false, message: "Λείπουν στοιχεία", code: "MISSING_PARAMS" });
    }

    try {
        const { data: po, error: fetchErr } = await supabase
            .from("purchases")
            .select(`
                id, store_id, vendor_id, payment_method_id, total_amount, subtotal, vat_total,
                invoice_number, invoice_date, notes, document_type, status,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !po) {
            return res.status(404).json({ success: false, message: "Η αγορά δεν βρέθηκε", code: "NOT_FOUND" });
        }
        if ((po.document_type || "").toUpperCase() !== "PO") {
            return res.status(400).json({
                success: false,
                message: "Μόνο Παραγγελία Αγοράς (PO) μπορεί να δημιουργήσει Δελτίο Παραλαβής",
                code: "NOT_PO"
            });
        }
        const statusLower = (po.status || "").toLowerCase();
        if (!["sent", "ordered", "partially_received"].includes(statusLower)) {
            return res.status(400).json({
                success: false,
                message: "Η παραγγελία πρέπει να είναι οριστικοποιημένη (απεσταλμένη ή μερικώς παραληφθείσα) για καταχώρηση παραλαβής",
                code: "INVALID_STATUS"
            });
        }

        const poIdInt = parseInt(id, 10);
        const { data: draftRows, error: draftQErr } = await supabase
            .from("purchases")
            .select("id")
            .eq("company_id", companyId)
            .eq("converted_from_id", poIdInt)
            .eq("document_type", "GRN")
            .eq("status", "draft")
            .order("created_at", { ascending: false })
            .limit(1);
        if (draftQErr) {
            console.error("create-grn draft lookup:", draftQErr);
            return res.status(500).json({ success: false, message: "Σφάλμα ελέγχου δελτίου παραλαβής", code: "DB_ERROR" });
        }
        if (draftRows && draftRows.length > 0) {
            const draftId = draftRows[0].id;
            const { data: fullReuse, error: fullReuseErr } = await supabase.from("purchases").select(`
            id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
            subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
            purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra)
        `).eq("id", draftId).eq("company_id", companyId).single();
            if (fullReuseErr || !fullReuse) {
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα φόρτωσης υπάρχοντος δελτίου παραλαβής",
                    code: "DB_ERROR"
                });
            }
            return res.json({ success: true, data: fullReuse, reused_existing_draft: true });
        }

        const poLines = po.purchase_items || [];
        const receivedByLine = await getReceivedTotalsByPoLine(supabase, companyId, po.id, null);

        let subtotal = 0;
        let vatTotal = 0;
        const itemsToInsert = [];
        for (const line of poLines) {
            const ordered = Number(line.quantity) || 0;
            const already = receivedByLine[line.id] || 0;
            const remaining = Math.max(0, ordered - already);
            if (remaining <= 0) continue;
            const cost = Number(line.cost_price) || 0;
            const lineTotal = Math.round(remaining * cost * 100) / 100;
            const vatExempt = line.vat_exempt === true;
            const vatRate = vatExempt ? 0 : Math.min(1, Math.max(0, Number(line.vat_rate) || 0));
            const lineVat = Math.round(lineTotal * vatRate * 100) / 100;
            subtotal += lineTotal;
            vatTotal += lineVat;
            itemsToInsert.push({
                product_id: line.product_id,
                product_variant_id: line.product_variant_id,
                quantity: remaining,
                cost_price: cost,
                total_cost: lineTotal,
                vat_rate: vatRate,
                vat_exempt: vatExempt,
                po_line_id: line.id,
                is_extra: false,
            });
        }
        subtotal = Math.round(subtotal * 100) / 100;
        vatTotal = Math.round(vatTotal * 100) / 100;
        const totalAmount = Math.round((subtotal + vatTotal) * 100) / 100;

        const grnNum = await getNextSequence(companyId, "GRN");
        const purchaseData = {
            company_id: companyId,
            store_id: po.store_id,
            vendor_id: po.vendor_id,
            payment_method_id: po.payment_method_id,
            total_amount: totalAmount,
            subtotal,
            vat_total: vatTotal,
            notes: null,
            invoice_number: grnNum,
            invoice_date: new Date().toISOString().slice(0, 10),
            status: "draft",
            document_type: "GRN",
            converted_from_id: poIdInt,
            created_by: userId || null
        };
        const { data: grn, error: insErr } = await supabase
            .from("purchases")
            .insert(purchaseData)
            .select("id")
            .single();
        if (insErr || !grn) {
            const isDup =
                insErr &&
                (insErr.code === "23505" ||
                    String(insErr.message || "").toLowerCase().includes("duplicate") ||
                    String(insErr.details || "").toLowerCase().includes("already exists"));
            if (isDup) {
                const { data: raceDrafts } = await supabase
                    .from("purchases")
                    .select("id")
                    .eq("company_id", companyId)
                    .eq("converted_from_id", poIdInt)
                    .eq("document_type", "GRN")
                    .eq("status", "draft")
                    .order("created_at", { ascending: false })
                    .limit(1);
                if (raceDrafts && raceDrafts.length > 0) {
                    const rid = raceDrafts[0].id;
                    const { data: fullRace, error: fullRaceErr } = await supabase.from("purchases").select(`
            id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
            subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
            purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra)
        `).eq("id", rid).eq("company_id", companyId).single();
                    if (!fullRaceErr && fullRace) {
                        return res.json({ success: true, data: fullRace, reused_existing_draft: true });
                    }
                }
            }
            console.error("create-grn insert GRN:", insErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία δελτίου παραλαβής",
                code: "DB_ERROR"
            });
        }
        if (itemsToInsert.length > 0) {
            const rows = itemsToInsert.map((it) => ({
                purchase_id: grn.id,
                product_id: it.product_id,
                product_variant_id: it.product_variant_id,
                quantity: it.quantity,
                cost_price: it.cost_price,
                total_cost: it.total_cost,
                vat_rate: it.vat_rate,
                vat_exempt: it.vat_exempt,
                po_line_id: it.po_line_id,
                is_extra: it.is_extra,
            }));
            const { error: itemsErr } = await supabase.from("purchase_items").insert(rows);
            if (itemsErr) {
                await supabase.from("purchases").delete().eq("id", grn.id);
                return res.status(500).json({
                    success: false,
                    message: "Σφάλμα κατά την αποθήκευση των γραμμών",
                    code: "DB_ERROR"
                });
            }
        }
        const { data: full } = await supabase.from("purchases").select(`
            id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
            subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
            purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt, po_line_id, is_extra)
        `).eq("id", grn.id).eq("company_id", companyId).single();
        return res.json({ success: true, data: full });
    } catch (err) {
        console.error("POST /company/purchases/:id/create-grn ERROR:", err);
        return res.status(500).json({ success: false, message: "Server error", code: "SERVER_ERROR" });
    }
});

// POST .../convert-from-grn — GRN → PUR; set GRN to invoiced
const convertPurchaseFromGrn = async (req, res) => {
    const companyId = req.user.companyId;
    const userId = req.user.id;
    const { id } = req.params;

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: grn, error: fetchErr } = await supabase
            .from("purchases")
            .select(`
                id, store_id, vendor_id, payment_method_id, total_amount, subtotal, vat_total,
                invoice_number, invoice_date, notes, document_type, status,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
            `)
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !grn) {
            return res.status(404).json({
                success: false,
                message: "Η αγορά δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        if ((grn.document_type || "").toUpperCase() !== "GRN") {
            return res.status(400).json({
                success: false,
                message: "Μόνο Δελτίο Παραλαβής (GRN) μπορεί να μετατραπεί σε Τιμολόγιο Αγοράς",
                code: "NOT_GRN"
            });
        }

        const statusLower = (grn.status || "").toLowerCase();
        if (!["completed", "pending_invoice", "received"].includes(statusLower)) {
            return res.status(400).json({
                success: false,
                message: "Το δελτίο παραλαβής πρέπει να είναι παραληφθείσο (ολοκληρωμένο ή προς τιμολόγηση) για μετατροπή",
                code: "INVALID_STATUS"
            });
        }

        const items = grn.purchase_items || [];
        if (items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Το δελτίο παραλαβής δεν έχει γραμμές προϊόντων",
                code: "NO_ITEMS"
            });
        }

        const purgeNum = await getNextSequence(companyId, "PUR");

        const purchaseData = {
            company_id: companyId,
            store_id: grn.store_id,
            vendor_id: grn.vendor_id,
            payment_method_id: grn.payment_method_id,
            total_amount: grn.total_amount,
            subtotal: grn.subtotal,
            vat_total: grn.vat_total,
            notes: grn.notes,
            invoice_number: purgeNum,
            invoice_date: grn.invoice_date || new Date().toISOString().slice(0, 10),
            status: "completed",
            document_type: "PUR",
            converted_from_id: parseInt(id, 10),
            created_by: userId || null
        };

        const { data: newPur, error: insErr } = await supabase
            .from("purchases")
            .insert(purchaseData)
            .select("id")
            .single();

        if (insErr || !newPur) {
            console.error("convert-from-grn insert PUR:", insErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη δημιουργία τιμολογίου αγοράς",
                code: "DB_ERROR"
            });
        }

        const itemsToInsert = items.map(it => ({
            purchase_id: newPur.id,
            product_id: it.product_id,
            product_variant_id: it.product_variant_id,
            quantity: it.quantity,
            cost_price: it.cost_price,
            total_cost: it.total_cost,
            vat_rate: it.vat_rate,
            vat_exempt: it.vat_exempt
        }));

        const { error: itemsErr } = await supabase.from("purchase_items").insert(itemsToInsert);
        if (itemsErr) {
            console.error("convert-from-grn insert items:", itemsErr);
            await supabase.from("purchases").delete().eq("id", newPur.id);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την αποθήκευση των γραμμών",
                code: "DB_ERROR"
            });
        }

        // Stock was already applied when GRN reached completed; PUR is the accounting document only.

        await supabase
            .from("purchases")
            .update({ status: "invoiced" })
            .eq("id", id)
            .eq("company_id", companyId);

        const { data: fullPur } = await supabase
            .from("purchases")
            .select(`
                id, created_at, store_id, vendor_id, payment_method_id, total_amount, status, notes,
                subtotal, vat_total, invoice_number, invoice_date, document_type, converted_from_id,
                purchase_items (id, product_id, product_variant_id, quantity, cost_price, total_cost, vat_rate, vat_exempt)
            `)
            .eq("id", newPur.id)
            .single();

        return res.json({
            success: true,
            message: "Το δελτίο παραλαβής μετατράπηκε σε Τιμολόγιο Αγοράς",
            data: fullPur
        });
    } catch (err) {
        console.error("POST /company/purchases/:id/convert-from-grn ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
};
router.post("/company/purchases/:id/convert-from-grn", requireAuth, requireAnyPermission(['purchases.create', 'purchases.edit', '*']), convertPurchaseFromGrn);

router.delete("/company/purchases/:id", requireAuth, requireAnyPermission(['purchases.delete', '*']), async (req, res) => {
    const companyId = req.user.companyId;
    const userPermissions = req.user.permissions || [];
    const { id } = req.params;
    const { confirm_negative_stock } = req.body || {};

    if (!companyId || !id) {
        return res.status(400).json({
            success: false,
            message: "Λείπουν στοιχεία",
            code: "MISSING_PARAMS"
        });
    }

    try {
        const { data: existing, error: fetchErr } = await supabase
            .from("purchases")
            .select("id, store_id, status, document_type")
            .eq("id", id)
            .eq("company_id", companyId)
            .single();

        if (fetchErr || !existing) {
            return res.status(404).json({
                success: false,
                message: "Η αγορά δεν βρέθηκε",
                code: "NOT_FOUND"
            });
        }

        if ((existing.document_type || "").toUpperCase() === "DBN" && (existing.status || "").toLowerCase() === "completed") {
            return res.status(403).json({
                success: false,
                message: "Δεν επιτρέπεται διαγραφή ολοκληρωμένου χρεωστικού σημειώματος",
                code: "CANNOT_DELETE_COMPLETED_DBN"
            });
        }

        const wasStockApplied = existing.status === "received" || existing.status === "completed";
        if (wasStockApplied) {
            const { data: oldItems } = await supabase
                .from("purchase_items")
                .select("product_id, product_variant_id, quantity")
                .eq("purchase_id", id);
            const oldItemsList = oldItems || [];
            const cancelItems = oldItemsList.map(it => ({
                store_id: existing.store_id,
                product_variant_id: it.product_variant_id,
                product_id: it.product_id,
                quantity: Number(it.quantity)
            }));
            if (cancelItems.length > 0 && !confirm_negative_stock) {
                const result = await checkStockAvailability(companyId, cancelItems, { userPermissions });
                if (result.block) {
                    const code = result.message && result.message.includes("δικαίωμα") ? "NO_PERMISSION_NEGATIVE_STOCK" : "INSUFFICIENT_STOCK";
                    return res.status(400).json({
                        success: false,
                        code,
                        message: result.message || "Ανεπαρκές απόθεμα",
                        insufficientItems: result.insufficientItems || []
                    });
                }
                if (result.warning) {
                    return res.status(200).json({
                        success: false,
                        code: "REQUIRES_CONFIRMATION",
                        requires_negative_stock_confirmation: true,
                        insufficientItems: result.insufficientItems || [],
                        message: result.message || "Τα ακόλουθα προϊόντα θα έχουν αρνητικό απόθεμα. Θέλετε να συνεχίσετε;"
                    });
                }
            }
            try {
                await reversePurchaseStock(companyId, existing.store_id, parseInt(id, 10));
            } catch (revErr) {
                console.error("DELETE purchases reverse stock:", revErr);
                return res.status(400).json({
                    success: false,
                    message: revErr.message || "Ανεπαρκές απόθεμα για διαγραφή αγοράς",
                    code: "STOCK_ERROR"
                });
            }
        }

        await supabase.from("purchase_items").delete().eq("purchase_id", id);
        const { error: delErr } = await supabase.from("purchases").delete().eq("id", id).eq("company_id", companyId);

        if (delErr) {
            console.error("DELETE /company/purchases:", delErr);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά τη διαγραφή αγοράς",
                code: "DB_ERROR"
            });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error("DELETE /company/purchases ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});

router.get('/plans', requireAuth, async (req, res) => {
    try {
        const { data: plans, error: plansError } = await supabase
            .from("plans")
            .select("*")
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

        const normalizedPlans = (plans ?? []).map(plan => {
        /* ---------------- Base plan pricing ---------------- */
        const baseMonthly = plan.cached_price_monthly ?? 0;
        const baseYearly = plan.cached_price_yearly ?? 0;

        const baseMonthlyFromYearly =
            baseYearly > 0 ? Number((baseYearly / 12).toFixed(2)) : 0;

        const baseDiscountPercent =
            baseMonthly > 0 && baseYearly > 0
                ? Math.round((1 - baseYearly / (baseMonthly * 12)) * 100)
                : null;

        /* ---------------- Extra store pricing ---------------- */
        const extraMonthly = plan.cached_extra_store_price_monthly ?? 0;
        const extraYearly = plan.cached_extra_store_price_yearly ?? 0;

        const extraMonthlyFromYearly =
            extraYearly > 0 ? Number((extraYearly / 12).toFixed(2)) : null;

        const extraDiscountPercent =
            extraMonthly > 0 && extraYearly > 0
                ? Math.round((1 - extraYearly / (extraMonthly * 12)) * 100)
                : null;

        return {
            id: plan.id,
            key: plan.key,
            name: plan.name,
            description: plan.description,

            features: plan.features,
            max_users: plan.max_users,
            max_products: plan.max_products,
            included_branches: plan.included_branches,

            pricing: {
                monthly: baseMonthly,
                yearly: baseYearly,
                display_monthly_from_yearly: baseMonthlyFromYearly,
                yearly_discount_percent: baseDiscountPercent,
            },

            extra_store_pricing: {
                monthly: extraMonthly,
                yearly: extraYearly,
                display_monthly_from_yearly: extraMonthlyFromYearly,
                yearly_discount_percent: extraDiscountPercent,
            },

            is_free: plan.is_free,
            is_popular: plan.is_popular,
            allows_paid_plugins: plan.allows_paid_plugins,
            rank: plan.rank,
        }
        })

    return res.json({
        success: true,
        data: normalizedPlans,
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
            .select(` 
                priority, 
                plugins ( 
                    key, 
                    name, 
                    description, 
                    cached_price_monthly,
                    cached_price_yearly,
                    photo_url, 
                    current_version 
                ) 
            `)
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
        // MAP TO RESPONSE FORMAT
        // ===============================
        const plugins = result.map((r) => {
            const {
                key,
                name,
                description,
                cached_price_monthly,
                cached_price_yearly,
                photo_url,
                current_version
            } = r;

            return {
                key,
                name,
                description,
                base_price_per_month: cached_price_monthly || 0,
                base_price_per_year: cached_price_yearly || 0,
                photo_url,
                current_version
            };
        });

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

// GET /api/shared/company-plugins - list company's plugins (for My Plugins page)
router.get('/company-plugins', requireAuth, async (req, res) => {
    const companyId = req.user.companyId;
    if (!companyId) {
        return res.status(403).json({
            success: false,
            message: "Δεν έχει επιλεχθεί ενεργή εταιρεία",
            code: "NO_ACTIVE_COMPANY"
        });
    }

    try {
        const { data: companyPlugins, error } = await supabase
            .from('company_plugins')
            .select(`
                plugin_key,
                status,
                disabled_reason,
                activated_at,
                settings,
                plugins (
                    key,
                    name,
                    description,
                    photo_url,
                    cached_price_monthly,
                    cached_price_yearly
                )
            `)
            .eq('company_id', companyId);

        if (error) {
            console.error("COMPANY PLUGINS ERROR:", error);
            return res.status(500).json({
                success: false,
                message: "Σφάλμα κατά την ανάγνωση plugins",
                code: "DB_ERROR"
            });
        }

        const plugins = (companyPlugins || []).map(cp => ({
            plugin_key: cp.plugin_key,
            status: cp.status,
            disabled_reason: cp.disabled_reason,
            activated_at: cp.activated_at,
            settings: cp.settings,
            name: cp.plugins?.name || cp.plugin_key,
            description: cp.plugins?.description,
            photo_url: cp.plugins?.photo_url,
            cached_price_monthly: cp.plugins?.cached_price_monthly,
            cached_price_yearly: cp.plugins?.cached_price_yearly,
        }));

        return res.json({
            success: true,
            message: "Επιτυχής λήψη company plugins",
            data: plugins
        });

    } catch (err) {
        console.error("GET COMPANY PLUGINS ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});


// ============================================
// Επιστρέφει τα invoices από Stripe
// ============================================
router.get('/subscription/invoices', requireAuth, requireOwner, async (req, res) => {
    try {
        const { companyId } = req.user;

        // 1. Get stripe customer id
        const { data: company, error: companyError } = await supabase
            .from("companies")
            .select("stripe_customer_id")
            .eq("id", companyId)
            .single();

        if (companyError || !company?.stripe_customer_id) {
            return res.json({
                success: true,
                data: []
            });
        }

        // 2. Fetch invoices from Stripe
        const invoices = await stripe.invoices.list({
            customer: company.stripe_customer_id,
            limit: 100
        });

        // 3. Format invoices
        const formattedInvoices = invoices.data.map(invoice => ({
            id: invoice.id,
            number: invoice.number || invoice.id.slice(-8).toUpperCase(),
            date: new Date(invoice.created * 1000).toISOString(),
            due_date: invoice.due_date 
                ? new Date(invoice.due_date * 1000).toISOString() 
                : null,
            amount: invoice.total / 100,
            currency: invoice.currency === 'eur' ? '€' : invoice.currency.toUpperCase(),
            status: mapInvoiceStatus(invoice.status),
            description: invoice.lines.data[0]?.description || 'Συνδρομή',
            pdf_url: invoice.invoice_pdf
        }));

        return res.json({
            success: true,
            data: formattedInvoices
        });

    } catch (err) {
        console.error("GET INVOICES ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
});


router.get("/onboarding/data", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;

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
router.post("/onboarding/sync-step", requireAuth, requireOwner, async (req, res) => {
    
    const { companyId } = req.user;
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
router.post("/onboarding/next", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
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
            company: { name: '', phone: '', country: '' },
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

        // Update company name immediately if changed (phone and country are stored in onboarding data
        // and written to companies only when onboarding completes, like phone)
        const companyUpdates = {};
        if (sanitizedData.company.name && sanitizedData.company.name !== currentData.company?.name) {
            companyUpdates.name = sanitizedData.company.name;
        }
        if (Object.keys(companyUpdates).length > 0) {
            const { data: companyUpdData, error: companyUpdateErr } = await supabase
                .from('companies')
                .update(companyUpdates)
                .select("stripe_customer_id")
                .eq('id', companyId)
                .maybeSingle();

            if (companyUpdateErr) {
                console.error("Failed to update company name:", companyUpdateErr);
                // Don't fail the request, just log it
            }
            
            if (companyUpdData?.stripe_customer_id) {
                await stripe.customers.update(companyUpdData.stripe_customer_id, {
                    name: sanitizedData.company.name,
                });
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
router.post("/onboarding-complete-free", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
    const userId = req.user.id;

    try {
        // 1. Fetch current onboarding state
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

        // 2. Check if already completed
        if (onboarding.is_completed) {
            return res.status(400).json({
                success: false,
                message: "Το onboarding έχει ήδη ολοκληρωθεί",
                code: "ALREADY_COMPLETED"
            });
        }

        // 3. Verify user is on the final step
        if (onboarding.current_step !== TOTAL_STEPS) {
            return res.status(400).json({
                success: false,
                message: "Πρέπει να ολοκληρώσετε όλα τα steps",
                code: "NOT_ON_FINAL_STEP",
            });
        }

        const sanitizedData = onboarding.data;

        // 4. Validate the sanitized data
        const validation = validateCompleteOnboardingData(sanitizedData);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: "Τα δεδομένα δεν είναι έγκυρα",
                code: "VALIDATION_ERROR",
            });
        }

        // 5. Fetch plan details
        const { data: plan, error: planErr } = await supabase
            .from('plans')
            .select('id, name, key, is_free, allows_paid_plugins, included_branches')
            .eq('id', sanitizedData.plan.id)
            .single();

        if (planErr || !plan) {
            return res.status(400).json({
                success: false,
                message: "Invalid plan",
                code: "INVALID_PLAN"
            });
        }

        if (!plan.is_free) {
            return res.status(400).json({
                success: false,
                message: "Αυτό το endpoint είναι μόνο για free plans",
                code: "INVALID_PLAN_TYPE"
            });
        }

        const canUsePaidPlugins = plan.allows_paid_plugins;

        // =============================================
        // UPDATE COMPANY INFO
        // =============================================
        const { error: companyUpdateErr } = await supabase
            .from('companies')
            .update({
                name: sanitizedData.company.name,
                phone: sanitizedData.company.phone,
                country: sanitizedData.company.country || null,
            })
            .eq('id', companyId);
    
        if (companyUpdateErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ενημέρωση της εταιρείας"
            };
        }
        // =============================================
        // INSERT INDUSTRIES
        // =============================================

        if (sanitizedData.industries.length > 0) {
            const { data: validIndustries, error: validIndustriesError } = await supabase
                .from('industries')
                .select('key')
                .in('key', sanitizedData.industries);

            if (validIndustriesError) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά την ανάγνωση κλάδων"
                };
            }

            if (validIndustries.length > 0) {
                const rows = validIndustries.map(i => ({
                    company_id: companyId,
                    industry_key: i.key
                }));

                const { error: insertError } = await supabase
                    .from('company_industries')
                    .insert(rows);

                if (insertError) {
                    throw {
                        status: 500,
                        code: "DB_ERROR",
                        message: "Σφάλμα κατά την ενημέρωση company industries"
                    };
                }
            }
        }

        // =============================================
        // INSERT PLUGINS
        // =============================================

        if (sanitizedData.plugins.length > 0) {
            const { data: availablePlugins, error: pluginsSelectErr } = await supabase
                .from('plugins')
                .select('key, is_active, cached_price_monthly, cached_price_yearly')
                .in('key', sanitizedData.plugins)
                .eq('is_active', true);

            if (pluginsSelectErr) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά την ανάγνωση plugins"
                };
            }

            // Filter based on plan
            const allowedPlugins = availablePlugins.filter(plugin => {
                if (!canUsePaidPlugins) {
                    return plugin.cached_price_monthly === null && plugin.cached_price_yearly === null;
                }
                return true;
            });

            if (allowedPlugins.length > 0) {
                const pluginRows = allowedPlugins.map(plugin => ({
                    company_id: companyId,
                    plugin_key: plugin.key,
                    status: 'active',
                    activated_at: new Date().toISOString(),
                    subscription_item_id: null,
                    settings: null
                }));

                const { error: insertPluginsErr } = await supabase
                    .from('company_plugins')
                    .insert(pluginRows);

                if (insertPluginsErr) {
                    throw {
                        status: 500,
                        code: "DB_ERROR",
                        message: "Σφάλμα κατά την αποθήκευση plugins"
                    };
                }
            }
        }

        // =============================================
        // CREATE STORES
        // =============================================

        const storesToCreate = [];

        // Always create main store
        storesToCreate.push({
            company_id: companyId,
            name: 'Κεντρική Αποθήκη',
            is_main: true,
            created_at: new Date().toISOString()
        });

        // Create additional branches for paid plans
        if (plan.key !== "basic") {
            const totalBranches = (sanitizedData.branches || 0) + plan.included_branches;
            
            for (let i = 1; i <= totalBranches; i++) {
                storesToCreate.push({
                    company_id: companyId,
                    name: `Υποκατάστημα ${i}`,
                    is_main: false,
                    created_at: new Date().toISOString()
                });
            }
        }

        const { data: createdStores, error: storesErr } = await supabase
            .from('stores')
            .insert(storesToCreate)
            .select('id, name, address, city, is_main');

        if (storesErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά τη δημιουργία καταστημάτων"
            };
        }

        console.log(`Created ${createdStores.length} stores`);
        // =============================================
        // LINK PLUGINS TO STORES
        // =============================================

        if (sanitizedData.plugins.length > 0 && createdStores.length > 0) {
            // Fetch company_plugins που μόλις δημιουργήθηκαν
            const { data: companyPlugins, error: fetchPluginsErr } = await supabase
                .from('company_plugins')
                .select('id, plugin_key')
                .eq('company_id', companyId)
                .in('plugin_key', sanitizedData.plugins);

            if (fetchPluginsErr) {
                throw {
                    status: 500,
                    code: "DB_ERROR",
                    message: "Σφάλμα κατά την ανάγνωση company plugins"
                };
            }

            // Δημιουργία store_plugins: κάθε plugin σε όλα τα stores
            const storePluginsToInsert = [];
            
            for (const store of createdStores) {
                for (const companyPlugin of companyPlugins) {
                    storePluginsToInsert.push({
                        company_plugin_id: companyPlugin.id,
                        store_id: store.id,
                        settings: null,
                        is_active: false,
                        created_at: new Date().toISOString()
                    });
                }
            }

            if (storePluginsToInsert.length > 0) {
                const { error: storePluginsErr } = await supabase
                    .from('store_plugins')
                    .insert(storePluginsToInsert);

                if (storePluginsErr) {
                    throw {
                        status: 500,
                        code: "DB_ERROR",
                        message: "Σφάλμα κατά τη σύνδεση plugins με stores"
                    };
                }

                console.log(`Created ${storePluginsToInsert.length} store_plugin records`);
            }
        }

        // =============================================
        // CREATE SUBSCRIPTION
        // =============================================
        const subscriptionPayload = {
            company_id: companyId,
            plan_id: plan.id,
            subscription_code: generateSubscriptionCode(),
            billing_period: null,
            billing_status: 'active',
            currency: 'eur',
            current_period_start: new Date().toISOString(),
            current_period_end: null,
            cancel_at_period_end: false,
            cancel_at: null,
            canceled_at: null,
            updated_at: new Date().toISOString()
        };

        const { error: subscriptionErr } = await supabase
            .from('subscriptions')
            .insert(subscriptionPayload);

        if (subscriptionErr) {
            console.error('FULL DB ERROR:', subscriptionErr);
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά τη δημιουργία συνδρομής"
            };
        }

        // =============================================
        // MARK ONBOARDING AS COMPLETED
        // =============================================

        const { data: onboardingUpdate, error: onboardingUpdateErr } = await supabase
            .from('onboarding')
            .update({
                is_completed: true,
                updated_at: new Date().toISOString()
            })
            .eq('company_id', companyId)
            .select("is_completed")
            .single();

        if (onboardingUpdateErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ολοκλήρωση onboarding"
            };
        }

        // =============================================
        // FETCH SUBSCRIPTION FOR RESPONSE
        // =============================================
        const { data: dbSubscription, error: subscriptionFetchErr } = await supabase
            .from('subscriptions')
            .select(`
                billing_status,
                plans (
                    name
                )
            `)
            .eq('company_id', companyId)
            .maybeSingle();

        if (subscriptionFetchErr) {
            console.error('Failed to fetch subscription:', subscriptionFetchErr);
            // Non-critical - continue without subscription
        }

        // =============================================
        // FETCH OWNER'S ROLE & PERMISSIONS
        // =============================================

        const { data: ownerRole, error: ownerRoleErr } = await supabase
            .from('company_users')
            .select(`
                role_id,
                roles (id,key,name)
            `)
            .eq('company_id', companyId)
            .eq('user_id', userId)
            .eq('is_owner', true)
            .single();

        if (ownerRoleErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση owner role"
            };
        }

        const { data: rolePerms, error: rolePermsErr } = await supabase
            .from('role_permissions')
            .select('permission_key')
            .eq('role_id', ownerRole.role_id);

        if (rolePermsErr) {
            throw {
                status: 500,
                code: "DB_ERROR",
                message: "Σφάλμα κατά την ανάγνωση permissions"
            };
        }

        const permissions = rolePerms?.map(rp => rp.permission_key) || [];

        // =============================================
        // ✅ BUILD STORES ARRAY WITH ROLE INFO
        // =============================================

        const storesWithRoles = createdStores.map(store => ({
            id: store.id,
            name: store.name,
            address: store.address,
            city: store.city,
            is_main: store.is_main,
            role: {
                id: ownerRole.roles.id,
                key: ownerRole.roles.key,
                name: ownerRole.roles.name
            },
            permissions
        }));


        
        // 8. Send Welcome Email
        // Fetch company για email
        const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('id', companyId)
            .single();

        const { data: user } = await supabase
            .from('users')
            .select('email')
            .eq('id', userId)
            .single();

        if (user && company) {
            await sendWelcomeEmail(
                user.email,
                company.name, // company name αντί για user name
                plan.name,
                plan.is_free, // isFree
                null
            );
        }

        // =============================================
        // BUILD RESPONSE
        // =============================================
        const result = {
            is_completed: onboardingUpdate.is_completed,
            stores: storesWithRoles
        };

        // Add subscription to response
        if (dbSubscription) {
            result.subscription = {
                plan: {
                    name: dbSubscription.plans?.name || "Unknown"
                },
                status: dbSubscription.billing_status
            };
        }

        return res.json({
            success: true,
            message: "Το onboarding ολοκληρώθηκε επιτυχώς!",
            data: result
        });

    } catch (err) {
        if (err.status) {
            return res.status(err.status).json({
                success: false,
                message: err.message,
                code: err.code
            });
        }

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
router.post("/onboarding/back", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;

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

// For updating billing period on payment checkout step
router.post("/onboarding/update-draft", requireAuth, requireOwner, async (req, res) => {

    const { companyId } = req.user;
    const { updates } = req.body;

    try {
        const { data: onboarding, error } = await supabase
            .from("onboarding")
            .select("data, is_completed")
            .eq("company_id", companyId)
            .single();

        if (error || !onboarding) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ανάγνωσης onboarding",
                code: "DB_ERROR"
            });
        }

        if (onboarding.is_completed) {
            return res.status(403).json({
                success: false,
                message: "Το onboarding έχει ολοκληρωθεί",
                code: "ONBOARDING_COMPLETED"
            });
        }

        const currentData = onboarding.data || {
            company: { name: '', phone: '', country: '' },
            industries: [],
            plan: null,
            plugins: []
        };

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

        const { data: updated, error: updateErr } = await supabase
            .from("onboarding")
            .update({
                data: sanitizedData,
                updated_at: new Date().toISOString()
            })
            .eq("company_id", companyId)
            .select("data")
            .single();

        if (updateErr) {
            return res.status(500).json({
                success: false,
                message: "Σφάλμα ενημέρωσης onboarding",
                code: "DB_ERROR"
            });
        }

        return res.json({
            success: true,
            data: {
                draft_data: updated.data
            }
        });

    } catch (err) {
        console.error("update-draft error", err);
        return res.status(500).json({
            success: false,
            message: "Server error",
            code: "SERVER_ERROR"
        });
    }
})

// ============================================
// ENDPOINT 3: Navigate to specific step (optional but useful)
// ============================================
router.post("/onboarding/goto/:step", requireAuth, requireOwner, async (req, res) => {
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