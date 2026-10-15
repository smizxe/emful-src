export type ShippingSyncSource = 'cron' | 'manual';

export type ShippingSyncState = {
    isRunning: boolean;
    runId: string | null;
    lastSource: ShippingSyncSource | null;
    lastRequestedAt: string | null;
    lastStartedAt: string | null;
    lastSuccessfulAt: string | null;
    lastFinishedAt: string | null;
    nextEligibleAt: string | null;
    lastError: string | null;
    lastProcessedCount: number;
    lastUpdatedCount: number;
    hasMore: boolean;
    // Where the next run starts in the candidate list. `Order.updatedAt` is
    // Prisma's application-level @updatedAt, so the Edge Function's PostgREST
    // writes never bump it - ordering by it made every run re-read the same
    // oldest page and left everything past it permanently unsynced. The run
    // pages through the candidates instead and wraps at the end.
    cursorOffset: number;
};

export const SHIPPING_STATUS_SYNC_STATE_KEY = 'shipping_status_sync_state';
export const SHIPPING_STATUS_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const SHIPPING_STATUS_SYNC_STALE_LOCK_MS = 20 * 60 * 1000;
export const SHIPPING_STATUS_SYNC_BATCH_LIMIT = 100;
export const SHIPPING_STATUS_SYNC_CONCURRENCY = 5;
export const SHIPPING_STATUS_SYNC_TIME_BUDGET_MS = 110 * 1000;

// Stallion's /track endpoint allows 120 requests per rolling minute - its 429
// body reports `{"message":"Too many requests","rateLimit":120,...}`. A run can
// issue several requests per order (one per tracking lookup, per account token),
// so without pacing a 100-order batch burns the quota in seconds and every
// remaining order fails. Aim below the cap to leave headroom for anything else
// hitting the same account.
export const STALLION_RATE_LIMIT_PER_MINUTE = 100;
export const STALLION_MIN_REQUEST_INTERVAL_MS = Math.ceil(60_000 / STALLION_RATE_LIMIT_PER_MINUTE);
// Used when a 429 arrives without a usable Retry-After / retryAfterSeconds.
export const STALLION_DEFAULT_RETRY_WAIT_MS = 15 * 1000;
export const STALLION_MAX_RETRY_WAIT_MS = 60 * 1000;
export const STALLION_MAX_RETRY_ATTEMPTS = 3;

// When a run leaves candidates behind (time budget or rate limit), make it
// immediately due again so the hourly cron drains the backlog instead of
// waiting out the full 6-hour interval.
export const SHIPPING_STATUS_SYNC_BACKLOG_RETRY_MS = 0;

export const defaultShippingSyncState = (): ShippingSyncState => ({
    isRunning: false,
    runId: null,
    lastSource: null,
    lastRequestedAt: null,
    lastStartedAt: null,
    lastSuccessfulAt: null,
    lastFinishedAt: null,
    nextEligibleAt: null,
    lastError: null,
    lastProcessedCount: 0,
    lastUpdatedCount: 0,
    hasMore: false,
    cursorOffset: 0,
});

export function parseShippingSyncState(value: string | null | undefined): ShippingSyncState {
    if (!value) {
        return defaultShippingSyncState();
    }

    try {
        const parsed = JSON.parse(value) as Partial<ShippingSyncState>;
        const defaults = defaultShippingSyncState();
        return {
            isRunning: typeof parsed.isRunning === 'boolean' ? parsed.isRunning : defaults.isRunning,
            runId: typeof parsed.runId === 'string' ? parsed.runId : defaults.runId,
            lastSource: parsed.lastSource === 'cron' || parsed.lastSource === 'manual' ? parsed.lastSource : defaults.lastSource,
            lastRequestedAt: typeof parsed.lastRequestedAt === 'string' ? parsed.lastRequestedAt : defaults.lastRequestedAt,
            lastStartedAt: typeof parsed.lastStartedAt === 'string' ? parsed.lastStartedAt : defaults.lastStartedAt,
            lastSuccessfulAt: typeof parsed.lastSuccessfulAt === 'string' ? parsed.lastSuccessfulAt : defaults.lastSuccessfulAt,
            lastFinishedAt: typeof parsed.lastFinishedAt === 'string' ? parsed.lastFinishedAt : defaults.lastFinishedAt,
            nextEligibleAt: typeof parsed.nextEligibleAt === 'string' ? parsed.nextEligibleAt : defaults.nextEligibleAt,
            lastError: typeof parsed.lastError === 'string' ? parsed.lastError : defaults.lastError,
            lastProcessedCount: typeof parsed.lastProcessedCount === 'number' ? parsed.lastProcessedCount : defaults.lastProcessedCount,
            lastUpdatedCount: typeof parsed.lastUpdatedCount === 'number' ? parsed.lastUpdatedCount : defaults.lastUpdatedCount,
            hasMore: typeof parsed.hasMore === 'boolean' ? parsed.hasMore : defaults.hasMore,
            cursorOffset: typeof parsed.cursorOffset === 'number' && Number.isFinite(parsed.cursorOffset) && parsed.cursorOffset >= 0
                ? Math.floor(parsed.cursorOffset)
                : defaults.cursorOffset,
        };
    } catch {
        return defaultShippingSyncState();
    }
}

export function serializeShippingSyncState(state: ShippingSyncState): string {
    return JSON.stringify(state);
}

export function computeNextEligibleAt(baseIso: string, hasMore = false) {
    const interval = hasMore ? SHIPPING_STATUS_SYNC_BACKLOG_RETRY_MS : SHIPPING_STATUS_SYNC_INTERVAL_MS;
    return new Date(new Date(baseIso).getTime() + interval).toISOString();
}

export function isSyncDue(state: ShippingSyncState, now = new Date()) {
    if (!state.nextEligibleAt) return true;
    return now.getTime() >= new Date(state.nextEligibleAt).getTime();
}

export function isStaleRunningState(state: ShippingSyncState, now = new Date()) {
    if (!state.isRunning || !state.lastStartedAt) return false;
    return now.getTime() - new Date(state.lastStartedAt).getTime() > SHIPPING_STATUS_SYNC_STALE_LOCK_MS;
}

export function normalizeShippingSyncState(state: ShippingSyncState, now = new Date()) {
    if (!isStaleRunningState(state, now)) {
        return state;
    }

    return {
        ...state,
        isRunning: false,
        runId: null,
        hasMore: false,
        lastError: state.lastError || 'Previous sync lock expired.',
    };
}
