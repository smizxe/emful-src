import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import { requireStaffOrAdminApi } from '@/lib/auth-guard';
import { MAX_PHOTOS_PER_JOB, PHOTO_BUCKET, PHOTO_FOLDER, parsePhotos } from '@/lib/jobPhotos';

// Product photos are kept full size, exactly as the camera took them. A phone
// photo is often bigger than the 4.5 MB the host lets through to this server,
// so instead of passing through here the browser gets a one-time link and
// sends the file straight to storage.

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// The storage plan's own per-file ceiling.
const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
const EXTENSION_BY_TYPE: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/gif': 'gif',
};

export async function POST(request: Request) {
    const guard = await requireStaffOrAdminApi();
    if (guard) return guard;

    try {
        const { jobId, contentType, size } = await request.json();
        if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

        const type = String(contentType || '').toLowerCase();
        const ext = EXTENSION_BY_TYPE[type];
        if (!ext) {
            return NextResponse.json({ error: 'Only photos can be uploaded here (JPG, PNG, WEBP, HEIC or GIF).' }, { status: 400 });
        }
        const bytes = Number(size) || 0;
        if (bytes <= 0 || bytes > MAX_PHOTO_BYTES) {
            return NextResponse.json({ error: 'A photo can be at most 50 MB.' }, { status: 400 });
        }

        const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, productPhotos: true } });
        if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        if (parsePhotos(job.productPhotos).length >= MAX_PHOTOS_PER_JOB) {
            return NextResponse.json({ error: `A job can hold at most ${MAX_PHOTOS_PER_JOB} photos. Delete one first.` }, { status: 400 });
        }

        const path = `${PHOTO_FOLDER}/${job.id}/${uuidv4()}.${ext}`;
        const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
        if (error || !data) {
            console.error('Signed upload URL error:', error);
            return NextResponse.json({ error: error?.message || 'Could not prepare the upload' }, { status: 500 });
        }
        const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);

        return NextResponse.json({ signedUrl: data.signedUrl, path, publicUrl: pub.publicUrl });
    } catch (error: any) {
        console.error('Job photo sign error:', error);
        return NextResponse.json({ error: error.message || 'Could not prepare the upload' }, { status: 500 });
    }
}
