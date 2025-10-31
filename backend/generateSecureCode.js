const crypto = require('crypto');

// Command for JWT SECRET
// node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

// Generate a random secure code
function generateHashCode() {
    return crypto.createHash('sha256') // Use SHA-256 hash algorithm
                 .update(crypto.randomBytes(256)) // Use 256 random bytes for uniqueness
                 .digest('hex'); // Output as a hexadecimal string
}

const code = generateHashCode();
console.log(code);


// async function checkCodeExists(code) {
//     const { data, error } = await supabase
//         .from('subscriptions') // Assuming you're checking the `subscriptions` table
//         .select('subscription_code') // Assuming `subscription_code` is the column with codes
//         .eq('subscription_code', code)
//         .single(); // Single result, as you're checking for existence

//     if (error) {
//         console.error('Error checking code existence:', error);
//         return true; // Consider it "exists" in case of error (e.g., database issues)
//     }

//     return data !== null; // If data is null, the code doesn't exist
// }

//     let code;
//     let exists = true;

//     // Keep generating the code until it doesn't exist in the database
//     while (exists) {
//         code = generateHashCode();
//         exists = await checkCodeExists(code);
//     }

//     console.log('Generated Unique Code:', code);