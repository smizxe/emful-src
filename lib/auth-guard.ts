import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getUserAccessStatus } from '@/lib/userAccess';
import { hasAnyRole, ROLE_COOKIE, ROLES_COOKIE } from '@/lib/roles';

type AllowedRole = 'ADMIN' | 'SELLER' | 'STAFF' | 'DESIGNER';

type GuardUser = {
    id: string;
    email: string;
    name: string | null;
    role: string;
    roles: string[];
    isActive: boolean;
    isBanned: boolean;
    bannedAt: Date | null;
    bannedReason: string | null;
    suspendedUntil: Date | null;
    suspensionReason: string | null;
    sellerId: string | null;
};

const DEFAULT_HOME_BY_ROLE: Record<string, string> = {
    ADMIN: '/admin',
    STAFF: '/staff/dashboard',
    SELLER: '/dashboard',
    // A designer's whole world is the design queue.
    DESIGNER: '/designer',
};

function clearAuthCookies(response: NextResponse) {
    response.cookies.set('userId', '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
    });
    response.cookies.set(ROLES_COOKIE, '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
    });
    response.cookies.set(ROLE_COOKIE, '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
    });
    return response;
}

export function getHomePathForRole(role?: string | null) {
    if (!role) {
        return '/login';
    }

    return DEFAULT_HOME_BY_ROLE[role] || '/login';
}

async function loadGuardUser(): Promise<GuardUser | null> {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return null;
    }

    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            roles: true,
            isActive: true,
            isBanned: true,
            bannedAt: true,
            bannedReason: true,
            suspendedUntil: true,
            suspensionReason: true,
            sellerId: true,
        },
    });
}

export async function getAuthenticatedUser() {
    return loadGuardUser();
}

export async function requireApiRole(allowedRoles: AllowedRole[]) {
    const user = await loadGuardUser();

    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const accessStatus = getUserAccessStatus(user as any);
    if (accessStatus.blocked) {
        return clearAuthCookies(
            NextResponse.json(
                {
                    error: accessStatus.message,
                    code: accessStatus.code,
                },
                { status: 403 }
            )
        );
    }

    if (!hasAnyRole(user, allowedRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return null;
}

export async function requireAdminApi() {
    return requireApiRole(['ADMIN']);
}

export async function requireAuthenticatedApi() {
    return requireApiRole(['ADMIN', 'SELLER', 'STAFF']);
}

export async function requireStaffOrAdminApi() {
    return requireApiRole(['ADMIN', 'STAFF']);
}

export async function requirePageRole(allowedRoles: AllowedRole[]) {
    const user = await loadGuardUser();

    if (!user) {
        redirect('/login');
    }

    const accessStatus = getUserAccessStatus(user as any);
    if (accessStatus.blocked) {
        redirect('/login');
    }

    if (!hasAnyRole(user, allowedRoles)) {
        redirect(getHomePathForRole(user.role));
    }

    return user;
}
