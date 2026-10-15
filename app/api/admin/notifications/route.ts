
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

// GET: Fetch recent notifications (unread first)
export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);

        if (searchParams.get('summary') === 'true') {
            const [pendingOrders, pendingTopups, pendingTickets] = await Promise.all([
                prisma.order.count({
                    where: { status: 'PENDING_APPROVAL' }
                }),
                prisma.topupRequest.count({
                    where: { status: 'PENDING' }
                }),
                prisma.ticket.count({
                    where: { status: 'PENDING' }
                })
            ]);

            const response = NextResponse.json({ pendingOrders, pendingTopups, pendingTickets });
            response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
            return response;
        }

        const notifications = await prisma.notification.findMany({
            orderBy: [
                { isRead: 'asc' }, // Unread First
                { createdAt: 'desc' } // Then Newest
            ],
            take: 20, // Limit to recent 20
        });
        const response = NextResponse.json(notifications);
        response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
        return response;
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }
}

// PATCH: Mark one or all as read
export async function PATCH(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { id, markAll } = body;

        if (markAll) {
            await prisma.notification.updateMany({
                where: { isRead: false },
                data: { isRead: true },
            });
            return NextResponse.json({ success: true, message: 'All marked as read' });
        }

        if (id) {
            await prisma.notification.update({
                where: { id },
                data: { isRead: true },
            });
            return NextResponse.json({ success: true, message: 'Marked as read' });
        }

        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }
}
