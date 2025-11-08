import { NextRequest, NextResponse } from 'next/server';
// import sendGridMail from '@sendgrid/mail';
import { Resend } from 'resend';

// const apiKey = process.env.SENDGRID_API_KEY;
// sendGridMail.setApiKey(apiKey);
const resend = new Resend(process.env.RESEND_API_KEY);


// Ensure required email environment variables are set
// const recipientEmail = process.env.RECIPIENT_EMAIL;
const recipientEmail = process.env.RESEND_EMAIL;

if (!recipientEmail) {
    throw new Error('Recipient or Sender email is not defined in the environment variables.');
}

// TODO: Implement this to backend and delete it. Also we might need a contactTo table in db to store which customer we have to contact.
export async function POST(req: NextRequest) {
    const { fullName, companyName, email, phone, message } = await req.json();
    
    const msg = {
        to: recipientEmail as string,
        from: email,
        subject: `Υποβολή Φόρμας Επικοινωνίας από ${fullName}`,
        text: `
            Ονοματεπώνυμο: ${fullName}
            Επωνυμία Εταιρείας: ${companyName || "N/A"}
            Διεύθυνση Email: ${email}
            Αριθμός Τηλεφώνου: ${phone || 'N/A'}
            Μήνυμα: ${message}
        `,
    };

    try {
        // await sendGridMail.send(msg);
        await resend.emails.send(msg);
        return NextResponse.json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ message: 'Error sending email' }, { status: 500 });
    }
}
