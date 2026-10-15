import { prisma } from '@/lib/prisma';

/**
 * Ticket refunds are recorded on the WalletLedger (refType 'ORDER_REFUND') rather
 * than on the ticket itself. The ledger note embeds the ticket id as "(Ticket #<id>)"
 * — see app/api/admin/tickets/resolve/route.ts. This helper looks up the refunded
 * amount for a set of tickets so the ticket lists can show an "Amount" column
 * without a schema change.
 */
export async function attachRefundAmounts<T extends { id: string; order?: { orderCode?: string | null } | null }>(
    tickets: T[]
): Promise<(T & { refundAmount: number | null })[]> {
    const orderCodes = Array.from(
        new Set(
            tickets
                .map((t) => t.order?.orderCode)
                .filter((c): c is string => typeof c === 'string' && c.length > 0)
        )
    );

    if (orderCodes.length === 0) {
        return tickets.map((t) => ({ ...t, refundAmount: null }));
    }

    const ledgers = await prisma.walletLedger.findMany({
        where: { type: 'REFUND', refType: 'ORDER_REFUND', refId: { in: orderCodes } },
        select: { amount: true, note: true },
    });

    // Sum refunds per ticket id parsed from the ledger note.
    const byTicket = new Map<string, number>();
    for (const l of ledgers) {
        const match = /Ticket #([0-9a-zA-Z-]+)/.exec(l.note || '');
        if (!match) continue;
        const ticketId = match[1];
        byTicket.set(ticketId, (byTicket.get(ticketId) || 0) + (l.amount || 0));
    }

    return tickets.map((t) => ({
        ...t,
        refundAmount: byTicket.has(t.id) ? byTicket.get(t.id)! : null,
    }));
}
