import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import dayjs from 'dayjs';
import { getDerivedOrderStatus } from '@/lib/orderStatus';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        // Authentication
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { seller: { select: { id: true } } }
        });

        if (!user || !user.seller) {
            return NextResponse.json({ error: 'Seller specific route' }, { status: 403 });
        }

        const sellerId = user.seller.id;

        // Date Setup - Handle ISO strings correctly
        let startDate: Date;
        let endDate: Date;

        if (start && start.includes('T')) {
            startDate = new Date(start);
        } else {
            startDate = start ? dayjs(start).startOf('day').toDate() : dayjs('2000-01-01').startOf('day').toDate();
        }

        if (end && end.includes('T')) {
            endDate = new Date(end);
        } else {
            endDate = end ? dayjs(end).endOf('day').toDate() : dayjs().endOf('day').toDate();
        }

        // 1. Fetch Orders for counts within range
        const orders = await prisma.order.findMany({
            where: {
                sellerId: sellerId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                createdAt: true,
                status: true,
                jobs: {
                    select: {
                        status: true
                    }
                }
            }
        });

        // 2. Fetch Historical Data for Charts (Past 7 days/intervals relative to end date)
        // For sparklines, we usually show trend. 
        // If range is 1 day, show hourly? Or past 7 days?
        // Let's assume sparklines show the *selected range* distribution or past 7 days if range is small.
        // The requirement says "same as admin production release".
        // Admin production usually shows trends.

        // Let's create buckets based on the range duration.
        // If range <= 2 days -> Hourly buckets? No too detailed.
        // If range <= 31 days -> Daily buckets.
        // If range > 31 days -> Weekly/Monthly buckets.

        const bucketsMap = new Map<string, {
            date: string;
            total: number;
            pendingApproval: number;
            received: number;
            inProcess: number;
            completed: number;
            cancelled: number;
            rejected: number;
        }>();

        // Generate empty buckets
        let current = dayjs(startDate);
        while (current.isBefore(dayjs(endDate).add(1, 'hour'))) { // inclusive
            const format = 'YYYY-MM-DD';
            bucketsMap.set(current.format(format), {
                date: current.format(format),
                total: 0,
                pendingApproval: 0,
                received: 0,
                inProcess: 0,
                completed: 0,
                cancelled: 0,
                rejected: 0
            });
            current = current.add(1, 'day');
        }

        // Fill buckets with orders
        // Note: For "In Process" and "Completed", we might typically check when they *became* that status.
        // But for simple stats, we often just count "Current Status" of orders *created* in that range.
        // OR we count events.
        // The Admin stats usually counts "Current Status".

        // Let's stick to: Break down the "orders found in range" by their creation date for the "Received" chart.
        // For "In Process" and "Completed", it's tricky if we don't have event logs. 
        // Admin stats implementation (ProductionStats) likely does this:
        // It fetches stats for specific range.

        // Let's look at how we want to visualize.
        // Sparklines usually just show "Volume over time".
        // Received Trend: Count of orders created per day in range.
        // In Process Trend: Count of orders currently In Process (or moved to In Process) per day? 
        // Easier: Just count orders created per day, and categorize them.

        // Wait, "In Process" sparkline typically implies "How many orders were processed per day".
        // Without an event log table, we can only rely on `createdAt` or `updatedAt`.
        // Let's use `createdAt` for simplicty and consistency with what's likely in Admin.

        orders.forEach(order => {
            const derivedStatus = getDerivedOrderStatus(order);
            const key = dayjs(order.createdAt).format('YYYY-MM-DD');
            if (bucketsMap.has(key)) {
                const bucket = bucketsMap.get(key)!;
                bucket.total++;
                if (derivedStatus === 'PENDING_APPROVAL') {
                    bucket.pendingApproval++;
                }
                if (derivedStatus === 'RECEIVED') {
                    bucket.received++;
                }
                if (['IN_PROCESS', 'PRINTING', 'SEWING'].includes(derivedStatus)) {
                    bucket.inProcess++;
                }
                if (['COMPLETED', 'SHIPPED', 'READY_TO_SHIP'].includes(derivedStatus)) {
                    bucket.completed++;
                }
                if (derivedStatus === 'CANCELLED') {
                    bucket.cancelled++;
                }
                if (derivedStatus === 'REJECTED') {
                    bucket.rejected++;
                }
            }
        });

        const chartData = Array.from(bucketsMap.values());

        // Calculate Totals
        const countTotal = orders.length;
        const derivedStatuses = orders.map((order) => getDerivedOrderStatus(order));
        const countPendingApproval = derivedStatuses.filter(status => status === 'PENDING_APPROVAL').length;
        const countReceived = derivedStatuses.filter(status => status === 'RECEIVED').length;
        const countInProcess = derivedStatuses.filter(status => ['IN_PROCESS', 'PRINTING', 'SEWING'].includes(status)).length;
        const countCompleted = derivedStatuses.filter(status => ['COMPLETED', 'SHIPPED', 'READY_TO_SHIP'].includes(status)).length;
        const countCancelled = derivedStatuses.filter(status => status === 'CANCELLED').length;
        const countRejected = derivedStatuses.filter(status => status === 'REJECTED').length;

        // Map to Recharts format
        const totalChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.total }));
        const pendingApprovalChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.pendingApproval }));
        const receivedChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.received }));
        const inProcessChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.inProcess }));
        const completedChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.completed }));
        const cancelledChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.cancelled }));
        const rejectedChart = chartData.map(b => ({ name: dayjs(b.date).format('D/M'), value: b.rejected }));

        const response = NextResponse.json({
            total: { count: countTotal, chartData: totalChart },
            pendingApproval: { count: countPendingApproval, chartData: pendingApprovalChart },
            received: { count: countReceived, chartData: receivedChart },
            inProcess: { count: countInProcess, chartData: inProcessChart },
            completed: { count: countCompleted, chartData: completedChart },
            cancelled: { count: countCancelled, chartData: cancelledChart },
            rejected: { count: countRejected, chartData: rejectedChart }
        });
        response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
        response.headers.set('Vary', 'Cookie');
        return response;

    } catch (error) {
        console.error('Error fetching seller stats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
