// Transforms a raw Etsy "Sold Order Items" export into the internal order-import
// row shape, using the seller's own mapping tables. The output rows carry the
// SAME normalized keys the standard import parser consumes, so the entire
// existing parse/validate/create pipeline is reused unchanged.

export interface EtsyMaps {
    // key = etsySku.toUpperCase()
    design: Map<string, { designLink: string; position: string; mockup: string; type: string; productSku: string | null }>;
    // key = style.toUpperCase()
    style: Map<string, string>;
    // key = etsyColor.toUpperCase()
    color: Map<string, string>;
}

export interface ParsedVariations {
    color: string;
    style: string;
    size: string;
    personalization: string;
}

/**
 * Parse Etsy's free-text "Variations" cell, e.g.
 *   "Color:Light Blue,Style and Size:Sweatshirt,L,Personalization:dark blue thread"
 * into { color, style, size, personalization }.
 *
 * Personalization is always last in Etsy's format and may contain commas,
 * colons and newlines, so everything after "Personalization:" is taken verbatim.
 */
// Known Etsy variation labels. The fields can appear in ANY order (some shops
// put Color before "Style and Size", some after), so we locate each label and
// slice its value up to the next label rather than assuming a fixed order.
// Labels can be singular/plural ("Color"/"Colors"), spelled "Colour", and the
// personalization field is sometimes labelled "Please enter:" with a double
// colon ("Please enter::"). `:+` swallows one or more colons. "Photo" is a
// buyer-uploaded-image marker ("Photo:1 file") that we don't use, but it must
// still be recognized as a boundary so it isn't absorbed into size.
const VARIATION_LABEL_RE = /(?:^|,)\s*(primary colou?rs?|colou?rs?|style and size|size and style|style|size|personali[sz]ation|please\s*enter|add\s*a\s*photo|photos?)\s*:+/gi;

function classifyLabel(label: string): 'color' | 'stylesize' | 'style' | 'size' | 'personalization' | 'ignore' | null {
    const l = label.toLowerCase();
    if (l.includes('personali') || l.includes('please')) return 'personalization';
    if (l.includes('photo')) return 'ignore';
    if (l.includes('style') && l.includes('size')) return 'stylesize';
    if (l.includes('colo')) return 'color';
    if (l === 'style') return 'style';
    if (l === 'size') return 'size';
    return null;
}

export function parseEtsyVariations(raw: unknown): ParsedVariations {
    const s = String(raw ?? '').trim();
    let color = '', style = '', size = '', personalization = '';
    if (!s) return { color, style, size, personalization };

    // Collect every top-level label and where its value starts.
    const marks: { kind: ReturnType<typeof classifyLabel>; valueStart: number; matchStart: number }[] = [];
    VARIATION_LABEL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VARIATION_LABEL_RE.exec(s)) !== null) {
        const kind = classifyLabel(m[1]);
        if (!kind) continue;
        marks.push({ kind, valueStart: m.index + m[0].length, matchStart: m.index });
    }
    if (marks.length === 0) return { color, style, size, personalization };

    marks.sort((a, b) => a.matchStart - b.matchStart);

    const valueOf = (i: number, toEnd = false) => {
        const start = marks[i].valueStart;
        const end = toEnd || i === marks.length - 1 ? s.length : marks[i + 1].matchStart;
        return s.slice(start, end).trim();
    };

    for (let i = 0; i < marks.length; i++) {
        const kind = marks[i].kind;
        if (kind === 'personalization') {
            // Free text, always last in practice — take everything to the end.
            personalization = s.slice(marks[i].valueStart).trim();
            break;
        } else if (kind === 'color') {
            color = valueOf(i);
        } else if (kind === 'stylesize') {
            const parts = valueOf(i).split(',').map((x) => x.trim()).filter(Boolean);
            style = parts[0] || '';
            size = parts.length > 1 ? parts[parts.length - 1] : '';
        } else if (kind === 'style') {
            style = valueOf(i);
        } else if (kind === 'size') {
            const parts = valueOf(i).split(',').map((x) => x.trim()).filter(Boolean);
            size = parts[parts.length - 1] || '';
        }
    }

    return { color, style, size, personalization };
}

function normalizeCountry(raw: unknown): string {
    const c = String(raw ?? '').trim();
    const lower = c.toLowerCase();
    if (lower === 'united states' || lower === 'usa' || lower === 'us') return 'US';
    if (lower === 'canada' || lower === 'ca') return 'CA';
    if (lower === 'united kingdom' || lower === 'uk' || lower === 'gb') return 'GB';
    if (lower === 'australia' || lower === 'au') return 'AU';
    return c ? c.slice(0, 2).toUpperCase() : 'US';
}

/** Case-insensitive header accessor for a raw Etsy row object. */
function makeGetter(row: Record<string, any>) {
    const lookup: Record<string, any> = {};
    Object.keys(row).forEach((k) => { lookup[k.trim().toLowerCase()] = row[k]; });
    return (header: string) => lookup[header.trim().toLowerCase()];
}

export interface EtsyImportRow {
    orderid: string;
    productsku: string;
    quantity: string;
    color: string;
    size: string;
    shippingname: string;
    shippingphone: string;
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    sellersku: string;
    note: string;
    position1: string;
    design1: string;
    mockup1: string;
    type1: string;
    // Parsed Etsy style (e.g. "Sweatshirt"); kept so the convert export can show
    // the style name in the Product SKU cell when no blank mapping exists.
    style?: string;
    // Non-parser metadata used for nicer messaging in the review UI.
    _etsyUnmappedSku?: string;
}

/**
 * Convert Etsy rows (original headers) into internal import rows (normalized keys).
 * Unmapped Etsy SKUs still produce a row (marked) so the review shows exactly
 * which SKUs need a mapping, rather than silently dropping the order.
 */
export function transformEtsyRows(rawJson: Record<string, any>[], maps: EtsyMaps): EtsyImportRow[] {
    return rawJson.map((row) => {
        const get = makeGetter(row);
        const etsySku = String(get('SKU') ?? '').trim();
        const design = maps.design.get(etsySku.toUpperCase());

        const { color: etsyColor, style, size, personalization } = parseEtsyVariations(get('Variations'));
        const color = maps.color.get(etsyColor.toUpperCase()) || etsyColor;

        // The garment blank is driven by the STYLE the buyer chose (Sweatshirt /
        // Hoodie / T-shirt), because one Etsy listing/SKU is often sold in several
        // styles. So the style map wins; the per-SKU design map's productSku is only
        // a fallback for styles that have no mapping. (The design map still supplies
        // the artwork: link / position / mockup / type.)
        const productSku = maps.style.get(style.toUpperCase())
            || (design?.productSku && design.productSku.trim())
            || '';

        return {
            orderid: String(get('Order ID') ?? '').trim(),
            productsku: productSku,
            quantity: String(get('Quantity') ?? '1').trim() || '1',
            color,
            size,
            shippingname: String(get('Ship Name') ?? '').trim(),
            shippingphone: '',
            address1: String(get('Ship Address1') ?? '').trim(),
            address2: String(get('Ship Address2') ?? '').trim(),
            city: String(get('Ship City') ?? '').trim(),
            state: String(get('Ship State') ?? '').trim(),
            zip: String(get('Ship Zipcode') ?? '').trim(),
            country: normalizeCountry(get('Ship Country')),
            sellersku: etsySku,
            note: personalization,
            position1: design?.position || '',
            design1: design?.designLink || '',
            // Parser requires a non-empty Mockup 1; a mapped listing without an
            // explicit mockup still passes with a placeholder.
            mockup1: design ? (design.mockup?.trim() || '-') : '',
            type1: design?.type || 'Embroidery',
            style,
            _etsyUnmappedSku: design ? '' : etsySku,
        };
    });
}
