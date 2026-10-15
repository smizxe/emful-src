import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { cookies } from 'next/headers';

// Helper to check if user is admin
async function isAdmin() {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) return false;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true }
    });

    return user?.role === 'ADMIN';
}

// GET: List all payment methods (Admin)
export async function GET() {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const paymentMethods = await prisma.paymentMethod.findMany({
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        });

        return NextResponse.json(paymentMethods);
    } catch (error) {
        console.error('Error fetching payment methods:', error);
        return NextResponse.json({ error: 'Failed to fetch payment methods' }, { status: 500 });
    }
}

// POST: Create a new payment method
export async function POST(req: NextRequest) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, currency, qrImageUrl, accountInfo, note, sortOrder } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const paymentMethod = await prisma.paymentMethod.create({
            data: {
                name,
                currency: currency || 'VND',
                qrImageUrl,
                accountInfo,
                note,
                sortOrder: sortOrder ? Number(sortOrder) : 0,
                isActive: true,
            },
        });

        return NextResponse.json(paymentMethod);
    } catch (error) {
        console.error('Error creating payment method:', error);
        return NextResponse.json({ error: 'Failed to create payment method' }, { status: 500 });
    }
}

// PUT: Update a payment method
export async function PUT(req: NextRequest) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { id, name, currency, qrImageUrl, accountInfo, note, isActive, sortOrder } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const paymentMethod = await prisma.paymentMethod.update({
            where: { id },
            data: {
                name,
                currency,
                qrImageUrl,
                accountInfo,
                note,
                isActive,
                sortOrder: sortOrder ? Number(sortOrder) : 0,
            },
        });

        return NextResponse.json(paymentMethod);
    } catch (error) {
        console.error('Error updating payment method:', error);
        return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 });
    }
}

// DELETE: Soft delete (set isActive = false)
export async function DELETE(req: NextRequest) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        if (!(await isAdmin())) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        // Soft delete - just mark as inactive
        await prisma.paymentMethod.update({
            where: { id },
            data: { isActive: false },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting payment method:', error);
        return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500 });
    }
}
