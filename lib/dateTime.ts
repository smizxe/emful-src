const DEFAULT_BUSINESS_TIME_ZONE = 'America/Vancouver';

export function getBusinessTimeZone() {
    return process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE || process.env.BUSINESS_TIME_ZONE || DEFAULT_BUSINESS_TIME_ZONE;
}

export function formatDateTimeInTimeZone(
    value: string | Date | null | undefined,
    timeZone = DEFAULT_BUSINESS_TIME_ZONE
) {
    if (!value) return '-';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';

    const year = get('year');
    const month = get('month');
    const day = get('day');
    const hour = get('hour');
    const minute = get('minute');

    if (!year || !month || !day || !hour || !minute) {
        return date.toISOString();
    }

    return `${hour}:${minute}, ${day}/${month}/${year}`;
}
