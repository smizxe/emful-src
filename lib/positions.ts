// Standard embroidery/print positions offered as a dropdown wherever a seller
// picks a print position (import review, order edit). Mirrors the Position list
// in the Excel template's reference sheet so the two stay consistent, plus NECK
// which is a priced position on some garments. Pricing matches by exact string,
// so these must stay in the same form the product `extraFees` rules use.
export const POSITION_OPTIONS = [
    'MOCK_UP',
    'CENTER_CHEST',
    'LEFT_CHEST',
    'RIGHT_CHEST',
    'LEFT_SLEEVE',
    'RIGHT_SLEEVE',
    'LEFT_ARM',
    'RIGHT_ARM',
    'NECK',
    'ON POCKET',
    'ABOVE POCKET',
] as const;

export const POSITION_SELECT_OPTIONS = POSITION_OPTIONS.map((p) => ({ label: p, value: p }));

// Where a design goes when the seller did not say: as its mockup shows. The
// shop has MOCK_UP priced on every product, so it is valid for any SKU.
export const DEFAULT_POSITION = 'MOCK_UP';
