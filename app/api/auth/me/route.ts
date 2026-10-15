import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { getUserAccessStatus } from '@/lib/userAccess';
import { getUserRoles, serializeRoles, ROLE_COOKIE, ROLES_COOKIE } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;

        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                seller: {
                    include: {
                        wallet: true
                    }
                }
            }
        }) as any;

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const accessStatus = getUserAccessStatus(user as any);
        if (accessStatus.blocked) {
            const response = NextResponse.json({
                error: accessStatus.message,
                code: accessStatus.code
            }, { status: 403 });
            response.cookies.delete('userId');
            response.cookies.delete('userRole');
            response.cookies.delete('userRoles');
            return response;
        }

        // Default name logic: Prefer DB name, fallback to role-based alias
        let name = user.name || 'User';
        let balance = 0;

        if (user.role === 'SELLER' && user.seller) {
            // For Sellers, prefer the Seller Company Name usually, or User name if individual?
            // Usually business name is better.
            name = user.seller.name || user.name || 'Seller';
            balance = user.seller.wallet?.balance || 0;
        } else if (user.role === 'ADMIN') {
            name = user.name || 'Administrator';
        } else if (user.role === 'STAFF') {
            name = user.name || 'Staff Member';
        }

        const roles = getUserRoles(user);

        const response = NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                name: name,
                role: user.role,
                roles,
                balance: balance
            }
        });
        response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30');
        response.headers.set('Vary', 'Cookie');

        // Roles can change while someone is signed in; keep the session cookies in
        // step so the middleware stops guarding doors that are no longer theirs.
        const currentRoles = serializeRoles(user);
        if (cookieStore.get(ROLES_COOKIE)?.value !== currentRoles
            || cookieStore.get(ROLE_COOKIE)?.value !== user.role) {
            const cookieOptions = {
                httpOnly: true,
                sameSite: 'lax' as const,
                secure: process.env.NODE_ENV === 'production',
                path: '/',
                maxAge: 60 * 60 * 24 * 7,
            };
            response.cookies.set(ROLE_COOKIE, user.role, cookieOptions);
            response.cookies.set(ROLES_COOKIE, currentRoles, cookieOptions);
        }
        return response;

    } catch (error) {
        console.error('Auth Check Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
