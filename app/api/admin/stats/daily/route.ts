
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import dayjs from 'dayjs';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date');

    if (!dateStr) {
        return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // Define start and end of the day
    // Handle ISO timestamps (containing 'T') directly
    let startOfDay: Date;
    let endOfDay: Date;

    if (dateStr.includes('T')) {
        // If it's an ISO string with time, use it directly as start and calculate end
        startOfDay = new Date(dateStr);
        endOfDay = dayjs(dateStr).endOf('day').toDate();
    } else {
        // Assuming dateStr is YYYY-MM-DD
        startOfDay = dayjs(dateStr).startOf('day').toDate();
        endOfDay = dayjs(dateStr).endOf('day').toDate();
    }

    try {
        const [orders, transactions, dailyJobs] = await Promise.all([
            prisma.order.findMany({
                where: {
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay
                    }
                },
                select: {
                    id: true,
                    orderCode: true,
                    status: true,
                    totalAmount: true,
                    seller: { select: { name: true } },
                    jobs: {
                        select: {
                            cogsActual: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.walletLedger.findMany({
                where: { createdAt: { gte: startOfDay, lte: endOfDay } },
                orderBy: { createdAt: 'desc' },
                include: { seller: { select: { name: true } } }
            }),
            prisma.job.findMany({
                where: { createdAt: { gte: startOfDay, lte: endOfDay } },
                orderBy: { createdAt: 'desc' },
                include: { order: { select: { orderCode: true } } }
            })
        ]);

        const totalOrders = orders.length;
        const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

        let totalCost = 0;
        orders.forEach((order) => {
            order.jobs.forEach((job) => {
                totalCost += (job.cogsActual || 0);
            });
        });

        // Shipping cost might be on the Order or Job?
        // Schema: Product.shippingRates, Order.totalAmount. 
        // We probably don't have exact shipping cost TO US recorded unless stored in cogsActual.
        // Let's stick to base cogs for now.

        const netProfit = totalRevenue - totalCost;

        const response = NextResponse.json({
            totalOrders,
            totalRevenue,
            totalCost,
            netProfit,
            orders: orders.map(o => ({
                id: o.id,
                orderCode: o.orderCode,
                status: o.status,
                totalAmount: o.totalAmount,
                seller: o.seller
            })),
            transactions,
            jobs: dailyJobs.map(j => ({
                id: j.id,
                status: j.status,
                order: j.order,
                jobCode: j.jobCode
            }))
        });
        response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60');
        return response;

    } catch (error) {
        console.error('Error fetching daily stats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
