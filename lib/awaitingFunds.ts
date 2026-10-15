import { prisma } from '@/lib/prisma';

// Orders imported while the seller's wallet couldn't cover them are parked at
// AWAITING_FUNDS instead of being rejected. They are ordinary priced orders (stock
// already reserved) that an admin simply can't approve yet. As soon as the wallet is
// topped up we release as many as the new balance covers, oldest first, so the seller
// never has to re-import.

export const AWAITING_FUNDS = 'AWAITING_FUNDS';

export type AwaitingFundsSummary = {
    /** Total value of orders still waiting for money. */
    outstanding: number;
    /** How much more the seller needs to release everything. */
    shortfall: number;
    count: number;
};

/**
 * Release AWAITING_FUNDS orders that the seller's current balance can cover.
 * Safe to call after any wallet credit; it's a no-op when nothing is waiting.
 */
export async function releaseAwaitingFundsOrders(sellerId: string) {
    if (!sellerId) return { released: 0, releasedOrderCodes: [] as string[] };

    const [wallet, waiting] = await Promise.all([
        prisma.wallet.findUnique({ where: { sellerId }, select: { balance: true } }),
        prisma.order.findMany({
            where: { sellerId, status: AWAITING_FUNDS },
            orderBy: { createdAt: 'asc' },
            select: { id: true, orderCode: true, totalAmount: true },
        }),
    ]);

    if (!wallet || waiting.length === 0) return { released: 0, releasedOrderCodes: [] as string[] };

    // Greedy, oldest first: release while the running total still fits the balance.
    const toRelease: { id: string; orderCode: string }[] = [];
    let running = 0;
    for (const order of waiting) {
        const amount = Number(order.totalAmount || 0);
        if (running + amount > wallet.balance) break;
        running += amount;
        toRelease.push({ id: order.id, orderCode: order.orderCode });
    }

    if (toRelease.length === 0) return { released: 0, releasedOrderCodes: [] as string[] };

    const ids = toRelease.map((order) => order.id);
    await prisma.$transaction([
        prisma.order.updateMany({
            where: { id: { in: ids }, status: AWAITING_FUNDS },
            data: { status: 'PENDING_APPROVAL' },
        }),
        prisma.job.updateMany({
            where: { orderId: { in: ids }, status: AWAITING_FUNDS },
            data: { status: 'PENDING_APPROVAL' },
        }),
    ]);

    return { released: toRelease.length, releasedOrderCodes: toRelease.map((o) => o.orderCode) };
}

/** How much the seller still owes on orders parked at AWAITING_FUNDS. */
export async function getAwaitingFundsSummary(sellerId: string): Promise<AwaitingFundsSummary> {
    const [wallet, waiting] = await Promise.all([
        prisma.wallet.findUnique({ where: { sellerId }, select: { balance: true } }),
        prisma.order.findMany({
            where: { sellerId, status: AWAITING_FUNDS },
            select: { totalAmount: true },
        }),
    ]);

    const outstanding = Number(waiting.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0).toFixed(2));
    const balance = Number(wallet?.balance || 0);

    return {
        outstanding,
        shortfall: Number(Math.max(0, outstanding - balance).toFixed(2)),
        count: waiting.length,
    };
}
