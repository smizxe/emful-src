import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { MAX_PHOTOS_PER_JOB, parsePhotos } from '@/lib/jobPhotos';
import { deleteStoredPhotos, removeJobPhoto } from '@/lib/jobPhotoStore';

// Photos of the finished garment. The shop takes them when a job is done and
// the seller sees them on their own order, to view or download.

/** Only accept somewhere the file actually lives, never arbitrary text. */
function isUsableUrl(value: unknown): boolean {
    return /^https?:\/\/\S+$/i.test(String(value || '').trim());
}

export async function GET(request: Request) {
    const guard = await requireStaffOrAdminApi();
    if (guard) return guard;

    const jobId = new URL(request.url).searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, productPhotos: true } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    return NextResponse.json({ photos: parsePhotos(job.productPhotos) });
}

/**
 * Add photos to a job (`add`), delete one (`remove`), or with `photos` replace
 * the whole set. Photos that leave the set are deleted from storage too.
 */
export async function POST(request: Request) {
    const guard = await requireStaffOrAdminApi();
    if (guard) return guard;

    try {
        const { jobId, add, remove, photos } = await request.json();
        if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

        const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, productPhotos: true } });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

        const current = parsePhotos(job.productPhotos);
        let next: string[];

        if (Array.isArray(photos)) {
            next = photos.map((p: unknown) => String(p || '').trim()).filter(isUsableUrl);
        } else if (remove) {
            const result = await removeJobPhoto(job, remove);
            if (!result) return NextResponse.json({ error: 'That photo is not on this job' }, { status: 404 });
            return NextResponse.json({ success: true, ...result });
        } else {
            const incoming = (Array.isArray(add) ? add : [add])
                .map((p: unknown) => String(p || '').trim())
                .filter(isUsableUrl);
            if (incoming.length === 0) {
                return NextResponse.json({ error: 'No usable photo URL given' }, { status: 400 });
            }
            next = [...current, ...incoming];
        }

        // Keep it sane: no duplicates, and a cap so one job cannot grow forever.
        next = Array.from(new Set(next)).slice(0, MAX_PHOTOS_PER_JOB);

        await prisma.job.update({ where: { id: jobId }, data: { productPhotos: JSON.stringify(next) } });
        const filesDeleted = await deleteStoredPhotos(jobId, current.filter((u) => !next.includes(u)));
        return NextResponse.json({ success: true, photos: next, filesDeleted });
    } catch (error: any) {
        console.error('Job photos error:', error);
        return NextResponse.json({ error: error.message || 'Failed to save photos' }, { status: 500 });
    }
}
