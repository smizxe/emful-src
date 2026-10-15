import dayjs from 'dayjs';
import { prisma } from '@/lib/prisma';
import OrderHistoryClient from './OrderHistoryClient';
import { requirePageRole } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function OrderHistoryPage({ searchParams }: Props) {
    await requirePageRole(['ADMIN']);

    const resolvedParams = await searchParams;
    const startParam = resolvedParams.start as string | undefined;
    const endParam = resolvedParams.end as string | undefined;

    const where: any = {
        status: {
            in: ['READY_TO_SHIP', 'COMPLETED', 'SHIPPED', 'CANCELLED']
        }
    };

    if (startParam && endParam) {
        const startDate = startParam.includes('T')
            ? new Date(startParam)
            : dayjs(startParam).startOf('day').toDate();
        const endDate = endParam.includes('T')
            ? new Date(endParam)
            : dayjs(endParam).endOf('day').toDate();

        where.createdAt = {
            gte: startDate,
            lte: endDate
        };
    }

    const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            orderCode: true,
            status: true,
            shippingStatus: true,
            createdAt: true,
            totalAmount: true,
            shippingCost: true,
            trackingNumber: true,
            carrier: true,
            jobs: {
                select: {
                    id: true,
                    sku: true,
                    color: true,
                    size: true,
                    qty: true,
                    recipientName: true,
                    phone: true,
                    address1: true,
                    address2: true,
                    city: true,
                    state: true,
                    zip: true,
                    country: true,
                    designs: true
                }
            }
        }
    });

    const initialOrders = orders.map(order => ({
        ...order,
        createdAt: order.createdAt.toISOString()
    }));

    return <OrderHistoryClient initialOrders={initialOrders} />;
}
