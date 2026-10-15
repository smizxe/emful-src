import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '200', 10), 1), 500);
        const includeTotal = searchParams.get('includeTotal') === 'true';

        const where: any = {};
        if (status) {
            where.status = { in: status.split(',') };
        }

        // Seller filter for Seller Detail Modal
        const sellerId = searchParams.get('sellerId');
        if (sellerId) {
            where.sellerId = sellerId;
        }

        const start = searchParams.get('start');
        const end = searchParams.get('end');

        if (start && end) {
            // Check if ISO string (contains T)
            if (start.includes('T')) {
                where.createdAt = {
                    gte: new Date(start), // Trust the ISO string exactly
                    lte: new Date(end)
                };
            } else {
                // Fallback for old behavior (YYYY-MM-DD)
                const startDate = new Date(start);
                startDate.setHours(0, 0, 0, 0);

                const endDate = new Date(end);
                endDate.setHours(23, 59, 59, 999);

                where.createdAt = {
                    gte: startDate,
                    lte: endDate
                };
            }
        }

        const summaryWhere = {
            ...where,
            status: where.status
                ? {
                    ...where.status,
                    notIn: ['CANCELLED', 'REJECTED']
                }
                : {
                    notIn: ['CANCELLED', 'REJECTED']
                }
        };

        const [orders, total, totalOrdersForAmount] = await Promise.all([
            prisma.order.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit,
                select: {
                    id: true,
                    orderCode: true,
                    // ... (rest of selection is implied/kept if I match correctly, but replace_file_content replaces the whole block if I target it)
                    // I should target the Promise.all block specifically or be careful.
                    // The select block is huge. I'll stick to replacing the Promise.all call.
                    status: true,
                    shippingStatus: true,
                    totalAmount: true,
                    createdAt: true,
                    shippingCost: true,
                    trackingNumber: true,
                    carrier: true,
                    priorityProduction: true,
                    priorityShipping: true,
                    priorityProductionFee: true,
                    priorityShippingFee: true,
                    seller: {
                        select: {
                            id: true,
                            name: true,
                            contactEmail: true
                        }
                    },
                    jobs: {
                        select: {
                            id: true,
                            sku: true,
                            color: true,
                            size: true,
                            qty: true,
                            priceToCharge: true,
                            shippingCost: true,
                            extraFees: true,
                            recipientName: true,
                            phone: true,
                            address1: true,
                            address2: true,
                            city: true,
                            state: true,
                            zip: true,
                            country: true,
                            designs: true,
                            status: true,
                            notes: true
                        }
                    }
                }
            }),
            includeTotal ? prisma.order.count({ where: summaryWhere }) : Promise.resolve(0),
            includeTotal ? prisma.order.findMany({
                where: summaryWhere,
                select: {
                    priorityProduction: true,
                    priorityShipping: true,
                    priorityProductionFee: true,
                    priorityShippingFee: true,
                    jobs: {
                        select: {
                            qty: true,
                            priceToCharge: true,
                            shippingCost: true,
                            extraFees: true
                        }
                    }
                }
            }) : Promise.resolve([])
        ]);

        const totalAmount = includeTotal
            ? totalOrdersForAmount.reduce((sum, order) => {
                const jobsTotal = order.jobs.reduce(
                    (jobSum, job) => jobSum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
                    0
                );
                const priorityTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
                    + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
                return sum + jobsTotal + priorityTotal;
            }, 0)
            : 0;

        if (includeTotal) {
            const response = NextResponse.json({
                data: orders,
                meta: {
                    page,
                    limit,
                    total,
                    totalAmount,
                    totalPages: Math.max(Math.ceil(total / limit), 1)
                }
            });
            response.headers.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=20');
            return response;
        }

        const response = NextResponse.json(orders);
        response.headers.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=20');
        return response;
    } catch (error) {
        console.error("Orders Fetch Error:", error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}

