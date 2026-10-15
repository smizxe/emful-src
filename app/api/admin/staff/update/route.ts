
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { STAFF_ROLES } from '../route';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { id, email, name, password, isActive, roles } = body;

        if (!id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // This screen manages internal logins only -- never a seller or another
        // admin, even if an id for one is passed in.
        const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
        if (!target || !['STAFF', 'DESIGNER'].includes(target.role)) {
            return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
        }

        const updateData: any = {};
        if (email) updateData.email = email;
        if (name) updateData.name = name;
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);
        if (roles !== undefined) {
            const next = Array.from(new Set(
                (Array.isArray(roles) ? roles : [roles])
                    .map((r: unknown) => String(r || '').trim().toUpperCase())
                    .filter((r: string) => STAFF_ROLES.includes(r))
            ));
            if (next.length === 0) {
                return NextResponse.json({ error: 'Pick at least one role' }, { status: 400 });
            }
            updateData.roles = next;
            // Keep the primary role inside the set, so they still land somewhere
            // they are allowed to be after their next login.
            updateData.role = next.includes(target.role) ? target.role : next[0];
        }
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData
        });

        return NextResponse.json({
            success: true,
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                name: updatedUser.name,
                role: updatedUser.role,
                roles: updatedUser.roles,
                isActive: updatedUser.isActive
            }
        });

    } catch (error: any) {
        console.error('Error updating staff:', error);
        return NextResponse.json({ error: error.message || 'Failed to update staff' }, { status: 500 });
    }
}
