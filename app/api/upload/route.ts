import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { requireAuthenticatedApi } from '@/lib/auth-guard';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'egfulfill-uploads';
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);
const ALLOWED_EXTENSIONS = new Set(['gif', 'heic', 'heif', 'jpeg', 'jpg', 'pdf', 'png', 'webp']);

function sanitizeFolder(input: string | null) {
    if (!input) return 'uploads';
    const normalized = input
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9/_-]/g, '');

    return normalized || 'uploads';
}

export async function POST(req: Request) {
    const authResponse = await requireAuthenticatedApi();
    if (authResponse) return authResponse;

    try {
        const data = await req.formData();
        const file = data.get('file') as File;
        const folder = sanitizeFolder(data.get('folder')?.toString() || null);

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
            return NextResponse.json({ error: 'File is too large. Maximum upload size is 10 MB.' }, { status: 400 });
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const mimeType = (file.type || '').toLowerCase();

        if (!ALLOWED_MIME_TYPES.has(mimeType) || !ALLOWED_EXTENSIONS.has(ext)) {
            return NextResponse.json({
                error: 'Unsupported file type. Only PDF, JPG, PNG, GIF, HEIC, and WEBP files are allowed.'
            }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const fileName = `${uuidv4()}.${ext}`;
        const filePath = `${folder}/${fileName}`;

        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(filePath, buffer, {
                contentType: file.type || 'application/octet-stream',
                upsert: false,
            });

        if (error) {
            console.error('Supabase Storage Error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const { data: publicUrlData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(filePath);

        return NextResponse.json({ url: publicUrlData.publicUrl });
    } catch (error: any) {
        console.error('Upload Route Error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
