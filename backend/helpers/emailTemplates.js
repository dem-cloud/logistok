// emailTemplates.js

function generateVerificationEmail(code) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border-radius: 8px; background: #ffffff; border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; text-align: center; margin-bottom: 16px;">
            Επιβεβαίωση Email
        </h2>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Γεια σας,<br><br>
            Για να ολοκληρώσετε την εγγραφή σας στο <strong>Olyntos</strong>,
            χρησιμοποιήστε τον παρακάτω κωδικό επιβεβαίωσης:
        </p>

        <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #111827; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 12px 24px; border-radius: 6px;">
                ${code}
            </div>
        </div>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Ο κωδικός ισχύει για <strong>10 λεπτά</strong>.
            Αν δεν ζητήσατε εσείς την επιβεβαίωση, αγνοήστε αυτό το email.
        </p>

        <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            Καλή συνέχεια,<br>
            Η ομάδα του <strong>Olyntos</strong>
        </p>
    </div>
    `;
}


function generatePasswordResetEmail(code) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border-radius: 8px; background: #ffffff; border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; text-align: center; margin-bottom: 16px;">
            Επαναφορά Κωδικού Πρόσβασης
        </h2>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Γεια σας,<br><br>
            Έχετε ζητήσει επαναφορά του κωδικού πρόσβασής σας στο <strong>Olyntos</strong>.
            Χρησιμοποιήστε τον παρακάτω κωδικό για να προχωρήσετε:
        </p>

        <div style="text-align: center; margin: 32px 0;">
            <div style="display: inline-block; background: #111827; color: #ffffff; font-size: 28px; font-weight: bold; letter-spacing: 4px; padding: 12px 24px; border-radius: 6px;">
                ${code}
            </div>
        </div>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Ο κωδικός λήγει σε <strong>10 λεπτά</strong> για λόγους ασφαλείας.<br>
            Αν δεν ζητήσατε επαναφορά, αγνοήστε αυτό το μήνυμα.
        </p>

        <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            Με εκτίμηση,<br>
            Η ομάδα του <strong>Olyntos</strong>
        </p>
    </div>
    `;
}

// Welcome Email - Dynamic for Free & Paid plans
const getWelcomeEmail = (companyName, planName, isFree, nextPaymentDate = null) => ({
    subject: `Welcome to Olyntos - ${planName} plan`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 40px; }
                .logo { font-size: 24px; font-weight: bold; color: #000; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
                .highlight { background: #fff; padding: 15px; border-left: 4px solid #000; margin: 20px 0; }
                .button { background: #000; color: #fff !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
                h1 { color: #333; margin-bottom: 10px; }
                p { color: #666; line-height: 1.6; margin: 10px 0; }
                .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Olyntos</div>
                </div>
                <div class="content">
                    <h1>🎉 Καλωσήρθες στο Olyntos!</h1>
                    <p>Γεια σας,</p>
                    <p>Χαιρόμαστε που η εταιρεία <strong>${companyName}</strong> ξεκίνησε τη χρήση του <strong>${planName}</strong> plan!</p>
                    
                    ${!isFree ? `
                        <div class="highlight">
                            <p style="margin: 0; color: #333;">
                                ✓ Η μέθοδος πληρωμής σας χρεώθηκε επιτυχώς<br>
                                ✓ Επόμενη χρέωση: <strong>${nextPaymentDate}</strong>
                            </p>
                        </div>
                        <p>Θα λαμβάνετε απόδειξη email κάθε φορά που γίνεται χρέωση.</p>
                    ` : `
                        <div class="highlight">
                            <p style="margin: 0; color: #333;">
                                Απολαμβάνετε το Free plan χωρίς καμία χρέωση! 🎁
                            </p>
                        </div>
                    `}
                    
                    <p>Μπορείτε να διαχειριστείτε τη συνδρομή και τις ρυθμίσεις σας ανά πάσα στιγμή.</p>
                    <a href="${process.env.FRONTEND_URL}/dashboard" class="button">Μετάβαση στο Dashboard</a>
                </div>
                <div class="footer">
                    <p>Χρειάζεστε βοήθεια; <a href="${process.env.FRONTEND_URL}/support" style="color: #666;">Επικοινωνήστε μαζί μας</a></p>
                </div>
            </div>
        </body>
        </html>
    `
});

// Payment Receipt Email (για κάθε μηνιαία χρέωση)
const getPaymentReceiptEmail = (companyName, amount, currency, invoiceNumber, periodStart, periodEnd, receiptUrl, invoiceUrl) => ({
    subject: `Απόδειξη πληρωμής #${invoiceNumber} - Olyntos`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 40px; background: #f5f5f5; padding: 30px; border-radius: 8px; }
                .logo { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .amount { font-size: 36px; font-weight: bold; margin: 20px 0; color: #000; }
                .details { background: #fff; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
                .row:last-child { border-bottom: none; }
                .links { margin-top: 30px; text-align: center; }
                .link { display: inline-block; margin: 0 15px; padding: 10px 20px; color: #0066cc; text-decoration: none; border: 1px solid #0066cc; border-radius: 6px; }
                .link:hover { background: #0066cc; color: #fff; }
                .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Olyntos</div>
                    <p style="color: #666; margin: 5px 0;">Απόδειξη Πληρωμής</p>
                    <div class="amount">€${amount}</div>
                    <p style="color: #666; font-size: 14px;">Πληρώθηκε στις ${new Date().toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                
                <p>Σας ευχαριστούμε για την πληρωμή σας! Παρακάτω θα βρείτε τα στοιχεία της συναλλαγής για την <strong>${companyName}</strong>:</p>
                
                <table style="width: 100%; background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0; border-collapse: separate; border-spacing: 0; overflow: hidden;">
                    <tr>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; color: #666;">Αριθμός απόδειξης</td>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right;"><strong>${invoiceNumber}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; color: #666;">Περίοδος συνδρομής</td>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right;"><strong>${periodStart} - ${periodEnd}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; color: #666;">Ποσό</td>
                        <td style="padding: 15px; border-bottom: 1px solid #f0f0f0; text-align: right;"><strong>€${amount}</strong></td>
                    </tr>
                    <tr>
                        <td style="padding: 15px; color: #666;">Εταιρεία</td>
                        <td style="padding: 15px; text-align: right;"><strong>${companyName}</strong></td>
                    </tr>
                </table>
                
                <div class="links">
                    <a href="${invoiceUrl}" class="link">📄 Λήψη Invoice</a>
                    <a href="${receiptUrl}" class="link">🧾 Λήψη Απόδειξης</a>
                </div>
                
                <div class="footer">
                    <p>Ερωτήσεις; <a href="${process.env.FRONTEND_URL}/support" style="color: #666;">Επισκεφθείτε το support</a></p>
                    <p style="margin-top: 20px;">© ${new Date().getFullYear()} Olyntos. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
});

// Payment Failed Email
const getPaymentFailedEmail = (companyName, amount, currency, invoiceNumber, failureReason, retryDate) => ({
    subject: `⚠️ Αποτυχία Πληρωμής - Απαιτείται Ενέργεια`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 40px; background: #fee; padding: 30px; border-radius: 8px; border: 2px solid #dc2626; }
                .logo { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
                .warning-icon { font-size: 48px; margin-bottom: 10px; }
                .amount { font-size: 32px; font-weight: bold; margin: 15px 0; color: #dc2626; }
                .content { background: #fff; padding: 25px; border-radius: 8px; border: 1px solid #e0e0e0; margin: 20px 0; }
                .alert-box { background: #fff3cd; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .alert-box p { margin: 5px 0; color: #92400e; }
                .button { background: #dc2626; color: #fff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: 600; }
                .button:hover { background: #b91c1c; }
                .info-table { width: 100%; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0; border-collapse: separate; border-spacing: 0; overflow: hidden; }
                .info-table td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; }
                .info-table tr:last-child td { border-bottom: none; }
                .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
                .support-link { color: #0066cc; text-decoration: none; font-weight: 600; }
                h2 { color: #dc2626; margin: 0 0 10px 0; }
                ul { margin: 10px 0; padding-left: 20px; }
                li { margin: 8px 0; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="warning-icon">⚠️</div>
                    <div class="logo">Olyntos</div>
                    <h2>Αποτυχία Πληρωμής</h2>
                    <div class="amount">€${amount}</div>
                    <p style="color: #666; font-size: 14px; margin: 5px 0;">Invoice #${invoiceNumber}</p>
                </div>
                
                <div class="content">
                    <p style="font-size: 16px; margin-bottom: 15px;">Αγαπητέ πελάτη της <strong>${companyName}</strong>,</p>
                    
                    <p>Δυστυχώς, δεν μπορέσαμε να ολοκληρώσουμε την ανανέωση της συνδρομής σας στο Olyntos.</p>
                    
                    <div class="alert-box">
                        <p style="margin: 0; font-weight: 600;">⚡ Λόγος αποτυχίας:</p>
                        <p style="margin: 5px 0 0 0;">${failureReason || 'Η κάρτα σας απορρίφθηκε'}</p>
                    </div>

                    <table class="info-table">
                        <tr>
                            <td style="color: #666; width: 50%;">Ποσό που οφείλεται</td>
                            <td style="text-align: right;"><strong>€${amount}</strong></td>
                        </tr>
                        <tr>
                            <td style="color: #666;">Αριθμός τιμολογίου</td>
                            <td style="text-align: right;"><strong>${invoiceNumber}</strong></td>
                        </tr>
                        ${retryDate ? `
                        <tr>
                            <td style="color: #666;">Επόμενη προσπάθεια</td>
                            <td style="text-align: right;"><strong>${retryDate}</strong></td>
                        </tr>
                        ` : ''}
                    </table>

                    <h3 style="color: #333; margin: 25px 0 15px 0;">Τι πρέπει να κάνετε:</h3>
                    <ul>
                        <li>Ελέγξτε ότι η κάρτα σας έχει επαρκή διαθέσιμα</li>
                        <li>Βεβαιωθείτε ότι τα στοιχεία της κάρτας είναι ενημερωμένα</li>
                        <li>Επικοινωνήστε με την τράπεζά σας αν το πρόβλημα επιμένει</li>
                    </ul>

                    <p style="margin-top: 20px;">Για να αποφύγετε τη διακοπή των υπηρεσιών σας, παρακαλούμε ενημερώστε τη μέθοδο πληρωμής σας το συντομότερο δυνατό.</p>

                    <div style="text-align: center;">
                        <a href="${process.env.FRONTEND_URL}/settings/billing" class="button">Ενημέρωση Μεθόδου Πληρωμής</a>
                    </div>
                </div>

                ${retryDate ? `
                <div style="background: #f0f9ff; border: 1px solid #0284c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                    <p style="margin: 0; color: #075985;">
                        <strong>ℹ️ Αυτόματη Επανάληψη:</strong><br>
                        Θα προσπαθήσουμε αυτόματα να χρεώσουμε την κάρτα σας ξανά στις <strong>${retryDate}</strong>.
                        Αν η πληρωμή αποτύχει ξανά, η πρόσβαση στο λογαριασμό σας ενδέχεται να περιοριστεί.
                    </p>
                </div>
                ` : ''}
                
                <div class="footer">
                    <p>Χρειάζεστε βοήθεια; <a href="${process.env.FRONTEND_URL}/support" class="support-link">Επικοινωνήστε με το Support</a></p>
                    <p style="margin-top: 20px;">© ${new Date().getFullYear()} Olyntos. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
});

// Subscription Canceled Email
const getSubscriptionCanceledEmail = (companyName) => ({
    subject: `Η συνδρομή σας ακυρώθηκε - ${companyName}`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                .header { text-align: center; margin-bottom: 40px; }
                .logo { font-size: 24px; font-weight: bold; color: #3F72E7; }
                .content { background: #f9fafb; padding: 30px; border-radius: 8px; }
                .button { background: #3F72E7; color: #fff !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: 600; }
                .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">Olyntos</div>
                </div>
                
                <div class="content">
                    <h2>Η συνδρομή σας ακυρώθηκε</h2>
                    
                    <p>Αγαπητέ πελάτη της <strong>${companyName}</strong>,</p>
                    
                    <p>Η συνδρομή σας στο Olyntos έχει ακυρωθεί. Ο λογαριασμός σας έχει μεταφερθεί στο δωρεάν πλάνο Basic.</p>
                    
                    <p><strong>Τι σημαίνει αυτό:</strong></p>
                    <ul>
                        <li>Τα premium features έχουν απενεργοποιηθεί</li>
                        <li>Τα πρόσθετα (plugins) έχουν απενεργοποιηθεί</li>
                        <li>Τα δεδομένα σας παραμένουν ασφαλή</li>
                    </ul>
                    
                    <p>Μπορείτε να επανενεργοποιήσετε τη συνδρομή σας ανά πάσα στιγμή.</p>
                    
                    <div style="text-align: center;">
                        <a href="${process.env.FRONTEND_URL}/settings/subscription" class="button">Επανενεργοποίηση Συνδρομής</a>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Ευχαριστούμε που χρησιμοποιήσατε το Olyntos.</p>
                    <p>© ${new Date().getFullYear()} Olyntos. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `
});

module.exports = {
    generateVerificationEmail,
    generatePasswordResetEmail,
    getWelcomeEmail,
    getPaymentReceiptEmail,
    getPaymentFailedEmail,
    getSubscriptionCanceledEmail
};