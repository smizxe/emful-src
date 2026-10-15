import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';

export async function GET(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const orderId = searchParams.get('orderId');
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '300', 10), 1), 1000);
    const includeTotal = searchParams.get('includeTotal') === 'true';

    const start = searchParams.get('start');
    const end = searchParams.get('end');

    const where: any = {};
    if (status) {
        where.status = { in: status.split(',') };
    }
    if (orderId) {
        where.orderId = orderId;
    }
    if (start && end) {
        // Check if ISO string (contains T)
        if (start.includes('T')) {
            where.createdAt = {
                gte: new Date(start),
                lte: new Date(end)
            };
        } else {
            where.createdAt = {
                gte: new Date(start + 'T00:00:00'),
                lte: new Date(end + 'T23:59:59')
            };
        }
    }

    try {
        const [jobs, total] = await Promise.all([
            prisma.job.findMany({
                where,
                include: { order: true, seller: true, tokens: true, assignedStaff: { select: { email: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: (page - 1) * limit
            }),
            includeTotal ? prisma.job.count({ where }) : Promise.resolve(0)
        ]);

        const uniqueSkus = Array.from(new Set(jobs.map((job) => job.sku).filter(Boolean)));
        const products = uniqueSkus.length > 0
            ? await prisma.product.findMany({
                where: { sku: { in: uniqueSkus } },
                select: { sku: true, name: true }
            })
            : [];
        const productNameBySku = new Map(products.map((product) => [product.sku, product.name]));
        const inventoryItems = uniqueSkus.length > 0
            ? await prisma.inventoryItem.findMany({
                where: { sku: { in: uniqueSkus } },
                select: {
                    sku: true,
                    color: true,
                    size: true,
                    onHand: true,
                    onOrder: true,
                    reserved: true
                }
            })
            : [];
        const inventoryByVariantKey = new Map(
            inventoryItems.map((item) => [
                `${item.sku}::${item.color || ''}::${item.size || ''}`.toUpperCase(),
                item
            ])
        );

        const jobsWithProductDetails = jobs.map((job) => {
            const colorPart = (job.color || '').toUpperCase().replace(/\s+/g, '');
            const sizePart = (job.size || '').toUpperCase().replace(/\s+/g, '');
            const subSku = `${job.sku}-${colorPart}${sizePart}`;
            const inventoryKey = `${job.sku}::${job.color || ''}::${job.size || ''}`.toUpperCase();
            const inventoryItem = inventoryByVariantKey.get(inventoryKey);

            return {
                ...job,
                productName: productNameBySku.get(job.sku) || '',
                subSku,
                inventoryStock: inventoryItem?.onHand || 0,
                inventoryOnOrder: inventoryItem?.onOrder || 0,
                inventoryReserved: inventoryItem?.reserved || 0
            };
        });

        if (includeTotal) {
            const response = NextResponse.json({
                data: jobsWithProductDetails,
                meta: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(Math.ceil(total / limit), 1)
                }
            });
            response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=5');
            return response;
        }

        const response = NextResponse.json(jobsWithProductDetails);
        response.headers.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=5');
        return response;
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
}
