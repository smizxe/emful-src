import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { removeJobPhoto } from '@/lib/jobPhotoStore';

// The seller's side of the photos the shop took of their finished order: they
// can delete one they no longer need, which also frees the stored file. Only
// ever on their own orders.

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!user.sellerId) return NextResponse.json({ error: 'Seller account required' }, { status: 403 });

    try {
        const { jobId, remove } = await request.json();
        if (!jobId || !remove) return NextResponse.json({ error: 'jobId and remove are required' }, { status: 400 });

        const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, sellerId: true, productPhotos: true } });
        // Someone else's order reads exactly like a missing one.
        if (!job || job.sellerId !== user.sellerId) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

        const result = await removeJobPhoto(job, remove);
        if (!result) return NextResponse.json({ error: 'That photo is not on this order' }, { status: 404 });
        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error('Seller photo delete error:', error);
        return NextResponse.json({ error: error.message || 'Could not delete the photo' }, { status: 500 });
    }
}
