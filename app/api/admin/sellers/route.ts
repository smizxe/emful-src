import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const sellers = await prisma.seller.findMany({
            select: {
                id: true,
                name: true,
                code: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        return NextResponse.json(sellers);
    } catch (error) {
        console.error('Error fetching sellers:', error);
        return NextResponse.json({ error: 'Failed to fetch sellers' }, { status: 500 });
    }
}
