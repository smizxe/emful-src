import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { getUserAccessStatus } from '@/lib/userAccess';
import { getUserRoles, serializeRoles, ROLE_COOKIE, ROLES_COOKIE } from '@/lib/roles';

export async function POST(request: Request) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Use Prisma for login
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        const accessStatus = getUserAccessStatus(user as any);
        if (accessStatus.blocked) {
            return NextResponse.json({
                error: accessStatus.message,
                code: accessStatus.code
            }, { status: 403 });
        }

        // Compare password (bcrypt for new users, string compare for legacy)
        let isValid = false;
        try {
            isValid = await bcrypt.compare(password, user.passwordHash);
        } catch (e) {
            // Ignore error if not a valid hash
        }

        // Fallback for legacy plain text passwords
        if (!isValid && user.passwordHash === password) {
            isValid = true;
        }

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
        }

        // Fetch extra details for frontend state
        let userName = 'User';
        let userBalance = 0;

        if (user.role === 'SELLER' && user.sellerId) {
            const seller = await prisma.seller.findUnique({
                where: { id: user.sellerId },
                include: { wallet: true }
            });
            if (seller) {
                // Prefer seller.name, fallback to user.name, then 'Seller'
                userName = seller.name || user.name || 'Seller';
                userBalance = seller.wallet?.balance || 0;
            } else {
                // Seller not found, use user.name
                userName = user.name || 'Seller';
            }
        } else if (user.role === 'ADMIN') {
            userName = user.name || 'Administrator';
        } else if (user.role === 'STAFF') {
            userName = user.name || 'Staff';
        } else {
            // Default fallback
            userName = user.name || 'User';
        }

        const finalResponse = NextResponse.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: userName,
                role: user.role,
                roles: getUserRoles(user),
                balance: userBalance
            }
        });

        finalResponse.cookies.set('userId', String(user.id), {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        // Set userRole cookie for middleware auth checking
        finalResponse.cookies.set(ROLE_COOKIE, user.role, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        // Middleware checks roles without a DB round trip, so the whole set rides
        // in a cookie alongside the primary role.
        finalResponse.cookies.set(ROLES_COOKIE, serializeRoles(user), {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        return finalResponse;

    } catch (error) {
        console.error('Login API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
