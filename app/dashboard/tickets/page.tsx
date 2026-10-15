import { prisma } from '@/lib/prisma';
import { requirePageRole } from '@/lib/auth-guard';
import UserTicketsClient from './UserTicketsClient';

export const dynamic = 'force-dynamic';

export default async function UserTicketsPage() {
    const user = await requirePageRole(['SELLER']);

    const tickets = await prisma.ticket.findMany({
        where: { userId: user.id },
        include: {
            order: { select: { orderCode: true } }
        },
        orderBy: { createdAt: 'desc' }
    });

    const initialTickets = tickets.map(ticket => ({
        ...ticket,
        createdAt: ticket.createdAt.toISOString()
    }));

    return <UserTicketsClient initialTickets={initialTickets} />;
}
