import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authenticateApiKey } from '@/lib/apiAuth';

// GET /api/v1/products — catalog of active products + variants, so sellers know
// the valid SKU / color / size to send when creating orders.
export async function GET(request: Request) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: { sku: 'asc' },
        select: {
            sku: true, name: true,
            variants: { where: { isActive: true }, select: { color: true, size: true, basePrice: true } },
        },
    });

    const data = products.map((p) => ({
        sku: p.sku,
        name: p.name,
        variants: p.variants.map((v) => ({ color: v.color || null, size: v.size || null, basePrice: v.basePrice })),
    }));

    return NextResponse.json({ data });
}
