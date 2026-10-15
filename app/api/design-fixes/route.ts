import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { hasAnyRole } from '@/lib/roles';

// Designs the shop has made or corrected for a seller, keyed on that seller's own
// SKU. A seller only ever sees, edits and deletes their own; admin and staff can
// look at any seller's by passing sellerId, which is how they answer "what did
// we fix for them".

async function resolveScope(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) {
        return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
    }

    if (hasAnyRole(user, ['ADMIN', 'STAFF'])) {
        const sellerId = new URL(request.url).searchParams.get('sellerId');
        return { sellerId: sellerId || null, isStaff: true };
    }

    // A seller is pinned to their own account -- no sellerId from the query string.
    if (!user.sellerId) {
        return { error: NextResponse.json({ error: 'Seller account required' }, { status: 403 }) };
    }
    return { sellerId: user.sellerId, isStaff: false };
}

export async function GET(request: Request) {
    const { sellerId, isStaff, error } = await resolveScope(request);
    if (error) return error;

    const search = (new URL(request.url).searchParams.get('search') || '').trim();

    const where: any = {};
    if (sellerId) where.sellerId = sellerId;
    if (search) {
        where.OR = [
            { sellerSku: { contains: search, mode: 'insensitive' } },
            { sku: { contains: search, mode: 'insensitive' } },
            { orderCode: { contains: search, mode: 'insensitive' } },
        ];
    }

    const fixes = await prisma.sellerDesignFix.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 500,
    });

    return NextResponse.json({ fixes, scopedToSeller: !isStaff });
}

/**
 * The row behind an id, when the caller may change it: a seller only their own,
 * admin and staff any. Someone else's row reads exactly like a missing one.
 */
async function findOwnFix(request: Request, id: unknown) {
    const { sellerId, isStaff, error } = await resolveScope(request);
    if (error) return { error };
    const fix = id ? await prisma.sellerDesignFix.findUnique({ where: { id: String(id) } }) : null;
    if (!fix || (!isStaff && fix.sellerId !== sellerId)) {
        return { error: NextResponse.json({ error: 'Design not found' }, { status: 404 }) };
    }
    return { fix };
}

/** Edit a row: the seller's SKU it is kept against, the file, the product and the note. */
export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { fix, error } = await findOwnFix(request, body?.id);
        if (error) return error;

        const sellerSku = String(body.sellerSku ?? fix.sellerSku).trim();
        const fileLink = String(body.fileLink ?? fix.fileLink).trim();
        const sku = String(body.sku ?? fix.sku).trim();
        const note = String(body.note ?? fix.note).trim();
        if (!sellerSku || !fileLink) {
            return NextResponse.json({ error: 'Your SKU and the file are both required' }, { status: 400 });
        }
        if (sellerSku.length > 200 || fileLink.length > 2000 || sku.length > 200 || note.length > 2000) {
            return NextResponse.json({ error: 'One of the fields is too long' }, { status: 400 });
        }

        // One design per SKU for a seller: renaming onto a SKU they already keep
        // a design for would hide one of the two.
        if (sellerSku !== fix.sellerSku) {
            const clash = await prisma.sellerDesignFix.findUnique({
                where: { sellerId_sellerSku: { sellerId: fix.sellerId, sellerSku } },
                select: { id: true },
            });
            if (clash) {
                return NextResponse.json({ error: `You already have a design kept for "${sellerSku}". Edit or delete that one instead.` }, { status: 409 });
            }
        }

        const updated = await prisma.sellerDesignFix.update({
            where: { id: fix.id },
            data: { sellerSku, fileLink, sku, note },
        });
        return NextResponse.json({ success: true, fix: updated });
    } catch (error: any) {
        console.error('Design fix edit error:', error);
        return NextResponse.json({ error: error.message || 'Could not save the design' }, { status: 500 });
    }
}

/** Delete a row. It is a lookup list only, so no order changes with it. */
export async function DELETE(request: Request) {
    try {
        const id = new URL(request.url).searchParams.get('id');
        const { fix, error } = await findOwnFix(request, id);
        if (error) return error;
        await prisma.sellerDesignFix.delete({ where: { id: fix.id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Design fix delete error:', error);
        return NextResponse.json({ error: error.message || 'Could not delete the design' }, { status: 500 });
    }
}
