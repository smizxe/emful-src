import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import dayjs from 'dayjs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'month';
    const date = searchParams.get('date') || dayjs().toISOString();
    // Optional ledger filters so the dashboard stats can deep-link to a subset
    // (e.g. ?type=REFUND shows refunds only).
    const typeFilter = searchParams.get('type');
    const refTypeFilter = searchParams.get('refType');

    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { seller: { include: { wallet: true } } }
    });

    if (!user || !user.seller) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    let startDate = dayjs(date);
    let endDate = dayjs(date);

    if (range === 'day') {
        startDate = dayjs(date).startOf('day');
        endDate = dayjs(date).endOf('day');
    } else if (range === 'month') {
        startDate = dayjs(date).startOf('month');
        endDate = dayjs(date).endOf('month');
    } else if (range === 'year') {
        startDate = dayjs(date).startOf('year');
        endDate = dayjs(date).endOf('year');
    } else if (range === 'all') {
        startDate = dayjs('2000-01-01').startOf('day');
        endDate = dayjs().endOf('day');
    }

    const ledgerEntries = await prisma.walletLedger.findMany({
        where: {
            sellerId: user.seller.id,
            createdAt: {
                gte: startDate.toDate(),
                lte: endDate.toDate()
            },
            ...(typeFilter ? { type: typeFilter } : {}),
            ...(refTypeFilter ? { refType: refTypeFilter } : {})
        },
        orderBy: { createdAt: 'desc' }
    });

    const orderIds = ledgerEntries
        .filter((entry) => entry.refType === 'ORDER' && entry.refId)
        .map((entry) => entry.refId as string);
    const jobIds = ledgerEntries
        .filter((entry) => entry.refType === 'JOB' && entry.refId)
        .map((entry) => entry.refId as string);
    const refundOrderCodes = ledgerEntries
        .filter((entry) => ['REFUND_ORDER', 'ORDER_REFUND'].includes(entry.refType) && entry.refId)
        .map((entry) => entry.refId as string);

    const [ordersById, jobsById, ordersByCode, summaryOrdersForAmount, topUpSummary] = await Promise.all([
        orderIds.length > 0
            ? prisma.order.findMany({
                where: { id: { in: orderIds } },
                select: {
                    id: true,
                    orderCode: true,
                    jobs: {
                        select: { recipientName: true },
                        take: 1
                    }
                }
            })
            : Promise.resolve([]),
        jobIds.length > 0
            ? prisma.job.findMany({
                where: { id: { in: jobIds } },
                select: {
                    id: true,
                    recipientName: true,
                    order: {
                        select: {
                            id: true,
                            orderCode: true
                        }
                    }
                }
            })
            : Promise.resolve([]),
        refundOrderCodes.length > 0
            ? prisma.order.findMany({
                where: { orderCode: { in: refundOrderCodes } },
                select: {
                    id: true,
                    orderCode: true,
                    jobs: {
                        select: { recipientName: true },
                        take: 1
                    }
                }
            })
            : Promise.resolve([]),
        prisma.order.findMany({
            where: {
                sellerId: user.seller.id,
                status: {
                    notIn: ['CANCELLED', 'REJECTED']
                },
                createdAt: {
                    gte: startDate.toDate(),
                    lte: endDate.toDate()
                }
            },
            select: {
                id: true,
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
        }),
        prisma.walletLedger.aggregate({
            where: {
                sellerId: user.seller.id,
                type: 'CREDIT',
                refType: 'TOPUP',
                createdAt: {
                    gte: startDate.toDate(),
                    lte: endDate.toDate()
                }
            },
            _sum: { amount: true }
        })
    ]);

    const orderByIdMap = new Map(ordersById.map((order) => [
        order.id,
        {
            orderCode: order.orderCode,
            recipientName: order.jobs[0]?.recipientName || null
        }
    ]));
    const jobByIdMap = new Map(jobsById.map((job) => [
        job.id,
        {
            orderId: job.order.id,
            orderCode: job.order.orderCode,
            recipientName: job.recipientName || null
        }
    ]));
    const orderByCodeMap = new Map(ordersByCode.map((order) => [
        order.orderCode,
        {
            orderId: order.id,
            recipientName: order.jobs[0]?.recipientName || null
        }
    ]));

    const transactions = ledgerEntries.map((entry) => {
        let orderId: string | null = null;
        let orderCode: string | null = null;
        let recipientName: string | null = null;

        if (entry.refType === 'ORDER' && entry.refId) {
            const order = orderByIdMap.get(entry.refId);
            orderId = entry.refId;
            orderCode = order?.orderCode || null;
            recipientName = order?.recipientName || null;
        } else if (entry.refType === 'JOB' && entry.refId) {
            const job = jobByIdMap.get(entry.refId);
            orderId = job?.orderId || null;
            orderCode = job?.orderCode || null;
            recipientName = job?.recipientName || null;
        } else if (['REFUND_ORDER', 'ORDER_REFUND'].includes(entry.refType) && entry.refId) {
            orderCode = entry.refId;
            orderId = orderByCodeMap.get(entry.refId)?.orderId || null;
            recipientName = orderByCodeMap.get(entry.refId)?.recipientName || null;
        }

        return {
            id: entry.id,
            type: entry.type,
            amount: entry.amount,
            currency: entry.currency,
            refType: entry.refType,
            refId: entry.refId,
            orderId,
            orderCode,
            recipientName,
            note: entry.note,
            createdAt: entry.createdAt
        };
    });

    const summaryTotalAmount = summaryOrdersForAmount.reduce((sum, order) => {
        const jobsTotal = order.jobs.reduce(
            (jobSum, job) => jobSum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
            0
        );
        const priorityTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
            + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
        return sum + jobsTotal + priorityTotal;
    }, 0);

    return NextResponse.json({
        transactions,
        currentBalance: user.seller.wallet?.balance ?? 0,
        summary: {
            totalOrders: summaryOrdersForAmount.length,
            totalAmount: summaryTotalAmount,
            amountToppedUp: topUpSummary._sum.amount ?? 0,
            currentBalance: user.seller.wallet?.balance ?? 0
        }
    });
}

