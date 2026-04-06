// supabaseConfig.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPA_PROJECT_URL;
// ### Το ANON_KEY είναι public key, χωρίς δικαιώματα εγγραφής όταν υπάρχει RLS
// const supabaseKey = process.env.SUPA_ANON_KEY
// ### Το service_role παρακάμπτει πάντα RLS, είναι υπερχρήστης.
const supabaseKey = process.env.SUPA_SERVICE_ROLE_KEY;

// Custom fetch with 20s timeout to prevent infinite hangs when Supabase is unreachable
const FETCH_TIMEOUT_MS = 20000;
function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { fetch: fetchWithTimeout },
});

module.exports = supabase;