import { createClient } from 'npm:@supabase/supabase-js@2';

import {
    SHIPPING_STATUS_SYNC_BATCH_LIMIT,
    SHIPPING_STATUS_SYNC_CONCURRENCY,
    SHIPPING_STATUS_SYNC_STATE_KEY,
    SHIPPING_STATUS_SYNC_TIME_BUDGET_MS,
    STALLION_DEFAULT_RETRY_WAIT_MS,
    STALLION_MAX_RETRY_ATTEMPTS,
    STALLION_MAX_RETRY_WAIT_MS,
    STALLION_MIN_REQUEST_INTERVAL_MS,
    computeNextEligibleAt,
    defaultShippingSyncState,
    isSyncDue,
    normalizeShippingSyncState,
    parseShippingSyncState,
    serializeShippingSyncState,
    type ShippingSyncSource,
    type ShippingSyncState,
} from '../_shared/shippingSync.ts';
import { mapStallionTrackingStatus } from '../_shared/stallionTrackingStatus.ts';

type OrderRow = {
    id: string;
    orderCode: string;
    trackingNumber: string | null;
    carrier: string | null;
    shippingStatus: string | null;
    status: string;
};

type ShipmentRow = {
    id: string;
    orderId: string;
    carrier: string | null;
    status: string | null;
    createdAt: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const syncSecret = Deno.env.get('EDGE_SYNC_SECRET') || Deno.env.get('SUPABASE_EDGE_SYNC_SECRET') || '';
const stallionApiUrl = Deno.env.get('STALLION_API_URL') || 'https://ship.stallionexpress.ca/api/v4';
// The shop runs more than one Stallion account (they opened a second one on
// 2026-08-25), so a parcel may live under either. Collect every configured token
// and try them in turn. STALLION_API_TOKENS accepts a comma-separated list.
const stallionApiTokens = Array.from(new Set([
    Deno.env.get('STALLION_API_TOKEN') ?? '',
    Deno.env.get('STALLION_API_TOKEN_2') ?? '',
    ...(Deno.env.get('STALLION_API_TOKENS') ?? '').split(','),
].map((token) => token.trim()).filter(Boolean)));

if (!supabaseUrl || !serviceRoleKey || !syncSecret || stallionApiTokens.length === 0) {
    console.error('Missing required environment variables for sync-shipping-status function');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

async function getSyncState() {
    const { data, error } = await supabase
        .from('SystemSetting')
        .select('value')
        .eq('key', SHIPPING_STATUS_SYNC_STATE_KEY)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return normalizeShippingSyncState(parseShippingSyncState(data?.value));
}

async function saveSyncState(state: ShippingSyncState) {
    const normalized = normalizeShippingSyncState(state);
    const payload = {
        key: SHIPPING_STATUS_SYNC_STATE_KEY,
        value: serializeShippingSyncState(normalized),
        description: 'Shipping status sync job state',
        updatedAt: new Date().toISOString(),
    };

    const updateResult = await supabase
        .from('SystemSetting')
        .update({
            value: payload.value,
            description: payload.description,
            updatedAt: payload.updatedAt,
        })
        .eq('key', SHIPPING_STATUS_SYNC_STATE_KEY)
        .select('key')
        .maybeSingle();

    if (updateResult.error) {
        throw updateResult.error;
    }

    if (!updateResult.data) {
        const { error: insertError } = await supabase.from('SystemSetting').insert(payload);
        if (insertError) {
            throw insertError;
        }
    }

    return normalized;
}

function candidateQuery() {
    return supabase
        .from('Order')
        .select('id,orderCode,trackingNumber,carrier,shippingStatus,status', { count: 'exact' })
        .not('trackingNumber', 'is', null)
        .not('status', 'in', '("CANCELLED","REJECTED")')
        .not('shippingStatus', 'in', '("DELIVERED","EXCEPTION")')
        // A stable sort - `updatedAt` is Prisma's @updatedAt and is not touched
        // by this function's PostgREST writes, so paging on it never advanced.
        .order('createdAt', { ascending: true })
        .order('id', { ascending: true });
}

// PostgREST answers a range that starts past the last row with 416 / PGRST103
// ("Requested range not satisfiable") instead of an empty page.
function isRangeNotSatisfiable(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    return error.code === 'PGRST103' || /range not satisfiable/i.test(String(error.message ?? ''));
}

async function fetchCandidateOrders(offset: number) {
    let startOffset = Math.max(0, offset);
    let { data, error, count } = await candidateQuery()
        .range(startOffset, startOffset + SHIPPING_STATUS_SYNC_BATCH_LIMIT - 1);

    // The candidate list shrinks as parcels reach DELIVERED, so a saved cursor can
    // end up past the end. That comes back as a 416 (not an empty page), which used
    // to abort the whole run with "Requested range not satisfiable" and sync 0/0.
    // Rewind to the start instead.
    const cursorPastEnd = startOffset > 0 && (
        isRangeNotSatisfiable(error) ||
        (!error && (data || []).length === 0 && (count ?? 0) > 0)
    );

    if (cursorPastEnd) {
        startOffset = 0;
        ({ data, error, count } = await candidateQuery()
            .range(0, SHIPPING_STATUS_SYNC_BATCH_LIMIT - 1));
    }

    if (error) {
        throw error;
    }

    const total = count ?? 0;
    const orders = (data || []) as OrderRow[];
    const nextOffset = startOffset + orders.length >= (count ?? total) ? 0 : startOffset + orders.length;

    if (orders.length === 0) {
        return {
            selectedOrders: [] as OrderRow[],
            latestShipmentByOrderId: new Map<string, ShipmentRow>(),
            hasMore: false,
            nextOffset: 0,
        };
    }

    const orderIds = orders.map((order) => order.id);
    const { data: shipmentData, error: shipmentError } = await supabase
        .from('Shipment')
        .select('id,orderId,carrier,status,createdAt')
        .in('orderId', orderIds)
        .order('createdAt', { ascending: false });

    if (shipmentError) {
        throw shipmentError;
    }

    const latestShipmentByOrderId = new Map<string, ShipmentRow>();
    for (const shipment of (shipmentData || []) as ShipmentRow[]) {
        if (!latestShipmentByOrderId.has(shipment.orderId)) {
            latestShipmentByOrderId.set(shipment.orderId, shipment);
        }
    }

    return {
        selectedOrders: orders,
        latestShipmentByOrderId,
        // More candidates sit past this page; the cursor already points at them.
        hasMore: nextOffset !== 0,
        nextOffset,
    };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

// A 429 is a throttle, not a bad order: the order keeps its current status and is
// retried on the next run rather than being reported as a tracking failure.
class StallionRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StallionRateLimitError';
    }
}

// Every worker in the pool books its request slot through this queue, so the run
// as a whole stays under Stallion's 120-req/minute cap. `backoffUntil` parks all
// workers at once when a 429 arrives - the quota is per account, so it is
// pointless for the other workers to keep firing during the cooldown.
let nextSlotAt = 0;
let backoffUntil = 0;
let slotQueue: Promise<unknown> = Promise.resolve();

function reserveSlot(): Promise<void> {
    const slot = slotQueue.then(async () => {
        const waitMs = Math.max(nextSlotAt, backoffUntil) - Date.now();
        if (waitMs > 0) {
            await sleep(waitMs);
        }
        nextSlotAt = Date.now() + STALLION_MIN_REQUEST_INTERVAL_MS;
    });

    slotQueue = slot.catch(() => undefined);
    return slot;
}

function parseRetryAfterMs(response: Response, body: string) {
    const header = Number(response.headers.get('retry-after'));
    if (Number.isFinite(header) && header > 0) {
        return header * 1000;
    }

    try {
        // Stallion reports the cooldown in the body: {"retryAfterSeconds":50}
        const seconds = Number(JSON.parse(body)?.retryAfterSeconds);
        if (Number.isFinite(seconds) && seconds > 0) {
            return seconds * 1000;
        }
    } catch {
        // Body was not JSON - fall through to the default.
    }

    return STALLION_DEFAULT_RETRY_WAIT_MS;
}

async function stallionFetch(query: string, token: string, deadlineMs: number) {
    for (let attempt = 0; attempt <= STALLION_MAX_RETRY_ATTEMPTS; attempt += 1) {
        await reserveSlot();

        const response = await fetch(`${stallionApiUrl}/track?${query}`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        });

        if (response.status !== 429) {
            return response;
        }

        const body = await response.text();
        const waitMs = Math.min(parseRetryAfterMs(response, body), STALLION_MAX_RETRY_WAIT_MS);
        backoffUntil = Math.max(backoffUntil, Date.now() + waitMs);

        // Waiting out the cooldown would overrun the run's time budget; stop now
        // and let the next run (flagged via hasMore) pick these orders up.
        if (Date.now() + waitMs >= deadlineMs) {
            throw new StallionRateLimitError(
                `Stallion rate limit reached; ${Math.round(waitMs / 1000)}s cooldown exceeds this run's remaining budget`);
        }
    }

    throw new StallionRateLimitError(
        `Stallion rate limit still active after ${STALLION_MAX_RETRY_ATTEMPTS} retries`);
}

// Most parcels sit in the same Stallion account, so try the account that has
// been resolving the most parcels first - every miss against the wrong account
// is a wasted request against the rate limit. Ordering by a running success
// count rather than by "whichever resolved last" matters: with orders
// interleaved between two accounts, last-one-wins flips the order on nearly
// every parcel and ends up costing MORE requests than no preference at all.
const tokenSuccesses = stallionApiTokens.map(() => 0);

function tokensInPreferredOrder() {
    return stallionApiTokens
        .map((token, index) => ({ token, index }))
        .sort((a, b) => (tokenSuccesses[b.index] - tokenSuccesses[a.index]) || (a.index - b.index));
}

// Stallion's /track accepts ship_code, tracking_code OR order_id. Tracking numbers
// imported from a CSV are the carrier's own (USPS/GOFO/PostNL), which Stallion may
// not resolve, so fall back to our order code — Stallion stores it as `order_id`.
async function trackShipment(trackingCode: string, orderCode: string | null | undefined, deadlineMs: number) {
    const lookups: string[] = [];
    if (trackingCode) lookups.push(`tracking_code=${encodeURIComponent(trackingCode)}`);
    // Our multi-item orders get a "(n)" suffix that Stallion never saw.
    const baseOrderCode = String(orderCode ?? '').replace(/\(\d+\)$/, '').trim();
    if (baseOrderCode) lookups.push(`order_id=${encodeURIComponent(baseOrderCode)}`);

    let lastFailure: string | null = null;

    // Exhaust the strongest lookup across EVERY account before falling back to a
    // weaker one, hence lookups on the outside. tracking_code identifies the exact
    // parcel; order_id can also match an old abandoned shipment carrying the same
    // order id. With accounts on the outside, such a stale order_id hit in the
    // first account beat the real tracking_code hit in the second - which is how
    // delivered parcels kept reporting as "Label Created".
    for (const query of lookups) {
        for (const { token, index } of tokensInPreferredOrder()) {
            const response = await stallionFetch(query, token, deadlineMs);

            // Unknown to this account under this key — try the next key/account.
            if (response.status === 404 || response.status === 422) {
                continue;
            }

            if (!response.ok) {
                // Record it but keep going - another account may still resolve it.
                lastFailure = `Stallion tracking failed (${response.status}): ${await response.text()}`;
                continue;
            }

            tokenSuccesses[index] += 1;
            return response.json();
        }
    }

    if (lastFailure) {
        throw new Error(lastFailure);
    }

    return null;
}

async function updateTrackingStatus(orderId: string, nextStatus: string, options: {
    shouldUpdateOrder: boolean;
    latestShipmentId?: string;
    shouldUpdateShipment: boolean;
}) {
    if (options.shouldUpdateOrder) {
        const { error: orderError } = await supabase
            .from('Order')
            .update({ shippingStatus: nextStatus })
            .eq('id', orderId);

        if (orderError) {
            throw orderError;
        }
    }

    if (options.latestShipmentId && options.shouldUpdateShipment) {
        const { error: shipmentError } = await supabase
            .from('Shipment')
            .update({ status: nextStatus })
            .eq('id', options.latestShipmentId);

        if (shipmentError) {
            throw shipmentError;
        }
    }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
    let index = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (index < items.length) {
            const currentIndex = index++;
            await worker(items[currentIndex]);
        }
    });

    await Promise.all(runners);
}

Deno.serve(async (request) => {
    let currentState = defaultShippingSyncState();
    let processedCount = 0;
    let updatedCount = 0;
    let hasMore = false;
    let cursorOffset = 0;

    try {
        if (request.method !== 'POST') {
            return json(405, { error: 'Method not allowed' });
        }

        if (!supabaseUrl || !serviceRoleKey || !syncSecret || stallionApiTokens.length === 0) {
            return json(500, {
                error: 'Missing required function environment variables',
                details: {
                    hasSupabaseUrl: Boolean(supabaseUrl),
                    hasServiceRoleKey: Boolean(serviceRoleKey),
                    hasSyncSecret: Boolean(syncSecret),
                    stallionApiTokenCount: stallionApiTokens.length,
                },
            });
        }

        if (request.headers.get('x-sync-secret') !== syncSecret) {
            return json(401, { error: 'Unauthorized' });
        }

        let source: ShippingSyncSource = 'cron';
        let runId = crypto.randomUUID();
        let requestedAt = new Date().toISOString();

        const body = await request.json().catch(() => ({}));
        source = body?.source === 'manual' ? 'manual' : 'cron';
        runId = typeof body?.runId === 'string' ? body.runId : runId;
        requestedAt = typeof body?.requestedAt === 'string' ? body.requestedAt : requestedAt;
        currentState = await getSyncState().catch(() => defaultShippingSyncState());
        // Seed from the stored cursor so a failure before paging re-saves the
        // position we were at instead of resetting the sweep to the first page.
        cursorOffset = currentState.cursorOffset;

        if (currentState.isRunning) {
            return json(202, { success: true, skipped: true, reason: 'already_running', state: currentState });
        }

        if (source === 'cron' && !isSyncDue(currentState)) {
            return json(202, { success: true, skipped: true, reason: 'not_due', state: currentState });
        }

        const startedAt = new Date().toISOString();
        currentState = await saveSyncState({
            ...currentState,
            isRunning: true,
            runId,
            lastSource: source,
            lastRequestedAt: requestedAt,
            lastStartedAt: startedAt,
            lastError: null,
            lastProcessedCount: 0,
            lastUpdatedCount: 0,
            hasMore: false,
        });

        const startedMs = Date.now();
        const deadlineMs = startedMs + SHIPPING_STATUS_SYNC_TIME_BUDGET_MS;
        const errors: string[] = [];
        let rateLimitedCount = 0;
        let rateLimitNote: string | null = null;

        const { selectedOrders, latestShipmentByOrderId, hasMore: hasMoreCandidates, nextOffset } =
            await fetchCandidateOrders(currentState.cursorOffset);
        hasMore = hasMoreCandidates;
        cursorOffset = nextOffset;

        await runPool(selectedOrders, SHIPPING_STATUS_SYNC_CONCURRENCY, async (order) => {
            if (Date.now() >= deadlineMs) {
                hasMore = true;
                return;
            }

            if (!order.trackingNumber) {
                return;
            }

            try {
                const tracking = await trackShipment(order.trackingNumber, order.orderCode, deadlineMs);
                // Counted here so an order Stallion cannot resolve at all still
                // shows up in the processed total instead of vanishing from it.
                processedCount += 1;
                if (!tracking) {
                    return;
                }
                // Stallion's /track response carries the history in `events`
                // (no top-level status field), so the current status is the most
                // recent event. Pick the latest by datetime (the API returns them
                // newest-first, but sort to be safe). Fall back to any top-level
                // status field just in case the shape ever changes.
                const events = Array.isArray(tracking?.events) ? [...tracking.events] : [];
                events.sort((a: any, b: any) =>
                    new Date(b?.datetime ?? b?.timestamp ?? 0).getTime() - new Date(a?.datetime ?? a?.timestamp ?? 0).getTime());
                const externalStatus = events[0]?.status
                    ?? tracking?.status ?? tracking?.details?.status ?? tracking?.shipment?.status ?? '';
                const mapped = mapStallionTrackingStatus(externalStatus);
                if (mapped === 'UNKNOWN') {
                    // Wording we do not recognise. Leave the order exactly as it
                    // is rather than guess at it; a later scan will say something
                    // we do understand.
                    return;
                }
                const nextStatus = mapped;

                const latestShipment = latestShipmentByOrderId.get(order.id);
                const shouldUpdateOrder = nextStatus !== (order.shippingStatus || 'PENDING');
                const shouldUpdateShipment = !!latestShipment?.id && nextStatus !== (latestShipment.status || 'PENDING');

                if (shouldUpdateOrder || shouldUpdateShipment) {
                    await updateTrackingStatus(order.id, nextStatus, {
                        shouldUpdateOrder,
                        latestShipmentId: latestShipment?.id,
                        shouldUpdateShipment,
                    });
                    updatedCount += 1;
                }
            } catch (error: any) {
                if (error?.name === 'StallionRateLimitError') {
                    // Throttled, not broken. Leave the order untouched and let the
                    // next run retry it - reporting it as a failure is what made
                    // every throttled order look permanently un-syncable.
                    rateLimitedCount += 1;
                    rateLimitNote = error.message || 'Stallion rate limit reached';
                    hasMore = true;
                    return;
                }

                processedCount += 1;
                errors.push(`${order.orderCode}: ${error.message || 'Unknown tracking error'}`);
            }
        });

        const finishedAt = new Date().toISOString();
        // Leftover candidates (time budget or rate limit) make the sync due again
        // right away, so the hourly cron drains the backlog instead of sitting out
        // the full 6-hour interval.
        const nextEligibleAt = computeNextEligibleAt(finishedAt, hasMore);
        const messages = [...errors.slice(0, 3)];
        if (rateLimitedCount > 0) {
            messages.unshift(
                `${rateLimitedCount} order(s) deferred by Stallion rate limiting - they retry on the next sync. ${rateLimitNote ?? ''}`.trim());
        }
        const lastError = messages.length > 0 ? messages.join(' | ') : null;

        const finalState = await saveSyncState({
            ...currentState,
            isRunning: false,
            runId: null,
            lastSuccessfulAt: finishedAt,
            lastFinishedAt: finishedAt,
            nextEligibleAt,
            lastError,
            lastProcessedCount: processedCount,
            lastUpdatedCount: updatedCount,
            hasMore,
            cursorOffset,
        });

        return json(200, {
            success: true,
            processedCount,
            updatedCount,
            rateLimitedCount,
            hasMore,
            state: finalState,
        });
    } catch (error: any) {
        console.error('sync-shipping-status fatal error', error);
        try {
            const failedAt = new Date().toISOString();
            const finalState = await saveSyncState({
                ...currentState,
                isRunning: false,
                runId: null,
                lastFinishedAt: failedAt,
                lastError: error?.message || 'Shipping status sync failed',
                lastProcessedCount: processedCount,
                lastUpdatedCount: updatedCount,
                hasMore,
                cursorOffset,
            });

            return json(500, {
                error: error?.message || 'Shipping status sync failed',
                state: finalState,
            });
        } catch (saveError: any) {
            console.error('sync-shipping-status failed to persist error state', saveError);
        }

        return json(500, {
            error: error?.message || 'Shipping status sync failed before initialization',
        });
    }
});
