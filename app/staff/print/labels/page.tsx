import React from 'react';
import { prisma } from '@/lib/prisma';
import PrintableLabels from '@/app/admin/print/labels/PrintableLabels'; // Reuse existing component

export default async function StaffPrintLabelsPage({ searchParams }: { searchParams: { ids: string } }) {
    // Safety check for searchParams being available
    const sp = await searchParams;
    const ids = sp.ids ? sp.ids.split(',') : [];

    if (ids.length === 0) {
        return <div>No Jobs Selected</div>;
    }

    const jobs = await prisma.job.findMany({
        where: { id: { in: ids } },
        include: { tokens: true, order: true }
    });

    return (
        <div className="bg-white min-h-screen text-black">
            <PrintableLabels jobs={jobs} />
        </div>
    );
}
