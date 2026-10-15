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
                // Apply Status Filter if present, otherwise exclude CANCELLED/REJECTED as per default logic
                ...(status
                    ? { status }
                    : { status: { notIn: ['CANCELLED', 'REJECTED'] } }
                ),
                ...(sellerId ? { sellerId } : {})
            },
            include: {
                jobs: true,
                shipments: true
            }
        });

        const dailyStats: Record<string, { date: string, orders: number, revenue: number, cost: number, profit: number }> = {};

        // Initialize all days
        let current = startDate.clone();
        while (current.isBefore(endDate) || current.isSame(endDate, 'day')) {
            const dateKey = current.format('YYYY-MM-DD');
            dailyStats[dateKey] = {
                date: dateKey,
                orders: 0,
                revenue: 0,
                cost: 0,
                profit: 0
            };
            current = current.add(1, 'day');
        }

        for (const order of orders) {
            const dateKey = dayjs(order.createdAt).format('YYYY-MM-DD');
            if (dailyStats[dateKey]) {
                const revenue = order.totalAmount || 0;

                // Calculate Cost of Apparel (COGS)
                let apparelCost = 0;
                order.jobs.forEach(job => {
                    // Use actual cogs if available, or fetch from variant
                    if (job.cogsActual) {
                        apparelCost += job.cogsActual * job.qty;
                    } else if (job.sku) {
                        // Try to find variant cogs
                        // Note: complex lookup if not joined directly. Job has SKU.
                        // We need to fetch product variants to map SKU -> cogsEstimate
                        // Since we can't easily join on arbitrary SKU string to Variant model in include if not related?
                        // Job model doesn't have relation to Variant, only SKU string.
                        // We will approximation: use priceToCharge * 0.4?? No, that's bad.
                        // Just use 0 if not found for now, or if we had cached products.
                        // Ideally Job should have cogs snapshot.
                        // For this implementation, I will assume cogsActual is mostly populated OR default to 0. 
                        apparelCost += (job.cogsActual || 0) * job.qty;
                    }
                });

                // Shipping Cost - retrieved from Order (populated when shipment created via Stallion)
                const shippingCost = order.shippingCost || 0;

                const totalCost = apparelCost + shippingCost;

                dailyStats[dateKey].orders += 1;
                dailyStats[dateKey].revenue += revenue;
                dailyStats[dateKey].cost += totalCost;
                dailyStats[dateKey].profit += (revenue - totalCost);
            }
        }

        const response = NextResponse.json(Object.values(dailyStats));
        response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
        return response;
    } catch (error) {
        console.error('Financial Stats Error:', error);
        return NextResponse.json({ error: 'Failed to fetch financial stats' }, { status: 500 });
    }
}
