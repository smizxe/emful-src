import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateApiKey } from '@/lib/apiAuth';
import { createApiOrders, type ApiOrderInput } from '@/lib/apiOrders';

// GET /api/v1/orders — list the authenticated seller's orders.
// Query: status, from (ISO date), to (ISO date), limit (<=100), offset.
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status')?.trim().toUpperCase();
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

    const where: any = { sellerId: auth.sellerId };
    if (status) where.status = status;
    if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = new Date(from);
        if (to) where.createdAt.lte = new Date(to);
    }

    const [total, orders] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                orderCode: true,
                status: true,
                shippingStatus: true,
                totalAmount: true,
                currency: true,
                trackingNumber: true,
                carrier: true,
                shippingCountry: true,
                createdAt: true,
                _count: { select: { jobs: true } },
            },
        }),
    ]);

    const data = orders.map((o) => ({
        orderCode: o.orderCode,
        status: o.status,
        shippingStatus: o.shippingStatus,
        totalAmount: o.totalAmount,
        currency: o.currency,
        trackingNumber: o.trackingNumber || null,
        carrier: o.carrier || null,
        shippingCountry: o.shippingCountry || null,
        itemCount: o._count.jobs,
        createdAt: o.createdAt,
    }));

    return NextResponse.json({ data, pagination: { total, limit, offset } });
}

// POST /api/v1/orders — create one or more orders. Accepts a single order
// ({ originalId, items, shippingAddress }) or { orders: [...] }. Prices are
// computed server-side; orders start in PENDING_APPROVAL.
export async function POST(request: Request) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let body: any;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const inputs: ApiOrderInput[] = Array.isArray(body?.orders)
        ? body.orders
        : (body && (body.items || body.originalId)) ? [body] : [];
    if (inputs.length === 0) {
        return NextResponse.json({ error: 'Provide an order ({ originalId, items, shippingAddress }) or { orders: [...] }' }, { status: 400 });
    }

    const seller = await prisma.seller.findUnique({ where: { id: auth.sellerId }, include: { wallet: true } });
    const result = await createApiOrders(inputs, auth.sellerId, seller?.wallet ?? null);

    if (!result.ok) {
        return NextResponse.json({ error: result.error, ...(result.errors ? { details: result.errors } : {}) }, { status: result.status });
    }
    return NextResponse.json({ status: 'Orders created', created: result.created }, { status: 201 });
}
