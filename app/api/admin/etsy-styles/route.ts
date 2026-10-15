import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { GLOBAL_STYLE_SELLER_ID } from '@/lib/etsyMaps';

// Global (all-seller) Etsy "Style -> garment blank SKU" defaults. Stored as
// EtsyStyleMap rows under the global sentinel sellerId.

export async function GET() {
    const guard = await requireAdminApi();
    if (guard) return guard;
    const styles = await prisma.etsyStyleMap.findMany({
        where: { sellerId: GLOBAL_STYLE_SELLER_ID },
        orderBy: { style: 'asc' },
        select: { id: true, style: true, productSku: true },
    });
    return NextResponse.json({ styles });
}

export async function POST(req: NextRequest) {
    const guard = await requireAdminApi();
    if (guard) return guard;
    try {
        const body = await req.json();
        if (body.action === 'delete') {
            if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
            await prisma.etsyStyleMap.deleteMany({ where: { id: body.id, sellerId: GLOBAL_STYLE_SELLER_ID } });
            return NextResponse.json({ success: true });
        }
        const style = String(body.style || '').trim();
        const productSku = String(body.productSku || '').trim();
        if (!style || !productSku) return NextResponse.json({ error: 'Style and product SKU are required' }, { status: 400 });

        // Validate the blank exists so admins can't map to a non-existent SKU.
        const product = await prisma.product.findUnique({ where: { sku: productSku }, select: { sku: true } });
        if (!product) return NextResponse.json({ error: `Product SKU "${productSku}" does not exist` }, { status: 400 });

        const row = await prisma.etsyStyleMap.upsert({
            where: { sellerId_style: { sellerId: GLOBAL_STYLE_SELLER_ID, style } },
            update: { productSku },
            create: { sellerId: GLOBAL_STYLE_SELLER_ID, style, productSku },
        });
        return NextResponse.json({ success: true, row });
    } catch (e: any) {
        console.error('Global etsy-styles error:', e);
        return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
    }
}
