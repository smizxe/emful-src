import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateApiKey } from '@/lib/apiAuth';

// GET /api/v1/orders/{orderCode}/status — lightweight status + tracking lookup.
export async function GET(request: Request, props: { params: Promise<{ orderCode: string }> }) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { orderCode } = await props.params;
    const order = await prisma.order.findFirst({
        where: { orderCode, sellerId: auth.sellerId },
        select: { orderCode: true, status: true, shippingStatus: true, trackingNumber: true, carrier: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    return NextResponse.json({
        orderCode: order.orderCode,
        status: order.status,
        shippingStatus: order.shippingStatus,
        trackingNumber: order.trackingNumber || null,
        carrier: order.carrier || null,
    });
}
