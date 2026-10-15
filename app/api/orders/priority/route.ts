import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getPriorityFeeSettings, getOrderPriorityFee } from '@/lib/priorityFees';
import { getDerivedOrderStatus } from '@/lib/orderStatus';

function getJobsTotal(jobs: Array<{ qty: number; priceToCharge: number; shippingCost: number; extraFees: number }>) {
    return Number(jobs.reduce(
        (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
        0
    ).toFixed(2));
}

// Priority may change while the order is PENDING_APPROVAL or RECEIVED (before
// production starts). Mirrors the seller UI lock in OrdersTable.
function isProductionPriorityAllowed(status: string) {
    return ['PENDING_APPROVAL', 'RECEIVED'].includes(status);
}

function isShippingPriorityAllowed(status: string) {
    // Status-only, same as production. Do not lock on tracking number — it is
    // assigned early in this workflow and was wrongly blocking edits at RECEIVED.
    return ['PENDING_APPROVAL', 'RECEIVED'].includes(status);
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { seller: true }
        });

        if (!user?.seller) {
            return NextResponse.json({ error: 'Seller account not found' }, { status: 403 });
        }

        const body = await request.json();
        const { orderId, priorityProduction, priorityShipping } = body;

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        const order = await prisma.order.findFirst({
            where: {
                id: orderId,
                sellerId: user.seller.id
            },
            include: {
                jobs: true,
                seller: { include: { wallet: true } }
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const derivedStatus = getDerivedOrderStatus(order);
        const nextFlags = {
            priorityProduction: Boolean(priorityProduction),
            priorityShipping: Boolean(priorityShipping)
        };

        if (!isProductionPriorityAllowed(derivedStatus) && nextFlags.priorityProduction !== order.priorityProduction) {
            return NextResponse.json({ error: 'Priority can only be changed before production starts (only while Pending Approval or Received)' }, { status: 400 });
        }

        if (!isShippingPriorityAllowed(derivedStatus) && nextFlags.priorityShipping !== order.priorityShipping) {
            return NextResponse.json({ error: 'Priority can only be changed before production starts (only while Pending Approval or Received)' }, { status: 400 });
        }

        const priorityFeeSettings = await getPriorityFeeSettings();
        const oldPriorityTotal = getOrderPriorityFee(order);
        const priorityFees = {
            priorityProductionFee: nextFlags.priorityProduction
                ? Number(order.priorityProduction && order.priorityProductionFee > 0
                    ? order.priorityProductionFee
                    : priorityFeeSettings.priorityProductionFee)
                : 0,
            priorityShippingFee: nextFlags.priorityShipping
                ? Number(order.priorityShipping && order.priorityShippingFee > 0
                    ? order.priorityShippingFee
                    : priorityFeeSettings.priorityShippingFee)
                : 0
        };
        const newPriorityTotal = Number((priorityFees.priorityProductionFee + priorityFees.priorityShippingFee).toFixed(2));
        const priorityAdjustment = Number((newPriorityTotal - oldPriorityTotal).toFixed(2));
        const totalAmount = Number((getJobsTotal(order.jobs) + newPriorityTotal).toFixed(2));

        const existingOrderCharge = await prisma.walletLedger.findFirst({
            where: {
                sellerId: order.sellerId,
                refType: 'ORDER',
                refId: order.id,
                type: 'DEBIT'
            },
            select: { id: true }
        });

        if (existingOrderCharge && priorityAdjustment > 0 && (!order.seller.wallet || order.seller.wallet.balance < priorityAdjustment)) {
            return NextResponse.json({
                error: `Insufficient wallet balance. Required: $${priorityAdjustment.toFixed(2)}, Available: $${(order.seller.wallet?.balance || 0).toFixed(2)}`
            }, { status: 400 });
        }

        const updatedOrder = await prisma.$transaction(async (tx) => {
            const updated = await tx.order.update({
                where: { id: order.id },
                data: {
                    priorityProduction: nextFlags.priorityProduction,
                    priorityShipping: nextFlags.priorityShipping,
                    priorityProductionFee: priorityFees.priorityProductionFee,
                    priorityShippingFee: priorityFees.priorityShippingFee,
                    totalAmount
                }
            });

            if (existingOrderCharge && priorityAdjustment !== 0) {
                const adjustmentAbs = Math.abs(priorityAdjustment);
                const adjustmentType = priorityAdjustment > 0 ? 'DEBIT' : 'CREDIT';
                const note = priorityAdjustment > 0
                    ? `Priority fee added for Order ${order.orderCode}`
                    : `Priority fee refunded for Order ${order.orderCode}`;

                await tx.wallet.update({
                    where: { sellerId: order.sellerId },
                    data: {
                        balance: priorityAdjustment > 0
                            ? { decrement: adjustmentAbs }
                            : { increment: adjustmentAbs }
                    }
                });

                await tx.walletLedger.create({
                    data: {
                        sellerId: order.sellerId,
                        type: adjustmentType,
                        amount: adjustmentAbs,
                        refType: 'ORDER',
                        refId: order.id,
                        note
                    }
                });
            }

            return updated;
        });

        return NextResponse.json({ success: true, order: updatedOrder, priorityAdjustment });
    } catch (error: any) {
        console.error('ORDER_PRIORITY_UPDATE_ERROR:', error);
        return NextResponse.json({ error: error.message || 'Failed to update priority' }, { status: 500 });
    }
}
