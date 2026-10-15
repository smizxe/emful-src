import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { orderId } = body;

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        // Start Transaction
        await prisma.$transaction(async (tx) => {
            // 1. Get Order with totalAmount and sellerId
            const order = await tx.order.findUnique({
                where: { id: orderId },
                include: { seller: true }
            });

            if (!order) {
                throw new Error('Order not found');
            }

            if (order.status === 'CANCELLED') {
                throw new Error('Order is already cancelled');
            }

            // 2. Update Order Status
            await tx.order.update({
                where: { id: orderId },
                data: { status: 'CANCELLED' }
            });

            // 3. Get all jobs to determine which ones are active (not cancelled)
            const jobs = await tx.job.findMany({
                where: { orderId: orderId }
            });

            const activeJobs = jobs.filter(j => j.status !== 'CANCELLED');
            let refundAmount = 0;

            if (activeJobs.length > 0) {
                // Calculate refund amount from ACTIVE jobs only
                // Formula matches `jobs/status` logic
                refundAmount = activeJobs.reduce((sum, job) => {
                    const jobTotal = (job.priceToCharge * job.qty) + job.shippingCost + job.extraFees;
                    return sum + jobTotal;
                }, 0);

                // Update active jobs to CANCELLED
                await tx.job.updateMany({
                    where: { id: { in: activeJobs.map(j => j.id) } },
                    data: { status: 'CANCELLED' }
                });
            }

            // 4. Refund to Seller Wallet
            // Only refund if there is an amount to refund and order was PAID
            const isPaid = order.status !== 'PENDING_APPROVAL' && order.status !== 'REJECTED';

            if (isPaid && refundAmount > 0) {
                // Check if wallet exists
                let wallet = await tx.wallet.findUnique({ where: { sellerId: order.sellerId } });
                if (!wallet) {
                    wallet = await tx.wallet.create({
                        data: { sellerId: order.sellerId, balance: 0 }
                    });
                }

                // Create Refund Ledger
                await tx.walletLedger.create({
                    data: {
                        sellerId: order.sellerId,
                        type: 'REFUND',
                        amount: refundAmount,
                        refType: 'REFUND_ORDER',
                        refId: order.orderCode,
                        note: `Refund for cancelled order ${order.orderCode} (${activeJobs.length} jobs)`
                    }
                });

                // Update Balance
                await tx.wallet.update({
                    where: { sellerId: order.sellerId },
                    data: { balance: { increment: refundAmount } }
                });
            }
        });

        return NextResponse.json({ success: true, message: 'Order cancelled and refunded' });
    } catch (error: any) {
        console.error('Cancel Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to cancel order' }, { status: 500 });
    }
}
