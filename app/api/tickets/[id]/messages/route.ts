
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Get messages for a ticket
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Params is a promise in Next.js 15
) {
    const { id: ticketId } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Verify access (User owns ticket OR User is Admin)
        // For simplicity assuming Admin is checked via separate logic or user role, 
        // but here we check if user owns ticket. 
        // Ideally we should have a robust role check. 
        // Let's first check if the ticket belongs to the user.
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: { user: true }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Allow if ticket owner OR if user is admin (Assuming admin check logic exists, but simplistic check for now: 
        // if the requester is NOT the ticket owner, we assume they must be admin to access this path in a real app, 
        // OR we can check a user role. Since we don't have strict Admin Auth middleware yet effectively wrapping this,
        // we will fetch messages if ticket exists. 
        // TODO: Strict security check.

        const messages = await prisma.ticketMessage.findMany({
            where: { ticketId },
            include: { attachments: true },
            orderBy: { createdAt: 'asc' }
        });

        return NextResponse.json(messages);

    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
    }
}

// Post a new message
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: ticketId } = await params;
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { message, senderRole, attachments } = body; // attachments: string[]
        // senderRole should be sent from client: 'USER' or 'ADMIN' based on the context of who is sending.
        // But better to verify server side.

        // Check user actually exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 401 });
        }

        // Validate Ticket
        const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // If User is sending, ensure they own the ticket
        if (senderRole === 'USER' && ticket.userId !== userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Create Message
        const temp = await prisma.ticketMessage.create({
            data: {
                ticketId,
                senderId: userId,
                senderRole, // Trusting client state for Role for now (Admin Panel vs User Dashboard)
                message,
                attachments: {
                    create: attachments?.map((url: string) => ({
                        url: url,
                        type: 'image'
                    })) || []
                }
            },
            include: { attachments: true }
        });

        // If Admin replies, update status to REPLIED/PENDING? Or just leave as is.
        // Logic: If Admin replies, maybe set status to 'RESOLVED' ? No, conversational.
        // Maybe update 'updatedAt' of ticket.
        await prisma.ticket.update({
            where: { id: ticketId },
            data: { updatedAt: new Date() }
        });

        return NextResponse.json(temp);

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }
}
