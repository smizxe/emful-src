import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';

// Which designer looks after which seller. Raising a design request for one of
// that seller's orders routes it to them; a seller with no designer set goes to
// the whole team.

export async function GET() {
    const guard = await requireStaffOrAdminApi();
    if (guard) return guard;

    const [sellers, designers, assignments] = await Promise.all([
        prisma.seller.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        prisma.user.findMany({
            where: { role: 'DESIGNER', isActive: true },
            select: { id: true, name: true, email: true },
            orderBy: { createdAt: 'asc' },
        }),
        prisma.designerAssignment.findMany({ select: { sellerId: true, designerId: true } }),
    ]);

    const bySeller = new Map(assignments.map((a) => [a.sellerId, a.designerId]));

    return NextResponse.json({
        designers,
        rows: sellers.map((seller) => ({
            sellerId: seller.id,
            sellerName: seller.name,
            designerId: bySeller.get(seller.id) || '',
        })),
    });
}

/** Set, or with an empty designerId clear, the designer for one seller. */
export async function POST(request: Request) {
    const guard = await requireStaffOrAdminApi();
    if (guard) return guard;

    try {
        const { sellerId, designerId } = await request.json();
        if (!sellerId) return NextResponse.json({ error: 'sellerId is required' }, { status: 400 });

        const seller = await prisma.seller.findUnique({ where: { id: sellerId }, select: { id: true } });
        if (!seller) return NextResponse.json({ error: 'Seller not found' }, { status: 404 });

        if (!designerId) {
            await prisma.designerAssignment.deleteMany({ where: { sellerId } });
            return NextResponse.json({ success: true, sellerId, designerId: '' });
        }

        const designer = await prisma.user.findUnique({ where: { id: designerId }, select: { id: true, role: true, roles: true } });
        const holdsDesigner = designer
            && (designer.role === 'DESIGNER' || (designer.roles || []).includes('DESIGNER'));
        if (!holdsDesigner) {
            return NextResponse.json({ error: 'That account is not a designer' }, { status: 400 });
        }

        await prisma.designerAssignment.upsert({
            where: { sellerId },
            create: { sellerId, designerId },
            update: { designerId },
        });

        return NextResponse.json({ success: true, sellerId, designerId });
    } catch (error: any) {
        console.error('Designer assignment error:', error);
        return NextResponse.json({ error: error.message || 'Failed to save assignment' }, { status: 500 });
    }
}
