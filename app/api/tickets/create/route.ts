import { prisma } from '@/lib/prisma';
import { notifyNewTicket } from '@/lib/notifications';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { orderId, subject, description, attachments } = body;

        const ticket = await prisma.ticket.create({
            data: {
                userId,
                orderId: orderId || null, // Handle explicit null or undefined
                subject,
                description,
                status: 'PENDING',
                messages: {
                    create: {
                        senderId: userId,
                        senderRole: 'USER',
                        message: description || 'No description provided',
                        attachments: {
                            create: (attachments || []).map((url: string) => ({
                                url: url,
                                type: 'image'
                            }))
                        }
                    }
                }
            }
        });

        const userEmail = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

        // Notify Admin
        await notifyNewTicket(
            ticket.id,
            ticket.subject || 'No Subject',
            ticket.description || '',
            userEmail?.email || 'Unknown User',
            false // Is NOT Admin
        );

        return NextResponse.json(ticket);
    } catch (error) {
        console.error('Create Ticket Error:', error);
        return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }
}
