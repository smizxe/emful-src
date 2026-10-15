
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { calculateCombinedShippingAllocations, calculateDesignSurcharges, calculateItemCosts } from '@/lib/pricing';

type ChargePositionSummary = {
    position: string;
    type: string;
    amount: number;
};

type OrderRevertMeta = {
    oldStatus?: string;
    newStatus?: string;
    reason?: string;
    originalTotalAmount?: number;
    originalExtraFeesTotal?: number;
    originalChargePositions?: ChargePositionSummary[];
    updatedTotalAmount?: number;
    updatedExtraFeesTotal?: number;
    adjustmentAmount?: number;
    adjustmentPositions?: ChargePositionSummary[];
    additionalChargeAmount?: number;
    additionalChargePositions?: ChargePositionSummary[];
};

function safeParseJson<T>(value: string | null | undefined): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function mergeChargePositions(positions: ChargePositionSummary[]): ChargePositionSummary[] {
    const map = new Map<string, ChargePositionSummary>();

    for (const position of positions) {
        const key = `${position.position.trim().toUpperCase()}|${position.type.trim().toUpperCase()}`;
        const existing = map.get(key);
        if (existing) {
            existing.amount += position.amount;
        } else {
            map.set(key, {
                position: position.position.trim().toUpperCase(),
                type: position.type.trim(),
                amount: position.amount
            });
        }
    }

    return Array.from(map.values()).map((position) => ({
        ...position,
        amount: Number(position.amount.toFixed(2))
    }));
}

function getChargeAdjustmentPositions(
    originalPositions: ChargePositionSummary[],
    updatedPositions: ChargePositionSummary[]
): ChargePositionSummary[] {
    const originalMap = new Map<string, number>();

    for (const position of originalPositions) {
        const key = `${position.position.trim().toUpperCase()}|${position.type.trim().toUpperCase()}`;
        originalMap.set(key, (originalMap.get(key) || 0) + position.amount);
    }

    const updatedMerged = mergeChargePositions(updatedPositions);

    return updatedMerged
        .map((position) => {
            const key = `${position.position.trim().toUpperCase()}|${position.type.trim().toUpperCase()}`;
            const originalAmount = originalMap.get(key) || 0;
            const delta = position.amount - originalAmount;

            if (delta === 0) return null;

            return {
                position: position.position,
                type: position.type,
                amount: Number(delta.toFixed(2))
            };
        })
        .filter((position): position is ChargePositionSummary => Boolean(position));
}

async function buildOriginalChargePositions(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    jobs: Array<{ sku: string; qty: number; designs: string }>
): Promise<ChargePositionSummary[]> {
    const chargePositions: ChargePositionSummary[] = [];

    for (const job of jobs) {
        const product = await tx.product.findUnique({
            where: { sku: job.sku }
        });

        if (!product) continue;

        const designs = safeParseJson<any[]>(job.designs) ?? [];
        const surchargeBreakdown = calculateDesignSurcharges(product, job.qty, designs);
        chargePositions.push(
            ...surchargeBreakdown.map((detail) => ({
                position: detail.position || detail.normalizedPosition.toUpperCase(),
                type: detail.type,
                amount: detail.amount
            }))
        );
    }

    return mergeChargePositions(chargePositions);
}

function getJobsGrandTotal(jobs: Array<{ qty: number; priceToCharge: number; shippingCost: number; extraFees: number }>) {
    return Number(jobs.reduce(
        (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
        0
    ).toFixed(2));
}

export async function POST(req: NextRequest) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { orderId, recipientName, address1, address2, city, state, zip, country, phone, items } = body;

        // 1. Fetch existing order to validate status
        const existingOrder = await prisma.order.findUnique({
            where: { id: orderId },
            include: { jobs: true }
        });

        if (!existingOrder) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // AWAITING_FUNDS behaves like a pending order here: it stays priced and keeps
        // its status (only a wallet top-up releases it), but the seller can still fix
        // details before it goes to approval.
        const allowedInfo = ['PENDING_APPROVAL', 'RECEIVED', 'DESIGN_REQUEST', 'AWAITING_FUNDS'];
        if (!allowedInfo.includes(existingOrder.status)) {
            return NextResponse.json({ error: 'Only pending, received, design-request or awaiting-funds orders can be edited' }, { status: 400 });
        }

        // A "Design Request" order was imported with missing info and no charge.
        // Editing it fills in the info; once every item resolves to a real
        // product/variant and has a design (link + position), it is promoted to
        // PENDING_APPROVAL and priced. Until then it stays a $0 Design Request.
        const wasDesignRequest = existingOrder.status === 'DESIGN_REQUEST';

        const latestRevertLog = await prisma.auditLog.findFirst({
            where: {
                action: 'ORDER_REVERT',
                entityType: 'ORDER',
                entityId: orderId
            },
            orderBy: { createdAt: 'desc' }
        });
        const latestRevertMeta = safeParseJson<OrderRevertMeta>(latestRevertLog?.metaJson);
        const existingOrderCharge = await prisma.walletLedger.findFirst({
            where: {
                sellerId: existingOrder.sellerId,
                refType: 'ORDER',
                refId: orderId,
                type: 'DEBIT'
            },
            orderBy: { createdAt: 'asc' }
        });

        // What is still stopping a Design Request from being promoted. Reported
        // back so the seller is told why their order did not move, instead of the
        // edit silently appearing to do nothing.
        const blockers: Array<{ line: number; sku: string; reason: string }> = [];

        // 2. Transaction to update Order and Jobs
        await prisma.$transaction(async (tx) => {
            let statusUpdate = {};
            const shouldTrackUpdatedCharge = existingOrder.status === 'RECEIVED' || Boolean(latestRevertMeta) || Boolean(existingOrderCharge);
            const priorityTotal = (existingOrder.priorityProduction ? Number(existingOrder.priorityProductionFee || 0) : 0)
                + (existingOrder.priorityShipping ? Number(existingOrder.priorityShippingFee || 0) : 0);
            const originalTotalAmount = latestRevertMeta?.originalTotalAmount ?? existingOrder.totalAmount ?? Number((getJobsGrandTotal(existingOrder.jobs) + priorityTotal).toFixed(2));
            const originalExtraFeesTotal = latestRevertMeta?.originalExtraFeesTotal
                ?? existingOrder.jobs.reduce((sum, job) => sum + (job.extraFees || 0), 0);
            const originalChargePositions = latestRevertMeta?.originalChargePositions
                ?? await buildOriginalChargePositions(tx, existingOrder.jobs);

            // If order was RECEIVED, revert to PENDING_APPROVAL
            if (existingOrder.status === 'RECEIVED') {
                statusUpdate = { status: 'PENDING_APPROVAL' };
            }

            // Update Order Details
            await tx.order.update({
                where: { id: orderId },
                data: {
                    shippingCountry: country,
                    ...statusUpdate
                }
            });

            // Recipient info mapping
            const recipientUpdate = {
                recipientName,
                address1,
                address2,
                city,
                state,
                zip,
                country,
                phone
            };

            let newTotalAmount = 0;
            let newExtraFeesTotal = 0;
            const processedJobIds = new Set<string>();
            const updatedChargePositions: ChargePositionSummary[] = [];
            const preparedItems = [];
            // For a Design Request, track whether every item is now fully specified.
            let allComplete = true;

            for (const [index, item] of items.entries()) {
                // Find product variant for price
                const product = await tx.product.findUnique({
                    where: { sku: item.sku },
                    include: { variants: true }
                });

                const normalizedDesigns = Array.isArray(item.designs)
                    ? item.designs
                        .filter((design: any) => (design?.url || '').trim() || (design?.position || '').trim() || (design?.mockup || '').trim())
                        .map((design: any) => ({
                            url: (design?.url || '').trim(),
                            location: (design?.position || '').trim(),
                            position: (design?.position || '').trim(),
                            mockup: (design?.mockup || '').trim(),
                            type: (design?.type || 'Embroidery').trim()
                        }))
                    : [];

                if (!product) {
                    // A normal edit must reference a real product; a Design Request may
                    // still have a placeholder SKU — keep it incomplete instead of failing.
                    if (wasDesignRequest) {
                        allComplete = false;
                        blockers.push({ line: index + 1, sku: item.sku, reason: `No product with SKU "${item.sku}"` });
                        preparedItems.push({
                            index, item, product: null, priceToCharge: 0,
                            normalizedDesigns, extraFees: 0, surchargeBreakdown: [] as any[]
                        });
                        continue;
                    }
                    throw new Error(`Product not found: ${item.sku}`);
                }

                const variant = product.variants.find(v =>
                    (v.color?.toLowerCase() === (item.color || '').toLowerCase()) &&
                    (v.size?.toLowerCase() === (item.size || '').toLowerCase())
                );

                // A Design Request is only "complete" when the item resolves to a real
                // variant and has at least one design with both a link and a position.
                const hasDesign = normalizedDesigns.some((d: any) => d.url && d.position);
                if (wasDesignRequest && !variant) {
                    allComplete = false;
                    const colours = Array.from(new Set(product.variants.map((v) => v.color).filter(Boolean)));
                    const sizesForColour = product.variants
                        .filter((v) => (v.color || '').toLowerCase() === (item.color || '').toLowerCase())
                        .map((v) => v.size)
                        .filter(Boolean);
                    const reason = sizesForColour.length > 0
                        ? `${item.sku} has no size "${item.size}" in ${item.color}. Available: ${sizesForColour.join(', ')}`
                        : `${item.sku} has no colour "${item.color}". Available: ${colours.slice(0, 12).join(', ')}${colours.length > 12 ? '...' : ''}`;
                    blockers.push({ line: index + 1, sku: item.sku, reason });
                }
                if (wasDesignRequest && !hasDesign) {
                    allComplete = false;
                    blockers.push({ line: index + 1, sku: item.sku, reason: 'Needs a design with both a file link and a position' });
                }

                const priceToCharge = variant?.basePrice || 0;
                const costs = calculateItemCosts(product, item.qty, normalizedDesigns);
                const extraFees = costs.extraFees || 0;
                const surchargeBreakdown = calculateDesignSurcharges(product, item.qty, normalizedDesigns);
                preparedItems.push({
                    index,
                    item,
                    product,
                    priceToCharge,
                    normalizedDesigns,
                    extraFees,
                    surchargeBreakdown
                });
            }

            // Promote to PENDING_APPROVAL only when a Design Request is fully specified.
            const promote = wasDesignRequest && allComplete;

            const shippingCostByItemIndex = new Map(
                calculateCombinedShippingAllocations(
                    preparedItems
                        .filter((prepared) => prepared.product)
                        .map((prepared) => ({
                            key: prepared.index,
                            product: prepared.product,
                            qty: prepared.item.qty
                        }))
                ).allocations.map((allocation) => [Number(allocation.key), allocation.shippingCost])
            );

            for (const prepared of preparedItems) {
                const { index, item, priceToCharge, normalizedDesigns, extraFees, surchargeBreakdown } = prepared;
                const shippingCost = shippingCostByItemIndex.get(index) || 0;
                const lineCost = (priceToCharge * item.qty) + shippingCost + extraFees;
                newTotalAmount += lineCost;
                newExtraFeesTotal += extraFees;
                updatedChargePositions.push(
                    ...surchargeBreakdown.map((detail) => ({
                        position: detail.position || detail.normalizedPosition.toUpperCase(),
                        type: detail.type,
                        amount: detail.amount
                    }))
                );

                if (item.id) {
                    // Update existing
                    processedJobIds.add(item.id);
                    const existingJob = existingOrder.jobs.find(j => j.id === item.id);
                    if (existingJob) {
                        // Inventory. A Design Request never reserved stock, so there's
                        // no diff to apply; when it's promoted we reserve the full qty
                        // on the (now real) SKU/color/size below.
                        if (!wasDesignRequest) {
                            const qtyDiff = item.qty - existingJob.qty;
                            if (qtyDiff !== 0) {
                                await tx.inventoryItem.upsert({
                                    where: { sku_color_size: { sku: existingJob.sku, color: existingJob.color || '', size: existingJob.size || '' } },
                                    update: { reserved: { increment: qtyDiff } },
                                    create: { sku: existingJob.sku, color: existingJob.color || '', size: existingJob.size || '', reserved: item.qty }
                                });
                            }
                        } else if (promote) {
                            await tx.inventoryItem.upsert({
                                where: { sku_color_size: { sku: item.sku, color: item.color || '', size: item.size || '' } },
                                update: { reserved: { increment: item.qty } },
                                create: { sku: item.sku, color: item.color || '', size: item.size || '', reserved: item.qty, onHand: 0 }
                            });
                        }

                        const designsJson = JSON.stringify(normalizedDesigns);

                        // While an order stays a Design Request, keep its charge at $0;
                        // real prices are written when it's promoted (or on normal edits).
                        const stayDesignRequest = wasDesignRequest && !promote;
                        let jobStatus: string | undefined = undefined;
                        if (existingOrder.status === 'RECEIVED' || promote) jobStatus = 'PENDING_APPROVAL';

                        await tx.job.update({
                            where: { id: item.id },
                            data: {
                                ...recipientUpdate,
                                sku: item.sku,
                                color: item.color,
                                size: item.size,
                                qty: item.qty,
                                notes: item.notes || null,
                                priceToCharge: stayDesignRequest ? 0 : priceToCharge,
                                shippingCost: stayDesignRequest ? 0 : shippingCost,
                                extraFees: stayDesignRequest ? 0 : extraFees,
                                designs: designsJson,
                                status: jobStatus
                            }
                        });
                    }
                }
            }

            // Update Order Total. A Design Request that isn't complete yet stays at
            // $0; once promoted it carries the freshly computed total and moves to
            // PENDING_APPROVAL (charged at admin approval like any pending order).
            const orderTotalWithPriority = (wasDesignRequest && !promote)
                ? 0
                : Number((newTotalAmount + priorityTotal).toFixed(2));
            await tx.order.update({
                where: { id: orderId },
                data: {
                    totalAmount: orderTotalWithPriority,
                    ...(promote ? { status: 'PENDING_APPROVAL' } : {})
                }
            });

            if (shouldTrackUpdatedCharge) {
                const adjustmentPositions = getChargeAdjustmentPositions(
                    originalChargePositions,
                    updatedChargePositions
                );
                const adjustmentAmount = Number(
                    (newExtraFeesTotal - originalExtraFeesTotal).toFixed(2)
                );

                await tx.auditLog.create({
                    data: {
                        actorUserId: userId,
                        actorType: 'USER',
                        action: 'ORDER_REVERT',
                        entityType: 'ORDER',
                        entityId: orderId,
                        metaJson: JSON.stringify({
                            oldStatus: existingOrder.status,
                            newStatus: 'PENDING_APPROVAL',
                            reason: 'User Edit',
                            originalTotalAmount: Number(originalTotalAmount.toFixed(2)),
                            originalExtraFeesTotal: Number(originalExtraFeesTotal.toFixed(2)),
                            originalChargePositions: mergeChargePositions(originalChargePositions),
                            updatedTotalAmount: orderTotalWithPriority,
                            updatedExtraFeesTotal: Number(newExtraFeesTotal.toFixed(2)),
                            adjustmentAmount,
                            adjustmentPositions,
                            additionalChargeAmount: adjustmentAmount,
                            additionalChargePositions: adjustmentPositions
                        } satisfies OrderRevertMeta)
                    }
                });
            }
        });

        return NextResponse.json({
            success: true,
            promoted: wasDesignRequest && blockers.length === 0,
            stillDesignRequest: wasDesignRequest && blockers.length > 0,
            blockers,
        });
    } catch (error) {
        console.error('Update Order Error:', error);
        return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
    }
}
