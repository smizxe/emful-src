import { resolveShippingStatus } from '@/shared/stallionTrackingStatus';

export const SHIPPING_STATUS_VALUES = [
    'PENDING',
    'LABEL_CREATED',
    'RECEIVED',
    'IN_TRANSIT',
    'DELIVERED',
    'EXCEPTION',
] as const;

export type ShippingStatus = typeof SHIPPING_STATUS_VALUES[number];

export function getDefaultShippingStatus(trackingNumber?: string | null): ShippingStatus {
    return trackingNumber ? 'LABEL_CREATED' : 'PENDING';
}

export function normalizeShippingStatus(
    value: unknown,
    trackingNumber?: string | null,
    current?: string | null,
): ShippingStatus {
    return resolveShippingStatus(value, trackingNumber, current);
}

export function getShippingStatusLabel(status: string | null | undefined) {
    switch (status) {
        case 'LABEL_CREATED':
            return 'Label Created';
        case 'RECEIVED':
            return 'Received';
        case 'IN_TRANSIT':
            return 'In Transit';
        case 'DELIVERED':
            return 'Delivered';
        case 'EXCEPTION':
            return 'Exception';
        default:
            return 'Pending';
    }
}
