import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const jobs = await prisma.job.findMany({
            where: {
                status: 'RECEIVED'
            },
            include: {
                order: true
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        return NextResponse.json(jobs);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
}
