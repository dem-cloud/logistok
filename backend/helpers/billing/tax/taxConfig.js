
// EU VAT
const euCountries = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
    
// Άλλες χώρες
const taxTypes = {
    'GB': { type: 'gb_vat', prefix: 'GB' },
    'CH': { type: 'ch_vat', prefix: 'CHE' },
    'NO': { type: 'no_vat', prefix: '' },
    'AU': { type: 'au_abn', prefix: '' },
    'NZ': { type: 'nz_gst', prefix: '' },
    'CA': { type: 'ca_bn', prefix: '' },
    'US': { type: 'us_ein', prefix: '' },
    'IN': { type: 'in_gst', prefix: '' },
    'JP': { type: 'jp_cn', prefix: '' },
    'KR': { type: 'kr_brn', prefix: '' },
    'SG': { type: 'sg_uen', prefix: '' },
    'MY': { type: 'my_sst', prefix: '' },
    'TH': { type: 'th_vat', prefix: '' },
    'AE': { type: 'ae_trn', prefix: '' },
    'SA': { type: 'sa_vat', prefix: '' },
    'BR': { type: 'br_cnpj', prefix: '' },
    'MX': { type: 'mx_rfc', prefix: '' },
    'CL': { type: 'cl_tin', prefix: '' },
};

module.exports = { euCountries, taxTypes };