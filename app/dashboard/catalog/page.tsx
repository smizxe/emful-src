import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProductList from './ProductList';

export default async function CatalogPage() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        redirect('/login?next=/dashboard/catalog');
    }

    const products = await prisma.product.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: { variants: true }
    });

    const inventory = await prisma.inventoryItem.findMany();
    const inventoryMap = new Map<string, number>();
    inventory.forEach(item => {
        // key format: "SKU-Color-Size" matches what we use in other places
        // But here we might just want to know if a SKU has ANY stock?
        // Let's store by granular key AND maybe by SKU total?
        // Actually, for the catalog list, we just want to know if "Product is Available".
        // Product is available if SUM(stock) > 0.
        const key = `${item.sku}-${item.color || ''}-${item.size || ''}`;
        inventoryMap.set(key, item.onHand);
    });

    // Enrich products with total stock
    const richProducts = products.map(p => {
        let totalStock = 0;
        if (p.variants.length > 0) {
            p.variants.forEach(v => {
                const key = `${p.sku}-${v.color || ''}-${v.size || ''}`;
                totalStock += inventoryMap.get(key) || 0;
            });
        } else {
            const key = `${p.sku}--`;
            totalStock = inventoryMap.get(key) || 0;
        }
        return { ...p, totalStock };
    });

    return (
        <ProductList products={richProducts} />
    );
}
