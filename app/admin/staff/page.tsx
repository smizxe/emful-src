import StaffManagementClient from './StaffManagementClient';
import { prisma } from '@/lib/prisma';
import { requirePageRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function StaffManagementPage() {
    await requirePageRole(['ADMIN']);

    const staffUsers = await prisma.user.findMany({
        where: { role: { in: ['STAFF', 'DESIGNER'] } },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            roles: true,
            isActive: true,
            createdAt: true,
            _count: {
                select: { assignedJobs: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const initialStaff = staffUsers.map(staff => ({
        ...staff,
        createdAt: staff.createdAt.toISOString()
    }));

    return <StaffManagementClient initialStaff={initialStaff} />;
}
