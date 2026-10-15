import { prisma } from '@/lib/prisma';
import {
    SHIPPING_STATUS_SYNC_STATE_KEY,
    type ShippingSyncState,
    normalizeShippingSyncState,
    parseShippingSyncState,
    serializeShippingSyncState,
} from '@/shared/shippingSync';

export async function getShippingSyncState() {
    const setting = await prisma.systemSetting.findUnique({
        where: { key: SHIPPING_STATUS_SYNC_STATE_KEY },
        select: { value: true },
    });

    return normalizeShippingSyncState(parseShippingSyncState(setting?.value));
}

export async function saveShippingSyncState(state: ShippingSyncState) {
    const normalized = normalizeShippingSyncState(state);

    await prisma.systemSetting.upsert({
        where: { key: SHIPPING_STATUS_SYNC_STATE_KEY },
        update: { value: serializeShippingSyncState(normalized) },
        create: {
            key: SHIPPING_STATUS_SYNC_STATE_KEY,
            value: serializeShippingSyncState(normalized),
            description: 'Shipping status sync job state',
        },
    });

    return normalized;
}

export async function patchShippingSyncState(partial: Partial<ShippingSyncState>) {
    const current = await getShippingSyncState();
    return saveShippingSyncState({
        ...current,
        ...partial,
    });
}
