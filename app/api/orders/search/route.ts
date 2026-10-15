import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Seller-scoped order lookup for the ticket order-ID typeahead.
 * Only returns orders belonging to the caller's own seller account.
 */
export async function GET(req: NextRequest) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!user.sellerId) {
        // Admin/staff have no seller account; this endpoint is for sellers only.
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const q = (req.nextUrl.searchParams.get('q') || '').trim();

    if (!q) {
        return NextResponse.json({ orders: [] });
    }

    const orders = await prisma.order.findMany({
        where: {
            sellerId: user.sellerId,
            orderCode: { contains: q, mode: 'insensitive' },
        },
        select: {
            id: true,
            orderCode: true,
            status: true,
            shippingStatus: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    return NextResponse.json({ orders });
}
