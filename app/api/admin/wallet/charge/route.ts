
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser, requireStaffOrAdminApi } from '@/lib/auth-guard';

export async function POST(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const currentUser = await getAuthenticatedUser();
        const body = await request.json();
        // mode: 'ADDITIONAL' bills the seller extra, 'REDUCE' gives money back (a
        // discount for a special customer). Amount is always positive; the mode
        // decides the direction.
        const { sellerId, amount, reason, refId, mode } = body;
        const isReduce = String(mode || 'ADDITIONAL').toUpperCase() === 'REDUCE';

        if (!sellerId || !amount || amount <= 0) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }

        // 1. Get Wallet
        const wallet = await prisma.wallet.findUnique({
            where: { sellerId }
        });

        if (!wallet) {
            return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
        }

        // A reduction can never take an order below zero — refuse rather than
        // silently clamp, so the admin sees what the real maximum is.
        if (isReduce && refId) {
            const job = await prisma.job.findUnique({
                where: { id: refId },
                select: { order: { select: { totalAmount: true } } }
            });
            const orderTotal = Number(job?.order?.totalAmount ?? 0);
            if (amount > orderTotal) {
                return NextResponse.json({
                    error: `Reduction of $${Number(amount).toFixed(2)} exceeds the order total of $${orderTotal.toFixed(2)}.`
                }, { status: 400 });
            }
        }

        // 2. Transact: Update Balance, Create Ledger, and persist the adjustment onto Job/Order totals
        const result = await prisma.$transaction(async (tx) => {
            const updatedWallet = await tx.wallet.update({
                where: { sellerId },
                data: isReduce
                    ? { balance: { increment: amount } }
                    : { balance: { decrement: amount } }
            });

            await tx.walletLedger.create({
                data: {
                    sellerId,
                    // 'CREDIT' with a non-TOPUP refType is what the wallet reports
                    // already treat as money going back to the seller.
                    type: isReduce ? 'CREDIT' : 'ADDITIONAL_CHARGE',
                    amount: isReduce ? amount : -amount,
                    currency: wallet.currency,
                    refType: 'JOB_CHARGE',
                    refId: refId || '',
                    note: reason || (isReduce
                        ? 'Cost reduction via Production Admin'
                        : 'Additional Charge via Production Admin'),
                    createdBy: currentUser?.role || 'STAFF'
                }
            });

            if (refId) {
                const job = await tx.job.findUnique({
                    where: { id: refId },
                    select: {
                        id: true,
                        orderId: true
                    }
                });

                if (job) {
                    await tx.job.update({
                        where: { id: job.id },
                        data: isReduce
                            ? { extraFees: { decrement: amount } }
                            : { extraFees: { increment: amount } }
                    });

                    await tx.order.update({
                        where: { id: job.orderId },
                        data: isReduce
                            ? { totalAmount: { decrement: amount } }
                            : { totalAmount: { increment: amount } }
                    });
                }
            }

            return updatedWallet;
        });

        return NextResponse.json({ success: true, balance: result.balance });

    } catch (error) {
        console.error('Charge error:', error);
        return NextResponse.json({ error: 'Failed to process charge' }, { status: 500 });
    }
}
