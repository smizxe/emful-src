import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const summaryOnly = searchParams.get('summary') === 'true';
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '15');
        const search = searchParams.get('search') || '';
        const outOfStock = searchParams.get('outOfStock') === 'true';
        const sortBy = searchParams.get('sortBy'); // 'stock_asc', 'stock_desc'

        const skip = (page - 1) * limit;

        // 1. Get Global Low Stock Count (Items < 1, i.e. <= 0)
        // We consider an item low stock if onHand < 1 (i.e. 0 or negative)
        const lowStockCount = await prisma.inventoryItem.count({
            where: { onHand: { lte: 0 } }
        });

        if (summaryOnly) {
            const response = NextResponse.json({ lowStockCount });
            response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
            return response;
        }

        // 2. Prepare Base Where Clause for Products
        const where: any = {};

        if (search) {
            const cleanSearch = search.trim();
            where.OR = [
                { sku: { contains: cleanSearch, mode: 'insensitive' } },
                { name: { contains: cleanSearch, mode: 'insensitive' } },
                {
                    variants: {
                        some: {
                            OR: [
                                { color: { contains: cleanSearch, mode: 'insensitive' } },
                                { size: { contains: cleanSearch, mode: 'insensitive' } }
                            ]
                        }
                    }
                }
            ];
            if (cleanSearch.includes('-')) {
                const parts = cleanSearch.split('-');
                let currentPrefix = "";
                for (let i = 0; i < parts.length; i++) {
                    if (i > 0) currentPrefix += "-";
                    currentPrefix += parts[i];
                    if (currentPrefix.length > 1) {
                        where.OR.push({ sku: { equals: currentPrefix, mode: 'insensitive' } });
                    }
                }
            }
        }

        let products;
        let total;

        // 3. Sorting Logic
        // 3. Sorting/Filtering Logic
        if (sortBy === 'stock_asc' || sortBy === 'stock_desc' || outOfStock) {
            // New Plan:
            // 1. Fetch ALL matching products (id, sku) based on search criteria
            // 2. Fetch ALL variants for these products
            // 3. Fetch RELEVANT inventory items
            // 4. Calculate total in memory
            // 5. Sort & Filter

            const allMatchingProducts = await prisma.product.findMany({
                where,
                select: { id: true, sku: true, createdAt: true },
                // Limit for safety? Maybe 10000? 
                // We'll trust search filters reduce the set reasonably.
            });

            // If empty, return early
            if (allMatchingProducts.length === 0) {
                return NextResponse.json({
                    data: [],
                    total: 0,
                    page,
                    totalPages: 0,
                    lowStockCount
                });
            }

            const productIds = allMatchingProducts.map(p => p.id);
            const productSkus = allMatchingProducts.map(p => p.sku);

            // Fetch variants for these products
            const allVariants = await prisma.productVariant.findMany({
                where: { productId: { in: productIds } },
                select: { id: true, productId: true, color: true, size: true }
            });

            // Map variants to products
            const variantMap = new Map<string, typeof allVariants>();
            allVariants.forEach(v => {
                const list = variantMap.get(v.productId) || [];
                list.push(v);
                variantMap.set(v.productId, list);
            });

            // Fetch Inventory - we only care about inventory connected to these SKUs
            // NOTE: We MUST fetch inventory items that match the variants specifically + the fallback (empty color/size)
            // But fetching all items for matched SKUs is simpler and safe enough (orphans will be ignored by logic below)
            const allInventory = await prisma.inventoryItem.findMany({
                where: { sku: { in: productSkus } }
            });

            // Build Inventory Map: Key = `SKU-COLOR-SIZE` (Upper/Trimmed) -> onHand
            // Helper to generate key
            const getInvKey = (sku: string, color: string, size: string) => {
                const c = (color || '').toUpperCase().trim();
                const s = (size || '').toUpperCase().trim();
                return `${sku}-${c}-${s}`;
            };

            const inventoryMap = new Map<string, number>();
            allInventory.forEach(item => {
                inventoryMap.set(getInvKey(item.sku, item.color || '', item.size || ''), item.onHand);
            });

            // Process Calculation
            let processedProducts = allMatchingProducts.map(p => {
                const variants = variantMap.get(p.id) || [];
                let totalStock = 0;
                let hasLowStockVariant = false; // For OOS/Low Stock Logic

                if (variants.length > 0) {
                    // It has variants -> Sum ONLY active variants
                    variants.forEach(v => {
                        const stock = inventoryMap.get(getInvKey(p.sku, v.color || '', v.size || '')) || 0;
                        totalStock += stock;
                        if (stock <= 0) hasLowStockVariant = true;
                    });
                } else {
                    // Single Product -> Check base SKU item (empty color/size)
                    const stock = inventoryMap.get(getInvKey(p.sku, '', '')) || 0;
                    totalStock = stock;
                    if (stock <= 0) hasLowStockVariant = true;
                }

                return {
                    ...p,
                    totalStock,
                    hasLowStockVariant
                };
            });

            // Filter OOS
            if (outOfStock) {
                // Should show if ANY variant is OOS (hasLowStockVariant === true)
                // "Show Out of Stock" usually means "Show me items I need to restock"
                processedProducts = processedProducts.filter(p => p.hasLowStockVariant);
            }

            // Sort
            processedProducts.sort((a, b) => {
                if (sortBy === 'stock_asc') {
                    // Primary: Total Stock ASC
                    if (a.totalStock !== b.totalStock) return a.totalStock - b.totalStock;
                    // Secondary: CreatedAt DESC (Newest first if stock equal)
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }
                if (sortBy === 'stock_desc') {
                    if (a.totalStock !== b.totalStock) return b.totalStock - a.totalStock;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                }
                // Default fallback
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });

            total = processedProducts.length;

            // Pagination
            const pagedParams = processedProducts.slice(skip, skip + limit);
            const pagedIds = pagedParams.map(p => p.id);

            // Fetch final full data
            products = await prisma.product.findMany({
                where: { id: { in: pagedIds } },
                include: { variants: true }
            });

            // Re-order to match sorted list
            const sortMap = new Map(pagedIds.map((id, index) => [id, index]));
            products.sort((a, b) => (sortMap.get(a.id) ?? 0) - (sortMap.get(b.id) ?? 0));

        } else {
            // Standard Path: No Sort/Stock Filter (Date Desc Default)
            total = await prisma.product.count({ where });
            products = await prisma.product.findMany({
                where,
                include: { variants: true },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit
            });
        }

        const inventoryItems = await prisma.inventoryItem.findMany({
            where: {
                sku: { in: products.map(p => p.sku) }
            }
        });

        const inventoryMap = new Map();
        inventoryItems.forEach(item => {
            const key = `${item.sku}-${item.color || ''}-${item.size || ''}`;
            inventoryMap.set(key, item);
        });

        const results = products.map(p => {
            let totalStock = 0;
            let variantsData = [];

            if (p.variants.length > 0) {
                variantsData = p.variants.map(v => {
                    const key = `${p.sku}-${v.color || ''}-${v.size || ''}`;
                    const invItem = inventoryMap.get(key);
                    const stock = invItem?.onHand || 0;
                    totalStock += stock;

                    const colorPart = (v.color || '').toUpperCase().replace(/\s+/g, '');
                    const sizePart = (v.size || '').toUpperCase().replace(/\s+/g, '');
                    const subSku = `${p.sku}-${colorPart}${sizePart}`;

                    return {
                        id: v.id,
                        sku: p.sku,
                        subSku,
                        color: v.color || '',
                        size: v.size || '',
                        stock: stock,
                        onOrder: invItem?.onOrder || 0,
                        reserved: invItem?.reserved || 0
                    };
                });
            } else {
                const key = `${p.sku}--`;
                const invItem = inventoryMap.get(key);
                const stock = invItem?.onHand || 0;
                totalStock = stock;
                variantsData.push({
                    id: p.id,
                    sku: p.sku,
                    subSku: p.sku,
                    color: '',
                    size: '',
                    stock: stock,
                    onOrder: invItem?.onOrder || 0,
                    reserved: invItem?.reserved || 0
                });
            }

            // Re-apply Search Filter to variants (same as before)
            if (search) {
                const searchLower = search.trim().toLowerCase();
                const parentBroadMatch =
                    p.sku.toLowerCase().includes(searchLower) ||
                    p.name.toLowerCase().includes(searchLower);

                if (!parentBroadMatch) {
                    variantsData = variantsData.filter(v =>
                        (v.subSku && v.subSku.toLowerCase().includes(searchLower)) ||
                        v.color.toLowerCase().includes(searchLower) ||
                        v.size.toLowerCase().includes(searchLower)
                    );
                }
            }

            return {
                id: p.id,
                sku: p.sku,
                name: p.name,
                totalStock,
                variants: variantsData
            };
        });

        return NextResponse.json({
            data: results,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            lowStockCount // Include in response
        });
    } catch (error) {
        console.error("Inventory Fetch Error:", error);
        return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();

        // Support both single update and bulk update (array)
        const updates = Array.isArray(body) ? body : [body];

        if (updates.length === 0) {
            return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
        }

        const results = await prisma.$transaction(async (tx) => {
            const updatedItems = [];

            for (const update of updates) {
                const { sku, color, size, stock, type } = update;

                if (!sku) {
                    throw new Error('SKU required for each update');
                }

                const safeColor = color || '';
                const safeSize = size || '';

                // Find existing to calc diff
                const existing = await tx.inventoryItem.findUnique({
                    where: {
                        sku_color_size: { sku, color: safeColor, size: safeSize }
                    }
                });

                const oldStock = existing?.onHand || 0;
                const diff = stock - oldStock;

                // Skip if no change
                if (diff === 0 && existing) {
                    updatedItems.push(existing);
                    continue;
                }

                const item = await tx.inventoryItem.upsert({
                    where: {
                        sku_color_size: { sku, color: safeColor, size: safeSize }
                    },
                    update: {
                        onHand: stock
                    },
                    create: {
                        sku,
                        color: safeColor,
                        size: safeSize,
                        onHand: stock,
                        reserved: 0
                    }
                });

                // Log movement only if there's a change
                if (diff !== 0) {
                    await tx.inventoryMovement.create({
                        data: {
                            sku,
                            color: safeColor,
                            size: safeSize,
                            qtyChange: diff,
                            type: type || 'AUDIT_ADJUST',
                            refType: 'MANUAL',
                            createdById: null // Set to null for admin actions without specific user ID
                        }
                    });
                }

                updatedItems.push(item);
            }

            return updatedItems;
        });

        // Return single item for single update, array for bulk
        return NextResponse.json(Array.isArray(body) ? results : results[0]);
    } catch (error: any) {
        console.error("Inventory Update Error:", error);
        return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
    }
}
