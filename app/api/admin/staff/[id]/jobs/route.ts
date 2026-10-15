
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const params = await props.params;
    try {
        const staffId = params.id;

        const jobs = await prisma.job.findMany({
            where: { assignedStaffId: staffId },
            include: {
                order: {
                    select: { orderCode: true }
                }
            },
            orderBy: { updatedAt: 'desc' },
            take: 100 // Limit history
        });

        return NextResponse.json(jobs);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
