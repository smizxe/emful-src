import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { getOrderDesignStatus } from '@/lib/designStatus';

// An imported order that carries no artwork needs an answer: the seller is
// sending it, or emfulfill designs it for them. Choosing emfulfill puts the
// item straight into the design queue; the designer prices it there.

function parseDesigns(raw: string | null | undefined): any[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** The same routing the admin side uses, so a seller's choice reaches the right designer. */
async function resolveDesigner(sellerId: string) {
    const assignment = await prisma.designerAssignment.findUnique({
        where: { sellerId },
        select: { designerId: true },
    });
    if (!assignment?.designerId) return { id: '', name: '' };

    const designer = await prisma.user.findUnique({
        where: { id: assignment.designerId },
        select: { id: true, name: true, email: true, isActive: true },
    });
    if (!designer?.isActive) return { id: '', name: '' };
    return { id: designer.id, name: designer.name || designer.email };
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!user.sellerId) return NextResponse.json({ error: 'Seller account required' }, { status: 403 });

    try {
        const { orderId, designBy } = await request.json();
        if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

        const choice = String(designBy || '').toUpperCase();
        if (!['SELLER', 'EM', ''].includes(choice)) {
            return NextResponse.json({ error: 'designBy must be SELLER or EM' }, { status: 400 });
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true, orderCode: true, sellerId: true, status: true,
                seller: { select: { name: true } },
                jobs: { select: { id: true, designs: true, sku: true, shippingLabel: true, recipientName: true, designBy: true, notes: true } },
            },
        });
        if (!order || order.sellerId !== user.sellerId) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        // Only items that actually have nothing need an answer.
        const needsArtwork = order.jobs.filter((job) => {
            const urls = parseDesigns(job.designs).map((d: any) => String(d?.url || '').trim()).filter(Boolean);
            return urls.length === 0;
        });

        if (needsArtwork.length === 0) {
            return NextResponse.json({ error: 'Every item on this order already has artwork' }, { status: 400 });
        }

        await prisma.job.updateMany({
            where: { id: { in: needsArtwork.map((j) => j.id) } },
            data: { designBy: choice },
        });

        let raised = 0;
        let withdrawn = 0;

        if (choice === 'SELLER') {
            // Changing their mind takes the work back off the design team, but only
            // while it is still waiting -- finished artwork stays where it is.
            const result = await prisma.designRequest.deleteMany({
                where: { jobId: { in: needsArtwork.map((j) => j.id) }, status: 'PENDING' },
            });
            withdrawn = result.count;
        }

        if (choice === 'EM') {
            const designer = await resolveDesigner(order.sellerId);
            for (const job of needsArtwork) {
                const existing = await prisma.designRequest.findUnique({ where: { jobId: job.id } });
                if (existing) continue;
                await prisma.designRequest.create({
                    data: {
                        jobId: job.id,
                        orderId: order.id,
                        orderCode: order.orderCode,
                        sellerId: order.sellerId,
                        sellerName: order.seller?.name || '',
                        customerName: job.recipientName || '',
                        sku: job.sku || '',
                        sellerSku: job.shippingLabel || '',
                        type: 'NEW',
                        // The designer reads what the seller wrote in the NOTE column of
                        // the import file, same as a request admin raises.
                        note: String(job.notes || '').trim(),
                        createdBy: user.email,
                        assignedDesignerId: designer.id,
                        assignedDesignerName: designer.name,
                    },
                });
                raised += 1;
            }
        }

        const after = await prisma.order.findUnique({
            where: { id: orderId },
            select: { jobs: { select: { designs: true, designBy: true } } },
        });

        return NextResponse.json({
            success: true,
            designBy: choice,
            itemsAnswered: needsArtwork.length,
            requestsRaised: raised,
            requestsWithdrawn: withdrawn,
            designStatus: getOrderDesignStatus(after?.jobs || []),
        });
    } catch (error: any) {
        console.error('Design-by error:', error);
        return NextResponse.json({ error: error.message || 'Failed to save your choice' }, { status: 500 });
    }
}
