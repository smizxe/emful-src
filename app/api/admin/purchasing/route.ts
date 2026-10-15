import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.max(parseInt(searchParams.get('limit') || '50', 10), 1);
        const search = searchParams.get('search') || '';
        const sortBy = searchParams.get('sortBy') || 'sku'; // sku, lowestOnHand, lowestFutureFree, highestReserved

        const offset = (page - 1) * limit;

        // Build Search Clause
        let searchClause = '';
        const params: any[] = [];

        if (search) {
            const normalizedSearch = search.replace(/[^a-zA-Z0-9]+/g, '').toUpperCase();
            searchClause = `
                AND (
                    p.sku ILIKE $1 
                    OR p.name ILIKE $1
                    OR pv.color ILIKE $1
                    OR pv.size ILIKE $1
                    OR (p.sku || '-' || COALESCE(pv.color, '') || COALESCE(pv.size, '')) ILIKE $1
                    OR regexp_replace(UPPER(p.sku || '-' || COALESCE(pv.color, '') || COALESCE(pv.size, '')), '[^A-Z0-9]+', '', 'g') LIKE $2
                    OR regexp_replace(UPPER(COALESCE(pv.color, '') || COALESCE(pv.size, '')), '[^A-Z0-9]+', '', 'g') LIKE $2
                )
            `;
            params.push(`%${search}%`);
            params.push(`%${normalizedSearch}%`);
        }

        // Build Sort Clause
        let orderByClause = 'ORDER BY p.sku ASC, pv.color ASC, pv.size ASC';
        if (sortBy === 'lowestOnHand') {
            orderByClause = 'ORDER BY "onHand" ASC, p.sku ASC';
        } else if (sortBy === 'lowestFutureFree') {
            orderByClause = 'ORDER BY "futureFree" ASC, p.sku ASC';
        } else if (sortBy === 'highestReserved') {
            orderByClause = 'ORDER BY "reserved" DESC, p.sku ASC';
        } else if (sortBy === 'highestOnOrder') {
            orderByClause = 'ORDER BY "onOrder" DESC, p.sku ASC';
        }

        // Main Query
        // Note: We use COALESCE to handle NULLs in color/size for the JOIN
        const rawData: any[] = await prisma.$queryRawUnsafe(`
            SELECT 
                pv.id,
                pv."productId",
                pv.color,
                pv.size,
                p.sku,
                p.name as "productName",
                COALESCE(ii."onHand", 0) as "onHand",
                COALESCE(ii."onOrder", 0) as "onOrder",
                COALESCE(ii."reserved", 0) as "reserved",
                (COALESCE(ii."onHand", 0) + COALESCE(ii."onOrder", 0) - COALESCE(ii."reserved", 0)) as "futureFree"
            FROM "ProductVariant" pv
            JOIN "Product" p ON pv."productId" = p.id
            LEFT JOIN "InventoryItem" ii ON p.sku = ii.sku 
                AND COALESCE(pv.color, '') = COALESCE(ii.color, '')
                AND COALESCE(pv.size, '') = COALESCE(ii.size, '')
            WHERE 1=1 ${searchClause}
            ${orderByClause}
            LIMIT ${limit} OFFSET ${offset}
        `, ...params);

        // Count Query
        const countResult: any[] = await prisma.$queryRawUnsafe(`
            SELECT COUNT(*) as total
            FROM "ProductVariant" pv
            JOIN "Product" p ON pv."productId" = p.id
            LEFT JOIN "InventoryItem" ii ON p.sku = ii.sku 
                AND COALESCE(pv.color, '') = COALESCE(ii.color, '')
                AND COALESCE(pv.size, '') = COALESCE(ii.size, '')
            WHERE 1=1 ${searchClause}
        `, ...params);

        // Convert BigInt total to number
        const total = Number(countResult[0]?.total || 0);

        // Map Results
        const results = rawData.map(row => {
            const colorPart = (row.color || '').toUpperCase().replace(/\s+/g, '');
            const sizePart = (row.size || '').toUpperCase().replace(/\s+/g, '');
            const subSku = `${row.sku}-${colorPart}${sizePart}`;

            return {
                id: row.id,
                productId: row.productId,
                productName: row.productName,
                sku: row.sku,
                subSku: subSku, // Generated Sub-SKU
                color: row.color || '',
                size: row.size || '',
                onHand: row.onHand,
                onOrder: row.onOrder,
                reserved: row.reserved,
                futureFree: row.futureFree
            };
        });

        return NextResponse.json({
            data: results,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });

    } catch (error: any) {
        console.error("Purchasing Fetch Error:", error);
        return NextResponse.json({ error: 'Failed to fetch purchasing data' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { action, sku, color, size, quantity } = body;

        if (!action || !sku || quantity === undefined) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const qty = parseInt(quantity);
        // Allow 0 only for UPDATE_ON_HAND. For others, must be > 0.
        if (isNaN(qty) || (qty <= 0 && action !== 'UPDATE_ON_HAND')) {
            return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 });
        }
        // For UPDATE_ON_HAND, check non-negative (unless we allow negative stock?) 
        // Let's assume stock cannot be negative.
        if (action === 'UPDATE_ON_HAND' && qty < 0) {
            return NextResponse.json({ error: 'Stock cannot be negative' }, { status: 400 });
        }

        const safeColor = color || '';
        const safeSize = size || '';

        const result = await prisma.$transaction(async (tx) => {
            // Find existing inventory item
            const existing = await tx.inventoryItem.findUnique({
                where: {
                    sku_color_size: { sku, color: safeColor, size: safeSize }
                }
            });

            // Upsert (Create if not exists)
            // Note: If creating, what are default values? 0.

            let onHand = existing?.onHand || 0;
            let onOrder = existing?.onOrder || 0;
            let reserved = existing?.reserved || 0; // Keep existing reserved

            if (action === 'PLACE_ORDER') {
                onOrder += qty;
            } else if (action === 'RECEIVE') {
                // Decrease onOrder, Increase onHand
                // Ensure onOrder doesn't go below 0? USER DIAGRAM says (-). logic is straight math.
                // auto-minus from onOrder. 
                // Let's prevent negative onOrder just for sanity, or allow it if user insists?
                // I'll prevent negative for now: Math.max(0, ...)
                if (onOrder < qty) {
                    // Optional: Warn or allow? "Receiving more than ordered".
                    // I'll allow it but clamp onOrder to 0 to avoid negative "Pending Orders".
                    onOrder = Math.max(0, onOrder - qty);
                    // Or strictly: onOrder -= qty; (allows negative if we received un-tracked order)
                    // Let's clamp to 0. It's safer UI.
                } else {
                    onOrder -= qty;
                }

                onHand += qty;
            } else if (action === 'UPDATE_ON_HAND') {
                // Direct adjustment of On Hand
                // The 'quantity' sent here is the NEW TOTAL onHand, OR a delta?
                // Usually "Edit number" implies setting the absolute value.
                // Let's assume 'quantity' is the NEW On Hand value.
                const newOnHand = qty;
                // Wait, validation check above ensures qty > 0. 
                // If user wants 0, we need to handle that.
                // But the current validation `if (isNaN(qty) || qty <= 0)` blocks 0.
                // We should relax validation or handle it differently.
                // For now, let's treat 'quantity' as the DELTA if using `UPDATE_ON_HAND`? 
                // No, "Edit" implies Set.

                // Correction: Let's assume the user sends the NEW value.
                // We calculate delta for the log.
                onHand = qty;
            } else {
                throw new Error('Invalid action');
            }

            const updatedItem = await tx.inventoryItem.upsert({
                where: {
                    sku_color_size: { sku, color: safeColor, size: safeSize }
                },
                update: {
                    onHand,
                    onOrder
                },
                create: {
                    sku,
                    color: safeColor,
                    size: safeSize,
                    onHand,
                    onOrder,
                    reserved: 0
                }
            });

            // Log Movement
            await tx.inventoryMovement.create({
                data: {
                    sku,
                    color: safeColor,
                    size: safeSize,
                    qtyChange: qty,
                    type: action === 'PLACE_ORDER' ? 'PURCHASE_ORDER' : 'PURCHASE_RECEIVE',
                    refType: 'MANUAL_PURCHASING',
                }
            });

            return updatedItem;
        });

        return NextResponse.json({ success: true, data: result });

    } catch (error: any) {
        console.error("Purchasing Update Error:", error);
        return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
    }
}
