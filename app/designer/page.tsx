import React from 'react';
import { requirePageRole } from '@/lib/auth-guard';
import DesignRequestsTable from '@/components/DesignRequests/DesignRequestsTable';

export const dynamic = 'force-dynamic';

export default async function DesignerPortalPage() {
    await requirePageRole(['DESIGNER', 'ADMIN']);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-1">Design Requests</h1>
            <p className="text-sm text-zinc-500 mb-6">
                Artwork waiting on you. Open the mockup / design reference, then put your
                finished file link and price on the row and set it to Finished.
            </p>
            <DesignRequestsTable canAdmin={false} />
        </div>
    );
}
