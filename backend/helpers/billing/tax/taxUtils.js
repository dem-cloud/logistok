const { checkVAT, countries } = require("jsvat");
const { euCountries, taxTypes } = require("./taxConfig");

function getTaxType(country, taxId) {
    if (!country) {
        return null;
    }

    if (!taxId) {
        return euCountries.includes(country)
            ? { type: 'eu_vat', value: null }
            : { type: taxTypes[country]?.type ?? null, value: null };
    }

    // EU VAT
    if (euCountries.includes(country)) {
        // Για Ελλάδα το prefix είναι EL, όχι GR
        const prefix = country === 'GR' ? 'EL' : country;
        const value = taxId.toUpperCase().startsWith(prefix) ? taxId : `${prefix}${taxId}`;
        return { type: 'eu_vat', value };
    }

    // Άλλες χώρες
    if (taxTypes[country]) {
        const { type, prefix } = taxTypes[country];
        const value = prefix && !taxId.toUpperCase().startsWith(prefix) 
            ? `${prefix}${taxId}` 
            : taxId;
        return { type, value };
    }

    // Αν δεν αναγνωρίζουμε τη χώρα, επέστρεψε null
    return null;
}

function validateTaxPrefix(country, taxId) {
    if (!taxId || !country) {
        return { valid: true };
    }

    const cleanTaxId = taxId.trim().toUpperCase();
    const match = cleanTaxId.match(/^([A-Z]{2})/);

    // 🔹 EU χώρες → ελέγχουμε prefix
    if (euCountries.includes(country)) {

        // Αν δεν έχει prefix, ΟΚ (μπορεί να το προσθέσεις εσύ μετά)
        if (!match) {
            return { valid: true };
        }

        let prefix = match[1];
        if (prefix === 'EL') prefix = 'GR';

        if (prefix !== country) {
            return {
                valid: false,
                error: `Το πρόθεμα του ΑΦΜ (${match[1]}) δεν ταιριάζει με τη χώρα (${country}).`
            };
        }
    }

    // 🔹 Non-EU → reject EU VAT prefixes
    if (!euCountries.includes(country) && match) {
        const detectedPrefix = match[1] === 'EL' ? 'GR' : match[1];
        
        if (euCountries.includes(detectedPrefix)) {
            return {
                valid: false,
                error: `Το ΑΦΜ έχει EU πρόθεμα (${match[1]}) αλλά η χώρα (${country}) δεν είναι EU.`
            };
        }
    }

    // 🔹 Non-EU → ΔΕΝ κάνουμε prefix validation
    return { valid: true };
}

function validateEuVatFormat(country, taxId) {
    if (!country || !taxId) {
        return { valid: true };
    }

    // Αν δεν είναι EU χώρα → δεν ελέγχουμε μορφή
    if (!euCountries.includes(country)) {
        return { valid: true };
    }

    const result = checkVAT(taxId, countries);

    if (!result.isValid) {
        return {
            valid: false,
            error: 'Μη έγκυρη μορφή ΑΦΜ (EU VAT).'
        };
    }

    return { valid: true };
}

function splitEuVat(country, taxId) {
    const clean = taxId.trim().toUpperCase();
    const prefix = country === 'GR' ? 'EL' : country;

    if (clean.startsWith(prefix)) {
        return {
            countryCode: prefix,
            vatNumber: clean.slice(prefix.length)
        };
    }

    return {
        countryCode: prefix,
        vatNumber: clean
    };
}


module.exports = { getTaxType, validateTaxPrefix, validateEuVatFormat, splitEuVat };