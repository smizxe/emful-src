import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { getAdminWalletData } from '@/lib/adminWalletData';
import { releaseAwaitingFundsOrders } from '@/lib/awaitingFunds';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const sellerId = searchParams.get('sellerId');
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10), 1), 200);
        const data = await getAdminWalletData(sellerId, page, limit);
        const response = NextResponse.json(data);
        response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
        return response;
    } catch (error) {
        console.error('Wallet API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch admin wallet data' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const body = await request.json();
    const { userId, amount, type, action, topupRequestId } = body;

    // ACTION: CONFIRM PENDING REQUEST
    if (action === 'confirm_request') {
        if (!topupRequestId) return NextResponse.json({ error: 'Missing Request ID' }, { status: 400 });

        try {
            const result = await prisma.$transaction(async (tx) => {
                // 1. Get the Request
                const req = await tx.topupRequest.findUnique({ where: { id: topupRequestId } });
                if (!req) throw new Error('Request not found');
                if (req.status !== 'PENDING') throw new Error('Request already processed');

                // 2. Update Request Status
                await tx.topupRequest.update({
                    where: { id: topupRequestId },
                    data: { status: 'CONFIRMED', confirmedAt: new Date() }
                });

                // 3. Update Wallet Balance
                const sellerId = req.sellerId;
                const creditAmount = req.amountReceived ?? req.amount;

                let wallet = await tx.wallet.findUnique({ where: { sellerId } });
                if (!wallet) {
                    wallet = await tx.wallet.create({ data: { sellerId, balance: 0 } });
                }

                await tx.wallet.update({
                    where: { sellerId },
                    data: { balance: { increment: creditAmount } }
                });

                // 4. Create Ledger Entry
                const ledger = await tx.walletLedger.create({
                    data: {
                        sellerId,
                        type: 'CREDIT',
                        amount: creditAmount,
                        currency: 'USD',
                        refType: 'TOPUP',
                        refId: req.id,
                        note: req.transferContent,
                        createdBy: 'ADMIN'
                    }
                });

                return { ledger, sellerId };
            });

            // Money just landed — release any orders that were parked waiting for it.
            const release = await releaseAwaitingFundsOrders(result.sellerId).catch((error) => {
                console.error('Awaiting-funds release failed:', error);
                return { released: 0, releasedOrderCodes: [] as string[] };
            });

            return NextResponse.json({ ...result.ledger, releasedOrders: release.released });
        } catch (error: any) {
            console.error('Confirm Request Error:', error);
            return NextResponse.json({ error: error.message || 'Confirmation failed' }, { status: 500 });
        }
    }

    // ACTION: CANCEL PENDING REQUEST
    if (action === 'cancel_request') {
        if (!topupRequestId) return NextResponse.json({ error: 'Missing Request ID' }, { status: 400 });

        try {
            const result = await prisma.$transaction(async (tx) => {
                const req = await tx.topupRequest.findUnique({ where: { id: topupRequestId } });
                if (!req) throw new Error('Request not found');
                if (req.status !== 'PENDING') throw new Error('Only pending requests can be cancelled');

                return tx.topupRequest.update({
                    where: { id: topupRequestId },
                    data: { status: 'CANCELLED' }
                });
            });

            return NextResponse.json(result);
        } catch (error: any) {
            console.error('Cancel Request Error:', error);
            return NextResponse.json({ error: error.message || 'Cancel request failed' }, { status: 500 });
        }
    }

    // ACTION: MANUAL ADMIN TOP UP (Existing logic)
    if (!userId || !amount) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update/Create Wallet
            // Check if wallet exists
            let wallet = await tx.wallet.findUnique({ where: { sellerId: userId } });

            if (!wallet) {
                wallet = await tx.wallet.create({
                    data: { sellerId: userId, balance: 0 }
                });
            }

            await tx.wallet.update({
                where: { sellerId: userId },
                data: {
                    balance: { increment: parseFloat(amount) }
                }
            });

            // 2. Create Ledger Entry
            const ledger = await tx.walletLedger.create({
                data: {
                    sellerId: userId,
                    type: 'CREDIT',
                    amount: parseFloat(amount),
                    currency: 'USD',
                    refType: 'TOPUP', // System Topup
                    note: `Admin Manual Topup: ${type || 'Standard'}`,
                    createdBy: 'ADMIN'
                }
            });

            return ledger;
        });

        // Money just landed — release any orders that were parked waiting for it.
        const release = await releaseAwaitingFundsOrders(userId).catch((error) => {
            console.error('Awaiting-funds release failed:', error);
            return { released: 0, releasedOrderCodes: [] as string[] };
        });

        return NextResponse.json({ ...result, releasedOrders: release.released });
    } catch (error) {
        console.error('Topup Error:', error);
        return NextResponse.json({ error: 'Transaction failed' }, { status: 500 });
    }
}
