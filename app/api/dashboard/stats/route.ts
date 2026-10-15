import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dayjs from 'dayjs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'month'; // day, month, year
    const date = searchParams.get('date') || dayjs().toISOString();

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { seller: { select: { id: true } } }
    });

    if (!user || !user.seller) {
        return new NextResponse('Unauthorized - Seller not found', { status: 401 });
    }

    const sellerId = user.seller.id;

    let startDate = dayjs(date);
    let endDate = dayjs(date);
    let groupByFormat = 'DD/MM';
    let unit: 'hour' | 'day' | 'month' = 'day';

    if (range === 'day') {
        startDate = dayjs(date).startOf('day');
        endDate = dayjs(date).endOf('day');
        groupByFormat = 'HH:00';
        unit = 'hour';
    } else if (range === 'month') {
        startDate = dayjs(date).startOf('month');
        endDate = dayjs(date).endOf('month');
        groupByFormat = 'DD/MM';
        unit = 'day';
    } else if (range === 'year') {
        startDate = dayjs(date).startOf('year');
        endDate = dayjs(date).endOf('year');
        groupByFormat = 'MMM';
        unit = 'month';
    }

    // 1. Fetch Orders in range
    const orders = await prisma.order.findMany({
        where: {
            sellerId,
            createdAt: {
                gte: startDate.toDate(),
                lte: endDate.toDate()
            }
        },
        select: {
            createdAt: true,
            totalAmount: true,
            status: true
        }
    });

    // 2. Process Data for Charts
    const chartData: Record<string, { label: string; orders: number; cost: number; completed: number }> = {};

    // Initialize chart data with empty values to ensure continuity
    let current = startDate.clone();
    /* eslint-disable-next-line no-constant-condition */
    while (true) {
        if (current.isAfter(endDate)) break;

        let label = current.format(groupByFormat);
        if (range === 'day') label = current.format('HH:00');

        chartData[label] = {
            label,
            orders: 0,
            cost: 0,
            completed: 0
        };

        current = current.add(1, unit);
    }

    orders.forEach(order => {
        let label = dayjs(order.createdAt).format(groupByFormat);
        if (range === 'day') label = dayjs(order.createdAt).format('HH:00');

        if (chartData[label]) {
            chartData[label].orders += 1;
            chartData[label].cost += order.totalAmount; // Assuming totalAmount is 'Cost of Fulfillment' for seller
            if (order.status === 'COMPLETED') {
                chartData[label].completed += 1;
            }
        }
    });

    const response = NextResponse.json({
        data: Object.values(chartData)
    });
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    response.headers.set('Vary', 'Cookie');
    return response;
}
