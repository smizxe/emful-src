import AdminWalletClient from './AdminWalletClient';
import { getAdminWalletData, getVndUsdRate } from '@/lib/adminWalletData';
import { requirePageRole } from '@/lib/auth-guard';
import { getPriorityFeeSettings } from '@/lib/priorityFees';

export const dynamic = 'force-dynamic';

export default async function AdminWalletPage() {
    await requirePageRole(['ADMIN']);

    const [initialData, initialRate, priorityFees] = await Promise.all([
        getAdminWalletData(),
        getVndUsdRate(),
        getPriorityFeeSettings()
    ]);

    return <AdminWalletClient initialData={initialData} initialRate={initialRate} initialPriorityFees={priorityFees} />;
}
