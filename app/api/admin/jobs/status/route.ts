import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';

export async function POST(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const body = await request.json();
        const { jobId, status } = body;

        if (!jobId || !status) {
            return NextResponse.json({ error: 'Job ID and Status are required' }, { status: 400 });
        }

        const updatedJob = await prisma.$transaction(async (tx) => {
            const job = await tx.job.findUnique({
                where: { id: jobId },
                include: {
                    order: true,
                    seller: { include: { wallet: true } }
                }
            });

            if (!job) throw new Error('Job not found');

            // Refund Logic: If changing TO CANCELLED from non-cancelled
            if (status === 'CANCELLED' && job.status !== 'CANCELLED') {
                // Only refund if the job was previously PAID.
                // PENDING_APPROVAL and REJECTED statuses imply no payment was made yet.
                const isPaidStatus = job.status !== 'PENDING_APPROVAL' && job.status !== 'REJECTED';

                if (isPaidStatus) {
                    const refundAmount = (job.priceToCharge * job.qty) + job.shippingCost + job.extraFees;

                    // 1. Credit Wallet
                    await tx.wallet.update({
                        where: { sellerId: job.sellerId },
                        data: { balance: { increment: refundAmount } }
                    });

                    // 2. Create Ledger Entry
                    await tx.walletLedger.create({
                        data: {
                            sellerId: job.sellerId,
                            type: 'REFUND',
                            amount: refundAmount,
                            refType: 'ORDER',
                            refId: job.orderId,
                            note: `Refund for cancelled job ${job.jobCode} in order ${job.order.orderCode}`
                        }
                    });
                }

                // 3. Release Inventory (Decrement Reserved)
                // Always release inventory regardless of payment status
                // Use updateMany to handle potential missing inventory item gracefully or matches by unique composite
                await tx.inventoryItem.updateMany({
                    where: {
                        sku: job.sku,
                        color: job.color || "",
                        size: job.size || ""
                    },
                    data: { reserved: { decrement: job.qty } }
                });
            }

            // Re-Charge Logic: If changing FROM CANCELLED to active status (Un-cancel)
            if (job.status === 'CANCELLED' && status !== 'CANCELLED') {
                const chargeAmount = (job.priceToCharge * job.qty) + job.shippingCost + job.extraFees;

                // Check balance
                const wallet = await tx.wallet.findUnique({ where: { sellerId: job.sellerId } });
                if (!wallet || wallet.balance < chargeAmount) {
                    throw new Error('Insufficient wallet balance to un-cancel job');
                }

                // 1. Debit Wallet
                await tx.wallet.update({
                    where: { sellerId: job.sellerId },
                    data: { balance: { decrement: chargeAmount } }
                });

                // 2. Create Ledger Entry
                await tx.walletLedger.create({
                    data: {
                        sellerId: job.sellerId,
                        type: 'DEBIT',
                        amount: chargeAmount,
                        refType: 'JOB',
                        refId: job.id,
                        note: `Re-charge for un-cancelled job ${job.jobCode}`
                    }
                });

                // 3. Reserve Inventory
                await tx.inventoryItem.updateMany({
                    where: {
                        sku: job.sku,
                        color: job.color || "",
                        size: job.size || ""
                    },
                    data: { reserved: { increment: job.qty } }
                });
            }

            // Update Job Status
            const updated = await tx.job.update({
                where: { id: jobId },
                data: { status }
            });

            // Check Order Status if Job Cancelled
            if (status === 'CANCELLED') {
                const activeJobsCount = await tx.job.count({
                    where: {
                        orderId: job.orderId,
                        status: { not: 'CANCELLED' }
                    }
                });

                if (activeJobsCount === 0) {
                    await tx.order.update({
                        where: { id: job.orderId },
                        data: { status: 'CANCELLED' }
                    });
                }
            } else if (status !== 'CANCELLED' && job.order.status === 'CANCELLED') {
                // If un-cancelling a job, and order was cancelled, reactivate order
                await tx.order.update({
                    where: { id: job.orderId },
                    data: { status: 'RECEIVED' }
                });
            } else {
                // Normal Status Update - Sync Order Status
                // Check status of ALL jobs in this order
                const allJobs = await tx.job.findMany({
                    where: { orderId: job.orderId }
                });

                const activeJobs = allJobs.filter(j => j.status !== 'CANCELLED');

                if (activeJobs.length > 0) {
                    const allCompleted = activeJobs.every(j =>
                        // Treat the current job as having the NEW status (since we just updated it above, but updatedJob var is returned later, tx.job.findMany might see old or new depending on isolation)
                        // Actually, we updated it via `updated` variable inside transaction above line 105.
                        // So `activeJobs` fetch WILL see the new status if using same transaction? 
                        // Prisma transaction: yes, reads seeing writes within same transaction depends on isolation level, but generally yes for default.
                        // Let's assume `allJobs` has the updated status for the current job.
                        ['COMPLETED', 'READY_TO_SHIP', 'SHIPPED'].includes(j.id === jobId ? status : j.status)
                    );

                    const currentOrder = await tx.order.findUnique({ where: { id: job.orderId } });

                    if (allCompleted && currentOrder?.status !== 'SHIPPED' && currentOrder?.status !== 'COMPLETED') {
                        // All jobs done, mark order as COMPLETED (ready for shipping)
                        await tx.order.update({
                            where: { id: job.orderId },
                            data: { status: 'COMPLETED' }
                        });
                    } else if (!allCompleted && currentOrder?.status === 'COMPLETED') {
                        // If order was marked Completed but we just moved a job back to In Process
                        await tx.order.update({
                            where: { id: job.orderId },
                            data: { status: 'IN_PROCESS' }
                        });
                    }
                    // If Order is already SHIPPED, we generally typically don't revert it automatically just by changing a job status to In Process, 
                    // unless we explicitly want to "unship". But safe to leave SHIPPED alone for now.
                }
            }

            return updated;
        }, {
            timeout: 20000
        });

        return NextResponse.json(updatedJob);
    } catch (error: any) {
        console.error('Update Job Status Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update job status' }, { status: 500 });
    }
}
