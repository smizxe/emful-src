import { prisma } from '@/lib/prisma';
import dayjs from 'dayjs';
import ApprovalPageClient from './ApprovalPageClient';
import { requirePageRole } from '@/lib/auth-guard';
import { getBusinessTimeZone } from '@/lib/dateTime';

export const dynamic = 'force-dynamic';

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ApprovalPage({ searchParams }: Props) {
    await requirePageRole(['ADMIN']);
    const businessTimeZone = getBusinessTimeZone();

    const resolvedParams = await searchParams;
    const startParam = resolvedParams.start as string | undefined;
    const endParam = resolvedParams.end as string | undefined;

    const where: any = {
        status: 'PENDING_APPROVAL'
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
            totalAmount: true,
            priorityProduction: true,
            priorityShipping: true,
            priorityProductionFee: true,
            priorityShippingFee: true,
            createdAt: true,
            seller: {
                select: {
                    id: true,
                    name: true
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
                    address1: true,
                    address2: true,
                    city: true,
                    state: true,
                    zip: true,
                    country: true,
                    designs: true,
                    status: true
                }
            }
        }
    });

    const initialOrders = orders.map(order => ({
        ...order,
        createdAt: order.createdAt.toISOString()
    }));

    return <ApprovalPageClient initialOrders={initialOrders} businessTimeZone={businessTimeZone} />;
}
