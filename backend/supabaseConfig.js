// supabaseConfig.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPA_PROJECT_URL
const supabaseKey = process.env.SUPA_ANON_KEY

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, supabaseKey)

module.exports = supabase;