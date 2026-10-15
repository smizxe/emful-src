
import { sendEmail } from './email';
import { prisma } from '@/lib/prisma'; // Ensure correct import path

// Helper to get Admin Email (could be env var or hardcoded for now)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'admin@egfulfill.com';
const IMPORT_NOTIFICATION_EMAIL = process.env.IMPORT_NOTIFICATION_EMAIL || 'emfulfill@gmail.com';

/**
 * Notify Admin when a new User/Seller registers
 */
export async function notifyAdminNewUser(email: string, name: string) {
    const subject = `[New User] ${name} has registered`;
    const text = `A new user has registered.\n\nName: ${name}\nEmail: ${email}\n\nPlease check the Admin Panel to approve if necessary.`;
    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #0044cc;">New User Registration</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p>Please check the Admin Panel.</p>
        </div>
    `;

    try {
        // 1. Send Email
        await sendEmail({ to: ADMIN_EMAIL, subject, text, html });
        console.log(`Notification sent to Admin for new user: ${email}`);

        // 2. Create DB Notification
        await prisma.notification.create({
            data: {
                type: 'REGISTER',
                title: 'New User Registration',
                message: `${name} (${email}) has registered.`,
                link: '/admin/users' // Redirect to users page
            }
        });
    } catch (error) {
        console.error('Failed to send Admin notification (New User):', error);
    }
}

/**
 * Notify Admin (and optionally User) about Top-up Request
 */
export async function notifyTopup(
    userEmail: string,
    amount: number,
    currency: string,
    type: 'REQUEST' | 'APPROVED' | 'REJECTED'
) {
    // 1. Notify Admin on REQUEST
    if (type === 'REQUEST') {
        const subject = `[Top-up Request] ${userEmail} - ${amount} ${currency}`;
        const text = `User ${userEmail} requested a top-up of ${amount} ${currency}. Please review evidence and approve.`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #28a745;">New Top-up Request</h2>
                <p><strong>User:</strong> ${userEmail}</p>
                <p><strong>Amount:</strong> ${amount} ${currency}</p>
                <p>Please review and approve in the Admin Panel.</p>
            </div>
        `;
        try {
            await sendEmail({ to: ADMIN_EMAIL, subject, text, html });

            await prisma.notification.create({
                data: {
                    type: 'TOPUP',
                    title: 'New Top-up Request',
                    message: `${userEmail} requested ${amount} ${currency}.`,
                    link: '/admin/wallet'
                }
            });
        } catch (e) {
            console.error('Failed to notify Admin (Top-up):', e);
        }
    }

    // 2. Notify User on APPROVED/REJECTED (Optional per requirement, but good UX)
    // Requirement 1: "Notify khi seller tạo account, hay top up. (Báo thêm vào gmail)" -> impling Notify Admin OR User? 
    // Usually means Admin wants to know. User knows because they just performed action. 
    // But let's notify Admin as priority.

    // NOTE: If we want to notify User via In-App (Bell) for APPROVED/REJECTED, we can add logic here later.
    // For now, request focused on Admin Bell.
}

/**
 * Notify Admin and User about Ticket activity
 * Requirement 2: "Notify khi có ticket cho cả seller lẫn admin."
 */
export async function notifyNewTicket(
    ticketId: string,
    subject: string,
    description: string,
    senderEmail: string,
    isFromAdmin: boolean,
    recipientEmail?: string // If Admin creates/replies, notify Seller
) {
    // Case 1: Seller creates ticket -> Notify Admin
    if (!isFromAdmin) {
        const emailSubject = `[New Ticket] ${subject} (from ${senderEmail})`;
        const text = `New ticket from ${senderEmail}.\n\nSubject: ${subject}\nDescription: ${description}`;
        const html = `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #d9534f;">New Support Ticket</h2>
                <p><strong>From:</strong> ${senderEmail}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong><br/>${description}</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/tickets/${ticketId}">View Ticket</a>
            </div>
        `;
        try {
            await sendEmail({ to: ADMIN_EMAIL, subject: emailSubject, text, html });

            await prisma.notification.create({
                data: {
                    type: 'TICKET',
                    title: 'New Ticket Created',
                    message: `${senderEmail}: ${subject}`,
                    link: `/admin/tickets/${ticketId}`
                }
            });
        } catch (e) {
            console.error('Failed to notify Admin (Ticket):', e);
        }
    }
    // Case 2: Admin creates/replies -> Notify Seller (Recipient)
    else if (recipientEmail) {
        const emailSubject = `[Ticket Update] ${subject}`;
        const text = `Admin has updated/created a ticket.\n\nSubject: ${subject}\nMessage: ${description}`;
        const html = `
             <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #0275d8;">Ticket Update</h2>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong><br/>${description}</p>
                 <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/tickets/${ticketId}">View Ticket</a>
            </div>
        `;
        try {
            await sendEmail({ to: recipientEmail, subject: emailSubject, text, html });
            // Optionally, create in-app notification for Seller (if we add userId to Notification model later)
        } catch (e) {
            console.error('Failed to notify Seller (Ticket):', e);
        }
    }
}

export async function notifyOrderImport(params: {
    importerEmail: string;
    importerName?: string | null;
    sellerName?: string | null;
    importedCount: number;
    totalCost: number;
    orderCodes: string[];
}) {
    const {
        importerEmail,
        importerName,
        sellerName,
        importedCount,
        totalCost,
        orderCodes
    } = params;

    const displayName = importerName || importerEmail;
    const sellerLabel = sellerName || 'Unknown Seller';
    const previewCodes = orderCodes.slice(0, 10);
    const remainingCount = Math.max(orderCodes.length - previewCodes.length, 0);
    const orderCodeList = previewCodes.length > 0 ? previewCodes.join(', ') : 'N/A';
    const moreText = remainingCount > 0 ? `\nAnd ${remainingCount} more order(s).` : '';

    const subject = `[Order Import] ${displayName} imported ${importedCount} order(s)`;
    const text = [
        `${displayName} (${importerEmail}) has imported new orders.`,
        `Seller: ${sellerLabel}`,
        `Imported orders: ${importedCount}`,
        `Estimated total: $${totalCost.toFixed(2)}`,
        `Order IDs: ${orderCodeList}${remainingCount > 0 ? `, and ${remainingCount} more` : ''}`
    ].join('\n');

    const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #0f766e;">New Order Import</h2>
            <p><strong>Importer:</strong> ${displayName} (${importerEmail})</p>
            <p><strong>Seller:</strong> ${sellerLabel}</p>
            <p><strong>Imported orders:</strong> ${importedCount}</p>
            <p><strong>Estimated total:</strong> $${totalCost.toFixed(2)}</p>
            <p><strong>Order IDs:</strong> ${orderCodeList}${remainingCount > 0 ? `, and ${remainingCount} more` : ''}</p>
        </div>
    `;

    try {
        await sendEmail({ to: IMPORT_NOTIFICATION_EMAIL, subject, text, html });
        await prisma.notification.create({
            data: {
                type: 'GENERAL',
                title: 'New Order Import',
                message: `${displayName} imported ${importedCount} order(s) for ${sellerLabel}.${moreText}`,
                link: '/admin/orders/approval'
            }
        });
    } catch (error) {
        console.error('Failed to notify Admin (Order Import):', error);
    }
}
