import AdminUsersClient from './AdminUsersClient';
import { prisma } from '@/lib/prisma';
import { requirePageRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BANNED';

export default async function AdminUsersPage() {
    await requirePageRole(['ADMIN']);

    const users = await prisma.user.findMany({
        include: {
            seller: {
                include: {
                    wallet: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    }) as any[];

    const initialUsers = users.map(user => {
        const status: UserStatus = user.isBanned
            ? 'BANNED'
            : user.suspendedUntil && user.suspendedUntil > new Date()
                ? 'SUSPENDED'
                : user.isActive
                    ? 'ACTIVE'
                    : 'INACTIVE';

        return {
        id: user.id,
        email: user.email,
        name: user.seller?.name || user.role,
        role: user.role,
        balance: user.seller?.wallet?.balance || 0,
        createdAt: user.createdAt.toISOString(),
        isBanned: user.isBanned,
        suspendedUntil: user.suspendedUntil ? user.suspendedUntil.toISOString() : null,
        status
    };
    });

    return <AdminUsersClient initialUsers={initialUsers} />;
}
