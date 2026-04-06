const soap = require('soap');

const VIES_WSDL = 'https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl';
const VIES_TIMEOUT = 5000; // 5 seconds

// Helper: Validate via VIES
async function validateViaVies(countryCode, vatNumber) {
    return new Promise((resolve) => {
        soap.createClient(VIES_WSDL, { wsdl_options: { timeout: VIES_TIMEOUT } }, (err, client) => {
            if (err || !client) {
                resolve({ success: false, error: 'VIES unavailable' });
                return;
            }

            client.checkVat({ countryCode, vatNumber }, (err, result) => {
                if (err) {
                    resolve({ success: false, error: err.message });
                    return;
                }

                resolve({
                    success: true,
                    valid: result.valid,
                    // name: result.name,
                    // address: result.address
                });
            });
        });
    });
}

module.exports = { validateViaVies };