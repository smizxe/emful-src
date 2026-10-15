
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { stripDuplicateOrderSuffix } from '@/lib/orderCodes';
import { getDefaultShippingStatus } from '@/lib/shippingStatus';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const { id } = await context.params;
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                seller: true,
                jobs: true
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json(order);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const { id } = await context.params;
        const body = await request.json();

        // Update all jobs associated with this order with the new address info
        if (body.recipientName || body.street1) {
            await prisma.job.updateMany({
                where: { orderId: id },
                data: {
                    recipientName: body.recipientName,
                    phone: body.phone,
                    address1: body.street1, // Mapping street1 -> address1
                    city: body.city,
                    state: body.provinceCode, // Mapping provinceCode -> state
                    zip: body.postalCode, // Mapping postalCode -> zip
                    country: body.countryCode, // Mapping countryCode -> country
                }
            });
        }

        // Update Order Details (Tracking/Carrier)
        if (body.trackingNumber !== undefined || body.carrier !== undefined) {
            const targetOrder = await prisma.order.findUnique({
                where: { id },
                select: { orderCode: true }
            });

            if (!targetOrder) {
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }

            const baseOrderCode = stripDuplicateOrderSuffix(targetOrder.orderCode);
            const relatedOrders = await prisma.order.findMany({
                where: {
                    OR: [
                        { orderCode: baseOrderCode },
                        { orderCode: { startsWith: `${baseOrderCode}(` } }
                    ]
                },
                select: {
                    id: true,
                    trackingNumber: true
                }
            });

            const resolvedTrackingNumber = body.trackingNumber !== undefined
                ? body.trackingNumber
                : (relatedOrders[0]?.trackingNumber || null);
            const resolvedShippingStatus = getDefaultShippingStatus(resolvedTrackingNumber);

            await prisma.order.updateMany({
                where: { id: { in: relatedOrders.map((order) => order.id) } },
                data: {
                    trackingNumber: resolvedTrackingNumber,
                    carrier: body.carrier,
                    shippingStatus: resolvedShippingStatus
                }
            });

            await prisma.shipment.updateMany({
                where: { orderId: { in: relatedOrders.map((order) => order.id) } },
                data: {
                    trackingNumber: resolvedTrackingNumber,
                    carrier: body.carrier,
                    status: resolvedShippingStatus
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Order Update Error:", error);
        return NextResponse.json({ error: 'Failed to update order details' }, { status: 500 });
    }
}
