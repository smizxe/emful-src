import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { stripDuplicateOrderSuffix } from '@/lib/orderCodes';
import { normalizeShippingStatus } from '@/lib/shippingStatus';

export async function POST(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const body = await request.json();
        const { updates } = body; // Array of { orderCode, trackingNumber, carrier, shippingStatus }

        if (!updates || !Array.isArray(updates)) {
            return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
        }

        const groupedUpdates = new Map<string, { orderCode: string; trackingNumber: string; carrier?: string; shippingStatus?: string }>();
        for (const update of updates) {
            const orderCode = String(update?.orderCode ?? '').trim();
            const trackingNumber = String(update?.trackingNumber ?? '').trim();

            if (!orderCode || !trackingNumber) {
                continue;
            }

            groupedUpdates.set(stripDuplicateOrderSuffix(orderCode), {
                orderCode,
                trackingNumber,
                carrier: update?.carrier,
                shippingStatus: update?.shippingStatus,
            });
        }

        let successCount = 0;
        let notFoundCount = 0;
        const failedOrders: string[] = [];
        const updatedOrderIds = new Set<string>();

        for (const update of groupedUpdates.values()) {
            const { orderCode, trackingNumber, carrier, shippingStatus } = update;
            const baseOrderCode = stripDuplicateOrderSuffix(orderCode);

            try {
                const orders = await prisma.order.findMany({
                    where: {
                        OR: [
                            { orderCode: baseOrderCode },
                            { orderCode: { startsWith: `${baseOrderCode}(` } },
                        ],
                    },
                    select: {
                        id: true,
                        shippingStatus: true,
                    }
                });

                if (orders.length > 0) {
                    await prisma.$transaction(async (tx) => {
                        for (const order of orders) {
                            // Wording the file uses that we do not recognise must not
                            // overwrite a status the order already has.
                            const nextStatus = normalizeShippingStatus(
                                shippingStatus, trackingNumber, order.shippingStatus);

                            await tx.order.update({
                                where: { id: order.id },
                                data: {
                                    trackingNumber: String(trackingNumber),
                                    carrier: carrier || 'Stallion Express',
                                    shippingStatus: nextStatus,
                                }
                            });
                        }

                        for (const order of orders) {
                            const nextStatus = normalizeShippingStatus(
                                shippingStatus, trackingNumber, order.shippingStatus);
                            const latestShipment = await tx.shipment.findFirst({
                                where: { orderId: order.id },
                                orderBy: { createdAt: 'desc' }
                            });

                            if (latestShipment) {
                                await tx.shipment.update({
                                    where: { id: latestShipment.id },
                                    data: {
                                        carrier: carrier || 'Stallion Express',
                                        trackingNumber: String(trackingNumber),
                                        status: nextStatus,
                                    }
                                });
                            } else {
                                await tx.shipment.create({
                                    data: {
                                        orderId: order.id,
                                        carrier: carrier || 'Stallion Express',
                                        trackingNumber: String(trackingNumber),
                                        status: nextStatus,
                                    }
                                });
                            }
                        }
                    });

                    orders.forEach((order) => updatedOrderIds.add(order.id));
                    successCount += orders.length;
                } else {
                    notFoundCount++;
                    failedOrders.push(orderCode);
                }
            } catch (error) {
                console.error(`Error updating order ${orderCode}:`, error);
                failedOrders.push(orderCode);
            }
        }

        return NextResponse.json({
            success: true,
            importedCount: successCount,
            updatedGroups: groupedUpdates.size,
            updatedOrderCount: updatedOrderIds.size,
            notFoundCount: notFoundCount,
            failedOrders: failedOrders.slice(0, 10) // Return first 10 failed IDs for brevity
        });

    } catch (error: any) {
        console.error("Import Tracking Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
