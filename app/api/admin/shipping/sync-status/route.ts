import { randomUUID } from 'crypto';

import { NextResponse } from 'next/server';

import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { getShippingSyncState, patchShippingSyncState } from '@/lib/shippingSyncState';

function getEdgeFunctionUrl() {
    const baseUrl = process.env.SUPABASE_URL;
    if (!baseUrl) {
        throw new Error('SUPABASE_URL is not configured');
    }

    return `${baseUrl}/functions/v1/sync-shipping-status`;
}

function getEdgeFunctionSecret() {
    const secret = process.env.EDGE_SYNC_SECRET || process.env.SUPABASE_EDGE_SYNC_SECRET;
    if (!secret) {
        throw new Error('EDGE_SYNC_SECRET is not configured');
    }
    return secret;
}

export async function GET() {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;

    try {
        const state = await getShippingSyncState();
        return NextResponse.json({ state });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Failed to load sync state' }, { status: 500 });
    }
}

export async function POST() {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;

    try {
        const state = await getShippingSyncState();
        if (state.isRunning) {
            return NextResponse.json({ error: 'Shipping status sync is already running', state }, { status: 409 });
        }

        const requestedAt = new Date().toISOString();
        const queuedState = await patchShippingSyncState({
            lastSource: 'manual',
            lastRequestedAt: requestedAt,
            lastError: null,
        });

        const response = await fetch(getEdgeFunctionUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-sync-secret': getEdgeFunctionSecret(),
            },
            body: JSON.stringify({
                source: 'manual',
                runId: randomUUID(),
                requestedAt,
            }),
            cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            await patchShippingSyncState({
                lastError: payload?.error || `Failed to start sync (${response.status})`,
            });
            return NextResponse.json({
                error: payload?.error || 'Failed to start shipping status sync',
                state: await getShippingSyncState(),
            }, { status: response.status });
        }

        return NextResponse.json({
            success: true,
            state: queuedState,
            result: payload,
        }, { status: 202 });
    } catch (error: any) {
        await patchShippingSyncState({
            lastError: error.message || 'Failed to start shipping status sync',
        }).catch(() => undefined);

        return NextResponse.json({ error: error.message || 'Failed to start shipping status sync' }, { status: 500 });
    }
}
