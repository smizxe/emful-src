export type InternalShippingStatus =
    | 'PENDING'
    | 'LABEL_CREATED'
    | 'RECEIVED'
    | 'IN_TRANSIT'
    | 'DELIVERED'
    | 'EXCEPTION';

/** Wording we do not recognise. Callers keep whatever they already had. */
export type MappedShippingStatus = InternalShippingStatus | 'UNKNOWN';

/**
 * Map a Stallion status onto ours.
 *
 * Two different vocabularies arrive here. Carrier scan text comes from a
 * tracking event ("Shipping Label Created", "Departed GOFO Regional Hub",
 * "The item is being processed by customs"). Shipment-level text comes from the
 * shipment record and the exported CSV ("Ready", "Incomplete", "Voided",
 * "Postage Expired"). Both have to be understood, because a label bought a
 * minute ago reports "Ready" and nothing else.
 *
 * Unrecognised wording returns UNKNOWN rather than a guess. Guessing is what
 * caused the two bugs this function has had: guessing LABEL_CREATED hid parcels
 * that had departed, and guessing IN_TRANSIT told sellers a parcel was moving
 * when it had only been paid for.
 *
 * Order matters:
 *  - Anything that only *mentions* delivery while the parcel is still moving is
 *    matched first. Marking it DELIVERED early also freezes the order, because
 *    delivered parcels are dropped from the sync's candidate list for good.
 *  - The "not dispatched yet" wording is matched before the generic delivery
 *    test, so "Ready" and label notices cannot be read as progress.
 */
export function mapStallionTrackingStatus(value: unknown): MappedShippingStatus {
    const normalized = String(value ?? '').trim().toLowerCase();
    const has = (...needles: string[]) => needles.some((n) => normalized.includes(n));

    if (!normalized) {
        return 'UNKNOWN';
    }

    // Still moving, even though the text mentions delivery or waiting.
    if (has(
        'out for delivery',
        'ready for delivery',
        'tendered',
        'delivery attempt',
        'attempted delivery',
        'unload',
        'arrived at delivery',
        'pickuppoint',
        'pickup point',
        'available for pickup',
        'ready for pickup',
    )) {
        return 'IN_TRANSIT';
    }

    if (has('exception', 'undeliverable', 'return to sender', 'returned', 'fail')) {
        return 'EXCEPTION';
    }

    // The label itself is dead, so somebody has to look at the order.
    if (has('void', 'postage expired', 'expired', 'cancel')) {
        return 'EXCEPTION';
    }

    // Bought but not handed over yet. This has to beat the generic delivery test
    // below: Stallion reports a freshly purchased label as "Ready", and reading
    // that as progress is what put not-yet-shipped orders on "In Transit".
    if (has(
        'label',
        'pre-shipment',
        'pre shipment',
        'info received',
        'awaiting',
        'imported',
        'ready',
        'incomplete',
        'manifest',
        'created',
        'pending',
    )) {
        return 'LABEL_CREATED';
    }

    if (has('deliver')) {
        return 'DELIVERED';
    }

    if (has(
        'transit',
        'transport',
        'depart',
        'en route',
        'on the way',
        'forwarded',
        'processed through',
        'customs',
        'sorting cent',
        'sortation',
        'in flight',
        'loaded on',
        'arrived at usps',
        'arrived shipping partner',
    )) {
        return 'IN_TRANSIT';
    }

    if (has('receiv', 'accept', 'arrived', 'induct', 'picked up')) {
        return 'RECEIVED';
    }

    return 'UNKNOWN';
}

/**
 * The same mapping for callers that must end up with a concrete status, such as
 * creating a shipment row from an imported tracking file. Unrecognised wording
 * falls back to the weakest claim the tracking number actually supports.
 */
export function resolveShippingStatus(
    value: unknown,
    trackingNumber?: string | null,
    current?: string | null,
): InternalShippingStatus {
    const mapped = mapStallionTrackingStatus(value);
    if (mapped !== 'UNKNOWN') return mapped;
    if (current) return current as InternalShippingStatus;
    return trackingNumber ? 'LABEL_CREATED' : 'PENDING';
}
