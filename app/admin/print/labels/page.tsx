import React from 'react';
import { prisma } from '@/lib/prisma';
import PrintableLabels from './PrintableLabels';

export default async function PrintLabelsPage({ searchParams }: { searchParams: { ids: string } }) {
    // searchParams needs await in Next 15, but usually handled by destructuring in function arg in Page? 
    // In Next 15 `searchParams` is a promise. In Next 14 it's an object. 
    // "next": "16.1.1" -> strictly async searchParams.

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

    // Calculate group info for each order - fetch from DB to get accurate totals
    // This ensures even if only 1 job is selected, we know the full group size
    const orderGroupInfo: Record<string, { position: number; total: number }> = {};

    for (const job of jobs) {
        const orderCode = job.order?.orderCode || '';
        if (!orderCode || orderGroupInfo[orderCode]) continue;

        // Extract base code: ORDER123(1) -> ORDER123
        const baseCode = orderCode.replace(/\(\d+\)$/, '').trim();

        // Query DB for all orders with same base code pattern
        const relatedOrders = await prisma.order.findMany({
            where: {
                OR: [
                    { orderCode: baseCode },                    // Base order (no suffix)
                    { orderCode: { startsWith: `${baseCode}(` } } // Orders with suffix
                ]
            },
            select: { orderCode: true },
            orderBy: { orderCode: 'asc' }
        });

        // Build position map for all related orders
        relatedOrders.forEach((order, idx) => {
            orderGroupInfo[order.orderCode] = {
                position: idx + 1,
                total: relatedOrders.length
            };
        });
    }

    return (
        <div className="bg-white min-h-screen text-black">
            <PrintableLabels jobs={jobs} orderGroupInfo={orderGroupInfo} />
        </div>
    );
}
