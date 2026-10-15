import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { generateApiKey } from '@/lib/apiAuth';

async function requireSellerId() {
    const user = await getAuthenticatedUser();
    if (!user) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
    if (!user.sellerId) return { error: NextResponse.json({ error: 'Seller account required' }, { status: 403 }) };
    return { sellerId: user.sellerId };
}

export async function GET() {
    const { sellerId, error } = await requireSellerId();
    if (error) return error;
    const keys = await prisma.apiKey.findMany({
        where: { sellerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, prefix: true, lastUsedAt: true, revoked: true, createdAt: true },
    });
    return NextResponse.json({ keys });
}

export async function POST(req: NextRequest) {
    const { sellerId, error } = await requireSellerId();
    if (error) return error;

    try {
        const body = await req.json();
        const action = body.action || 'create';

        if (action === 'revoke') {
            if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
            await prisma.apiKey.updateMany({ where: { id: body.id, sellerId }, data: { revoked: true } });
            return NextResponse.json({ success: true });
        }

        // create
        const name = String(body.name || 'API Key').trim().slice(0, 60) || 'API Key';
        const { plain, keyHash, prefix } = generateApiKey();
        const key = await prisma.apiKey.create({
            data: { sellerId, name, keyHash, prefix },
            select: { id: true, name: true, prefix: true, createdAt: true },
        });
        // The plaintext key is returned ONCE here and never stored.
        return NextResponse.json({ success: true, key: { ...key, plain } });
    } catch (e: any) {
        console.error('API key error:', e);
        return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
    }
}
