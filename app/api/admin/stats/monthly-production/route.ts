import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { NextResponse } from 'next/server';
import dayjs from 'dayjs';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const { searchParams } = new URL(request.url);

    // Support both startDate/endDate (new) and month/year (legacy)
    let startDate, endDate;

    if (searchParams.get('startDate') && searchParams.get('endDate')) {
        // Client sends ISO timestamps with proper timezone-aware day boundaries
        startDate = dayjs(searchParams.get('startDate'));
        endDate = dayjs(searchParams.get('endDate'));
    } else {
        const month = parseInt(searchParams.get('month') || dayjs().month().toString());
        const year = parseInt(searchParams.get('year') || dayjs().year().toString());
        startDate = dayjs().year(year).month(month).startOf('month');
        endDate = dayjs().year(year).month(month).endOf('month');
    }

    // Cap endDate to today if it's in the future (for current month accuracy)
    const today = dayjs().endOf('day');
    if (endDate.isAfter(today)) {
        endDate = today;
    }

    const sellerId = searchParams.get('sellerId');
    const status = searchParams.get('status');

    try {
        const orders = await prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startDate.toDate(),
                    lte: endDate.toDate()
                },
                ...(sellerId ? { sellerId } : {}),
                ...(status ? { status } : {}),
            },
            select: {
                id: true,
                status: true,
                createdAt: true
            }
        });

        const dailyStats: Record<string, { date: string, totalOrders: number, received: number, processing: number, shipped: number, cancelled: number }> = {};

        // Initialize all days
        let current = startDate.clone();
        while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
            const dateKey = current.format('YYYY-MM-DD');
            dailyStats[dateKey] = {
                date: dateKey,
                totalOrders: 0,
                received: 0,
                processing: 0,
                shipped: 0,
                cancelled: 0
            };
            current = current.add(1, 'day');
        }

        for (const order of orders) {
            const dateKey = dayjs(order.createdAt).format('YYYY-MM-DD');
            if (dailyStats[dateKey]) {
                const status = (order.status || '').toUpperCase();
                dailyStats[dateKey].totalOrders += 1;

                if (status.includes('CANCEL') || status.includes('REJECT')) {
                    dailyStats[dateKey].cancelled += 1;
                } else if (status.includes('COMPLETED') || status.includes('SHIPPED')) {
                    dailyStats[dateKey].shipped += 1;
                } else if (status.includes('PROCESS')) {
                    dailyStats[dateKey].processing += 1;
                } else if (status.includes('RECEIVED') || status.includes('PAID') || status.includes('PENDING')) {
                    dailyStats[dateKey].received += 1;
                }
            }
        }

        const response = NextResponse.json(Object.values(dailyStats));
        response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
        return response;
    } catch (error) {
        console.error('Production Stats Error:', error);
        return NextResponse.json({ error: 'Failed to fetch production stats' }, { status: 500 });
    }
}
