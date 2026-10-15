import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { sellerId: true }
        });

        if (!user?.sellerId) {
            return NextResponse.json({ error: 'Seller account not found' }, { status: 404 });
        }

        const { id } = await context.params;
        const order = await prisma.order.findFirst({
            where: {
                id,
                sellerId: user.sellerId
            },
            include: {
                jobs: true
            }
        });

        if (!order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json(order);
    } catch (error) {
        console.error('Seller order detail fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch order details' }, { status: 500 });
    }
}
