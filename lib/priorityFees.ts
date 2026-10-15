import { prisma } from '@/lib/prisma';

export const PRIORITY_PRODUCTION_FEE_KEY = 'PRIORITY_PRODUCTION_FEE';
export const PRIORITY_SHIPPING_FEE_KEY = 'PRIORITY_SHIPPING_FEE';

export type PriorityFeeSettings = {
    priorityProductionFee: number;
    priorityShippingFee: number;
};

export type PriorityFeeFlags = {
    priorityProduction?: boolean | null;
    priorityShipping?: boolean | null;
    priorityProductionFee?: number | null;
    priorityShippingFee?: number | null;
};

const money = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

function parseAmount(value: unknown) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 ? money(amount) : 0;
}

export async function getPriorityFeeSettings(): Promise<PriorityFeeSettings> {
    const settings = await prisma.systemSetting.findMany({
        where: {
            key: {
                in: [PRIORITY_PRODUCTION_FEE_KEY, PRIORITY_SHIPPING_FEE_KEY]
            }
        }
    });

    const map = new Map(settings.map((setting) => [setting.key, setting.value]));

    return {
        priorityProductionFee: parseAmount(map.get(PRIORITY_PRODUCTION_FEE_KEY)),
        priorityShippingFee: parseAmount(map.get(PRIORITY_SHIPPING_FEE_KEY))
    };
}

export function getAppliedPriorityFees(flags: PriorityFeeFlags, settings: PriorityFeeSettings) {
    const priorityProductionFee = flags.priorityProduction
        ? parseAmount(flags.priorityProductionFee ?? settings.priorityProductionFee)
        : 0;
    const priorityShippingFee = flags.priorityShipping
        ? parseAmount(flags.priorityShippingFee ?? settings.priorityShippingFee)
        : 0;

    return {
        priorityProductionFee,
        priorityShippingFee,
        totalPriorityFee: money(priorityProductionFee + priorityShippingFee)
    };
}

export function getOrderPriorityFee(order: PriorityFeeFlags) {
    return money(
        (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
        + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0)
    );
}
