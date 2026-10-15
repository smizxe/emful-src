import { prisma } from '@/lib/prisma';
import ProductsClient from './ProductsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminProductsPage() {
    const products = await prisma.product.findMany({
        include: {
            variants: true
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }]
    });

    // Map to format the client expects
    const mappedProducts = products.map((p: any) => {
        const uniqueColors = Array.from(new Set(p.variants.map((v: any) => v.color).filter(Boolean)));
        const uniqueSizes = Array.from(new Set(p.variants.map((v: any) => v.size).filter(Boolean)));
        const basePrices = p.variants.map((v: any) => v.basePrice);

        return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            sortOrder: p.sortOrder,
            images: p.images,
            isActive: p.isActive,
            variantCount: p.variants.length,
            priceRange: basePrices.length > 0
                ? `$${Math.min(...basePrices).toFixed(2)} - $${Math.max(...basePrices).toFixed(2)}`
                : 'N/A',
            // fields for edit modal
            colors: uniqueColors,
            sizes: uniqueSizes,
            basePrice: basePrices.length > 0 ? Math.min(...basePrices) : 0,
            variants: p.variants,
            shippingRates: p.shippingRates,
            extraFees: p.extraFees,
            colorMapping: p.colorMapping,
            pricingAdjustments: p.pricingAdjustments,
            itemValue: p.itemValue,
            itemDescription: p.itemDescription,
            itemCurrency: p.itemCurrency,
            hsCode: p.hsCode,
            countryOfOrigin: p.countryOfOrigin,
            customsDescription: p.customsDescription,
            itemWeight: p.itemWeight,
            weightUnit: p.weightUnit,
            itemLength: p.itemLength,
            itemWidth: p.itemWidth,
            itemHeight: p.itemHeight,
            sizeUnit: p.sizeUnit,
            description: p.description
        };
    });

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">Product Management</h2>
            <ProductsClient products={mappedProducts} />
        </div>
    );
}
