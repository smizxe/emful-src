import React from 'react';
import { requirePageRole } from '@/lib/auth-guard';
import DesignRequestsTable from '@/components/DesignRequests/DesignRequestsTable';
import DesignerAssignments from '@/components/DesignRequests/DesignerAssignments';

export const dynamic = 'force-dynamic';

/** The same queue admin sees -- staff raise and follow design work too. */
export default async function StaffDesignRequestsPage() {
    await requirePageRole(['STAFF', 'ADMIN']);

    return (
        <div>
            <h1 className="text-2xl font-bold mb-1">Design Requests</h1>
            <p className="text-sm text-zinc-500 mb-6">
                Artwork waiting on the design team. Raise a request from Production Release,
                hand the designer a reference link, and the finished file comes back onto the order.
            </p>
            <DesignRequestsTable canAdmin />
            <DesignerAssignments />
        </div>
    );
}
