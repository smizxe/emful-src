
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const { email, code } = await request.json();

        if (!email || !code) {
            return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
        }

        // Find token
        const vt = await prisma.verificationToken.findUnique({
            where: {
                identifier_token: {
                    identifier: email,
                    token: code
                }
            }
        });

        if (!vt) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
        }

        // Check expiry
        if (new Date() > vt.expires) {
            return NextResponse.json({ error: 'Verification code expired' }, { status: 400 });
        }

        // Activate User
        if (vt.userId) {
            await prisma.user.update({
                where: { id: vt.userId },
                data: { isActive: true }
            });
        } else {
            // Fallback if userId wasn't linked (should not happen with our flow)
            const user = await prisma.user.findUnique({ where: { email } });
            if (user) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { isActive: true }
                });
            }
        }

        // Delete used token query
        await prisma.verificationToken.delete({
            where: { id: vt.id }
        });

        return NextResponse.json({ success: true, message: 'Account verified successfully' });

    } catch (error) {
        console.error('Verification Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
