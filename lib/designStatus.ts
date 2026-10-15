/**
 * What the shop knows about an order's artwork, read off the jobs' design JSON.
 *
 * Sellers write "self" (or "own") in the design column of the import file when
 * they are supplying the artwork themselves, so that is a deliberate answer
 * rather than a missing one. Anything else that looks like a file reference
 * counts as artwork we already hold.
 */
export type DesignStatusKind = 'HAS_FILE' | 'BY_EM_DONE' | 'BY_SELLER' | 'BY_EM' | 'MISSING';

export interface DesignStatus {
    kind: DesignStatusKind;
    label: string;
    /** How many of the order's items still have nothing. */
    missingCount: number;
    total: number;
    /** What the seller answered, so the choice can still be changed later. */
    designBy: '' | 'SELLER' | 'EM';
}

const SELLER_OWN_MARKERS = ['self', 'own', 'seller', 'by seller'];

function parseDesigns(raw: unknown): any[] {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(String(raw || '[]'));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function kindForJob(job: { designs?: unknown; designBy?: string | null }): DesignStatusKind {
    const designs = parseDesigns(job?.designs);
    const urls = designs
        .map((d: any) => String(d?.url || '').trim())
        .filter(Boolean);

    const answer = String(job?.designBy || '').toUpperCase();
    if (urls.length > 0) {
        // Artwork is here. If we made it, say so -- the shop wants to see at a
        // glance which orders their own design team delivered.
        if (answer === 'EM') return 'BY_EM_DONE';
        if (urls.every((url) => SELLER_OWN_MARKERS.includes(url.toLowerCase()))) return 'BY_SELLER';
        return 'HAS_FILE';
    }
    if (urls.length === 0) {
        // Nothing came with the import, so the seller's answer is what matters.
        if (answer === 'EM') return 'BY_EM';
        if (answer === 'SELLER') return 'BY_SELLER';
        return 'MISSING';
    }
    return 'HAS_FILE';
}

/** The weakest answer across the order's items is the one worth showing. */
export function getOrderDesignStatus(jobs: Array<{ designs?: unknown; designBy?: string | null }> | null | undefined): DesignStatus {
    const list = Array.isArray(jobs) ? jobs : [];
    if (list.length === 0) {
        return { kind: 'MISSING', label: 'No design', missingCount: 0, total: 0, designBy: '' };
    }

    const kinds = list.map(kindForJob);
    const missingCount = kinds.filter((k) => k === 'MISSING').length;

    // The answer the seller gave, kept so they can still change it later.
    const answers = list.map((job) => String(job?.designBy || '').toUpperCase());
    const designBy: '' | 'SELLER' | 'EM' =
        answers.includes('EM') ? 'EM' : answers.includes('SELLER') ? 'SELLER' : '';

    const base = { missingCount: 0, total: list.length, designBy };

    if (missingCount > 0) {
        return { ...base, kind: 'MISSING', label: 'No design', missingCount };
    }
    if (kinds.some((k) => k === 'BY_EM')) {
        return { ...base, kind: 'BY_EM', label: 'By emfulfill' };
    }
    if (kinds.some((k) => k === 'BY_SELLER')) {
        return { ...base, kind: 'BY_SELLER', label: 'By seller' };
    }
    if (kinds.some((k) => k === 'BY_EM_DONE')) {
        return { ...base, kind: 'BY_EM_DONE', label: 'By emfulfill' };
    }
    return { ...base, kind: 'HAS_FILE', label: 'Design file' };
}
