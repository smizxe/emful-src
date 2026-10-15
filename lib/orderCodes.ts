export function stripDuplicateOrderSuffix(orderCode: string | null | undefined) {
    let baseOrderCode = String(orderCode ?? '').trim();

    while (/\(\d+\)$/.test(baseOrderCode)) {
        baseOrderCode = baseOrderCode.replace(/\(\d+\)$/, '').trim();
    }

    return baseOrderCode;
}
