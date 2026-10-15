import { prisma } from '@/lib/prisma';

export interface AdminWalletTransaction {
    id: string;
    type: string;
    amount: number;
    displayAmount?: number | null;
    status: string;
    createdAt: string;
    user: {
        email: string;
        name: string | null;
    };
    isRequest?: boolean;
    currency?: string;
    exchangeRate?: number | null;
    amountReceived?: number | null;
    refId?: string | null;
    orderId?: string | null;
    orderCode?: string | null;
    recipientName?: string | null;
    note?: string | null;
    evidenceUrl?: string | null;
}

export interface AdminWalletUser {
    id: string;
    email: string;
    name: string | null;
    balance: number;
}

export interface AdminWalletData {
    transactions: AdminWalletTransaction[];
    users: AdminWalletUser[];
    summary?: {
        totalTopUp: number;
        totalCost: number;
        totalRefund: number;
        totalAmount: number;
        currentBalance: number;
    };
}

function isTopUpEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'CREDIT' && entry.refType === 'TOPUP';
}

function isRefundEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'REFUND' || (entry.type === 'CREDIT' && entry.refType !== 'TOPUP');
}

function isCostEntry(entry: { type: string; refType: string | null }) {
    return entry.type === 'DEBIT' || entry.type === 'ADDITIONAL_CHARGE';
}

export async function getAdminWalletData(sellerId?: string | null, page = 1, limit = 50): Promise<AdminWalletData> {
    const ledgerWhere: { sellerId?: string } = {};
    if (sellerId) {
        ledgerWhere.sellerId = sellerId;
    }

    const ledgerEntries = await prisma.walletLedger.findMany({
        where: ledgerWhere,
        include: { seller: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit
    });

    const pendingRequests = await prisma.topupRequest.findMany({
        where: {
            status: 'PENDING',
            ...(sellerId ? { sellerId } : {})
        },
        include: { seller: { include: { users: true } } },
        orderBy: { createdAt: 'desc' }
    });

    const pendingFormatted = pendingRequests.map(req => ({
        id: req.id,
        type: 'TOP_UP_REQUEST',
        amount: req.amount,
        status: 'PENDING',
        createdAt: req.createdAt.toISOString(),
        user: {
            email: req.seller.users[0]?.email || req.seller.contactEmail || req.seller.name,
            name: req.seller.name
        },
        isRequest: true,
        currency: req.currency,
        exchangeRate: req.exchangeRate,
        amountReceived: req.amountReceived,
        evidenceUrl: req.evidenceUrl
    }));

    const orderIds = ledgerEntries
        .filter((entry) => entry.refType === 'ORDER' && entry.refId)
        .map((entry) => entry.refId as string);
    const jobIds = ledgerEntries
        .filter((entry) => ['JOB', 'JOB_CHARGE'].includes(entry.refType) && entry.refId)
        .map((entry) => entry.refId as string);
    const refundOrderCodes = ledgerEntries
        .filter((entry) => ['REFUND_ORDER', 'ORDER_REFUND'].includes(entry.refType) && entry.refId)
        .map((entry) => entry.refId as string);

    const [ordersById, jobsById, ordersByCode] = await Promise.all([
        orderIds.length > 0
            ? prisma.order.findMany({
                where: { id: { in: orderIds } },
                select: {
                    id: true,
                    orderCode: true,
                    priorityProduction: true,
                    priorityShipping: true,
                    priorityProductionFee: true,
                    priorityShippingFee: true,
                    jobs: {
                        select: {
                            recipientName: true,
                            qty: true,
                            priceToCharge: true,
                            shippingCost: true,
                            extraFees: true,
                        }
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
                            orderCode: true,
                            priorityProduction: true,
                            priorityShipping: true,
                            priorityProductionFee: true,
                            priorityShippingFee: true,
                            jobs: {
                                select: {
                                    qty: true,
                                    priceToCharge: true,
                                    shippingCost: true,
                                    extraFees: true,
                                }
                            }
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
                    priorityProduction: true,
                    priorityShipping: true,
                    priorityProductionFee: true,
                    priorityShippingFee: true,
                    jobs: {
                        select: {
                            recipientName: true,
                            qty: true,
                            priceToCharge: true,
                            shippingCost: true,
                            extraFees: true,
                        }
                    }
                }
            })
            : Promise.resolve([]),
    ]);

    const getOrderGrandTotal = (order: {
        jobs: Array<{ qty: number; priceToCharge: number | null; shippingCost: number | null; extraFees: number | null }>;
        priorityProduction?: boolean | null;
        priorityShipping?: boolean | null;
        priorityProductionFee?: number | null;
        priorityShippingFee?: number | null;
    }) => {
        const jobsTotal = order.jobs.reduce(
            (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
            0
        );
        const priorityTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
            + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
        return Number((jobsTotal + priorityTotal).toFixed(2));
    };

    const orderByIdMap = new Map(ordersById.map((order) => [
        order.id,
        {
            orderCode: order.orderCode,
            recipientName: order.jobs[0]?.recipientName || null,
            grandTotal: getOrderGrandTotal(order),
        }
    ]));
    const jobByIdMap = new Map(jobsById.map((job) => [
        job.id,
        {
            orderId: job.order.id,
            orderCode: job.order.orderCode,
            recipientName: job.recipientName || null,
            grandTotal: getOrderGrandTotal(job.order),
        }
    ]));
    const orderByCodeMap = new Map(ordersByCode.map((order) => [
        order.orderCode,
        {
            orderId: order.id,
            recipientName: order.jobs[0]?.recipientName || null,
            grandTotal: getOrderGrandTotal(order),
        }
    ]));

    const ledgerFormatted = ledgerEntries.map((entry) => {
        let orderId = null;
        let orderCode = null;
        let recipientName = null;
        let displayAmount: number | null = null;
        const isPrimaryOrderPayment = entry.type === 'DEBIT'
            && entry.refType === 'ORDER'
            && entry.note?.startsWith('Payment for Order');

        if (entry.refType === 'ORDER' && entry.refId) {
            const order = orderByIdMap.get(entry.refId);
            orderId = entry.refId;
            orderCode = order?.orderCode || null;
            recipientName = order?.recipientName || null;
            displayAmount = isPrimaryOrderPayment
                && order?.grandTotal != null
                && Math.abs(Math.abs(entry.amount) - order.grandTotal) < 0.01
                ? order.grandTotal
                : null;
        } else if (['JOB', 'JOB_CHARGE'].includes(entry.refType) && entry.refId) {
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
            type: entry.refType === 'TOPUP' ? 'ADMIN_TOP_UP' : entry.type,
            amount: entry.amount,
            displayAmount,
            status: 'COMPLETED',
            createdAt: entry.createdAt.toISOString(),
            user: {
                email: entry.seller.contactEmail || entry.seller.name,
                name: entry.seller.name
            },
            isRequest: false,
            refId: entry.refId,
            orderId,
            orderCode,
            recipientName,
            note: entry.note
        };
    });

    const sellers = await prisma.seller.findMany({
        include: {
            wallet: true,
            users: { select: { email: true }, take: 1 }
        }
    });

    const users = sellers.map(seller => ({
        id: seller.id,
        email: seller.users[0]?.email || seller.contactEmail || seller.code,
        name: seller.name,
        balance: seller.wallet?.balance || 0
    }));

    let summary: AdminWalletData['summary'] | undefined;

    if (sellerId) {
        const [wallet, summaryEntries] = await Promise.all([
            prisma.wallet.findUnique({
                where: { sellerId },
                select: { balance: true }
            }),
            prisma.walletLedger.findMany({
                where: { sellerId },
                select: {
                    type: true,
                    amount: true,
                    refType: true,
                }
            })
        ]);

        let totalTopUp = 0;
        let totalCost = 0;
        let totalRefund = 0;

        for (const entry of summaryEntries) {
            const amount = Math.abs(entry.amount || 0);

            if (isTopUpEntry(entry)) {
                totalTopUp += amount;
                continue;
            }

            if (isCostEntry(entry)) {
                totalCost += amount;
                continue;
            }

            if (isRefundEntry(entry)) {
                totalRefund += amount;
            }
        }

        summary = {
            totalTopUp,
            totalCost,
            totalRefund,
            totalAmount: Math.max(totalCost - totalRefund, 0),
            currentBalance: wallet?.balance || 0,
        };
    }

    return {
        transactions: [...pendingFormatted, ...ledgerFormatted],
        users,
        summary
    };
}

export async function getVndUsdRate() {
    const setting = await prisma.systemSetting.findUnique({
        where: { key: 'VND_USD_RATE' }
    });

    return setting ? parseFloat(setting.value) : 25000;
}
