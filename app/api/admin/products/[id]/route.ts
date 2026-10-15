import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, sku, isActive, variants } = body;

        let inventoryKeysNeeded: Array<{ sku: string; color: string; size: string }> = [];

        const product = await prisma.$transaction(async (tx) => {
            // 1. Update Product Info
            const imageList = Array.isArray(body.images) ? body.images : (body.images ? [body.images] : []);

            const updatedProduct = await tx.product.update({
                where: { id },
                data: {
                    name,
                    sku,
                    isActive,
                    description: body.description,
                    images: JSON.stringify(imageList), // Backward compatibility
                    shippingRates: body.shippingRates,
                    extraFees: body.extraFees,
                    colorMapping: body.colorMapping,
                    pricingAdjustments: body.pricingAdjustments,
                    itemValue: body.itemValue !== undefined ? parseFloat(body.itemValue) : undefined,
                    itemDescription: body.itemDescription,
                    itemCurrency: body.itemCurrency,
                    hsCode: body.hsCode,
                    countryOfOrigin: body.countryOfOrigin,
                    customsDescription: body.customsDescription,
                    itemWeight: body.itemWeight !== undefined ? parseFloat(body.itemWeight) : undefined,
                    weightUnit: body.weightUnit,
                    itemLength: body.itemLength !== undefined ? parseFloat(body.itemLength) : undefined,
                    itemWidth: body.itemWidth !== undefined ? parseFloat(body.itemWidth) : undefined,
                    itemHeight: body.itemHeight !== undefined ? parseFloat(body.itemHeight) : undefined,
                    sizeUnit: body.sizeUnit
                },
            });

            // 1.5 Sync Product Images
            // Fetch existing images
            const existingImages = await tx.productImage.findMany({
                where: { productId: id },
                select: { id: true, url: true } // Need URL to compare
            });
            const existingUrls = existingImages.map(img => img.url);

            // Determine images to add and remove
            const urlsToAdd = imageList.filter((url: string) => !existingUrls.includes(url));
            const urlsToRemove = existingUrls.filter(url => !imageList.includes(url));

            if (urlsToRemove.length > 0) {
                await tx.productImage.deleteMany({
                    where: {
                        productId: id,
                        url: { in: urlsToRemove }
                    }
                });
            }

            if (urlsToAdd.length > 0) {
                await tx.productImage.createMany({
                    data: urlsToAdd.map((url: string) => ({
                        productId: id,
                        url: url
                    }))
                });
            }

            if (Array.isArray(variants)) {
                // 2. Manage Variants

                // Get existing IDs from DB
                const existingVariants = await tx.productVariant.findMany({
                    where: { productId: id },
                    select: { id: true, color: true, size: true }
                });
                const existingIds = existingVariants.map(v => v.id);

                // IDs present in the payload
                const payloadIds = variants.map((v: any) => v.id).filter(Boolean);

                // a. Delete removed variants
                const idsToDelete = existingIds.filter(eid => !payloadIds.includes(eid));
                if (idsToDelete.length > 0) {
                    await tx.productVariant.deleteMany({
                        where: { id: { in: idsToDelete } }
                    });
                }

                // b. Separate variants into update and create batches
                const variantsToUpdate: any[] = [];
                const variantsToCreate: any[] = [];
                const inventoryKeysNeeded: Array<{ sku: string; color: string; size: string }> = [];

                for (const v of variants) {
                    const price = parseFloat(v.basePrice) || 0;

                    if (v.id && existingIds.includes(v.id)) {
                        variantsToUpdate.push({
                            id: v.id,
                            color: v.color,
                            size: v.size,
                            basePrice: price
                        });
                    } else {
                        variantsToCreate.push({
                            productId: id,
                            color: v.color,
                            size: v.size,
                            basePrice: price,
                            cogsEstimate: price * 0.6
                        });
                        inventoryKeysNeeded.push({
                            sku: sku,
                            color: v.color || "",
                            size: v.size || ""
                        });
                    }
                }

                // c. Batch update existing variants
                for (const v of variantsToUpdate) {
                    await tx.productVariant.update({
                        where: { id: v.id },
                        data: {
                            color: v.color,
                            size: v.size,
                            basePrice: v.basePrice
                        }
                    });
                }

                // d. Batch create new variants
                if (variantsToCreate.length > 0) {
                    await tx.productVariant.createMany({
                        data: variantsToCreate
                    });
                }
            }

            return { updatedProduct, inventoryKeysNeeded };
        }, {
            maxWait: 5000,
            timeout: 10000 // Reduced from 20s since transaction is now faster
        });

        // e. Handle inventory items outside transaction for better performance
        if (product.inventoryKeysNeeded && product.inventoryKeysNeeded.length > 0) {
            // Check which inventory items already exist
            const existingInventory = await prisma.inventoryItem.findMany({
                where: {
                    OR: product.inventoryKeysNeeded.map((key: any) => ({
                        sku: key.sku,
                        color: key.color,
                        size: key.size
                    }))
                },
                select: { sku: true, color: true, size: true }
            });

            const existingKeys = new Set(
                existingInventory.map(item => `${item.sku}|${item.color}|${item.size}`)
            );

            // Create only missing inventory items
            const itemsToCreate = product.inventoryKeysNeeded.filter((key: any) =>
                !existingKeys.has(`${key.sku}|${key.color}|${key.size}`)
            );

            if (itemsToCreate.length > 0) {
                await prisma.inventoryItem.createMany({
                    data: itemsToCreate.map((key: any) => ({
                        sku: key.sku,
                        color: key.color,
                        size: key.size,
                        onHand: 0,
                        reserved: 0
                    })),
                    skipDuplicates: true
                });
            }
        }

        return NextResponse.json(product.updatedProduct);
    } catch (error: any) {
        console.error('Update product error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { id } = await params;

        // Get the product's SKU before deletion
        const product = await prisma.product.findUnique({
            where: { id },
            select: { sku: true, name: true }
        });

        if (!product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // Check if product has any orders/jobs
        const existingJobs = await prisma.job.count({
            where: { sku: product.sku }
        });

        // Warning: Product has orders, but deletion is safe because Jobs store SKU as string
        // Orders will continue to work with the SKU even after product deletion
        if (existingJobs > 0) {
            console.log(`⚠️  Deleting product ${product.sku} (${product.name}) which has ${existingJobs} existing jobs/orders`);
            console.log(`   Orders will remain intact as they store SKU independently`);
        }

        // Delete everything in a transaction
        await prisma.$transaction([
            // Delete inventory items linked by SKU
            prisma.inventoryItem.deleteMany({
                where: { sku: product.sku }
            }),

            // Delete inventory movement history
            prisma.inventoryMovement.deleteMany({
                where: { sku: product.sku }
            }),

            // Delete product images (if not using cascade)
            prisma.productImage.deleteMany({
                where: { productId: id }
            }),

            // Delete product variants
            prisma.productVariant.deleteMany({
                where: { productId: id }
            }),

            // Delete the product itself
            prisma.product.delete({
                where: { id }
            })
        ]);

        return NextResponse.json({
            success: true,
            message: existingJobs > 0
                ? `Product deleted. ${existingJobs} existing orders will remain intact.`
                : 'Product deleted successfully.'
        });
    } catch (error: any) {
        console.error('Delete product error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
