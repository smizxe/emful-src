import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// GET: List active payment methods (for sellers)
export async function GET() {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const paymentMethods = await prisma.paymentMethod.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
            select: {
                id: true,
                name: true,
                currency: true,
                qrImageUrl: true,
                accountInfo: true,
                note: true,
            },
        });

        const response = NextResponse.json(paymentMethods);
        response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
        response.headers.set('Vary', 'Cookie');
        return response;
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
    }
}
