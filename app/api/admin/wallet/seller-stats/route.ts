import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

function isTopUpEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'CREDIT' && entry.refType === 'TOPUP';
}

function isRefundEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'REFUND' || (entry.type === 'CREDIT' && entry.refType !== 'TOPUP');
}

function isCostEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'DEBIT' || entry.type === 'ADDITIONAL_CHARGE';
}

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const start = searchParams.get('start');
        const end = searchParams.get('end');
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.max(parseInt(searchParams.get('limit') || '20', 10), 1);
        const skip = (page - 1) * limit;

        // Date filters
        const dateFilter: any = {};
        const ledgerDateFilter: any = {};

        if (start && end) {
            const dateRange = {
                gte: new Date(start),
                lte: new Date(end)
            };
            dateFilter.createdAt = dateRange;
            ledgerDateFilter.createdAt = dateRange;
        }

        // 0. Get Total Sellers for Pagination
        const totalSellers = await prisma.seller.count();

        // 1. Fetch Paginated sellers (1 Query)
        const sellers = await prisma.seller.findMany({
            include: {
                wallet: true,
                users: { select: { email: true, name: true }, take: 1 }
            },
            take: limit,
            skip: skip,
            orderBy: { name: 'asc' }
        });

        const sellerIds = sellers.map(s => s.id);

        if (sellerIds.length === 0) {
            return NextResponse.json({
                all: null,
                sellers: [],
                meta: { page, limit, total: totalSellers, totalPages: Math.ceil(totalSellers / limit) }
            });
        }

        const ledgerSummaryEntries = await prisma.walletLedger.findMany({
            where: {
                sellerId: { in: sellerIds },
                ...ledgerDateFilter
            },
            select: {
                sellerId: true,
                type: true,
                refType: true,
                amount: true,
            }
        });

        const topUpMap = new Map<string, number>();
        const debitMap = new Map<string, number>();
        const refundMap = new Map<string, number>();

        for (const entry of ledgerSummaryEntries) {
            const amount = Math.abs(entry.amount || 0);
            const sellerId = entry.sellerId;

            if (isTopUpEntry(entry)) {
                topUpMap.set(sellerId, (topUpMap.get(sellerId) || 0) + amount);
                continue;
            }

            if (isCostEntry(entry)) {
                debitMap.set(sellerId, (debitMap.get(sellerId) || 0) + amount);
                continue;
            }

            if (isRefundEntry(entry)) {
                refundMap.set(sellerId, (refundMap.get(sellerId) || 0) + amount);
            }
        }

        // 3. Job Cancel Count - count of JOB refund transactions in date range
        const jobCancelsInit = await prisma.walletLedger.groupBy({
            by: ['sellerId'],
            where: {
                sellerId: { in: sellerIds },
                type: 'REFUND',
                OR: [
                    { refType: 'JOB' },
                    {
                        refType: 'ORDER',
                        note: { startsWith: 'Refund for cancelled job' }
                    }
                ],
                ...ledgerDateFilter
            },
            _count: { id: true }
        });

        // 6. Order Stats (1 Query) - For counts only (orders created in range)
        const ordersInit = await prisma.order.groupBy({
            by: ['sellerId', 'status'],
            where: {
                sellerId: { in: sellerIds },
                ...dateFilter
            },
            _count: { id: true }
        });

        // Use Maps for O(1) lookup
        const jobCancelMap = new Map(jobCancelsInit.map(i => [i.sellerId, i._count.id || 0]));

        const orderMap = new Map<string, { total: number, cancelled: number, real: number }>();

        ordersInit.forEach(item => {
            const curr = orderMap.get(item.sellerId) || { total: 0, cancelled: 0, real: 0 };
            const count = item._count.id;

            if (!['CANCELLED', 'REJECTED'].includes(item.status)) {
                curr.total += count;
            }

            if (['CANCELLED', 'REJECTED', 'REFUNDED'].includes(item.status)) {
                curr.cancelled += count;
            } else {
                curr.real += count;
            }
            orderMap.set(item.sellerId, curr);
        });

        // Combine Data (Sellers Page)
        const sellerStats = sellers.map(seller => {
            const sId = seller.id;
            const oStats = orderMap.get(sId) || { total: 0, cancelled: 0, real: 0 };

            const totalTopUp = topUpMap.get(sId) || 0;
            const totalCost = debitMap.get(sId) || 0;
            const refund = refundMap.get(sId) || 0;
            const jobCancel = jobCancelMap.get(sId) || 0;

            const totalOrders = oStats.total;
            const realOrders = oStats.real;

            const realCost = totalCost - refund;
            const balance = seller.wallet?.balance || 0;

            return {
                sellerId: sId,
                sellerName: seller.name,
                sellerCode: seller.code,
                email: seller.users[0]?.email || seller.contactEmail,
                totalTopUp,
                totalOrders,
                jobCancel, // Changed from orderCancel
                realOrders,
                totalCost,
                refund,
                realCost,
                balance
            };
        });

        // GLOBAL TOTALS - Filter by ledger date (transaction date)
        const [globalLedgerEntries, globalJobCancel, globalOrders] = await Promise.all([
            prisma.walletLedger.findMany({
                where: { ...ledgerDateFilter },
                select: {
                    type: true,
                    refType: true,
                    amount: true
                }
            }),
            prisma.walletLedger.count({
                where: {
                    type: 'REFUND',
                    OR: [
                        { refType: 'JOB' },
                        {
                            refType: 'ORDER',
                            note: { startsWith: 'Refund for cancelled job' }
                        }
                    ],
                    ...ledgerDateFilter
                }
            }),
            prisma.order.groupBy({
                by: ['status'],
                where: { ...dateFilter },
                _count: { id: true }
            })
        ]);

        // Process Global Orders
        let globalTotalOrders = 0;
        let globalReal = 0;

        globalOrders.forEach(g => {
            const count = g._count.id;
            if (!['CANCELLED', 'REJECTED'].includes(g.status)) {
                globalTotalOrders += count;
            }
            if (!['CANCELLED', 'REJECTED', 'REFUNDED'].includes(g.status)) {
                globalReal += count;
            }
        });

        let globalTopUpAmount = 0;
        let globalTotalCost = 0;
        let globalRefundAmount = 0;

        for (const entry of globalLedgerEntries) {
            const amount = Math.abs(entry.amount || 0);
            if (isTopUpEntry(entry)) {
                globalTopUpAmount += amount;
                continue;
            }
            if (isCostEntry(entry)) {
                globalTotalCost += amount;
                continue;
            }
            if (isRefundEntry(entry)) {
                globalRefundAmount += amount;
            }
        }

        const allStats = {
            sellerId: 'ALL',
            sellerName: 'ALL SELLERS',
            sellerCode: 'ALL',
            email: '',
            totalTopUp: globalTopUpAmount,
            totalOrders: globalTotalOrders,
            jobCancel: globalJobCancel, // Changed from orderCancel
            realOrders: globalReal,
            totalCost: globalTotalCost,
            refund: globalRefundAmount,
            realCost: globalTotalCost - globalRefundAmount,
            balance: 0
        };

        // Total Balance
        const totalBalance = await prisma.wallet.aggregate({ _sum: { balance: true } });
        allStats.balance = totalBalance._sum.balance || 0;


        return NextResponse.json({
            all: allStats,
            sellers: sellerStats,
            meta: {
                page,
                limit,
                total: totalSellers,
                totalPages: Math.ceil(totalSellers / limit)
            }
        });

    } catch (error: any) {
        console.error('Seller Stats Error:', error);
        return NextResponse.json({ error: 'Failed to fetch seller stats' }, { status: 500 });
    }
}

