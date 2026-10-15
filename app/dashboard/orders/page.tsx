import { prisma } from '@/lib/prisma';
import React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import OrdersTable from './OrdersTable';
import DateRangeFilter from '@/components/Shared/DateRangeFilter';
import SellerStats from '@/components/Dashboard/SellerStats';
import dayjs from 'dayjs';
import Trans from '@/components/Trans';
import { getDerivedOrderStatus } from '@/lib/orderStatus';

// Force dynamic to prevent caching issues
export const dynamic = 'force-dynamic';

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function OrdersPage({ searchParams }: Props) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        redirect('/login');
    }

    // Get user and their seller account
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { seller: true }
    });

    if (!user || !user.seller) {
        redirect('/login');
    }

    // Date Filtering Logic - await searchParams since it's a Promise in Next.js 15
    const resolvedParams = await searchParams;
    const startParam = resolvedParams.start as string;
    const endParam = resolvedParams.end as string;

    // Default to Last 30 Days if no params
    let startDate: Date;
    let endDate: Date;

    if (startParam && startParam.includes('T')) {
        startDate = new Date(startParam);
    } else {
        startDate = startParam ? dayjs(startParam).startOf('day').toDate() : dayjs('2000-01-01').startOf('day').toDate();
    }

    if (endParam && endParam.includes('T')) {
        endDate = new Date(endParam);
    } else {
        endDate = endParam ? dayjs(endParam).endOf('day').toDate() : dayjs().endOf('day').toDate();
    }

    const rawOrders = await prisma.order.findMany({
        where: {
            sellerId: user.seller.id,
            createdAt: {
                gte: startDate,
                lte: endDate
            }
        },
        include: { jobs: true }, // Include jobs for status check
        orderBy: { createdAt: 'desc' }
    });

    const orders = rawOrders.map(order => ({
        ...order,
        status: getDerivedOrderStatus(order)
    }));

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold"><Trans id="ordersPage.title" /></h2>
                <DateRangeFilter />
            </div>

            <SellerStats />

            <OrdersTable orders={orders} />
        </div>
    );
}
