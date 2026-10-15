export interface PricingResult {
    shippingCost: number;
    extraFees: number;
    errors?: string[];
}

export interface DesignSurchargeDetail {
    position: string;
    normalizedPosition: string;
    type: string;
    normalizedType: string;
    surcharge: number;
    qty: number;
    amount: number;
}

export interface ShippingRatePair {
    firstItemRate: number;
    additionalItemRate: number;
}

export interface CombinedShippingItem {
    key: string | number;
    product: any;
    qty: number;
}

export interface CombinedShippingAllocation {
    key: string | number;
    shippingCost: number;
}

const normalize = (s: string) => s?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';

const ALIASES: Record<string, string> = {
    'front': 'centerchest',
    'back': 'centerback',
    'legacyfront': 'centerchest',
    'left': 'leftsleeve',
    'right': 'rightsleeve',
    'leftsleeve': 'leftsleeve',
    'rightsleeve': 'rightsleeve',
    'centerchest': 'centerchest',
    'centerback': 'centerback',
    // Underscore variants (after normalize removes underscores, these should match)
    // Actually normalize removes all non-alphanumeric, so LEFT_SLEEVE -> leftsleeve, which is already in map
    // The REAL issue is the rule positions in DB might have underscores: CENTER_CHEST -> centerchest
    // Let me add more explicit aliases just in case
    'center_chest': 'centerchest',
    'left_sleeve': 'leftsleeve',
    'right_sleeve': 'rightsleeve',
    'center_back': 'centerback',
};

const resolvePosition = (pos: string) => {
    const normalized = normalize(pos);
    return ALIASES[normalized] || normalized;
};

export function validateDesigns(product: any, designs: any[]): string[] {
    const errors: string[] = [];
    if (!product.extraFees) return [];

    let rules: any[] = [];
    try {
        rules = JSON.parse(product.extraFees);
    } catch { return []; }

    if (!Array.isArray(rules) || rules.length === 0) return [];

    // Normalize rules
    const normalizedRules = rules.map(r => ({
        pos: resolvePosition(r.position),
        type: normalize(r.type)
    }));

    for (const d of designs) {
        const dPos = resolvePosition(d.position || d.location);
        const dType = normalize(d.type || 'Embroidery');

        const match = normalizedRules.some(r => r.pos === dPos && r.type === dType);
        if (!match) {
            errors.push(`Invalid design: Position '${d.position}' Type '${d.type}' not allowed for this product.`);
        }
    }
    return errors;
}

export function calculateDesignSurcharges(product: any, qty: number, designs?: any[]): DesignSurchargeDetail[] {
    const surchargeDetails: DesignSurchargeDetail[] = [];

    if (!product.extraFees || !designs || !Array.isArray(designs)) {
        return surchargeDetails;
    }

    try {
        const rules = JSON.parse(product.extraFees);
        if (!Array.isArray(rules)) {
            return surchargeDetails;
        }

        for (const d of designs) {
            const rawPosition = String(d.position || d.location || '').trim();
            const rawType = String(d.type || 'Embroidery').trim();
            const normalizedPosition = resolvePosition(rawPosition);
            const normalizedType = normalize(rawType);

            const rule = rules.find((r) =>
                resolvePosition(r.position) === normalizedPosition &&
                normalize(r.type) === normalizedType
            );

            if (!rule) continue;

            const surcharge = Number(rule.surcharge) || 0;
            surchargeDetails.push({
                position: rawPosition || String(rule.position || '').trim(),
                normalizedPosition,
                type: rawType,
                normalizedType,
                surcharge,
                qty,
                amount: surcharge * qty
            });
        }
    } catch (e) {
        console.warn(`Failed to parse extraFees for SKU ${product.sku}:`, e);
    }

    return surchargeDetails;
}

const money = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

function parseShippingRates(product: any): any[] {
    if (!product?.shippingRates) return [];

    try {
        const shippingRates = JSON.parse(product.shippingRates);
        return Array.isArray(shippingRates) ? shippingRates : [];
    } catch (e) {
        console.warn(`Failed to parse shippingRates for SKU ${product.sku}:`, e);
        return [];
    }
}

function getShippingFee(rate: any) {
    return Number(rate?.shippingFee ?? rate?.rate ?? 0) || 0;
}

function getShippingQuantity(rate: any) {
    return Number(rate?.quantity ?? rate?.minQty ?? 0) || 0;
}

function isGreaterRate(rate: any) {
    const operator = String(rate?.operator || '').toLowerCase();
    return operator.includes('greater') || getShippingQuantity(rate) > 1;
}

export function getProductShippingRatePair(product: any): ShippingRatePair {
    const shippingRates = parseShippingRates(product);
    if (shippingRates.length === 0) {
        return { firstItemRate: 0, additionalItemRate: 0 };
    }

    const exactBase = shippingRates.find((rate: any) => {
        const operator = String(rate?.operator || '').toLowerCase();
        return getShippingQuantity(rate) === 1 && (!operator || operator === 'equal');
    });
    const quantityOneFallback = shippingRates.find((rate: any) => getShippingQuantity(rate) === 1);
    const lowestQuantityRate = [...shippingRates].sort((a: any, b: any) => getShippingQuantity(a) - getShippingQuantity(b))[0];

    const firstItemRate = getShippingFee(exactBase || quantityOneFallback || lowestQuantityRate);
    const additionalCandidates = shippingRates.filter(isGreaterRate);
    const additionalItemRate = additionalCandidates.length > 0
        ? Math.max(...additionalCandidates.map(getShippingFee))
        : firstItemRate;

    return {
        firstItemRate,
        additionalItemRate
    };
}

export function calculateCombinedShippingAllocations(items: CombinedShippingItem[]) {
    const activeItems = items
        .map((item, index) => ({
            ...item,
            index,
            qty: Math.max(0, Number(item.qty || 0)),
            rates: getProductShippingRatePair(item.product)
        }))
        .filter((item) => item.qty > 0);

    const emptyResult = {
        totalShippingCost: 0,
        allocations: [] as CombinedShippingAllocation[]
    };

    if (activeItems.length === 0) {
        return emptyResult;
    }

    const totalQty = activeItems.reduce((sum, item) => sum + item.qty, 0);
    const maxFirstItemRate = Math.max(...activeItems.map((item) => item.rates.firstItemRate));
    const maxAdditionalItemRate = Math.max(...activeItems.map((item) => item.rates.additionalItemRate));
    const baseItem = activeItems.reduce((current, item) =>
        item.rates.firstItemRate > current.rates.firstItemRate ? item : current
    );
    const totalShippingCost = money(maxFirstItemRate + Math.max(0, totalQty - 1) * maxAdditionalItemRate);

    let accumulated = 0;
    const allocations = activeItems.map((item, index) => {
        const rawShippingCost = item.index === baseItem.index
            ? maxFirstItemRate + Math.max(0, item.qty - 1) * maxAdditionalItemRate
            : item.qty * maxAdditionalItemRate;
        const shippingCost = index === activeItems.length - 1
            ? money(totalShippingCost - accumulated)
            : money(rawShippingCost);

        accumulated = money(accumulated + shippingCost);

        return {
            key: item.key,
            shippingCost
        };
    });

    return {
        totalShippingCost,
        allocations
    };
}

export function calculateItemCosts(product: any, qty: number, designs?: any[]): PricingResult {
    let shippingCost = 0;
    let extraFeesTotal = 0;

    // 1. Calculate Shipping
    const safeQty = Math.max(0, Number(qty || 0));
    if (safeQty > 0) {
        const { firstItemRate, additionalItemRate } = getProductShippingRatePair(product);
        shippingCost = firstItemRate + Math.max(0, safeQty - 1) * additionalItemRate;
    }

    // 2. Calculate Extra Fees
    if (product.extraFees && designs && Array.isArray(designs)) {
        extraFeesTotal = calculateDesignSurcharges(product, qty, designs)
            .reduce((sum, detail) => sum + detail.amount, 0);
    }

    return {
        shippingCost: Number.isFinite(shippingCost) ? shippingCost : 0,
        extraFees: Number.isFinite(extraFeesTotal) ? extraFeesTotal : 0
    };
}
