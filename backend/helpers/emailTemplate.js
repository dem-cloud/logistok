// emailTemplates.js

function generateVerificationEmail(code) {
    return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border-radius: 8px; background: #ffffff; border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; text-align: center; margin-bottom: 16px;">
            Επιβεβαίωση Email
        </h2>

        <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Γεια σας,<br><br>
            Για να ολοκληρώσετε την εγγραφή σας στο <strong>Logistok</strong>,
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
            Η ομάδα του <strong>Logistok</strong>
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
            Έχετε ζητήσει επαναφορά του κωδικού πρόσβασής σας στο <strong>Logistok</strong>.
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
            Η ομάδα του <strong>Logistok</strong>
        </p>
    </div>
    `;
}

module.exports = {
    generateVerificationEmail,
    generatePasswordResetEmail
};