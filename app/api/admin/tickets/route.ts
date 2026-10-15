import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { attachRefundAmounts } from '@/lib/ticketRefunds';

export async function GET(req: NextRequest) {
    const adminGuardResponse = await requireStaffOrAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status');

        const where: any = {};
        if (status && status !== 'ALL') {
            where.status = status;
        }

        const tickets = await prisma.ticket.findMany({
            where,
            include: {
                user: { select: { email: true, id: true } },
                order: { select: { orderCode: true, id: true, totalAmount: true, currency: true, status: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        const withRefunds = await attachRefundAmounts(tickets);
        return NextResponse.json(withRefunds);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
    }
}
