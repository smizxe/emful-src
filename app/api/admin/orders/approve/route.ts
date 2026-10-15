import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { getOrderPriorityFee } from '@/lib/priorityFees';

type ChargePositionSummary = {
    position: string;
    type: string;
    amount: number;
};

type OrderRevertMeta = {
    adjustmentAmount?: number;
    adjustmentPositions?: ChargePositionSummary[];
    additionalChargeAmount?: number;
    additionalChargePositions?: ChargePositionSummary[];
};

function safeParseJson<T>(value: string | null | undefined): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function formatPositionAdjustments(positions: ChargePositionSummary[]): string {
    return positions
        .map((position) => {
            const sign = position.amount > 0 ? '+' : '-';
            return `${position.position} (${position.type}: ${sign}$${Math.abs(position.amount).toFixed(2)})`;
        })
        .join(', ');
}

function getOrderGrandTotal(order: {
    jobs: Array<{ qty: number; priceToCharge: number; shippingCost: number; extraFees: number }>;
    priorityProduction?: boolean | null;
    priorityShipping?: boolean | null;
    priorityProductionFee?: number | null;
    priorityShippingFee?: number | null;
}) {
    const jobsTotal = order.jobs.reduce(
        (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
        0
    );
    return Number((jobsTotal + getOrderPriorityFee(order)).toFixed(2));
}

export async function POST(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const body = await request.json();
        const { orderId, action, rejectionReason } = body; // action: 'APPROVE' | 'REJECT'

        if (!orderId || !action) {
            return NextResponse.json({ error: 'Order ID and action (APPROVE/REJECT) are required' }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                jobs: true,
                seller: { include: { wallet: true } }
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        if (order.status !== 'PENDING_APPROVAL') {
            return NextResponse.json({ error: `Order is not pending approval (Current: ${order.status})` }, { status: 400 });
        }

        const latestRevertLog = await prisma.auditLog.findFirst({
            where: {
                action: 'ORDER_REVERT',
                entityType: 'ORDER',
                entityId: orderId
            },
            orderBy: { createdAt: 'desc' }
        });
        const latestRevertMeta = safeParseJson<OrderRevertMeta>(latestRevertLog?.metaJson);

        const result = await prisma.$transaction(async (tx) => {
            if (action === 'APPROVE') {
                // 1. Check Wallet Balance
                const wallet = order.seller.wallet;
                if (!wallet) throw new Error('Seller has no wallet');
                const existingOrderCharges = await tx.walletLedger.findMany({
                    where: {
                        sellerId: order.sellerId,
                        refType: 'ORDER',
                        refId: order.id
                    },
                    select: {
                        id: true,
                        type: true,
                        amount: true
                    }
                });

                const adjustmentAmountRaw = latestRevertMeta?.adjustmentAmount ?? latestRevertMeta?.additionalChargeAmount;
                const adjustmentPositions = latestRevertMeta?.adjustmentPositions ?? latestRevertMeta?.additionalChargePositions ?? [];
                const hasHistoricalOrderCharge = existingOrderCharges.some((entry) => entry.type === 'DEBIT');
                const hasUpdatedOrderCharge = typeof adjustmentAmountRaw === 'number';
                const initialChargeAmount = getOrderGrandTotal(order);
                const chargeAmount = hasUpdatedOrderCharge
                    ? Number(adjustmentAmountRaw!.toFixed(2))
                    : hasHistoricalOrderCharge
                        ? 0
                        : initialChargeAmount;

                if (chargeAmount > 0 && wallet.balance < chargeAmount) {
                    throw new Error(`Insufficient wallet balance. Required: $${chargeAmount.toFixed(2)}, Available: $${wallet.balance.toFixed(2)}`);
                }

                if (chargeAmount > 0) {
                    const positionText = formatPositionAdjustments(adjustmentPositions);
                    const note = hasUpdatedOrderCharge
                        ? `Additional charge for updated Order ${order.orderCode}${positionText ? ` - ${positionText}` : ''}`
                        : `Payment for Order ${order.orderCode}`;

                    // 2. Deduct Wallet Balance
                    await tx.wallet.update({
                        where: { sellerId: order.sellerId },
                        data: { balance: { decrement: chargeAmount } }
                    });

                    // 3. Create Ledger Entry (DEBIT = charge)
                    await tx.walletLedger.create({
                        data: {
                            sellerId: order.sellerId,
                            type: 'DEBIT',
                            amount: chargeAmount,
                            refType: 'ORDER',
                            refId: order.id,
                            note
                        }
                    });
                } else if (chargeAmount < 0) {
                    const refundAmount = Math.abs(chargeAmount);
                    const positionText = formatPositionAdjustments(adjustmentPositions);
                    const note = `Refund for updated Order ${order.orderCode}${positionText ? ` - ${positionText}` : ''}`;

                    await tx.wallet.update({
                        where: { sellerId: order.sellerId },
                        data: { balance: { increment: refundAmount } }
                    });

                    await tx.walletLedger.create({
                        data: {
                            sellerId: order.sellerId,
                            type: 'CREDIT',
                            amount: refundAmount,
                            refType: 'ORDER',
                            refId: order.id,
                            note
                        }
                    });
                }

                // 4. Update Order Status
                const updatedOrder = await tx.order.update({
                    where: { id: orderId },
                    data: { status: 'RECEIVED' }
                });

                // 5. Update Jobs Status
                await tx.job.updateMany({
                    where: { orderId: orderId },
                    data: { status: 'RECEIVED' }
                });

                return { success: true, status: 'RECEIVED', order: updatedOrder };

            } else if (action === 'REJECT') {
                // 1. Update Order Status
                const updatedOrder = await tx.order.update({
                    where: { id: orderId },
                    data: {
                        status: 'REJECTED',
                        rejectionReason: rejectionReason || 'No reason provided'
                    }
                });

                // 2. Update Jobs Status
                await tx.job.updateMany({
                    where: { orderId: orderId },
                    data: { status: 'REJECTED' }
                });

                // 3. Release Reserved Inventory
                for (const job of order.jobs) {
                    // Try to match inventory item. Handle potential nulls for color/size if they were saved as empty strings.
                    // The import logic uses: color || "", size || "".
                    const sku = job.sku;
                    const color = job.color || "";
                    const size = job.size || "";

                    await tx.inventoryItem.updateMany({
                        where: { sku, color, size },
                        data: { reserved: { decrement: job.qty } }
                    });
                }

                // 4. Refund to Seller Wallet
                // Refund logic removed: Orders in PENDING_APPROVAL have not been charged yet.


                return { success: true, status: 'REJECTED', order: updatedOrder };
            } else {
                throw new Error('Invalid action');
            }
        });

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Approval Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
