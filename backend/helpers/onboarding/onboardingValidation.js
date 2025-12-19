/**
 * Sanitizes onboarding updates to match the EXACT expected schema
 * Always returns the complete schema structure, even for partial updates
 * @param {Object} updates - Raw updates from request
 * @param {Object} currentData - Current onboarding data from database
 * @returns {Object} - Sanitized updates with complete schema
 */
function sanitizeOnboardingUpdates(updates, currentData = {}) {
    // Start with the required schema structure
    const sanitized = {
        company: {
            name: currentData.company?.name || '',
            phone: currentData.company?.phone || ''
        },
        industries: Array.isArray(currentData.industries) ? currentData.industries : [],
        plan: currentData.plan || null,
        plugins: Array.isArray(currentData.plugins) ? currentData.plugins : []
    };

    if (!updates || typeof updates !== 'object') {
        return sanitized;
    }

    // Update company fields if provided
    if (updates.company && typeof updates.company === 'object') {
        if (updates.company.name !== undefined) {
            sanitized.company.name = String(updates.company.name).trim();
        }
        
        if (updates.company.phone !== undefined) {
            sanitized.company.phone = String(updates.company.phone).trim();
        }
    }

    // Update industries if provided
    if (updates.industries !== undefined) {
        if (!Array.isArray(updates.industries)) {
            throw new Error('INVALID_DATA_TYPE: industries must be an array');
        }

        const same =
            sanitized.industries.length === updates.industries.length &&
            sanitized.industries.every(item => updates.industries.includes(item));

        if(!same){
            sanitized.plugins = []
        }
        
        sanitized.industries = updates.industries
            .filter(item => typeof item === 'string')
            .map(item => String(item).trim())
            .filter(item => item.length > 0);
    }

    // Update plan if provided
    if (updates.plan !== undefined) {
        if (updates.plan === null) {
            sanitized.plan = null;
        } else if (typeof updates.plan === 'object') {
            // Plan must have both id and billing if not null
            const planId = updates.plan.id !== undefined 
                ? String(updates.plan.id).trim() 
                : (sanitized.plan?.id || '');
            
            const planBilling = updates.plan.billing !== undefined
                ? String(updates.plan.billing).trim()
                : (sanitized.plan?.billing || '');

            // Validate billing
            if (planBilling && planBilling !== 'monthly' && planBilling !== 'yearly') {
                throw new Error('INVALID_BILLING_TYPE: billing must be "monthly" or "yearly"');
            }

            sanitized.plan = {
                id: planId,
                billing: planBilling
            };
        }
    }

    // Update plugins if provided
    if (updates.plugins !== undefined) {
        if (!Array.isArray(updates.plugins)) {
            throw new Error('INVALID_DATA_TYPE: plugins must be an array');
        }
        
        sanitized.plugins = updates.plugins
            .filter(item => typeof item === 'string')
            .map(item => String(item).trim())
            .filter(item => item.length > 0);
    }

    return sanitized;
}

/**
 * Validates onboarding data for /next endpoint
 * Company fields can be empty, plan can be null
 * @param {Object} data - Sanitized onboarding data
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateNextOnboardingData(data) {
    const errors = [];

    // Company must have name and phone fields (can be empty strings)
    if (!data.company || typeof data.company !== 'object') {
        errors.push('Το πεδίο company είναι υποχρεωτικό');
    } else {
        if (data.company.name === undefined) {
            errors.push('Το πεδίο company.name είναι υποχρεωτικό');
        }
        if (data.company.phone === undefined) {
            errors.push('Το πεδίο company.phone είναι υποχρεωτικό');
        }
    }

    // Industries must be array (can be empty)
    if (!Array.isArray(data.industries)) {
        errors.push('Το πεδίο industries πρέπει να είναι array');
    }

    // Plan can be null, but if not null must have id and billing
    if (data.plan !== null) {
        if (typeof data.plan !== 'object') {
            errors.push('Το πεδίο plan πρέπει να είναι object ή null');
        } else {
            if (!data.plan.id || data.plan.id === '') {
                errors.push('Το πεδίο plan.id είναι υποχρεωτικό όταν plan δεν είναι null');
            }
            if (!data.plan.billing || !['monthly', 'yearly'].includes(data.plan.billing)) {
                errors.push('Το πεδίο plan.billing πρέπει να είναι "monthly" ή "yearly"');
            }
        }
    }

    // Plugins must be array (can be empty)
    if (!Array.isArray(data.plugins)) {
        errors.push('Το πεδίο plugins πρέπει να είναι array');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validates complete onboarding data for /complete endpoint
 * Company fields must NOT be empty, plan must NOT be null
 * @param {Object} data - Sanitized onboarding data
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateCompleteOnboardingData(data) {
    const errors = [];

    // Company must have non-empty name and phone
    if (!data.company?.name || data.company.name.length === 0) {
        errors.push('Το όνομα της εταιρείας είναι υποχρεωτικό');
    }
    
    if (!data.company?.phone || data.company.phone.length === 0) {
        errors.push('Το τηλέφωνο της εταιρείας είναι υποχρεωτικό');
    }

    // Industries must be array (can be empty)
    if (!Array.isArray(data.industries)) {
        errors.push('Το πεδίο industries πρέπει να είναι array');
    }

    // Plan must NOT be null and must have id and billing
    if (!data.plan || data.plan === null) {
        errors.push('Πρέπει να επιλέξετε πακέτο');
    } else {
        if (!data.plan.id || data.plan.id.length === 0) {
            errors.push('Το πεδίο plan.id είναι υποχρεωτικό');
        }
        
        if (!data.plan.billing || !['monthly', 'yearly'].includes(data.plan.billing)) {
            errors.push('Το πεδίο plan.billing πρέπει να είναι "monthly" ή "yearly"');
        }
    }

    // Plugins must be array (can be empty)
    if (!Array.isArray(data.plugins)) {
        errors.push('Το πεδίο plugins πρέπει να είναι array');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    sanitizeOnboardingUpdates,
    validateNextOnboardingData,
    validateCompleteOnboardingData
};