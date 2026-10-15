import AdminLayoutShell from '@/components/Admin/AdminLayoutShell';
import { requirePageRole } from '@/lib/auth-guard';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    await requirePageRole(['ADMIN']);

    return <AdminLayoutShell>{children}</AdminLayoutShell>;
}

