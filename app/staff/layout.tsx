import StaffLayoutShell from '@/components/Staff/StaffLayoutShell';
import { requirePageRole } from '@/lib/auth-guard';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
    await requirePageRole(['ADMIN', 'STAFF']);

    return <StaffLayoutShell>{children}</StaffLayoutShell>;
}

