import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateApiKey } from '@/lib/apiAuth';

// GET /api/v1/orders/{orderCode} — full detail of one order, scoped to the
// authenticated seller (incl. line items, status and tracking).
export async function GET(request: Request, props: { params: Promise<{ orderCode: string }> }) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { orderCode } = await props.params;

    const order = await prisma.order.findFirst({
        where: { orderCode, sellerId: auth.sellerId },
        include: {
            jobs: {
                select: {
                    jobCode: true, sku: true, color: true, size: true, qty: true,
                    status: true, designs: true, shippingLabel: true, notes: true,
                    recipientName: true,
                },
            },
        },
    });

    if (!order) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const parseDesigns = (s: string) => { try { const d = JSON.parse(s || '[]'); return Array.isArray(d) ? d : []; } catch { return []; } };

    return NextResponse.json({
        orderCode: order.orderCode,
        status: order.status,
        shippingStatus: order.shippingStatus,
        totalAmount: order.totalAmount,
        currency: order.currency,
        trackingNumber: order.trackingNumber || null,
        carrier: order.carrier || null,
        shippingCountry: order.shippingCountry || null,
        shippingMethod: order.shippingMethod || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.jobs.map((j) => ({
            jobCode: j.jobCode,
            sku: j.sku,
            sellerSku: j.shippingLabel || null,
            color: j.color || null,
            size: j.size || null,
            qty: j.qty,
            status: j.status,
            recipientName: j.recipientName || null,
            notes: j.notes || null,
            designs: parseDesigns(j.designs).map((d: any) => ({
                url: d.url, position: d.location || d.position || null, type: d.type || null, mockup: d.mockup || null,
            })),
        })),
    });
}
