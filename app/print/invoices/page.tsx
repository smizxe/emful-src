import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import InvoiceTemplate from './InvoiceTemplate';

export const dynamic = 'force-dynamic';

export default async function PrintInvoicesPage({ searchParams }: { searchParams: Promise<{ ids: string }> }) {
    const { ids } = await searchParams;

    if (!ids) {
        return <div>No orders selected</div>;
    }

    const orderIds = ids.split(',').filter(Boolean);

    const orders = await prisma.order.findMany({
        where: {
            OR: [
                { id: { in: orderIds } },
                { orderCode: { in: orderIds } } // Support fetching by orderCode too if needed
            ]
        },
        include: {
            jobs: true,
            seller: {
                select: {
                    name: true,
                    contactEmail: true,
                    phone: true,
                    address: true
                }
            }
        }
    });

    if (orders.length === 0) {
        return <div>Orders not found</div>;
    }

    return (
        <div className="print-container">
            {orders.map((order, index) => (
                <div key={order.id} className="invoice-page">
                    <InvoiceTemplate order={order} />
                    {index < orders.length - 1 && <div className="page-break" />}
                </div>
            ))}

            <style>{`
                @media print {
                    @page { margin: 0; }
                    body { margin: 1.6cm; }
                    .page-break { page-break-after: always; }
                    .no-print { display: none !important; }
                }
            `}</style>

            <script dangerouslySetInnerHTML={{ __html: 'window.print();' }} />
        </div>
    );
}
