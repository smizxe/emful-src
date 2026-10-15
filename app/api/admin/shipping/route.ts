import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { createShipment, DEFAULT_RETURN_ADDRESS, type ShipmentRequest } from '@/lib/stallion';
import { getDefaultShippingStatus } from '@/lib/shippingStatus';

// GET: Fetch orders for shipping (Expanded to include early stages)
export async function GET(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const dateRange = searchParams.get('dateRange'); // 'today', 'week', 'month'
        const sortBy = searchParams.get('sortBy'); // 'newest', 'oldest', 'value_high', 'value_low'
        const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '300', 10), 1), 1000);
        const includeTotal = searchParams.get('includeTotal') === 'true';

        // Build Where Clause
        const where: any = {
            status: {
                in: ['RECEIVED', 'IN_PROCESS', 'READY_TO_SHIP', 'COMPLETED', 'SHIPPED']
            }
        };

        if (dateRange) {
            const now = new Date();
            let startDate = new Date();

            if (dateRange === 'today') {
                startDate.setHours(0, 0, 0, 0);
            } else if (dateRange === 'week') {
                const day = startDate.getDay();
                const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
                startDate.setDate(diff);
                startDate.setHours(0, 0, 0, 0);
            } else if (dateRange === 'month') {
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
            }

            if (['today', 'week', 'month'].includes(dateRange)) {
                where.createdAt = { gte: startDate };
            }
        }

        // Build Sort Clause
        let orderBy: any = { createdAt: 'desc' };
        if (sortBy === 'oldest') {
            orderBy = { createdAt: 'asc' };
        } else if (sortBy === 'value_high') {
            orderBy = { totalAmount: 'desc' };
        } else if (sortBy === 'value_low') {
            orderBy = { totalAmount: 'asc' };
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    seller: { select: { contactEmail: true, name: true } },
                    jobs: {
                        select: {
                            id: true,
                            status: true,
                            recipientName: true,
                            phone: true,
                            address1: true,
                            address2: true,
                            city: true,
                            state: true,
                            zip: true,
                            country: true,
                            sku: true,
                            qty: true,
                            designs: true,
                            notes: true
                        }
                    }
                },
                orderBy,
                take: limit,
                skip: (page - 1) * limit
            }),
            includeTotal ? prisma.order.count({ where }) : Promise.resolve(0)
        ]);

        const response = NextResponse.json({
            orders,
            meta: includeTotal ? {
                page,
                limit,
                total,
                totalPages: Math.max(Math.ceil(total / limit), 1)
            } : undefined,
            isSandbox: process.env.STALLION_API_URL?.includes('sandbox'),
            apiUrl: process.env.STALLION_API_URL
        });
        response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');
        return response;
    } catch (error) {
        console.error("Shipping GET Error:", error);
        return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
    }
}

// POST: Create shipment via Stallion Express API
export async function POST(request: Request) {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const body = await request.json();
        const { orderIds, orderId, postageType, postageTypeId, weight, length, width, height, packageContents, value, currency, hsCode, countryOfOrigin, customsDescription, recipientStreet1, recipientCity, recipientProvinceCode, recipientCountryCode, recipientPostalCode } = body;

        // Support both single orderId (legacy/fallback) and orderIds array
        const targetOrderIds: string[] = orderIds || (orderId ? [orderId] : []);

        if (targetOrderIds.length === 0) {
            return NextResponse.json({ error: 'Order IDs are required' }, { status: 400 });
        }

        // Get all orders with job details
        const orders = await prisma.order.findMany({
            where: { id: { in: targetOrderIds } },
            include: {
                jobs: {
                    select: {
                        recipientName: true,
                        phone: true,
                        address1: true,
                        address2: true,
                        city: true,
                        state: true,
                        zip: true,
                        country: true,
                        sku: true,
                    },
                    take: 1
                }
            }
        });

        if (orders.length === 0) {
            return NextResponse.json({ error: 'Orders not found' }, { status: 404 });
        }

        // Use the first order/job as the primary reference for address if not overridden
        const primaryOrder = orders[0];
        const job = primaryOrder.jobs[0];

        if (!job) {
            return NextResponse.json({ error: `No job found for order ${primaryOrder.orderCode}` }, { status: 400 });
        }

        // Normalize country code to 2 characters
        const countryMap: Record<string, string> = {
            'canada': 'CA', 'ca': 'CA',
            'united states': 'US', 'usa': 'US', 'us': 'US',
            'mexico': 'MX', 'mx': 'MX',
        };
        const rawCountry = (job.country || 'US').toLowerCase().trim();
        const countryCode = countryMap[rawCountry] || rawCountry.substring(0, 2).toUpperCase();

        // Build Stallion shipment request (FLAT structure for v4 API)

        // Normalize postageType: "UPS Standard" -> "ups_standard" if needed
        let finalPostageType = postageType || 'usps_ground_advantage';
        if (finalPostageType.includes(' ') || /[A-Z]/.test(finalPostageType)) {
            finalPostageType = finalPostageType.toLowerCase().replace(/\s+/g, '_');
        }

        console.log(`[DEBUG] Received postageType: '${postageType}', using: '${finalPostageType}'`);
        console.log(`[DEBUG] Body Product SKU:`, body.productSku);
        console.log(`[DEBUG] DB Job SKU:`, job.sku);
        console.log(`[DEBUG] Final Resolved SKU:`, body.productSku || job.sku);
        console.log(`[DEBUG] Items for shipment:`, JSON.stringify(orders.length > 0 ? orders[0].jobs : 'No jobs'));

        if (!hsCode && countryCode !== 'CA') {
            console.warn('[WARN] Creating International/US shipment without HS Code! usage of default/undefined might cause "No rate available".');
        }

        const shipmentRequest: ShipmentRequest = {
            to_address: {
                name: job.recipientName || 'Recipient',
                // Use admin-corrected values instead of potentially incorrect job data
                address1: recipientStreet1 || job.address1 || '',
                address2: job.address2 || undefined,
                city: recipientCity || job.city || '',
                province_code: recipientProvinceCode || job.state || '',
                postal_code: recipientPostalCode || job.zip || '',
                country_code: recipientCountryCode || countryCode,
                phone: job.phone || undefined,
            },
            return_address: DEFAULT_RETURN_ADDRESS,
            // Package fields at TOP LEVEL
            weight: parseFloat(weight) || 0.5,
            weight_unit: 'kg',
            length: length ? parseFloat(length) : undefined,
            width: width ? parseFloat(width) : undefined,
            height: height ? parseFloat(height) : undefined,
            size_unit: 'cm',
            package_type: 'parcel', // Restored to 'parcel' as per user instruction
            // Shipping
            postage_type: finalPostageType,
            // postage_type_id: postageTypeId, // Removing explicit ID to rely on code string match
            // Customs (FLAT fields)
            // Items Array (Standard v4)
            items: [
                {
                    sku: body.productSku || job.sku,
                    description: customsDescription || packageContents || 'Merchandise',
                    quantity: 1, // Single shipment logic treats bulk as multiple requests or single item pkg
                    value: parseFloat(value) || 8,
                    currency: currency || 'CAD',
                    hs_code: hsCode || undefined,
                    country_of_origin: countryOfOrigin || 'MX',
                    weight: parseFloat(weight) || 0.5,
                    weight_unit: 'kg',
                }
            ],
            // Customs (Legacy fields removed to prevent API conflict - data is now in items)
            // Reference
            reference: primaryOrder.orderCode + (orders.length > 1 ? ` +${orders.length - 1}` : ''),
            description: `Order ${primaryOrder.orderCode}` + (orders.length > 1 ? ` +${orders.length - 1} others` : ''),
        };

        console.log('Stallion Shipment Request Payload:', JSON.stringify(shipmentRequest, null, 2));

        // Call Stallion Express API
        const shipment = await createShipment(shipmentRequest, primaryOrder.id);

        console.log('Stallion Create Response:', JSON.stringify(shipment, null, 2));

        if (!shipment.success && !shipment.tracking_code) {
            console.error('Stallion API returned success=false or missing tracking:', shipment);
            return NextResponse.json({ error: shipment.message || 'Stallion API failed' }, { status: 400 });
        }

        const trackingNumber = shipment.tracking_code || shipment.tracking_number;
        const labelUrl = shipment.label_url || (shipment.label ? 'data:application/pdf;base64,' + shipment.label : '');
        const shippingCost = shipment.rate?.total || shipment.total_price || 0;

        // Transactional update for all orders
        await prisma.$transaction(async (tx) => {
            for (const order of orders) {
                const updateData: any = {
                    trackingNumber: trackingNumber,
                    carrier: 'Stallion Express',
                    shippingCost: typeof shippingCost === 'string' ? parseFloat(shippingCost) : shippingCost,
                    shippingStatus: getDefaultShippingStatus(trackingNumber),
                };

                await tx.order.update({
                    where: { id: order.id },
                    data: updateData
                });

                // Also create a Shipment record if the model exists
                try {
                    await tx.shipment.create({
                        data: {
                            orderId: order.id,
                            carrier: 'Stallion Express',
                            trackingNumber: trackingNumber || '',
                            labelPdfUrl: labelUrl,
                            status: 'LABEL_CREATED',
                        }
                    });
                } catch (e) {
                    // Shipment model might not exist or error, log but continue
                    console.log('Could not create Shipment record:', e);
                }
            }
        });

        return NextResponse.json({
            success: true,
            shipCode: shipment.ship_code,
            trackingNumber: trackingNumber,
            labelUrl: labelUrl,
            totalPrice: shipment.rate?.total || shipment.total_price,
            orderIds: targetOrderIds,
        });
    } catch (error: any) {
        console.error("Shipping POST Error:", error);
        return NextResponse.json({
            error: error.message || 'Failed to create shipment'
        }, { status: 500 });
    }
}
