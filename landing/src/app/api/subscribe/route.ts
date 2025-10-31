import { NextResponse } from "next/server";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const senderEmail = process.env.SENDGRID_FROM_EMAIL;

if (!senderEmail) {
    throw new Error('Recipient or Sender email is not defined in the environment variables.');
}


export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        if (!/^\S+@\S+\.\S+$/.test(email)) {
            return NextResponse.json({ error: "Μη έγκυρο email." }, { status: 400 });
        }

        // SendGrid email setup
        const msg = {
            to: email, // User email
            from: senderEmail as string, // Your verified sender email
            subject: "Επιτυχής εγγραφή στο Newsletter",
            text: "Σας ευχαριστούμε που εγγραφήκατε στο newsletter μας!",
            html: "<p>Σας ευχαριστούμε που εγγραφήκατε στο newsletter μας!</p>",
        };

        await sgMail.send(msg);

        console.log("New subscriber:", email);
        return NextResponse.json({ message: "Επιτυχής εγγραφή!" }, { status: 200 });

    } catch (error) {
        console.error("SendGrid Error:", error);
        return NextResponse.json({ error: "Σφάλμα διακομιστή." }, { status: 500 });
    }
}
