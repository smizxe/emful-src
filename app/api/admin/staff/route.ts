
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import bcrypt from 'bcryptjs';

export const STAFF_ROLES = ['STAFF', 'DESIGNER'];

/**
 * An account can hold both roles -- someone who works production and also
 * designs. The first one picked becomes the primary role: it decides where
 * they land after login.
 */
function normaliseRoles(input: unknown, fallback?: string): string[] {
    const list = (Array.isArray(input) ? input : [input])
        .map((r) => String(r || '').trim().toUpperCase())
        .filter((r) => STAFF_ROLES.includes(r));
    const unique = Array.from(new Set(list));
    if (unique.length > 0) return unique;
    return [fallback && STAFF_ROLES.includes(fallback) ? fallback : 'STAFF'];
}

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        // In a real app, verify Admin session here
        // Designers live here too: same kind of internal login, just a different
        // role, so admin manages both from one screen.
        const staffUsers = await prisma.user.findMany({
            where: { role: { in: STAFF_ROLES } },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                roles: true,
                isActive: true,
                createdAt: true,
                _count: {
                    select: { assignedJobs: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(staffUsers);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { email, password, name } = body;
        const roles = normaliseRoles(body.roles ?? body.role);
        const role = roles[0];

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
        }

        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                name: name || null,
                passwordHash,
                role,
                roles,
            }
        });

        return NextResponse.json({
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
            roles: newUser.roles,
            createdAt: newUser.createdAt
        });

    } catch (error: any) {
        console.error('Error creating staff:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
