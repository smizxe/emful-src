import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { v4 as uuidv4 } from 'uuid';

// Secure-ish random token, mirrors the generator used by the import route.
function generateToken() {
    return uuidv4().replace(/-/g, '') + Math.random().toString(36).substring(2, 8);
}

/**
 * Build a unique "reproduce" order code by appending R (then R2, R3, ...) to the
 * original order code. Runs inside the transaction so collisions are caught.
 */
async function buildReproduceOrderCode(tx: any, baseCode: string) {
    let attempt = 1;
    // First try `${base}R`, then `${base}R2`, `${base}R3`, ...
    while (true) {
        const candidate = attempt === 1 ? `${baseCode}R` : `${baseCode}R${attempt}`;
        const existing = await tx.order.findUnique({ where: { orderCode: candidate } });
        if (!existing) return candidate;
        attempt++;
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireStaffOrAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        // decision: 'APPROVE' | 'REJECT' | 'REFUND' | 'REPRODUCE' | 'REPLACEMENT' (legacy)
        // amount: optional refund amount for partial refunds
        const { ticketId, decision, amount } = await request.json();

        if (!ticketId || !decision) {
            return NextResponse.json({ error: 'Missing ticketId or decision' }, { status: 400 });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                order: { include: { jobs: true } },
                user: { include: { seller: { include: { wallet: true } } } }
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Captured for the response (e.g. the new order code on reproduce).
        const result: { reproducedOrderCode?: string; refundAmount?: number } = {};

        await prisma.$transaction(async (tx) => {
            if (decision === 'REFUND') {
                if (!ticket.order) {
                    throw new Error('No order associated with this ticket');
                }

                const orderTotal = ticket.order.totalAmount || 0;
                // Full refund by default; a positive `amount` (<= total) means a partial refund.
                const parsedAmount = Number(amount);
                const refundAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
                    ? parsedAmount
                    : orderTotal;

                if (refundAmount <= 0) {
                    throw new Error('Refund amount must be greater than 0');
                }
                if (refundAmount > orderTotal + 0.001) {
                    throw new Error(`Refund amount cannot exceed order total ($${orderTotal.toFixed(2)})`);
                }

                const sellerId = ticket.user?.seller?.id;
                const walletId = ticket.user?.seller?.wallet?.id;
                if (!sellerId || !walletId) {
                    throw new Error('Seller wallet not found');
                }

                if (ticket.order.status === 'PENDING_APPROVAL' || ticket.order.status === 'REJECTED') {
                    throw new Error('Cannot refund an unpaid order (Status: ' + ticket.order.status + ')');
                }

                const isFullRefund = refundAmount >= orderTotal - 0.001;

                // 1. Credit wallet
                await tx.wallet.update({
                    where: { id: walletId },
                    data: { balance: { increment: refundAmount } }
                });

                // 2. Ledger record
                await tx.walletLedger.create({
                    data: {
                        sellerId,
                        type: 'REFUND',
                        amount: refundAmount,
                        currency: 'USD',
                        refType: 'ORDER_REFUND',
                        refId: ticket.order.orderCode,
                        note: `${isFullRefund ? 'Full' : 'Partial'} refund for Order #${ticket.order.orderCode} (Ticket #${ticket.id})`,
                        createdBy: 'ADMIN'
                    }
                });

                // 3/4. Only a full refund closes out the order + jobs. A partial refund
                // leaves the order in its current state (goods may still be produced/shipped).
                if (isFullRefund) {
                    await tx.order.update({ where: { id: ticket.order.id }, data: { status: 'REFUNDED' } });
                    await tx.job.updateMany({ where: { orderId: ticket.order.id }, data: { status: 'REFUNDED' } });
                }

                // 5. Resolve ticket
                await tx.ticket.update({
                    where: { id: ticketId },
                    data: { status: 'RESOLVED', resolutionType: 'REFUND' }
                });

                result.refundAmount = refundAmount;

            } else if (decision === 'REPRODUCE' || decision === 'REPLACEMENT') {
                if (!ticket.order) {
                    throw new Error('No order associated with this ticket');
                }

                const sellerId = ticket.user?.seller?.id;
                if (!sellerId) {
                    throw new Error('Seller not found for this ticket');
                }

                const originalJobs = ticket.order.jobs || [];
                if (originalJobs.length === 0) {
                    throw new Error('Original order has no items to reproduce');
                }

                const newOrderCode = await buildReproduceOrderCode(tx, ticket.order.orderCode);

                // Create the reproduce order — goes straight into production (RECEIVED),
                // free of charge (issue resolution, no wallet debit).
                const newOrder = await tx.order.create({
                    data: {
                        orderCode: newOrderCode,
                        sellerId,
                        status: 'RECEIVED',
                        shippingStatus: 'RECEIVED',
                        totalAmount: 0, // Reproduce is free for the seller
                        currency: ticket.order.currency,
                        shippingCountry: ticket.order.shippingCountry,
                        shippingMethod: ticket.order.shippingMethod,
                        priorityProduction: ticket.order.priorityProduction,
                        priorityShipping: ticket.order.priorityShipping,
                    }
                });

                // Clone every job/line-item into the new order, sent to production.
                for (const job of originalJobs) {
                    const jobCode = 'JOB' + uuidv4().substring(0, 8).toUpperCase();
                    const newJob = await tx.job.create({
                        data: {
                            orderId: newOrder.id,
                            sellerId,
                            jobCode,
                            status: 'RECEIVED',
                            sku: job.sku,
                            color: job.color,
                            size: job.size,
                            qty: job.qty,
                            recipientName: job.recipientName,
                            phone: job.phone,
                            address1: job.address1,
                            address2: job.address2,
                            city: job.city,
                            state: job.state,
                            zip: job.zip,
                            country: job.country,
                            designs: job.designs,
                            notes: job.notes,
                            priceToCharge: 0, // Free reproduce
                            shippingCost: 0,
                            extraFees: 0,
                            shippingLabel: job.shippingLabel,
                        }
                    });

                    await tx.qrToken.create({ data: { jobId: newJob.id, type: 'FILE', token: generateToken() } });
                    await tx.qrToken.create({ data: { jobId: newJob.id, type: 'STATUS', token: generateToken(), maxUses: 2 } });

                    // Reserve inventory just like a real production order.
                    await tx.inventoryItem.upsert({
                        where: { sku_color_size: { sku: job.sku, color: job.color || '', size: job.size || '' } },
                        update: { reserved: { increment: job.qty } },
                        create: { sku: job.sku, color: job.color || '', size: job.size || '', reserved: job.qty, onHand: 0 }
                    });
                }

                await tx.ticket.update({
                    where: { id: ticketId },
                    data: { status: 'RESOLVED', resolutionType: 'REPRODUCE' }
                });

                result.reproducedOrderCode = newOrderCode;

            } else if (decision === 'REJECT') {
                await tx.ticket.update({
                    where: { id: ticketId },
                    data: { status: 'REJECTED' }
                });
            } else {
                // 'APPROVE' (general resolve)
                await tx.ticket.update({
                    where: { id: ticketId },
                    data: { status: 'RESOLVED' }
                });
            }
        }, { maxWait: 20000, timeout: 120000 });

        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Ticket Resolve Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to resolve ticket' }, { status: 500 });
    }
}
