import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import dayjs from 'dayjs';

export async function GET(req: NextRequest) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(req.url);
        const dateParam = searchParams.get('date');

        if (!dateParam) {
            return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
        }

        const sellerId = searchParams.get('sellerId');
        const status = searchParams.get('status');

        const targetDate = dayjs(dateParam);

        // Handle ISO timestamps correctly
        let startOfDay: Date;
        let endOfDay: Date;

        if (dateParam.includes('T')) {
            startOfDay = new Date(dateParam);
            endOfDay = targetDate.endOf('day').toDate();
        } else {
            startOfDay = targetDate.startOf('day').toDate();
            endOfDay = targetDate.endOf('day').toDate();
        }

        // 1. Fetch Orders created on this day
        const orders = await prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                ...(sellerId ? { sellerId } : {}),
                ...(status ? { status } : {}),
            },
            include: {
                seller: {
                    select: {
                        name: true,
                        code: true,
                    }
                },
                _count: {
                    select: { jobs: true } // Item count usually corresponds to jobs in this system
                },
                jobs: {
                    select: { qty: true }
                }
            },
            orderBy: {
                createdAt: 'desc',
            }
        });

        // Post-process orders to calculate total items
        const ordersWithTotalItems = orders.map(order => ({
            ...order,
            totalItems: order.jobs.reduce((sum, job) => sum + job.qty, 0)
        }));

        // 2. Fetch Wallet Transactions on this day
        // Note: Status filter applies to Order status, might cause transactions to be empty if filtered strictly?
        // Wallet ledger doesn't have "status" like orders. It has "type" (CREDIT/DEBIT).
        // If "status" is present (e.g., COMPLETED, PENDING), it likely doesn't apply to Wallet Ledger directly?
        // OR does it apply to the related Order? WalletLedger has refId -> Order?
        // Usually financial reports filtering by "Status=Cancelled" implies showing cancelled orders' revenue (should be 0 or refund).
        // For Wallet Ledger, if user filters by Status, we probably should ONLY show it if it relates to orders of that status, which is complex.
        // DECISION: If status filter is active, we might SKIP wallet transactions or only show those related to orders?
        // For now, let's only filter Wallet Transactions by SELLER ID. Status filter will stick to Orders.
        // User asked: "filter for order, seller".
        const transactions = status
            ? [] // If filtering by Order Status, wallet transactions (topups, fees) might not be relevant or easily filterable.
            : await prisma.walletLedger.findMany({
                where: {
                    createdAt: {
                        gte: startOfDay,
                        lte: endOfDay,
                    },
                    ...(sellerId ? { sellerId } : {}),
                },
                include: {
                    seller: {
                        select: {
                            name: true,
                            code: true,
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc',
                }
            });

        return NextResponse.json({
            orders: ordersWithTotalItems,
            transactions,
        });

    } catch (error) {
        console.error('Error fetching daily details:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
