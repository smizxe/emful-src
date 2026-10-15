 import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import HomePage, { type HomeProduct } from './components/HomePage';

export const dynamic = 'force-dynamic';

const HOME_PRODUCT_LIMIT = 6;

function parseImages(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((item): item is string => typeof item === 'string');

    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
            } catch {
                return [];
            }
        }
        if (trimmed.startsWith('http') || trimmed.startsWith('/')) return [trimmed];
    }

    return [];
}

async function getLatestProducts(): Promise<HomeProduct[]> {
    try {
        const products = await prisma.product.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: HOME_PRODUCT_LIMIT,
            include: { variants: { where: { isActive: true } }, productImages: true },
        });

        return products.map((product) => {
            const images = parseImages(product.images);
            const cover = product.productImages[0]?.url || images[0] || '/placeholder.png';
            const prices = product.variants
                .map((variant) => variant.basePrice)
                .filter((price): price is number => typeof price === 'number');

            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                image: cover,
                minPrice: prices.length > 0 ? Math.min(...prices) : null,
                maxPrice: prices.length > 0 ? Math.max(...prices) : null,
                variantCount: product.variants.length,
            };
        });
    } catch (error) {
        // The landing page must render even if the catalog query fails.
        console.error('Failed to load homepage products', error);
        return [];
    }
}

export default async function Home() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    // Simple check: if userId cookie exists, we consider them logged in for the homepage view.
    // Ideally we would fetch the user from DB to verify, but this is sufficient for UI state.
    const isLoggedIn = !!userId;

    const products = await getLatestProducts();

    return <HomePage isLoggedIn={isLoggedIn} products={products} />;
}
