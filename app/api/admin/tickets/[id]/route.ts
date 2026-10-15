import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(
    req: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const adminGuardResponse = await requireStaffOrAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const params = await props.params;
    const { id } = params;

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Verify Admin/Staff Role
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });

        if (!user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id },
            include: {
                user: { select: { email: true, name: true } },
                order: { select: { orderCode: true } }
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        return NextResponse.json(ticket);
    } catch (error) {
        console.error('Get ticket error:', error);
        return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 });
    }
}
