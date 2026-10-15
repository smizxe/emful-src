import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { cookies } from 'next/headers';

async function requireAdmin() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return null;
    }

    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            role: true
        }
    });
}

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const currentUser = await requireAdmin();
        if (!currentUser || currentUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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

        // Map to simpler structure for frontend
        const mappedUsers = users.map(user => ({
            id: user.id,
            email: user.email,
            name: user.seller?.name || user.role, // Fallback to Role if no name
            role: user.role,
            balance: user.seller?.wallet?.balance || 0,
            createdAt: user.createdAt,
            isBanned: user.isBanned,
            bannedAt: user.bannedAt,
            suspendedUntil: user.suspendedUntil,
            status: user.isBanned
                ? 'BANNED'
                : user.suspendedUntil && user.suspendedUntil > new Date()
                    ? 'SUSPENDED'
                    : user.isActive
                        ? 'ACTIVE'
                        : 'INACTIVE'
        }));

        return NextResponse.json(mappedUsers);
    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const currentUser = await requireAdmin();
        if (!currentUser || currentUser.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId, action, suspendedUntil, reason } = await request.json();

        if (!userId || !action) {
            return NextResponse.json({ error: 'userId and action are required' }, { status: 400 });
        }

        if (userId === currentUser.id) {
            return NextResponse.json({ error: 'You cannot suspend or ban your own account.' }, { status: 400 });
        }

        const targetUser = await prisma.user.findUnique({
            where: { id: userId }
        }) as any;

        if (!targetUser) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        if (action === 'SUSPEND') {
            if (!suspendedUntil) {
                return NextResponse.json({ error: 'Suspend time is required.' }, { status: 400 });
            }

            const suspendDate = new Date(suspendedUntil);
            if (Number.isNaN(suspendDate.getTime()) || suspendDate <= new Date()) {
                return NextResponse.json({ error: 'Suspend time must be a valid future date.' }, { status: 400 });
            }

            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    suspendedUntil: suspendDate,
                    suspensionReason: reason || null
                } as any
            }) as any;

            return NextResponse.json({
                success: true,
                message: `User ${updatedUser.email} has been suspended until ${updatedUser.suspendedUntil?.toISOString()}.`
            });
        }

        if (action === 'BAN') {
            if (targetUser.isBanned) {
                return NextResponse.json({ error: 'User is already banned.' }, { status: 400 });
            }

            const updatedUser = await prisma.user.update({
                where: { id: userId },
                data: {
                    isBanned: true,
                    bannedAt: new Date(),
                    bannedReason: reason || null,
                    suspendedUntil: null,
                    suspensionReason: null
                } as any
            }) as any;

            return NextResponse.json({
                success: true,
                message: `User ${updatedUser.email} has been banned.`
            });
        }

        return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    } catch (error) {
        console.error('Error updating user access:', error);
        return NextResponse.json({ error: 'Failed to update user access' }, { status: 500 });
    }
}
