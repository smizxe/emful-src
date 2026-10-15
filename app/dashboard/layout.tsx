import DashboardLayoutShell from '@/components/Dashboard/DashboardLayoutShell';
import { requirePageRole } from '@/lib/auth-guard';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageRole(['SELLER']);

    return <DashboardLayoutShell>{children}</DashboardLayoutShell>;
}

