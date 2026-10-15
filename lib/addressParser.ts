/**
 * Simplified Address Parser
 * 
 * Format (line-based):
 * Line 1: Address1
 * Line 2: Address2 (optional)
 * Line 3 or 2: City, Province Zip
 * Line 4 or 3: Country
 * 
 * Rules:
 * - 4 lines → has Address2 (line 2)
 * - 3 lines → NO Address2, line 2 = City, Province Zip
 */

export interface ParsedAddress {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
}

// Regex for "City, Province Zip" pattern - handles US and Canadian formats
// Examples: "Rosharon, TX 77583", "CULVER CITY, CA 90230", "Toronto, ON M5V 1K4"
const CITY_STATE_ZIP_PATTERN = /^(.+?),\s*([A-Z]{2})\s+(.+)$/i;

/**
 * Parse a raw address string (newline-separated) into structured components
 * 
 * Supported formats:
 * - 4 lines: Address1 / Address2 / City, Province Zip / Country
 * - 3 lines: Address1 / City, Province Zip / Country
 */
export function parseAddress(rawAddress: string): ParsedAddress {
    const result: ParsedAddress = {
        address1: '',
        address2: '',
        city: '',
        state: '',
        zip: '',
        country: 'US'
    };

    if (!rawAddress || typeof rawAddress !== 'string') {
        return result;
    }

    // Split by newlines, filter empty lines
    const lines = rawAddress.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);

    if (lines.length === 0) {
        result.address1 = rawAddress.trim();
        return result;
    }

    if (lines.length === 1) {
        // Only one line - just address1
        result.address1 = lines[0];
        return result;
    }

    if (lines.length === 2) {
        // 2 lines: Address1 / City,Province Zip OR Country
        result.address1 = lines[0];
        // Try to parse second line as City, Province Zip
        const parsed = parseCityStateZip(lines[1]);
        if (parsed) {
            result.city = parsed.city;
            result.state = parsed.state;
            result.zip = parsed.zip;
        } else {
            // Might just be country or unparseable
            result.country = normalizeCountry(lines[1]);
        }
        return result;
    }

    if (lines.length === 3) {
        // 3 lines: Address1 / City, Province Zip / Country
        result.address1 = lines[0];

        const parsed = parseCityStateZip(lines[1]);
        if (parsed) {
            result.city = parsed.city;
            result.state = parsed.state;
            result.zip = parsed.zip;
        } else {
            // Fallback: entire line as city
            result.city = lines[1];
        }

        result.country = normalizeCountry(lines[2]);
        return result;
    }

    // 4+ lines: Address1 / Address2 / City, Province Zip / Country
    result.address1 = lines[0];
    result.address2 = lines[1];

    const parsed = parseCityStateZip(lines[2]);
    if (parsed) {
        result.city = parsed.city;
        result.state = parsed.state;
        result.zip = parsed.zip;
    } else {
        result.city = lines[2];
    }

    result.country = normalizeCountry(lines[3] || 'US');

    return result;
}

/**
 * Parse "City, Province Zip" format
 * Examples: "Rosharon, TX 77583", "CULVER CITY, CA 90230"
 */
function parseCityStateZip(line: string): { city: string; state: string; zip: string } | null {
    const match = line.match(CITY_STATE_ZIP_PATTERN);
    if (match) {
        return {
            city: match[1].trim(),
            state: match[2].toUpperCase(),
            zip: match[3].trim()
        };
    }
    return null;
}

/**
 * Normalize country name to ISO code
 */
function normalizeCountry(country: string): string {
    const c = country.toLowerCase().trim();

    if (c === 'united states' || c === 'usa' || c === 'us' || c === 'u.s.' || c === 'u.s.a.') {
        return 'US';
    }
    if (c === 'canada' || c === 'ca') {
        return 'CA';
    }
    if (c === 'united kingdom' || c === 'uk' || c === 'gb') {
        return 'GB';
    }
    if (c === 'australia' || c === 'au') {
        return 'AU';
    }

    // Return first 2 chars uppercase if not recognized
    return country.toUpperCase().substring(0, 2) || 'US';
}

/**
 * Re-parse address1 field if city/state/zip are missing
 * Used for legacy orders where full address is stored in address1
 */
export function reparseAddressIfNeeded(
    address1: string,
    city: string,
    state: string,
    zip: string,
    country: string
): ParsedAddress {
    // If we already have structured data, return it
    if (city && state && zip) {
        return {
            address1,
            address2: '',
            city,
            state,
            zip,
            country: country || 'US'
        };
    }

    // Check if address1 contains newlines (multi-line address stored as single field)
    if (/[\r\n]/.test(address1)) {
        return parseAddress(address1);
    }

    // No newlines and no structured data - return as-is
    return {
        address1,
        address2: '',
        city: city || '',
        state: state || '',
        zip: zip || '',
        country: country || 'US'
    };
}
