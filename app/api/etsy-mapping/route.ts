import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { DEFAULT_POSITION } from '@/lib/positions';

// Per-seller Etsy import mappings: design (Etsy SKU -> design), style (style ->
// garment blank), color (Etsy color name -> internal color). All seller-scoped.

async function requireSellerId() {
    const user = await getAuthenticatedUser();
    if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
    if (!user.sellerId) return { error: NextResponse.json({ error: 'Seller account required' }, { status: 403 }) };
    return { sellerId: user.sellerId };
}

export async function GET() {
    const { sellerId, error } = await requireSellerId();
    if (error) return error;

    const [designs, styles, colors] = await Promise.all([
        prisma.etsyDesignMap.findMany({ where: { sellerId }, orderBy: { etsySku: 'asc' } }),
        prisma.etsyStyleMap.findMany({ where: { sellerId }, orderBy: { style: 'asc' } }),
        prisma.etsyColorMap.findMany({ where: { sellerId }, orderBy: { etsyColor: 'asc' } }),
    ]);
    return NextResponse.json({ designs, styles, colors });
}

export async function POST(req: NextRequest) {
    const { sellerId, error } = await requireSellerId();
    if (error) return error;

    try {
        const body = await req.json();
        const { kind, action } = body;

        if (action === 'delete') {
            if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
            if (kind === 'design') await prisma.etsyDesignMap.deleteMany({ where: { id: body.id, sellerId } });
            else if (kind === 'style') await prisma.etsyStyleMap.deleteMany({ where: { id: body.id, sellerId } });
            else if (kind === 'color') await prisma.etsyColorMap.deleteMany({ where: { id: body.id, sellerId } });
            else return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
            return NextResponse.json({ success: true });
        }

        // Edit one row in place, by id -- including renaming its key. Re-saving
        // through the add form could only ever create a second row.
        if (action === 'update') {
            if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

            if (kind === 'design') {
                const existing = await prisma.etsyDesignMap.findFirst({ where: { id: body.id, sellerId } });
                if (!existing) return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
                const etsySku = String(body.etsySku || '').trim();
                const designLink = String(body.designLink || '').trim();
                if (!etsySku || !designLink) return NextResponse.json({ error: 'Etsy SKU and design link are required' }, { status: 400 });
                if (etsySku !== existing.etsySku) {
                    const clash = await prisma.etsyDesignMap.findUnique({ where: { sellerId_etsySku: { sellerId, etsySku } } });
                    if (clash) return NextResponse.json({ error: `Another mapping already uses the Etsy SKU "${etsySku}"` }, { status: 409 });
                }
                const row = await prisma.etsyDesignMap.update({
                    where: { id: existing.id },
                    data: {
                        etsySku,
                        designLink,
                        position: String(body.position || DEFAULT_POSITION).trim() || DEFAULT_POSITION,
                        mockup: String(body.mockup || '').trim(),
                        type: String(body.type || 'Embroidery').trim() || 'Embroidery',
                        productSku: body.productSku ? String(body.productSku).trim() : null,
                    },
                });
                return NextResponse.json({ success: true, row });
            }

            if (kind === 'style') {
                const existing = await prisma.etsyStyleMap.findFirst({ where: { id: body.id, sellerId } });
                if (!existing) return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
                const style = String(body.style || '').trim();
                const productSku = String(body.productSku || '').trim();
                if (!style || !productSku) return NextResponse.json({ error: 'Style and product SKU are required' }, { status: 400 });
                if (style !== existing.style) {
                    const clash = await prisma.etsyStyleMap.findUnique({ where: { sellerId_style: { sellerId, style } } });
                    if (clash) return NextResponse.json({ error: `Another mapping already uses the style "${style}"` }, { status: 409 });
                }
                const row = await prisma.etsyStyleMap.update({ where: { id: existing.id }, data: { style, productSku } });
                return NextResponse.json({ success: true, row });
            }

            if (kind === 'color') {
                const existing = await prisma.etsyColorMap.findFirst({ where: { id: body.id, sellerId } });
                if (!existing) return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
                const etsyColor = String(body.etsyColor || '').trim();
                const internalColor = String(body.internalColor || '').trim();
                if (!etsyColor || !internalColor) return NextResponse.json({ error: 'Both colors are required' }, { status: 400 });
                if (etsyColor !== existing.etsyColor) {
                    const clash = await prisma.etsyColorMap.findUnique({ where: { sellerId_etsyColor: { sellerId, etsyColor } } });
                    if (clash) return NextResponse.json({ error: `Another mapping already uses the color "${etsyColor}"` }, { status: 409 });
                }
                const row = await prisma.etsyColorMap.update({ where: { id: existing.id }, data: { etsyColor, internalColor } });
                return NextResponse.json({ success: true, row });
            }

            return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
        }

        if (kind === 'design') {
            const etsySku = String(body.etsySku || '').trim();
            const designLink = String(body.designLink || '').trim();
            if (!etsySku || !designLink) return NextResponse.json({ error: 'Etsy SKU and design link are required' }, { status: 400 });
            const data = {
                designLink,
                position: String(body.position || DEFAULT_POSITION).trim() || DEFAULT_POSITION,
                mockup: String(body.mockup || '').trim(),
                type: String(body.type || 'Embroidery').trim() || 'Embroidery',
                productSku: body.productSku ? String(body.productSku).trim() : null,
            };
            const row = await prisma.etsyDesignMap.upsert({
                where: { sellerId_etsySku: { sellerId, etsySku } },
                update: data,
                create: { sellerId, etsySku, ...data },
            });
            return NextResponse.json({ success: true, row });
        }

        if (kind === 'style') {
            const style = String(body.style || '').trim();
            const productSku = String(body.productSku || '').trim();
            if (!style || !productSku) return NextResponse.json({ error: 'Style and product SKU are required' }, { status: 400 });
            const row = await prisma.etsyStyleMap.upsert({
                where: { sellerId_style: { sellerId, style } },
                update: { productSku },
                create: { sellerId, style, productSku },
            });
            return NextResponse.json({ success: true, row });
        }

        if (kind === 'color') {
            const etsyColor = String(body.etsyColor || '').trim();
            const internalColor = String(body.internalColor || '').trim();
            if (!etsyColor || !internalColor) return NextResponse.json({ error: 'Both colors are required' }, { status: 400 });
            const row = await prisma.etsyColorMap.upsert({
                where: { sellerId_etsyColor: { sellerId, etsyColor } },
                update: { internalColor },
                create: { sellerId, etsyColor, internalColor },
            });
            return NextResponse.json({ success: true, row });
        }

        if (kind === 'bulkDesign') {
            // Bulk import from the seller's existing MAP sheet.
            const rows: any[] = Array.isArray(body.rows) ? body.rows : [];
            let count = 0;
            for (const r of rows) {
                const etsySku = String(r.etsySku || '').trim();
                const designLink = String(r.designLink || '').trim();
                if (!etsySku || !designLink) continue;
                await prisma.etsyDesignMap.upsert({
                    where: { sellerId_etsySku: { sellerId, etsySku } },
                    update: {
                        designLink,
                        position: String(r.position || DEFAULT_POSITION).trim() || DEFAULT_POSITION,
                        mockup: String(r.mockup || '').trim(),
                        type: String(r.type || 'Embroidery').trim() || 'Embroidery',
                        productSku: r.productSku ? String(r.productSku).trim() : null,
                    },
                    create: {
                        sellerId, etsySku, designLink,
                        position: String(r.position || DEFAULT_POSITION).trim() || DEFAULT_POSITION,
                        mockup: String(r.mockup || '').trim(),
                        type: String(r.type || 'Embroidery').trim() || 'Embroidery',
                        productSku: r.productSku ? String(r.productSku).trim() : null,
                    },
                });
                count++;
            }
            return NextResponse.json({ success: true, count });
        }

        return NextResponse.json({ error: 'Unknown kind' }, { status: 400 });
    } catch (e: any) {
        console.error('Etsy mapping error:', e);
        return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
    }
}
