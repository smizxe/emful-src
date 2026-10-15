import { NextResponse } from 'next/server';
import { loadListingMockupLookup, skuKeyOf } from '@/lib/listingMockups';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { cookies } from 'next/headers';
import { calculateCombinedShippingAllocations, calculateItemCosts, validateDesigns } from '@/lib/pricing';
import { parseAddress } from '@/lib/addressParser';
import { notifyOrderImport } from '@/lib/notifications';
import { getAppliedPriorityFees, getPriorityFeeSettings, type PriorityFeeSettings } from '@/lib/priorityFees';
import { transformEtsyRows } from '@/lib/etsyImport';
import { loadEtsyMaps } from '@/lib/etsyMaps';
import { DEFAULT_POSITION } from '@/lib/positions';

// Helper to generate secure random token
function generateToken() {
    return uuidv4().replace(/-/g, '') + Math.random().toString(36).substring(2, 8);
}

// Helper to normalize keys
const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[\s_-]+/g, '');
const normalizeText = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function normalizeDesigns(designs: unknown) {
    let parsedDesigns: any[] = [];

    if (Array.isArray(designs)) {
        parsedDesigns = designs;
    } else if (typeof designs === 'string' && designs.trim()) {
        try {
            const decoded = JSON.parse(designs);
            if (Array.isArray(decoded)) {
                parsedDesigns = decoded;
            }
        } catch {
            parsedDesigns = [];
        }
    }

    return parsedDesigns
        .map((design: any) => ({
            url: normalizeText(design?.url),
            location: normalizeText(design?.location),
            mockup: normalizeText(design?.mockup),
            type: normalizeText(design?.type),
        }))
        .sort((a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function getOrderItems(order: any) {
    if (Array.isArray(order?.items)) return order.items;
    if (Array.isArray(order?.jobs)) return order.jobs;
    return [];
}

function getRawComparableOrderCode(order: any) {
    return String(order?.sourceOrderCode ?? order?.id ?? order?.orderCode ?? '').trim();
}

function stripDuplicateSuffix(orderCode: string) {
    let baseOrderCode = orderCode.trim();

    while (/\(\d+\)$/.test(baseOrderCode)) {
        baseOrderCode = baseOrderCode.replace(/\(\d+\)$/, '').trim();
    }

    return baseOrderCode;
}

function getRawComparableOrderCodeBase(order: any) {
    return stripDuplicateSuffix(getRawComparableOrderCode(order));
}

function getComparableOrderCode(order: any) {
    return normalizeText(getRawComparableOrderCodeBase(order));
}

function getOrderFingerprint(order: any) {
    const items = getOrderItems(order)
        .map((item: any) => ({
            sku: normalizeText(item?.sku),
            color: normalizeText(item?.color),
            size: normalizeText(item?.size),
            qty: Number(item?.qty || 0),
            shippingLabel: normalizeText(item?.shippingLabel),
            notes: normalizeText(item?.notes),
            designs: normalizeDesigns(item?.designs),
        }))
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

    const primaryItem = getOrderItems(order)[0] || {};

    return JSON.stringify({
        orderCode: getComparableOrderCode(order),
        recipientName: normalizeText(order?.recipientName ?? primaryItem?.recipientName),
        phone: normalizeText(order?.phone ?? primaryItem?.phone),
        address1: normalizeText(order?.address1 ?? primaryItem?.address1),
        address2: normalizeText(order?.address2 ?? primaryItem?.address2),
        city: normalizeText(order?.city ?? primaryItem?.city),
        state: normalizeText(order?.state ?? primaryItem?.state),
        zip: normalizeText(order?.zip ?? primaryItem?.zip),
        country: normalizeText(order?.country ?? primaryItem?.country),
        items,
    });
}

function getOrderSourceLabel(order: any, fallbackIndex: number) {
    const rows = Array.isArray(order?.sourceRows) && order.sourceRows.length > 0
        ? `row ${order.sourceRows.join(', ')}`
        : `entry ${fallbackIndex + 1}`;
    const orderCode = getRawComparableOrderCode(order);
    return orderCode ? `${rows} (Order ID ${orderCode})` : rows;
}

function getRawRowValue(row: any, keys: string[], fallbackRow?: any) {
    for (const key of keys) {
        const value = String(row?.[key] ?? '').trim();
        if (value) return value;
    }

    if (fallbackRow) {
        for (const key of keys) {
            const value = String(fallbackRow?.[key] ?? '').trim();
            if (value) return value;
        }
    }

    return '';
}

function getShippingDestinationKey(row: any, fallbackRow: any) {
    const recipientName = getRawRowValue(row, ['recipientname', 'shippingname'], fallbackRow);
    const rawShippingAddress = getRawRowValue(row, ['shippingaddress'], fallbackRow);

    if (rawShippingAddress) {
        return [
            normalizeText(recipientName),
            normalizeText(rawShippingAddress)
        ].join('|');
    }

    return [
        normalizeText(recipientName),
        normalizeText(getRawRowValue(row, ['address1', 'shipaddress1', 'shippingaddress1'], fallbackRow)),
        normalizeText(getRawRowValue(row, ['address2', 'shipaddress2', 'shippingaddress2'], fallbackRow)),
        normalizeText(getRawRowValue(row, ['city', 'shipcity', 'shippingcity'], fallbackRow)),
        normalizeText(getRawRowValue(row, ['state', 'shipstate', 'shippingstate', 'province', 'shippingprovince'], fallbackRow)),
        normalizeText(getRawRowValue(row, ['zip', 'shipzipcode', 'shippingzip', 'postalcode'], fallbackRow)),
        normalizeText(getRawRowValue(row, ['country', 'shipcountry', 'shippingcountry'], fallbackRow)),
    ].join('|');
}

function computeImportedOrderBaseTotal(order: any) {
    const items = Array.isArray(order?.items) ? order.items : [];
    return Number(items.reduce((sum: number, item: any) => {
        const qty = Number(item?.qty || 0);
        const priceToCharge = Number(item?.priceToCharge || 0);
        const shippingCost = Number(item?.shippingCost || 0);
        const extraFees = Number(item?.extraFees || 0);
        return sum + (priceToCharge * qty) + shippingCost + extraFees;
    }, 0).toFixed(2));
}

function computeImportedOrderTotal(order: any, priorityFeeSettings: PriorityFeeSettings) {
    const baseTotal = computeImportedOrderBaseTotal(order);
    const priorityFees = getAppliedPriorityFees(order, priorityFeeSettings);
    return Number((baseTotal + priorityFees.totalPriorityFee).toFixed(2));
}

async function detectDuplicateOrders(sellerId: string, orders: any[]) {
    const findings = new Map<number, string[]>();
    const fileDuplicateIndexes = new Set<number>();
    const existingDuplicateIndexes = new Set<number>();
    const seenFingerprints = new Map<string, number>();

    const addFinding = (index: number, message: string, type: 'IN_FILE' | 'EXISTING') => {
        const current = findings.get(index) || [];
        current.push(message);
        findings.set(index, current);

        if (type === 'IN_FILE') fileDuplicateIndexes.add(index);
        if (type === 'EXISTING') existingDuplicateIndexes.add(index);
    };

    orders.forEach((order, index) => {
        const fingerprint = getOrderFingerprint(order);
        const firstIndex = seenFingerprints.get(fingerprint);

        if (firstIndex !== undefined) {
            addFinding(
                index,
                `Duplicate order in this file. Same details as ${getOrderSourceLabel(orders[firstIndex], firstIndex)}.`,
                'IN_FILE'
            );
            return;
        }

        seenFingerprints.set(fingerprint, index);
    });

    const comparableOrderCodeBases = Array.from(
        new Set(
            orders
                .map((order) => getRawComparableOrderCodeBase(order))
                .filter(Boolean)
        )
    );

    if (comparableOrderCodeBases.length > 0) {
        const existingOrders = await prisma.order.findMany({
            where: {
                sellerId,
                OR: comparableOrderCodeBases.flatMap((orderCodeBase) => ([
                    {
                        orderCode: {
                            equals: orderCodeBase,
                            mode: 'insensitive'
                        }
                    },
                    {
                        orderCode: {
                            startsWith: `${orderCodeBase}(`,
                            mode: 'insensitive'
                        }
                    }
                ]))
            },
            select: {
                orderCode: true,
                createdAt: true,
                jobs: {
                    select: {
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
                        designs: true,
                        notes: true,
                        shippingLabel: true,
                    }
                }
            }
        });

        const existingOrdersByCodeBase = new Map<string, typeof existingOrders>();
        existingOrders.forEach((order) => {
            const orderCodeBase = normalizeText(stripDuplicateSuffix(order.orderCode));
            const current = existingOrdersByCodeBase.get(orderCodeBase) || [];
            current.push(order);
            existingOrdersByCodeBase.set(orderCodeBase, current);
        });

        orders.forEach((order, index) => {
            const comparableCode = getComparableOrderCode(order);
            if (!comparableCode) return;

            const existingOrder = (existingOrdersByCodeBase.get(comparableCode) || [])
                .find((candidate) => getOrderFingerprint(order) === getOrderFingerprint(candidate));

            if (existingOrder) {
                addFinding(
                    index,
                    `Duplicate order already exists in the system as ${existingOrder.orderCode} (imported on ${existingOrder.createdAt.toISOString().slice(0, 10)}).`,
                    'EXISTING'
                );
            }
        });
    }

    return {
        findings,
        summary: {
            inFileCount: fileDuplicateIndexes.size,
            existingCount: existingDuplicateIndexes.size,
            totalCount: new Set([...fileDuplicateIndexes, ...existingDuplicateIndexes]).size
        }
    };
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get('content-type') || '';

        // --- MODE 2: CREATE ORDERS (JSON) ---
        if (contentType.includes('application/json')) {
            const body = await request.json();
            const { orders } = body; // Array of validated order objects

            if (!orders || !Array.isArray(orders) || orders.length === 0) {
                return NextResponse.json({ error: 'No orders provided' }, { status: 400 });
            }

            // Authentication - Get logged-in user from cookies
            const cookieStore = await cookies();
            const userId = cookieStore.get('userId')?.value;
            if (!userId) {
                return NextResponse.json({ error: 'Not authenticated. Please login.' }, { status: 401 });
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { seller: { include: { wallet: true } } }
            });

            if (!user) {
                return NextResponse.json({ error: 'User not found' }, { status: 401 });
            }

            const { targetSellerId } = body;
            let sellerId = '';
            let sellerWallet = null;

            if (targetSellerId && user.role === 'ADMIN') {
                // Admin importing for a seller
                const targetSeller = await prisma.seller.findUnique({
                    where: { id: targetSellerId },
                    include: { wallet: true }
                });
                if (!targetSeller) {
                    return NextResponse.json({ error: 'Target seller not found' }, { status: 404 });
                }
                sellerId = targetSeller.id;
                sellerWallet = targetSeller.wallet;
            } else {
                // Seller importing for themselves
                if (!user.seller) {
                    return NextResponse.json({ error: 'Seller account not found' }, { status: 401 });
                }
                sellerId = user.seller.id;
                sellerWallet = user.seller.wallet;
            }

            const duplicateCheck = await detectDuplicateOrders(sellerId, orders);
            if (duplicateCheck.summary.totalCount > 0) {
                const duplicateOrders = orders
                    .map((order: any, index: number) => {
                        const errors = duplicateCheck.findings.get(index);
                        if (!errors) return null;

                        return {
                            orderCode: getRawComparableOrderCode(order) || null,
                            source: getOrderSourceLabel(order, index),
                            errors
                        };
                    })
                    .filter(Boolean);

                return NextResponse.json({
                    error: 'Duplicate orders detected. Please remove the duplicate orders and analyze the file again.',
                    duplicateOrders
                }, { status: 409 });
            }

            const priorityFeeSettings = await getPriorityFeeSettings();

            // Calculate total cost of all orders to be created. Design-request
            // (incomplete) orders are NOT charged now — they cost $0 until the
            // seller completes them and they become PENDING_APPROVAL.
            const totalCost = Number(orders
                .filter((order: any) => !order.incomplete)
                .reduce((sum: number, order: any) => sum + computeImportedOrderTotal(order, priorityFeeSettings), 0)
                .toFixed(2));

            // Check wallet balance BEFORE creating orders
            if (!sellerWallet) {
                return NextResponse.json({ error: 'Seller wallet not found. Please contact admin.' }, { status: 400 });
            }

            // Not enough funds no longer blocks the import. The orders are created
            // as AWAITING_FUNDS instead of PENDING_APPROVAL so the seller keeps them,
            // and they flip to PENDING_APPROVAL automatically once the wallet is
            // topped up (see lib/awaitingFunds.ts).
            const shortfall = Number(Math.max(0, totalCost - sellerWallet.balance).toFixed(2));
            const fundsShort = shortfall > 0;

            // Execute Creation Transaction (NO WALLET DEDUCTION)
            const transactionResult = await prisma.$transaction(async (tx) => {
                const createdOrderCodes: string[] = [];

                for (const orderData of orders) {
                    const comparableOrderCodeBase = getRawComparableOrderCodeBase(orderData);
                    if (comparableOrderCodeBase) {
                        const existingOrders = await tx.order.findMany({
                            where: {
                                sellerId,
                                OR: [
                                    {
                                        orderCode: {
                                            equals: comparableOrderCodeBase,
                                            mode: 'insensitive'
                                        }
                                    },
                                    {
                                        orderCode: {
                                            startsWith: `${comparableOrderCodeBase}(`,
                                            mode: 'insensitive'
                                        }
                                    }
                                ]
                            },
                            select: {
                                orderCode: true,
                                jobs: {
                                    select: {
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
                                        designs: true,
                                        notes: true,
                                        shippingLabel: true,
                                    }
                                }
                            }
                        });

                        const matchingExistingOrder = existingOrders.find(
                            (existingOrder) => getOrderFingerprint(orderData) === getOrderFingerprint(existingOrder)
                        );

                        if (matchingExistingOrder) {
                            throw new Error(`Duplicate order detected for ${matchingExistingOrder.orderCode}. This order was already imported.`);
                        }
                    }

                    // Create Order
                    // Ensure unique orderCode or generate one logic
                    // Use Order ID if provided, else generate

                    let finalOrderCode = '';
                    if (orderData.id && !String(orderData.id).startsWith('TEMP-') && String(orderData.id).length > 0) {
                        finalOrderCode = String(orderData.id);
                    } else {
                        finalOrderCode = `ORDER${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
                    }

                    // Auto-rename if Duplicate
                    let uniqueCode = finalOrderCode;
                    let counter = 1;
                    while (true) {
                        const existingOrder = await tx.order.findUnique({ where: { orderCode: uniqueCode } });
                        if (!existingOrder) break;
                        uniqueCode = `${finalOrderCode}(${counter})`;
                        counter++;
                    }
                    finalOrderCode = uniqueCode;

                    // Incomplete orders come in as "Design Request": created so the
                    // seller can keep the order, but with NO charge, NO priority and
                    // NO inventory reservation until they fill the missing info and
                    // it flips to PENDING_APPROVAL (see /api/orders/update).
                    const isDesignRequest = Boolean(orderData.incomplete);

                    // Priced orders the wallet can't cover yet are parked as
                    // AWAITING_FUNDS — identical to a pending order (priced, stock
                    // reserved) except an admin can't approve/charge it until the
                    // seller tops up, which releases it automatically.
                    const isAwaitingFunds = !isDesignRequest && fundsShort;
                    const orderStatus = isDesignRequest
                        ? 'DESIGN_REQUEST'
                        : (isAwaitingFunds ? 'AWAITING_FUNDS' : 'PENDING_APPROVAL');

                    const priorityFees = isDesignRequest
                        ? { priorityProductionFee: 0, priorityShippingFee: 0 }
                        : getAppliedPriorityFees(orderData, priorityFeeSettings);
                    const orderTotal = isDesignRequest ? 0 : computeImportedOrderTotal(orderData, priorityFeeSettings);

                    const newOrder = await tx.order.create({
                        data: {
                            orderCode: finalOrderCode,
                            sellerId,
                            status: orderStatus,
                            totalAmount: orderTotal,
                            trackingNumber: '',
                            shippingMethod: 'STANDARD',
                            shippingCountry: orderData.country,
                            priorityProduction: isDesignRequest ? false : Boolean(orderData.priorityProduction),
                            priorityShipping: isDesignRequest ? false : Boolean(orderData.priorityShipping),
                            priorityProductionFee: priorityFees.priorityProductionFee,
                            priorityShippingFee: priorityFees.priorityShippingFee,
                        }
                    });

                    createdOrderCodes.push(finalOrderCode);

                    // Create Jobs (Items)
                    for (const item of orderData.items) {
                        const jobCode = 'JOB' + uuidv4().substring(0, 8).toUpperCase();
                        const newJob = await tx.job.create({
                            data: {
                                orderId: newOrder.id,
                                sellerId,
                                jobCode,
                                status: orderStatus,
                                sku: item.sku,
                                color: item.color,
                                size: item.size,
                                qty: item.qty,
                                // Snapshot recipient info to job as well (as per schema usage)
                                recipientName: orderData.recipientName,
                                address1: orderData.address1,
                                address2: orderData.address2,
                                city: orderData.city,
                                state: orderData.state,
                                zip: orderData.zip,
                                country: orderData.country,
                                phone: orderData.phone,
                                designs: item.designs, // JSON string already
                                notes: item.notes,
                                priceToCharge: isDesignRequest ? 0 : item.priceToCharge,
                                shippingCost: isDesignRequest ? 0 : (item.shippingCost || 0),
                                extraFees: isDesignRequest ? 0 : (item.extraFees || 0),
                                shippingLabel: item.shippingLabel,
                            }
                        });

                        // QR Tokens
                        await tx.qrToken.create({
                            data: { jobId: newJob.id, type: 'FILE', token: generateToken() }
                        });
                        await tx.qrToken.create({
                            data: { jobId: newJob.id, type: 'STATUS', token: generateToken(), maxUses: 2 }
                        });

                        // Inventory Logic — Design Requests don't reserve stock yet
                        // (SKU may still be a placeholder); reservation happens when
                        // the order is completed and promoted to PENDING_APPROVAL.
                        if (!isDesignRequest) {
                            await tx.inventoryItem.upsert({
                                where: { sku_color_size: { sku: item.sku, color: item.color || "", size: item.size || "" } },
                                update: { reserved: { increment: item.qty } },
                                create: { sku: item.sku, color: item.color || "", size: item.size || "", reserved: item.qty, onHand: 0 }
                            });
                        }
                    }
                }
                return { count: createdOrderCodes.length, createdOrderCodes };
            }, {
                maxWait: 20000,
                timeout: 120000
            });

            const sellerNameForNotification =
                targetSellerId && user.role === 'ADMIN'
                    ? (await prisma.seller.findUnique({
                        where: { id: sellerId },
                        select: { name: true }
                    }))?.name
                    : user.seller?.name;

            notifyOrderImport({
                importerEmail: user.email,
                importerName: user.name,
                sellerName: sellerNameForNotification,
                importedCount: transactionResult.count,
                totalCost,
                orderCodes: transactionResult.createdOrderCodes
            }).catch((error) => {
                console.error('Order import email notification failed:', error);
            });

            return NextResponse.json({
                success: true,
                message: fundsShort
                    ? `Imported ${transactionResult.count} orders. They are on hold as "Awaiting Funds" — top up $${shortfall.toFixed(2)} and they move to Pending Approval automatically.`
                    : `Successfully created ${transactionResult.count} orders. Waiting for Admin Approval.`,
                importedCount: transactionResult.count,
                // Funding summary so the seller is told exactly how short they are.
                fundsShort,
                shortfall,
                totalCost,
                walletBalance: sellerWallet.balance
            });
        }


        // --- MODE 1: PARSE FILE (Multipart) ---
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const targetSellerId = String(formData.get('targetSellerId') || '').trim();
        // 'etsy' → the uploaded file is a raw Etsy export to be auto-mapped.
        const source = String(formData.get('source') || '').trim().toLowerCase();

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rawJson = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: "" });

        let rawData = rawJson.map((row: any) => {
            const newRow: any = {};
            Object.keys(row).forEach(key => {
                newRow[normalizeKey(key)] = row[key];
            });
            return newRow;
        });

        // Authentication - Get logged-in user from cookies
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated. Please login.' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { seller: { include: { wallet: true } } }
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

        let sellerId = '';
        let sellerWallet = null;

        if (targetSellerId && user.role === 'ADMIN') {
            const targetSeller = await prisma.seller.findUnique({
                where: { id: targetSellerId },
                include: { wallet: true }
            });

            if (!targetSeller) {
                return NextResponse.json({ error: 'Target seller not found' }, { status: 404 });
            }

            sellerId = targetSeller.id;
            sellerWallet = targetSeller.wallet;
        } else {
            if (!user.seller) return NextResponse.json({ error: 'Seller account not found' }, { status: 401 });
            sellerId = user.seller.id;
            sellerWallet = user.seller.wallet;
        }

        // The seller's Etsy listings file, as SKU -> listing photo. Used below to
        // fill a mockup the sheet left blank, matched on the seller's own SKU.
        const listingMockups = await loadListingMockupLookup(sellerId);

        // Etsy source: transform the raw export into internal rows using this
        // seller's mapping tables, then let the standard pipeline take over.
        if (source === 'etsy') {
            const maps = await loadEtsyMaps(sellerId);
            rawData = transformEtsyRows(rawJson as any[], maps) as any[];
        }

        const orderGroups = new Map<string, any[]>();
        const productsCache: Record<string, any> = {};

        rawData.forEach((r: any, index: number) => {
            const rowIndex = index + 2;
            const row = { ...r, _rowIndex: rowIndex };
            const extOrderId = String(r['orderid'] || r['ordernumber'] || r['externalid'] || '').trim();

            if (extOrderId) {
                if (!orderGroups.has(extOrderId)) orderGroups.set(extOrderId, []);
                orderGroups.get(extOrderId)!.push(row);
            } else {
                const tempId = `TEMP-${uuidv4()}`;
                orderGroups.set(tempId, [row]);
            }
        });

        const parsedOrders: any[] = [];
        let totalBatchCost = 0;
        const priorityFeeSettings = await getPriorityFeeSettings();

        for (const [extOrderId, rows] of orderGroups) {
            const firstRow = rows[0];
            const shippingGroups = new Map<string, Array<{ row: any; rowOffset: number }>>();
            const shippingCostByRowOffset = new Map<number, number>();

            rows.forEach((row: any, rowOffset: number) => {
                const destinationKey = getShippingDestinationKey(row, firstRow);
                if (!shippingGroups.has(destinationKey)) shippingGroups.set(destinationKey, []);
                shippingGroups.get(destinationKey)!.push({ row, rowOffset });
            });

            for (const shippingRows of shippingGroups.values()) {
                const shippingItems: Array<{ key: number; product: any; qty: number }> = [];

                for (const { row, rowOffset } of shippingRows) {
                    const sku = String(row['sku'] || row['productsku'] || '').trim();
                    const qty = parseInt(String(row['qty'] || row['quantity'] || '0').trim());

                    if (!sku || qty <= 0) continue;

                    let product = productsCache[sku];
                    if (!product) {
                        product = await prisma.product.findUnique({
                            where: { sku },
                            include: { variants: true }
                        });
                        if (product) productsCache[sku] = product;
                    }

                    if (product) {
                        shippingItems.push({ key: rowOffset, product, qty });
                    }
                }

                const { allocations } = calculateCombinedShippingAllocations(shippingItems);
                allocations.forEach((allocation) => {
                    shippingCostByRowOffset.set(Number(allocation.key), allocation.shippingCost);
                });
            }

            // Iterate rows and create INDIVIDUAL Orders
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const rowIndex = row._rowIndex;
                // Extract Headers (repeated for transparency, though identical for group usually)
                const recipientName = String(row['recipientname'] || row['shippingname'] || firstRow['recipientname'] || '').trim(); // Fallback to first row if missing in duplicate rows

                // Address Consolidation - Use line-based address parser
                // First, check for SHIPPING ADDRESS column (multiline format)
                const rawShippingAddress = String(row['shippingaddress'] || firstRow['shippingaddress'] || '').trim();

                let address1 = '';
                let address2 = '';
                let city = '';
                let state = '';
                let zip = '';
                let country = '';
                const phone = String(row['phone'] || row['shippingphone'] || '').trim();

                if (rawShippingAddress) {
                    // Parse multiline shipping address
                    const parsed = parseAddress(rawShippingAddress);
                    address1 = parsed.address1;
                    address2 = parsed.address2;
                    city = parsed.city;
                    state = parsed.state;
                    zip = parsed.zip;
                    country = parsed.country;
                } else {
                    // Use individual columns if shippingaddress not present
                    // Support standard generic naming AND Etsy specific naming (Ship Address1, etc.)
                    // Normalization removes spaces and lowercases: 'Ship Address1' -> 'shipaddress1'
                    address1 = String(row['address1'] || row['shipaddress1'] || row['shippingaddress1'] || '').trim();
                    address2 = String(row['address2'] || row['shipaddress2'] || row['shippingaddress2'] || '').trim();
                    city = String(row['city'] || row['shipcity'] || row['shippingcity'] || '').trim();
                    state = String(row['state'] || row['shipstate'] || row['shippingstate'] || row['province'] || row['shippingprovince'] || '').trim();
                    zip = String(row['zip'] || row['shipzipcode'] || row['shippingzip'] || row['postalcode'] || '').trim();
                    country = String(row['country'] || row['shipcountry'] || row['shippingcountry'] || '').trim();

                    // Inherit from first row if completely missing
                    if (!address1) {
                        address1 = String(firstRow['address1'] || firstRow['shipaddress1'] || '').trim();
                        address2 = String(firstRow['address2'] || firstRow['shipaddress2'] || '').trim();
                        city = city || String(firstRow['city'] || firstRow['shipcity'] || '').trim();
                        state = state || String(firstRow['state'] || firstRow['shipstate'] || firstRow['shippingprovince'] || '').trim();
                        zip = zip || String(firstRow['zip'] || firstRow['shipzipcode'] || firstRow['shippingzip'] || '').trim();
                        country = country || String(firstRow['country'] || firstRow['shipcountry'] || firstRow['shippingcountry'] || '').trim();
                    }
                }
                if (!country) country = 'US';


                const sku = String(row['sku'] || row['productsku'] || '').trim();
                const color = String(row['color'] || '').trim();
                const size = String(row['size'] || '').trim();
                const qty = parseInt(String(row['qty'] || row['quantity'] || '0').trim());
                const shippingLabel = String(row['sellersku'] || row['seller sku'] || row['shippinglabel'] || row['shipping label'] || '').trim();

                const orderErrors: string[] = [];
                let orderValid = true;

                if (!sku) { orderErrors.push(`Row ${rowIndex}: Missing SKU`); }
                if (qty <= 0) { orderErrors.push(`Row ${rowIndex}: Qty invalid`); }

                // Position 1 / Design 1 / Mockup 1 are still required, but they are
                // checked further down, once the listing photo and the default
                // position have filled what they can.

                // Retrieve Product
                let product = productsCache[sku];
                if (!product) {
                    product = await prisma.product.findUnique({ where: { sku }, include: { variants: true } });
                    if (product) productsCache[sku] = product;
                }

                if (!product) {
                    orderErrors.push(`Row ${rowIndex}: SKU ${sku} not found`);
                    orderValid = false;
                }

                // Inventory & Variant Logic
                let variant = null;
                let inventoryItem = null;

                if (product && product.variants) {
                    variant = product.variants.find((v: any) =>
                        (v.color?.toLowerCase() === color.toLowerCase() || (!v.color && !color)) &&
                        (v.size?.toLowerCase() === size.toLowerCase() || (!v.size && !size))
                    );

                    if (!variant) {
                        orderErrors.push(`Row ${rowIndex}: Variant ${color}/${size} not found for SKU ${sku}`);
                        orderValid = false;
                    }

                    // Inventory check
                    const inventoryItems = await prisma.inventoryItem.findMany({ where: { sku } });
                    inventoryItem = inventoryItems.find(inv => {
                        const dbColor = (inv.color || '').toLowerCase();
                        const reqColor = (color || '').toLowerCase();
                        const dbSize = (inv.size || '').toLowerCase();
                        const reqSize = (size || '').toLowerCase();
                        return dbColor === reqColor && dbSize === reqSize;
                    });

                }

                // Designs (Same extraction logic)
                const designs: any[] = [];
                // Unindexed / Legacy
                const rawPos = String(row['position'] || row['location'] || '').trim();
                const rawType = String(row['type'] || 'Embroidery').trim();
                const legacyLink = String(row['embroideryfilelink'] || row['designlink'] || '').trim();
                if (legacyLink) {
                    let bestGuessPos = rawPos;
                    if (!bestGuessPos) {
                        for (let k = 1; k <= 4; k++) {
                            const p = String(row[`position${k}`] || row[`position ${k}`] || row[`design${k}location`] || row[`location${k}`] || '').trim();
                            if (p) { bestGuessPos = p; break; }
                        }
                    }
                    designs.push({ url: legacyLink, location: bestGuessPos || 'Legacy/Front', type: rawType || 'Embroidery' });
                }
                // Indexed
                let slot1: any = null;
                for (let k = 1; k <= 4; k++) {
                    const url = String(row[`design${k}`] || row[`design${k}link`] || row[`embroidery${k}`] || '').trim();
                    const loc = String(row[`position${k}`] || row[`position ${k}`] || row[`design${k}location`] || row[`location${k}`] || '').trim();
                    const mockup = String(row[`mockup${k}`] || row[`mockuplink${k}`] || row[`mockup`] || row[`mockuplink`] || '').trim();
                    const type = String(row[`type${k}`] || row[`type`] || '').trim();
                    // Keep the row whenever ANY of the three carries something. Only
                    // pushing on a design link meant a sheet with Position and Mockup
                    // filled in but the Design column still blank lost all three, and
                    // the order came in showing Blank everywhere.
                    const hasSomething = Boolean(url || loc || mockup);
                    const alreadyThere = designs.some((d: any) =>
                        (d.url || '') === url
                        && (d.location || '') === loc
                        && (d.mockup || '') === mockup);
                    if (hasSomething && !alreadyThere) {
                        const entry = { url, location: loc || undefined, mockup, type };
                        designs.push(entry);
                        if (k === 1) slot1 = entry;
                    }
                }

                // A blank mockup gets the listing photo for this seller SKU, when
                // the seller's listings file has one. Never overwrites what the
                // sheet itself carried.
                const listingPhoto = listingMockups.get(skuKeyOf(shippingLabel));
                if (listingPhoto) {
                    if (designs.length === 0) {
                        slot1 = { url: '', location: undefined, mockup: listingPhoto, type: '' };
                        designs.push(slot1);
                    } else {
                        for (const d of designs) {
                            if (!String(d.mockup || '').trim()) d.mockup = listingPhoto;
                        }
                    }
                }

                // A design the sheet gives no position is placed as its mockup shows:
                // MOCK_UP, a position every product prices. Slot 1 always gets it,
                // even before its artwork exists, so a Design Request order is whole
                // once the file arrives. A further slot carrying only a mockup is a
                // picture, not another embroidery to charge for, so it is left alone.
                for (const d of designs) {
                    const hasPosition = String(d.location || '').trim();
                    const hasArtwork = String(d.url || '').trim();
                    if (!hasPosition && (d === slot1 || hasArtwork)) d.location = DEFAULT_POSITION;
                }

                // Position 1, Design 1 and Mockup 1 must all be there -- judged on the
                // row as it now stands, so a mockup from the listings file and the
                // default position count.
                if (!slot1 || !String(slot1.location || '').trim() || !String(slot1.url || '').trim() || !String(slot1.mockup || '').trim()) {
                    orderErrors.push(`Row ${rowIndex}: Missing required Design Info (Position 1, Design 1, Mockup 1)`);
                    orderValid = false;
                }

                if (product) {
                    const designErrors = validateDesigns(product, designs);
                    if (designErrors.length > 0) designErrors.forEach(err => orderErrors.push(`Row ${rowIndex}: ${err}`));
                }

                if (orderErrors.length > 0) orderValid = false;


                // --- COST CALCULATION ---
                const priceToCharge = variant?.basePrice || 0;

                // Extra Fees (Per item)
                let extraFeesTotal = 0;
                if (product) {
                    const costs = calculateItemCosts(product, qty, designs);
                    extraFeesTotal = costs.extraFees;
                    // We ignore costs.shippingCost here because we use masterShippingCost
                }

                // Shipping Cost Assignment
                const assignedShippingCost = shippingCostByRowOffset.get(i) || 0;

                // Total Order Cost
                const orderCost = Number(((priceToCharge * qty) + assignedShippingCost + extraFeesTotal).toFixed(2));


                // Create Wrapper Order Object
                // If duplicates: Suffix ID.
                let uniqueOrderId = extOrderId;
                if (i > 0) {
                    uniqueOrderId = `${extOrderId}(${i})`; // e.g. ORDER123(1) for 2nd item (index 1)
                }

                const orderItems = [{
                    sku,
                    color: inventoryItem ? (inventoryItem.color || '') : color,
                    size: inventoryItem ? (inventoryItem.size || '') : size,
                    qty,
                    designs: JSON.stringify(designs),
                    notes: String(row['notes'] || row['note'] || '').trim(),
                    priceToCharge,
                    shippingCost: assignedShippingCost, // Stored on Job level for reference?? Or just Order? Code creates Orders. 
                    // Actually, schema has shippingCost on Job? 
                    // Let's check Schema... Job has 'shippingCost'. Order has 'totalAmount'.
                    // We will put the assignedShippingCost on the JOB. 
                    // If Order has multiple Jobs? No, based on this new logic, Order has 1 Job (1 row).
                    // So Job.shippingCost = assignedShippingCost.
                    extraFees: extraFeesTotal,
                    shippingLabel,
                    lineCost: orderCost
                }];

                parsedOrders.push({
                    id: uniqueOrderId.startsWith('TEMP-') ? null : uniqueOrderId,
                    tempId: uniqueOrderId,
                    sourceOrderCode: extOrderId.startsWith('TEMP-') ? '' : extOrderId,
                    sourceRows: [rowIndex],
                    recipientName, address1, address2, city, state, zip, country, phone,
                    items: orderItems,
                    baseCost: orderCost,
                    totalCost: orderCost,
                    priorityProduction: false,
                    priorityShipping: false,
                    priorityProductionFee: priorityFeeSettings.priorityProductionFee,
                    priorityShippingFee: priorityFeeSettings.priorityShippingFee,
                    valid: orderValid,
                    errors: orderErrors,
                    // Meta for checking duplication in UI if needed
                    isDuplicate: i > 0,
                    duplicate: false,
                    groupId: extOrderId
                });
            }
        }

        const duplicateCheck = await detectDuplicateOrders(sellerId, parsedOrders);
        duplicateCheck.findings.forEach((duplicateErrors, index) => {
            parsedOrders[index].valid = false;
            parsedOrders[index].duplicate = true;
            parsedOrders[index].errors = [...parsedOrders[index].errors, ...duplicateErrors];
        });

        // Flag "Design Request" orders: not fully valid, but only because they're
        // missing info the seller can fill in later (SKU / blank / design / position).
        // These are importable at $0 and become PENDING_APPROVAL once completed.
        // Hard blocks (duplicates, qty <= 0) are NOT design requests — they can't be
        // imported at all.
        parsedOrders.forEach((order) => {
            const qty = Number(order.items?.[0]?.qty || 0);
            order.incomplete = !order.valid && !order.duplicate && qty > 0;
            if (order.incomplete) {
                order.totalCost = 0;
                order.baseCost = 0;
            }
        });

        totalBatchCost = parsedOrders
            .filter((order) => order.valid)
            .reduce((sum, order) => sum + (order.totalCost || 0), 0);

        // Return Analysis (Dry Run Mode always for File Upload now)
        return NextResponse.json({
            success: true,
            dryRun: true,
            parsedOrders, // Frontend will iterate this to show checkable list
            summary: {
                totalOrders: parsedOrders.length,
                validOrders: parsedOrders.filter((order) => order.valid).length,
                invalidOrders: parsedOrders.filter((order) => !order.valid).length,
                designRequestOrders: parsedOrders.filter((order) => order.incomplete).length,
                duplicateInFileCount: duplicateCheck.summary.inFileCount,
                duplicateExistingCount: duplicateCheck.summary.existingCount,
                duplicateCount: duplicateCheck.summary.totalCount
            },
            totalEstimatedCost: totalBatchCost,
            balanceSufficient: (sellerWallet?.balance || 0) >= totalBatchCost,
            walletBalance: sellerWallet?.balance || 0,
            priorityFees: priorityFeeSettings
        });

    } catch (error: any) {
        console.error("Import Error:", error);
        return NextResponse.json({ error: error.message || 'Server Error' }, { status: 500 });
    }
}
