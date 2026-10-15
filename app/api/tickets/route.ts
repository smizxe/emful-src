
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { attachRefundAmounts } from '@/lib/ticketRefunds';

export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const tickets = await prisma.ticket.findMany({
            where: { userId },
            include: {
                order: { select: { orderCode: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        const withRefunds = await attachRefundAmounts(tickets);
        return NextResponse.json(withRefunds);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}
