import { NextRequest, NextResponse } from 'next/server';
import { cookieHasAnyRole, ROLE_COOKIE, ROLES_COOKIE } from '@/lib/roles';

function getHomePathForRole(role?: string) {
    if (role === 'ADMIN') {
        return '/admin';
    }

    if (role === 'STAFF') {
        return '/staff/dashboard';
    }

    if (role === 'SELLER') {
        return '/dashboard';
    }

    // Designers only ever get the design queue.
    if (role === 'DESIGNER') {
        return '/designer';
    }

    return '/login';
}

function redirectToLogin(request: NextRequest) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
}

function isStaffAllowedAdminApi(pathname: string, method: string) {
    const segments = pathname.split('/').filter(Boolean);
    const isDirectOrderDetail = segments.length === 4 && segments[0] === 'api' && segments[1] === 'admin' && segments[2] === 'orders';
    // Ticket detail: /api/admin/tickets/{id} (GET only)
    const isDirectTicketDetail = segments.length === 4 && segments[0] === 'api' && segments[1] === 'admin' && segments[2] === 'tickets' && segments[3] !== 'resolve';

    if (pathname === '/api/admin/jobs' || pathname === '/api/admin/jobs/status') {
        return true;
    }

    // Staff can view and resolve order-issue tickets.
    if (pathname === '/api/admin/tickets') {
        return method === 'GET';
    }

    if (pathname === '/api/admin/tickets/resolve') {
        return method === 'POST';
    }

    if (isDirectTicketDetail) {
        return method === 'GET';
    }

    if (isDirectOrderDetail) {
        return ['GET', 'PATCH'].includes(method);
    }

    if (pathname === '/api/admin/orders/approve') {
        return method === 'POST';
    }

    if (pathname === '/api/admin/wallet/charge') {
        return method === 'POST';
    }

    if (pathname === '/api/admin/shipping' || pathname.startsWith('/api/admin/shipping/')) {
        return true;
    }

    if (pathname === '/api/admin/products') {
        return method === 'GET';
    }

    return false;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const userId = request.cookies.get('userId')?.value;
    const userRole = request.cookies.get(ROLE_COOKIE)?.value;
    // An account can hold more than one role, so every check below asks "do they
    // hold any of these", not "is this their primary role".
    const rolesCookie = request.cookies.get(ROLES_COOKIE)?.value;
    const can = (...roles: string[]) => cookieHasAnyRole(rolesCookie, userRole, roles);

    const isAdminApi = pathname.startsWith('/api/admin');
    const isAdminPage = pathname.startsWith('/admin');
    const isStaffPage = pathname.startsWith('/staff');
    const isDashboardPage = pathname.startsWith('/dashboard');
    const isDesignerPage = pathname.startsWith('/designer');

    if (isAdminApi) {
        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        if (!can('ADMIN') && !(can('STAFF') && isStaffAllowedAdminApi(pathname, request.method))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        return NextResponse.next();
    }

    if (isAdminPage) {
        if (!userId) {
            return redirectToLogin(request);
        }

        if (!can('ADMIN')) {
            return NextResponse.redirect(new URL(getHomePathForRole(userRole), request.url));
        }
    }

    if (isStaffPage) {
        if (!userId) {
            return redirectToLogin(request);
        }

        if (!can('STAFF', 'ADMIN')) {
            return NextResponse.redirect(new URL(getHomePathForRole(userRole), request.url));
        }
    }

    // The designer portal is the only page a DESIGNER may open; admins can look in.
    if (isDesignerPage) {
        if (!userId) {
            return redirectToLogin(request);
        }

        if (!can('DESIGNER', 'ADMIN')) {
            return NextResponse.redirect(new URL(getHomePathForRole(userRole), request.url));
        }
    }

    if (isDashboardPage) {
        if (!userId) {
            return redirectToLogin(request);
        }

        if (!can('SELLER') && can('DESIGNER')) {
            return NextResponse.redirect(new URL('/designer', request.url));
        }

        if (can('ADMIN')) {
            return NextResponse.redirect(new URL('/admin', request.url));
        }

        if (can('STAFF')) {
            return NextResponse.redirect(new URL('/staff/dashboard', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*', '/dashboard/:path*', '/staff/:path*', '/designer/:path*', '/api/admin/:path*'],
};
