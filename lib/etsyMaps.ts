import 'server-only';
import { prisma } from '@/lib/prisma';
import type { EtsyMaps } from '@/lib/etsyImport';

// Style -> garment-blank mappings can be shared across all sellers (every seller
// prints "Sweatshirt" on the same blank). Global rows live under this sentinel
// sellerId and are managed by admin; a seller's own row overrides the global one.
export const GLOBAL_STYLE_SELLER_ID = '__GLOBAL__';

/**
 * Load a seller's Etsy mapping, merged with the global style→blank defaults.
 * All keys are upper-cased so matching is case-insensitive (e.g. "SWEATSHIRT",
 * "Sweatshirt" and "sweatshirt" all resolve to the same blank).
 */
export async function loadEtsyMaps(sellerId: string): Promise<EtsyMaps> {
    const [designs, sellerStyles, globalStyles, colors] = await Promise.all([
        prisma.etsyDesignMap.findMany({ where: { sellerId } }),
        prisma.etsyStyleMap.findMany({ where: { sellerId } }),
        prisma.etsyStyleMap.findMany({ where: { sellerId: GLOBAL_STYLE_SELLER_ID } }),
        prisma.etsyColorMap.findMany({ where: { sellerId } }),
    ]);

    const style = new Map<string, string>();
    for (const s of globalStyles) style.set(s.style.toUpperCase(), s.productSku); // global defaults first
    for (const s of sellerStyles) style.set(s.style.toUpperCase(), s.productSku); // seller override wins

    return {
        design: new Map(designs.map((d) => [d.etsySku.toUpperCase(), {
            designLink: d.designLink, position: d.position, mockup: d.mockup, type: d.type, productSku: d.productSku,
        }])),
        style,
        color: new Map(colors.map((c) => [c.etsyColor.toUpperCase(), c.internalColor])),
    };
}
