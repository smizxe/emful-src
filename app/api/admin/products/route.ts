import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi, requireStaffOrAdminApi } from '@/lib/auth-guard';

// GET: Fetch all products (lightweight - for SKU/itemValue lookup)
export async function GET() {
    const guardResponse = await requireStaffOrAdminApi();
    if (guardResponse) return guardResponse;
    try {
        const products = await prisma.product.findMany({
            select: {
                id: true,
                sku: true,
                name: true,
                sortOrder: true,
                itemValue: true,
                itemDescription: true,
                itemCurrency: true,
                hsCode: true,
                countryOfOrigin: true,
                customsDescription: true,
                itemWeight: true,
                weightUnit: true,
                itemLength: true,
                itemWidth: true,
                itemHeight: true,
                sizeUnit: true,
                isActive: true
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
        });
        return NextResponse.json(products);
    } catch (error) {
        console.error('Products GET Error:', error);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { sku, name, isActive, variants, description, images } = body;
        // Note: colors/sizes arrays are in body but we use 'variants' array for creation now.

        if (!sku || !name) {
            return NextResponse.json({ error: 'SKU and Name are required' }, { status: 400 });
        }

        const existing = await prisma.product.findUnique({ where: { sku } });
        if (existing) {
            return NextResponse.json({ error: 'SKU already exists' }, { status: 400 });
        }

        const product = await prisma.$transaction(async (tx) => {
            // Handle images: ensure it's an array
            const imageList = Array.isArray(images) ? images : (images ? [images] : []);
            const lastProduct = await tx.product.findFirst({
                select: { sortOrder: true },
                orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }]
            });

            const newProduct = await tx.product.create({
                data: {
                    sku,
                    name,
                    sortOrder: (lastProduct?.sortOrder ?? 0) + 1,
                    isActive: isActive ?? true,
                    description,
                    images: JSON.stringify(imageList), // Backward compatibility
                    shippingRates: body.shippingRates,
                    extraFees: body.extraFees,
                    colorMapping: body.colorMapping,
                    pricingAdjustments: body.pricingAdjustments,
                    itemValue: body.itemValue !== undefined ? parseFloat(body.itemValue) : 8,
                    itemDescription: body.itemDescription,
                    itemCurrency: body.itemCurrency || 'CAD',
                    hsCode: body.hsCode || '6110.20.20.41',
                    countryOfOrigin: body.countryOfOrigin || 'MX',
                    customsDescription: body.customsDescription,
                    itemWeight: parseFloat(body.itemWeight) || 0.36,
                    weightUnit: body.weightUnit || 'kg',
                    itemLength: parseFloat(body.itemLength) || 20,
                    itemWidth: parseFloat(body.itemWidth) || 12,
                    itemHeight: parseFloat(body.itemHeight) || 6,
                    sizeUnit: body.sizeUnit || 'cm'
                }
            });

            // Create ProductImage records
            if (imageList.length > 0) {
                await tx.productImage.createMany({
                    data: imageList.map((url: string) => ({
                        productId: newProduct.id,
                        url: url
                    }))
                });
            }

            // Iterate provided variants
            if (Array.isArray(variants) && variants.length > 0) {
                // Batch create variants
                await tx.productVariant.createMany({
                    data: variants.map((v: any) => ({
                        productId: newProduct.id,
                        color: v.color,
                        size: v.size,
                        basePrice: parseFloat(v.basePrice) || 0,
                        cogsEstimate: (parseFloat(v.basePrice) || 0) * 0.6,
                        isActive: true
                    }))
                });

                // Batch create inventory items
                // Inventory SKU usually product SKU if variants share sku prefix or logic.
                // Schema: InventoryItem(sku, color, size)
                await tx.inventoryItem.createMany({
                    data: variants.map((v: any) => ({
                        sku: sku,
                        color: v.color || "",
                        size: v.size || "",
                        onHand: 0,
                        reserved: 0
                    }))
                });
            } else {
                // Fallback if no variants provided (shouldn't happen with new UI)
                // Create default variant
                await tx.productVariant.create({
                    data: {
                        productId: newProduct.id,
                        basePrice: 0,
                        cogsEstimate: 0
                    }
                });
            }

            return newProduct;
        });

        return NextResponse.json(product);
    } catch (error: any) {
        console.error('Create product error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
