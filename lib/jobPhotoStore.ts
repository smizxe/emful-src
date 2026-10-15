import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';
import { PHOTO_BUCKET, parsePhotos, storagePathOfPhoto } from '@/lib/jobPhotos';

// Server side of a job's product photos: taking one off a job and deleting its
// stored file. Photos are kept full size, so a deleted one should stop taking up
// storage. Used by both the shop's screen and the seller's own order page.

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Delete the stored files behind these photo links: only our own uploads, and only when no other job still shows them. */
export async function deleteStoredPhotos(jobId: string, urls: string[]) {
    const ownHost = (() => { try { return new URL(process.env.SUPABASE_URL!).host; } catch { return ''; } })();
    const paths: string[] = [];
    for (const url of urls) {
        const path = storagePathOfPhoto(url);
        if (!path) continue;
        try { if (new URL(url).host !== ownHost) continue; } catch { continue; }
        const elsewhere = await prisma.job.count({ where: { productPhotos: { contains: url }, NOT: { id: jobId } } });
        if (elsewhere === 0) paths.push(path);
    }
    if (paths.length === 0) return 0;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    // The photo is already off the order; a file left behind only costs space.
    if (error) console.error('Could not delete product photo files:', paths, error);
    return error ? 0 : paths.length;
}

/** Take one photo off a job and delete its file. Null when the photo is not on that job. */
export async function removeJobPhoto(job: { id: string; productPhotos: string | null }, url: string) {
    const current = parsePhotos(job.productPhotos);
    const target = String(url || '').trim();
    if (!target || !current.includes(target)) return null;
    const photos = current.filter((u) => u !== target);
    await prisma.job.update({ where: { id: job.id }, data: { productPhotos: JSON.stringify(photos) } });
    const filesDeleted = await deleteStoredPhotos(job.id, [target]);
    return { photos, filesDeleted };
}
