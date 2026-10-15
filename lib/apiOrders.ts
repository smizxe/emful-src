import 'server-only';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { calculateItemCosts, calculateCombinedShippingAllocations, validateDesigns } from '@/lib/pricing';

function generateToken() {
    return uuidv4().replace(/-/g, '') + Math.random().toString(36).substring(2, 8);
}

// Normalize a public-API design entry to the internal shape used everywhere else.
function normDesign(d: any) {
    return {
        url: String(d?.url ?? d?.designUrl ?? '').trim(),
        location: String(d?.position ?? d?.location ?? '').trim(),
        mockup: String(d?.mockup ?? d?.mockupUrl ?? '').trim(),
        type: String(d?.type ?? 'Embroidery').trim() || 'Embroidery',
    };
}

export interface ApiOrderInput {
    originalId?: string;
    items: Array<{
        sku?: string; itemSku?: string;
        color?: string; size?: string;
        quantity?: number; qty?: number;
        designs?: any[]; images?: any[];
        sellerSku?: string;
    }>;
    shippingAddress?: {
        fullName?: string; phone?: string;
        address1?: string; address2?: string;
        city?: string; state?: string; stateCode?: string;
        zip?: string; country?: string; countryCode?: string;
    };
}

export type CreateApiOrdersResult =
    | { ok: true; created: { orderCode: string; totalAmount: number }[] }
    | { ok: false; status: number; error: string; errors?: string[]; balanceRequired?: number; balanceAvailable?: number };

/**
 * Validate + price + create orders submitted through the public API. Prices are
 * ALWAYS derived server-side from the product variant + design/position rules +
 * shipping — never trusted from the caller. Orders land in PENDING_APPROVAL like
 * a normal import (wallet is charged at admin approval, not here).
 */
export async function createApiOrders(
    inputs: ApiOrderInput[],
    sellerId: string,
    wallet: { balance: number } | null,
): Promise<CreateApiOrdersResult> {
    const productCache: Record<string, any> = {};
    const getProduct = async (sku: string) => {
        if (!(sku in productCache)) {
            productCache[sku] = await prisma.product.findUnique({ where: { sku }, include: { variants: true } });
        }
        return productCache[sku];
    };

    const errors: string[] = [];
    const prepared: Array<{
        originalId: string; ship: any;
        items: Array<{ sku: string; color: string; size: string; qty: number; designs: any[]; priceToCharge: number; extraFees: number; shippingCost: number; sellerSku: string }>;
        total: number;
    }> = [];

    for (let oi = 0; oi < inputs.length; oi++) {
        const input = inputs[oi];
        const label = input.originalId || `order#${oi + 1}`;
        const rawItems = Array.isArray(input.items) ? input.items : [];
        if (rawItems.length === 0) { errors.push(`${label}: no items`); continue; }

        const ship = input.shippingAddress || {};
        const preparedItems: any[] = [];
        const shippingInputs: { key: number; product: any; qty: number }[] = [];

        for (let ii = 0; ii < rawItems.length; ii++) {
            const it = rawItems[ii];
            const sku = String(it.sku ?? it.itemSku ?? '').trim();
            const color = String(it.color ?? '').trim();
            const size = String(it.size ?? '').trim();
            const qty = parseInt(String(it.quantity ?? it.qty ?? 0), 10);
            const designs = (Array.isArray(it.designs) ? it.designs : Array.isArray(it.images) ? it.images : [])
                .map(normDesign).filter((d: any) => d.url);

            if (!sku) { errors.push(`${label} item ${ii + 1}: missing sku`); continue; }
            if (!(qty > 0)) { errors.push(`${label} item ${ii + 1}: quantity must be > 0`); continue; }
            if (designs.length === 0 || !designs[0].url || !designs[0].location) {
                errors.push(`${label} item ${ii + 1}: at least one design with url + position is required`);
                continue;
            }
            designs.forEach((d: any) => { if (!d.mockup) d.mockup = '-'; });

            const product = await getProduct(sku);
            if (!product) { errors.push(`${label} item ${ii + 1}: SKU ${sku} not found`); continue; }

            const variant = (product.variants || []).find((v: any) =>
                (v.color?.toLowerCase() === color.toLowerCase() || (!v.color && !color)) &&
                (v.size?.toLowerCase() === size.toLowerCase() || (!v.size && !size))
            );
            if (!variant) { errors.push(`${label} item ${ii + 1}: variant ${color || '-'}/${size || '-'} not found for ${sku}`); continue; }

            const designErrors = validateDesigns(product, designs);
            designErrors.forEach((e) => errors.push(`${label} item ${ii + 1}: ${e}`));

            const key = preparedItems.length;
            shippingInputs.push({ key, product, qty });
            preparedItems.push({
                sku, color, size, qty, designs,
                priceToCharge: variant.basePrice || 0,
                extraFees: calculateItemCosts(product, qty, designs).extraFees,
                shippingCost: 0, // filled from combined allocation below
                sellerSku: String(it.sellerSku ?? '').trim(),
            });
        }

        if (preparedItems.length === 0) continue;

        const { allocations } = calculateCombinedShippingAllocations(shippingInputs);
        const shipByKey = new Map<number, number>(allocations.map((a: any) => [Number(a.key), a.shippingCost]));
        let total = 0;
        preparedItems.forEach((pi, idx) => {
            pi.shippingCost = shipByKey.get(idx) || 0;
            total += (pi.priceToCharge * pi.qty) + pi.shippingCost + pi.extraFees;
        });
        total = Number(total.toFixed(2));

        prepared.push({ originalId: String(input.originalId || '').trim(), ship, items: preparedItems, total });
    }

    if (errors.length > 0) {
        return { ok: false, status: 422, error: 'Validation failed', errors };
    }
    if (prepared.length === 0) {
        return { ok: false, status: 400, error: 'No valid orders to create' };
    }

    const grandTotal = Number(prepared.reduce((s, p) => s + p.total, 0).toFixed(2));
    if (!wallet) return { ok: false, status: 400, error: 'Seller wallet not found' };
    // Note: creation leaves orders PENDING_APPROVAL; the wallet is only debited at
    // approval. We still surface a balance warning so callers know it will be needed.

    const created = await prisma.$transaction(async (tx) => {
        const out: { orderCode: string; totalAmount: number }[] = [];
        for (const p of prepared) {
            let base = p.originalId && !p.originalId.startsWith('TEMP-') ? p.originalId : `ORDER${Date.now()}-${uuidv4().substring(0, 6).toUpperCase()}`;
            let code = base, n = 1;
            while (await tx.order.findUnique({ where: { orderCode: code } })) { code = `${base}(${n})`; n++; }

            const country = String(p.ship.country ?? p.ship.countryCode ?? '').trim() || 'US';
            const order = await tx.order.create({
                data: {
                    orderCode: code, sellerId, status: 'PENDING_APPROVAL',
                    totalAmount: p.total, trackingNumber: '', shippingMethod: 'STANDARD', shippingCountry: country,
                },
            });
            for (const it of p.items) {
                const job = await tx.job.create({
                    data: {
                        orderId: order.id, sellerId, jobCode: 'JOB' + uuidv4().substring(0, 8).toUpperCase(),
                        status: 'PENDING_APPROVAL', sku: it.sku, color: it.color, size: it.size, qty: it.qty,
                        recipientName: String(p.ship.fullName ?? '').trim(),
                        phone: String(p.ship.phone ?? '').trim(),
                        address1: String(p.ship.address1 ?? '').trim(),
                        address2: String(p.ship.address2 ?? '').trim(),
                        city: String(p.ship.city ?? '').trim(),
                        state: String(p.ship.state ?? p.ship.stateCode ?? '').trim(),
                        zip: String(p.ship.zip ?? '').trim(),
                        country,
                        designs: JSON.stringify(it.designs),
                        priceToCharge: it.priceToCharge, shippingCost: it.shippingCost, extraFees: it.extraFees,
                        shippingLabel: it.sellerSku,
                    },
                });
                await tx.qrToken.create({ data: { jobId: job.id, type: 'FILE', token: generateToken() } });
                await tx.qrToken.create({ data: { jobId: job.id, type: 'STATUS', token: generateToken(), maxUses: 2 } });
                await tx.inventoryItem.upsert({
                    where: { sku_color_size: { sku: it.sku, color: it.color || '', size: it.size || '' } },
                    update: { reserved: { increment: it.qty } },
                    create: { sku: it.sku, color: it.color || '', size: it.size || '', reserved: it.qty, onHand: 0 },
                });
            }
            out.push({ orderCode: code, totalAmount: p.total });
        }
        return out;
    }, { maxWait: 20000, timeout: 120000 });

    return { ok: true, created };
}
