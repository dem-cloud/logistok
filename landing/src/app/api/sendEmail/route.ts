import { NextRequest, NextResponse } from 'next/server';
import sendGridMail from '@sendgrid/mail';

const apiKey = process.env.SENDGRID_API_KEY;

if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is not defined in the environment variables.');
}

sendGridMail.setApiKey(apiKey);

// Ensure required email environment variables are set
const recipientEmail = process.env.RECIPIENT_EMAIL;
const senderEmail = process.env.SENDGRID_FROM_EMAIL;

if (!recipientEmail || !senderEmail) {
    throw new Error('Recipient or Sender email is not defined in the environment variables.');
}


export async function POST(req: NextRequest) {
    const { fullName, companyName, email, phone, message } = await req.json();
    
    const msg = {
        to: recipientEmail as string,
        from: senderEmail as string,
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
        await sendGridMail.send(msg);
        return NextResponse.json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ message: 'Error sending email' }, { status: 500 });
    }
}
