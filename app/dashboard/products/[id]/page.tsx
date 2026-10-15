import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ProductDetail from './ProductDetail';

export default async function ProductDetailPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        redirect(`/login?next=/dashboard/products/${params.id}`);
    }

    const product = await prisma.product.findUnique({
        where: { id: params.id },
        include: { variants: true }
    });

    if (!product) {
        return <div className="p-10 text-center">Product not found</div>;
    }

    return (
        <ProductDetail product={product} />
    );
}
