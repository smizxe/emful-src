import { prisma } from '@/lib/prisma';
import { calculateCombinedShippingAllocations, calculateDesignSurcharges, calculateItemCosts } from '@/lib/pricing';

/**
 * Promote a Design Request order once every item is finally specified.
 *
 * The seller's own edit screen already does this when they fill the gaps in
 * themselves (see /api/orders/update). This is the other way in: the design team
 * delivers the artwork, which completes the order without the seller touching
 * it, and the order should price itself and move to Pending Approval just the
 * same.
 *
 * Deliberately conservative: it only ever acts on an order still sitting at
 * DESIGN_REQUEST, and only when every line resolves to a real variant and
 * carries a design with both a link and a position. Anything short of that
 * leaves the order exactly as it is, at $0.
 */

export interface PromotionResult {
    promoted: boolean;
    reason?: string;
    totalAmount?: number;
}

function parseDesigns(raw: string | null | undefined): any[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export async function promoteDesignRequestIfComplete(orderId: string): Promise<PromotionResult> {
    const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
            id: true,
            status: true,
            priorityProduction: true,
            priorityShipping: true,
            priorityProductionFee: true,
            priorityShippingFee: true,
            jobs: { select: { id: true, sku: true, color: true, size: true, qty: true, designs: true } },
        },
    });

    if (!order) return { promoted: false, reason: 'order not found' };
    if (order.status !== 'DESIGN_REQUEST') return { promoted: false, reason: 'not a design request' };
    if (order.jobs.length === 0) return { promoted: false, reason: 'no items' };

    // Resolve every line first; one unresolved line means the order stays put.
    const lines = [];
    for (const job of order.jobs) {
        const product = await prisma.product.findUnique({
            where: { sku: job.sku },
            include: { variants: true },
        });
        if (!product) return { promoted: false, reason: `no product ${job.sku}` };

        const variant = product.variants.find((v) =>
            (v.color || '').toLowerCase() === (job.color || '').toLowerCase()
            && (v.size || '').toLowerCase() === (job.size || '').toLowerCase());
        if (!variant) return { promoted: false, reason: `no variant for ${job.sku} ${job.color}/${job.size}` };

        const designs = parseDesigns(job.designs);
        const hasDesign = designs.some((d: any) => (d?.url || '').trim() && ((d?.position || d?.location || '').trim()));
        if (!hasDesign) return { promoted: false, reason: `item ${job.sku} has no finished design` };

        lines.push({ job, product, variant, designs });
    }

    // Same pricing the seller's edit screen uses, so both routes agree.
    const shippingByKey = new Map(
        calculateCombinedShippingAllocations(
            lines.map((line, index) => ({ key: index, product: line.product, qty: line.job.qty }))
        ).allocations.map((allocation) => [Number(allocation.key), allocation.shippingCost])
    );

    let total = 0;
    const writes = lines.map((line, index) => {
        const priceToCharge = line.variant.basePrice || 0;
        const extraFees = calculateItemCosts(line.product, line.job.qty, line.designs).extraFees || 0;
        const shippingCost = shippingByKey.get(index) || 0;
        total += (priceToCharge * line.job.qty) + shippingCost + extraFees;
        return { line, priceToCharge, extraFees, shippingCost };
    });

    const priorityTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
        + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
    const totalAmount = Number((total + priorityTotal).toFixed(2));

    await prisma.$transaction(async (tx) => {
        for (const { line, priceToCharge, extraFees, shippingCost } of writes) {
            // A Design Request never reserved stock, so the full quantity is
            // reserved now, exactly as the edit screen does when it promotes.
            await tx.inventoryItem.upsert({
                where: {
                    sku_color_size: {
                        sku: line.job.sku,
                        color: line.job.color || '',
                        size: line.job.size || '',
                    },
                },
                update: { reserved: { increment: line.job.qty } },
                create: {
                    sku: line.job.sku,
                    color: line.job.color || '',
                    size: line.job.size || '',
                    reserved: line.job.qty,
                    onHand: 0,
                },
            });

            await tx.job.update({
                where: { id: line.job.id },
                data: { priceToCharge, shippingCost, extraFees, status: 'PENDING_APPROVAL' },
            });
        }

        await tx.order.update({
            where: { id: order.id },
            data: { totalAmount, status: 'PENDING_APPROVAL' },
        });
    });

    return { promoted: true, totalAmount };
}

/** Surcharge lines, for anyone that wants to show what the extra fees were. */
export function describeSurcharges(product: any, qty: number, designs: any[]) {
    return calculateDesignSurcharges(product, qty, designs).map((detail: any) => ({
        position: detail.position || detail.normalizedPosition.toUpperCase(),
        type: detail.type,
        amount: detail.amount,
    }));
}
