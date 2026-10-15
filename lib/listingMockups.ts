import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';

/**
 * A seller's Etsy listings export, reduced to the two columns the shop wants:
 * SKU (column AA) and IMAGE1 (column H). Everything else in the file -- titles,
 * descriptions, tags, the other nine images -- is ignored, which is what keeps
 * a 2MB export down to a few hundred lookups.
 *
 * The SKU here is the seller's own SKU, matched against the SELLER SKU column of
 * an order import. Checked against live orders: it matched 35 seller SKUs and no
 * product SKUs at all. The same SKU also turned up under three different sellers,
 * so every lookup is per seller.
 */

export interface ParsedListingMockups {
    rowCount: number;
    entries: Array<{ skuKey: string; sku: string; imageUrl: string; images: string[] }>;
    /** Rows that had a SKU but no usable image, or an image but no SKU. */
    skipped: number;
}

export function skuKeyOf(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
}

function isImageUrl(value: unknown): boolean {
    return /^https?:\/\/\S+$/i.test(String(value ?? '').trim());
}

/** Find a column by its header, falling back to where the Etsy export puts it. */
function columnIndex(header: unknown[], names: string[], fallback: number): number {
    const normalised = header.map((h) => String(h ?? '').trim().toUpperCase());
    for (const name of names) {
        const i = normalised.indexOf(name);
        if (i !== -1) return i;
    }
    return fallback;
}

export function parseListingMockups(buffer: Buffer | ArrayBuffer): ParsedListingMockups {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // Header row plus every row as an array; descriptions span many lines inside
    // quotes, which the CSV reader handles, so one record is one listing.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
    if (rows.length === 0) return { rowCount: 0, entries: [], skipped: 0 };

    const [header, ...data] = rows;
    const skuCol = columnIndex(header, ['SKU'], 26);       // column AA
    const imageCol = columnIndex(header, ['IMAGE1', 'IMAGE 1'], 7); // column H

    const bySku = new Map<string, { sku: string; images: string[] }>();
    let skipped = 0;

    for (const row of data) {
        const sku = String(row[skuCol] ?? '').trim();
        const image = String(row[imageCol] ?? '').trim();
        if (!sku || !isImageUrl(image)) {
            skipped += 1;
            continue;
        }
        const key = skuKeyOf(sku);
        const existing = bySku.get(key);
        if (existing) {
            // Several listings can share a SKU. The first photo is the mockup;
            // the rest are kept so nothing in the file is thrown away.
            if (!existing.images.includes(image)) existing.images.push(image);
        } else {
            bySku.set(key, { sku, images: [image] });
        }
    }

    return {
        rowCount: data.length,
        entries: Array.from(bySku.entries()).map(([skuKey, v]) => ({
            skuKey,
            sku: v.sku,
            imageUrl: v.images[0],
            images: v.images,
        })),
        skipped,
    };
}

/** Replace a seller's whole mapping with the contents of a new file. */
export async function replaceListingMockups(
    sellerId: string,
    fileName: string,
    parsed: ParsedListingMockups,
    uploadedBy: string,
) {
    await prisma.$transaction(async (tx) => {
        await tx.listingMockup.deleteMany({ where: { sellerId } });
        if (parsed.entries.length > 0) {
            await tx.listingMockup.createMany({
                data: parsed.entries.map((e) => ({
                    sellerId,
                    skuKey: e.skuKey,
                    sku: e.sku,
                    imageUrl: e.imageUrl,
                    images: JSON.stringify(e.images),
                })),
            });
        }
        await tx.listingMockupFile.upsert({
            where: { sellerId },
            create: { sellerId, fileName, rowCount: parsed.rowCount, skuCount: parsed.entries.length, uploadedBy },
            update: { fileName, rowCount: parsed.rowCount, skuCount: parsed.entries.length, uploadedBy },
        });
    }, { timeout: 60000 });
}

/** Seller SKU -> mockup link, for filling a gap while an order is imported. */
export async function loadListingMockupLookup(sellerId: string): Promise<Map<string, string>> {
    const rows = await prisma.listingMockup.findMany({
        where: { sellerId },
        select: { skuKey: true, imageUrl: true },
    });
    return new Map(rows.map((r) => [r.skuKey, r.imageUrl]));
}
