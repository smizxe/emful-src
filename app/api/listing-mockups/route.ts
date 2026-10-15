import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { hasAnyRole } from '@/lib/roles';
import { parseListingMockups, replaceListingMockups, skuKeyOf } from '@/lib/listingMockups';

// The Etsy listings file a seller keeps current, reduced to SKU -> listing photo.
// Admin and staff manage any seller's file by passing sellerId; a seller manages
// only their own and any sellerId they pass is ignored.

const MAX_FILE_BYTES = 15 * 1024 * 1024;

async function resolveSeller(request: Request, sellerIdFromBody?: string | null) {
    const user = await getAuthenticatedUser();
    if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };

    if (hasAnyRole(user, ['ADMIN', 'STAFF'])) {
        const sellerId = sellerIdFromBody || new URL(request.url).searchParams.get('sellerId');
        if (!sellerId) return { error: NextResponse.json({ error: 'Choose a seller first' }, { status: 400 }) };
        const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true } });
        if (!seller) return { error: NextResponse.json({ error: 'Seller not found' }, { status: 404 }) };
        return { user, sellerId };
    }

    if (!user.sellerId) return { error: NextResponse.json({ error: 'Seller account required' }, { status: 403 }) };
    return { user, sellerId: user.sellerId };
}

/** The active file's summary, and optionally a lookup of one SKU. */
export async function GET(request: Request) {
    const { sellerId, error } = await resolveSeller(request);
    if (error) return error;

    const search = (new URL(request.url).searchParams.get('search') || '').trim();
    const file = await prisma.listingMockupFile.findUnique({ where: { sellerId } });

    let matches: Array<{ sku: string; imageUrl: string; images: string[] }> = [];
    if (search) {
        const rows = await prisma.listingMockup.findMany({
            where: { sellerId, skuKey: { contains: skuKeyOf(search) } },
            orderBy: { skuKey: 'asc' },
            take: 20,
        });
        matches = rows.map((r) => {
            let images: string[] = [];
            try { images = JSON.parse(r.images); } catch { images = [r.imageUrl]; }
            return { sku: r.sku, imageUrl: r.imageUrl, images };
        });
    }

    return NextResponse.json({ file, matches });
}

/** Upload a new file; it replaces whatever was there. */
export async function POST(request: Request) {
    try {
        const form = await request.formData();
        const file = form.get('file');
        const { user, sellerId, error } = await resolveSeller(request, form.get('sellerId')?.toString() || null);
        if (error) return error;

        if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
            return NextResponse.json({ error: 'The file must be under 15 MB' }, { status: 400 });
        }
        if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
            return NextResponse.json({ error: 'Upload the Etsy listings export as .csv or .xlsx' }, { status: 400 });
        }

        const parsed = parseListingMockups(Buffer.from(await file.arrayBuffer()));
        if (parsed.entries.length === 0) {
            return NextResponse.json({
                error: 'No SKU with an image was found. The file needs a SKU column and an IMAGE1 column.',
            }, { status: 400 });
        }

        await replaceListingMockups(sellerId, file.name, parsed, user.email);
        const saved = await prisma.listingMockupFile.findUnique({ where: { sellerId } });

        return NextResponse.json({ success: true, file: saved, skipped: parsed.skipped });
    } catch (err: any) {
        console.error('Listing mockups upload error:', err);
        return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
    }
}

/** Remove the file and every mapping that came from it. */
export async function DELETE(request: Request) {
    const { sellerId, error } = await resolveSeller(request);
    if (error) return error;

    const removed = await prisma.$transaction([
        prisma.listingMockup.deleteMany({ where: { sellerId } }),
        prisma.listingMockupFile.deleteMany({ where: { sellerId } }),
    ]);
    return NextResponse.json({ success: true, removedSkus: removed[0].count });
}
