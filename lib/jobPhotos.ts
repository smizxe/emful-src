/**
 * Photos of a finished job, as stored in Job.productPhotos (a JSON list of URLs).
 * The files themselves live in the public upload bucket under PHOTO_FOLDER.
 */
export const PHOTO_BUCKET = 'egfulfill-uploads';
export const PHOTO_FOLDER = 'product-photos';
export const MAX_PHOTOS_PER_JOB = 10;

export function parsePhotos(raw: string | null | undefined): string[] {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter((u) => typeof u === 'string' && u.trim()) : [];
    } catch {
        return [];
    }
}

/**
 * The storage path of a photo this shop uploaded, or null for anything else
 * (a link pasted from elsewhere, another bucket, another folder) -- so deleting
 * a photo can only ever remove one of our own product photos.
 */
export function storagePathOfPhoto(url: string): string | null {
    const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
    const at = String(url || '').indexOf(marker);
    if (at < 0) return null;
    let path: string;
    try {
        path = decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
    } catch {
        return null;
    }
    if (!path.startsWith(`${PHOTO_FOLDER}/`) || path.includes('..')) return null;
    return path;
}
