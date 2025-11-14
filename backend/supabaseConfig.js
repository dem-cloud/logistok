// supabaseConfig.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPA_PROJECT_URL
// ### Το ANON_KEY είναι public key, χωρίς δικαιώματα εγγραφής όταν υπάρχει RLS
// const supabaseKey = process.env.SUPA_ANON_KEY
// ### Το service_role παρακάμπτει πάντα RLS, είναι υπερχρήστης.
const supabaseKey = process.env.SUPA_SERVICE_ROLE_KEY

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = supabase;