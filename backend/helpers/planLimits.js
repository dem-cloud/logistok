const supabase = require('../supabaseConfig');

/**
 * Check if store is active. Returns false if store is inactive (disabled by plan downgrade).
 * Use before allowing mutations (sales, purchases, stock movements) targeting the store.
 */
async function isStoreActive(storeId, companyId) {
    if (!storeId) return false;
    const { data: store, error } = await supabase
        .from('stores')
        .select('id, is_active')
        .eq('id', storeId)
        .eq('company_id', companyId)
        .maybeSingle();

    if (error || !store) return false;
    return store.is_active !== false;
}

/**
 * Check if company can add more users based on plan limit.
 * Returns { allowed: boolean, reason?: string }.
 */
async function canAddUser(companyId) {
    const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
            plans (max_users, included_branches)
        `)
        .eq('company_id', companyId)
        .maybeSingle();

    if (subErr || !sub?.plans) {
        return { allowed: true }; // No plan = allow (fallback)
    }

    const maxUsers = sub.plans.max_users;
    if (maxUsers == null) return { allowed: true }; // Unlimited

    const { count, error: countErr } = await supabase
        .from('company_users')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active');

    if (countErr) return { allowed: true };
    if (count >= maxUsers) {
        return { allowed: false, reason: 'PLAN_USER_LIMIT' };
    }
    return { allowed: true };
}

/**
 * Check if company can add more stores based on plan limit.
 * Max allowed stores = included_branches + extra_store_quantity.
 * Returns { allowed, reason?, freeSlots, paidExtra, needsPayment }.
 */
async function canAddStore(companyId) {
    const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
            id,
            plans (id, key, included_branches)
        `)
        .eq('company_id', companyId)
        .in('billing_status', ['active', 'trialing', 'past_due'])
        .maybeSingle();

    if (subErr || !sub?.plans) {
        return {
            allowed: true,
            freeSlots: 999,
            paidExtra: 0,
            needsPayment: false
        };
    }

    const includedBranches = sub.plans.included_branches ?? 0;
    const planKey = sub.plans.key ?? '';

    // Get extra_store quantity from subscription_items
    const { data: extraStoreItem } = await supabase
        .from('subscription_items')
        .select('quantity')
        .eq('subscription_id', sub.id)
        .eq('item_type', 'extra_store')
        .maybeSingle();

    const paidExtra = extraStoreItem?.quantity ?? 0;
    const maxStores = includedBranches + paidExtra;

    const { count: activeCount, error: countErr } = await supabase
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('is_active', true);

    if (countErr) {
        return {
            allowed: true,
            freeSlots: includedBranches,
            paidExtra,
            needsPayment: false
        };
    }

    const freeSlots = Math.max(0, includedBranches - activeCount);
    const hasRoom = activeCount < maxStores;
    const needsPayment = freeSlots <= 0 && hasRoom;

    // Basic plan cannot add extra stores (no payment option)
    if (planKey.toLowerCase() === 'basic' && freeSlots <= 0) {
        return {
            allowed: false,
            reason: 'PLAN_UPGRADE_REQUIRED',
            freeSlots: 0,
            paidExtra: 0,
            needsPayment: false
        };
    }

    if (!hasRoom) {
        return {
            allowed: false,
            reason: 'PLAN_STORE_LIMIT',
            freeSlots: 0,
            paidExtra,
            needsPayment: false
        };
    }

    return {
        allowed: true,
        freeSlots,
        paidExtra,
        needsPayment
    };
}

/**
 * Express middleware: reject if storeId in req.body or req.params is inactive.
 * Use before sales, purchases, stock_movements create/update.
 * Expects: req.user.companyId, and store_id in body or :storeId in params.
 */
function requireActiveStore(req, res, next) {
    const companyId = req.user?.companyId;
    const storeId = req.body?.store_id || req.params?.storeId;

    if (!storeId) return next();

    isStoreActive(storeId, companyId)
        .then(active => {
            if (!active) {
                return res.status(403).json({
                    success: false,
                    message: "Αυτό το κατάστημα δεν είναι ενεργό. Αναβαθμίστε το πλάνο για να κάνετε αλλαγές.",
                    code: "STORE_INACTIVE"
                });
            }
            next();
        })
        .catch(err => {
            console.error("requireActiveStore error:", err);
            next(err);
        });
}

module.exports = { isStoreActive, canAddUser, canAddStore, requireActiveStore };
