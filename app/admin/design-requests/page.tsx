import React from 'react';
import { requirePageRole } from '@/lib/auth-guard';
import DesignRequestsTable from '@/components/DesignRequests/DesignRequestsTable';
import DesignerAssignments from '@/components/DesignRequests/DesignerAssignments';

export const dynamic = 'force-dynamic';

export default async function AdminDesignRequestsPage() {
    await requirePageRole(['ADMIN', 'STAFF']);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-1">Design Requests</h1>
            <p className="text-sm text-zinc-500 mb-6">
                Artwork waiting on the design team. Raise a request from Production Release,
                hand the designer a reference link, and the finished file comes back onto the order.
                Designer logins are created under Staff &amp; Designers.
            </p>
            <DesignRequestsTable canAdmin />
            <DesignerAssignments />
        </div>
    );
}
