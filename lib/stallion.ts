/**
 * Stallion Express API Service
 * Documentation: https://stallionexpress.redocly.app/stallionexpress-v4
 */

const STALLION_API_URL = process.env.STALLION_API_URL || 'https://ship.stallionexpress.ca/api/v4';
const STALLION_API_TOKEN = process.env.STALLION_API_TOKEN || '';

interface StallionAddress {
    name: string;
    company?: string;
    address1: string;  // Stallion v4 uses address1, not street1
    address2?: string;
    city: string;
    province_code: string;
    postal_code: string;
    country_code: string;
    phone?: string;
    email?: string;
}

// Item Interface (v4 Standard)
interface StallionItem {
    sku?: string;
    description: string;
    quantity: number;
    value: number;
    currency?: string;
    hs_code?: string;
    country_of_origin?: string;
    weight?: number;
    weight_unit?: 'kg' | 'lb' | 'oz';
}

// Stallion v4 uses FLAT structure - no nested package object
interface ShipmentRequest {
    to_address: StallionAddress;
    return_address: StallionAddress;
    // Package fields (TOP LEVEL, not nested)
    weight: number;
    weight_unit: 'kg' | 'lb' | 'oz';
    length?: number;
    width?: number;
    height?: number;
    size_unit?: 'cm' | 'in';
    // Shipping - API may require postage_type_id (number) instead of postage_type (string)
    postage_type?: string;
    postage_type_id?: number;
    package_type?: string; // Required by v4 API

    // Items Array (New Standard)
    items?: StallionItem[];

    // Customs (Legacy/Alternative Flat Structure)
    package_contents?: string;
    value?: number;
    currency?: string;
    hs_code?: string;
    country_of_origin?: string;
    customs_description?: string;
    product_sku?: string; // Legacy flat SKU

    // Reference
    reference?: string;
    description?: string;
}

interface RateRequest {
    to_address: StallionAddress;
    return_address: StallionAddress;
    // Package fields (TOP LEVEL)
    weight: number;
    weight_unit: 'kg' | 'lb' | 'oz';
    length?: number;
    width?: number;
    height?: number;
    size_unit?: 'cm' | 'in';
    package_type?: string; // Required by v4 API
    // Customs
    package_contents?: string;
    value?: number;
    currency?: string;
    hs_code?: string;
    country_of_origin?: string;
    customs_description?: string;
}

interface StallionRate {
    postage_type: string;
    code: string; // Ensure code is always available
    postage_description: string;
    price: number;
    currency: string;
    estimated_delivery_days?: number;
    // v4 might map 'rate' or 'total' instead of price
    rate?: number;
    total?: number;
    name?: string;
    postage_type_id?: number; // Add this if available in API
}

interface StallionShipment {
    success: boolean;
    ship_code?: string;
    tracking_code?: string;  // v4 uses tracking_code
    tracking_number?: string; // fallback
    label?: string;          // v4 returns base64 label here
    label_url?: string;      // fallback
    postage_type?: string;
    total_price?: number;
    currency?: string;
    rate?: {
        total: number;
        currency: string;
    };
    message?: string;
}

interface StallionTrackingEvent {
    status: string;
    description: string;
    location?: string;
    timestamp: string;
}

interface StallionTrackingResponse {
    ship_code: string;
    tracking_number: string;
    status: string;
    events: StallionTrackingEvent[];
}

async function stallionFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${STALLION_API_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${STALLION_API_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('Stallion API Error:', response.status, errorBody);
        throw new Error(`Stallion API Error: ${response.status} - ${errorBody}`);
    }

    return response.json();
}

/**
 * Get shipping rates for a package
 */
export async function getShippingRates(request: RateRequest): Promise<StallionRate[]> {
    const result = await stallionFetch<{ rates: any[] }>('/rates', {
        method: 'POST',
        body: JSON.stringify(request),
    });

    console.log('Stallion Raw Rates Response:', JSON.stringify(result, null, 2));

    if (!result.rates || !Array.isArray(result.rates)) {
        return [];
    }

    return result.rates.map(rate => ({
        // changes here: prioritize code, but keep postage_type for backward compatibility if needed
        postage_type: rate.code || rate.postage_type,
        code: rate.code || rate.postage_type,
        postage_description: rate.name || rate.postage_description || rate.postage_type,
        // Map price from various possible fields
        price: rate.price ?? rate.rate ?? rate.total ?? 0,
        currency: rate.currency || 'CAD', // Default to CAD if missing
        estimated_delivery_days: rate.delivery_days || rate.estimated_delivery_days,
        ...rate
    }));
}

/**
 * Create a shipment and get the label
 */
export async function createShipment(request: ShipmentRequest, idempotencyKey?: string): Promise<StallionShipment> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const result = await stallionFetch<StallionShipment>('/shipments', {
        method: 'POST',
        body: JSON.stringify(request),
        headers,
    });
    return result;
}

/**
 * Track a shipment by ship_code
 */
export async function trackShipment(shipCode: string): Promise<StallionTrackingResponse> {
    return stallionFetch<StallionTrackingResponse>(`/track?ship_code=${encodeURIComponent(shipCode)}`);
}

/**
 * Void/Cancel a shipment
 */
export async function voidShipment(shipCode: string): Promise<{ success: boolean; message: string }> {
    return stallionFetch<{ success: boolean; message: string }>(`/shipments/${encodeURIComponent(shipCode)}/void`);
}

// Export types for use in other files
export type {
    StallionAddress,
    ShipmentRequest,
    RateRequest,
    StallionRate,
    StallionShipment,
    StallionTrackingResponse,
    StallionTrackingEvent,
};

// Default return address (Stallion Induction Address)
export const DEFAULT_RETURN_ADDRESS: StallionAddress = {
    name: '1530518 B.C.LTD.',
    company: 'SE #112889',
    address1: '2748 PEACE PORTAL DRIVE - UNIT A107',
    city: 'BLAINE',
    province_code: 'WA',
    postal_code: '98230',
    country_code: 'US',
    phone: '7789573979',
};
