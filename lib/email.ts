
import nodemailer from 'nodemailer';

interface SendEmailParams {
    to: string;
    subject: string;
    text: string; // Plain text version for better deliverability
    html: string;
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD,
    },
});

export async function sendEmail({ to, subject, text, html }: SendEmailParams) {
    if (!process.env.GMAIL_USER || (!process.env.GMAIL_APP_PASSWORD && !process.env.GMAIL_PASSWORD)) {
        console.warn('Gmail credentials not found in environment variables. Email sending skipped.');
        console.log('Would have sent email to:', to);
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: `"EmFulfill Support" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            text, // Include text version
            html,
        });
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

export async function sendVerificationEmail(email: string, code: string) {
    const subject = 'Verify your EmFulfill account';

    // Plain text version is crucial for anti-spam filters
    const text = `Welcome!\n\nPlease use the following code to verify your account:\n${code}\n\nIf you didn't request this, please ignore this email.`;

    const html = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #333; margin-top: 0;">Welcome to EmFulfill!</h2>
            <p style="color: #666; font-size: 16px;">Please use the following code to verify your account:</p>
            <div style="background-color: #f0f7ff; border: 1px solid #d0e3ff; padding: 20px; text-align: center; border-radius: 8px; font-size: 32px; letter-spacing: 5px; font-weight: bold; color: #0052cc; margin: 20px 0;">
                ${code}
            </div>
            <p style="color: #999; font-size: 14px; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #aaa; font-size: 12px; text-align: center;">EmFulfill Inc.</p>
        </div>
    `;
    return sendEmail({ to: email, subject, text, html });
}
