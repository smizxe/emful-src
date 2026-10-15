import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

// Public API key format: emf_live_<40 hex chars>. Only the SHA-256 hash is
// stored; the plaintext is shown to the seller once at creation time.
const KEY_PREFIX = 'emf_live_';

export function generateApiKey() {
    const secret = crypto.randomBytes(20).toString('hex'); // 40 hex chars
    const plain = KEY_PREFIX + secret;
    const keyHash = hashApiKey(plain);
    const prefix = plain.slice(0, KEY_PREFIX.length + 6); // e.g. emf_live_ab12cd
    return { plain, keyHash, prefix };
}

export function hashApiKey(plain: string) {
    return crypto.createHash('sha256').update(plain.trim()).digest('hex');
}

// --- Simple in-memory fixed-window rate limiter (per key, per minute). ---
// Sufficient for the current single-instance scale; documented as a limitation.
const RATE_LIMIT = 120; // requests per window
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(keyId: string): boolean {
    const now = Date.now();
    const b = buckets.get(keyId);
    if (!b || now - b.windowStart >= WINDOW_MS) {
        buckets.set(keyId, { count: 1, windowStart: now });
        return true;
    }
    b.count += 1;
    return b.count <= RATE_LIMIT;
}

export type ApiAuthResult =
    | { ok: true; sellerId: string; keyId: string }
    | { ok: false; status: number; error: string };

/**
 * Authenticate an inbound /api/v1 request via `Authorization: Bearer <key>`.
 * Scopes the caller to a single seller. Never leaks whether a key exists.
 */
export async function authenticateApiKey(request: Request): Promise<ApiAuthResult> {
    const header = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return { ok: false, status: 401, error: 'Missing API key. Use header: Authorization: Bearer <key>' };
    }
    const plain = match[1].trim();
    const keyHash = hashApiKey(plain);

    const key = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key || key.revoked) {
        return { ok: false, status: 401, error: 'Invalid or revoked API key' };
    }

    if (!checkRateLimit(key.id)) {
        return { ok: false, status: 429, error: 'Rate limit exceeded (120 requests/minute)' };
    }

    // Throttle lastUsedAt writes to at most once/minute.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > WINDOW_MS) {
        prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => { });
    }

    return { ok: true, sellerId: key.sellerId, keyId: key.id };
}
