/**
 * Phone photos are often 3-10 MB, but the host (Vercel) refuses any request
 * body over 4.5 MB before it reaches /api/upload -- it answers with a plain-text
 * "Request Entity Too Large", which Safari then reports as "The string did not
 * match the expected pattern". So a photo that would be refused is scaled down
 * in the browser first. Everything that fits (PDFs, GIFs, most images) is sent
 * untouched, at full size.
 */
const SHRINK_ABOVE_BYTES = 4 * 1024 * 1024;
const TARGET_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 3200;
const SHRINKABLE = /^image\/(jpeg|jpg|png|webp|heic|heif)$/;

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image')); };
        img.src = url;
    });
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function shrinkImageForUpload(file: File): Promise<File> {
    if (typeof window === 'undefined') return file;
    if (!SHRINKABLE.test((file.type || '').toLowerCase()) || file.size <= SHRINK_ABOVE_BYTES) return file;

    try {
        // The browser applies the photo's EXIF rotation when it decodes it, so the
        // canvas copy comes out the right way up.
        const img = await loadImage(file);
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) return file;

        const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        // JPEG has no transparency; give a transparent PNG a white page, not black.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let blob: Blob | null = null;
        for (const quality of [0.85, 0.7, 0.55]) {
            blob = await toJpeg(canvas, quality);
            if (blob && blob.size <= TARGET_BYTES) break;
        }
        if (!blob || blob.size >= file.size) return file;

        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    } catch {
        // A format this browser cannot decode: send the original and let the
        // server say whether it fits.
        return file;
    }
}
