import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

// GET - Get single template
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { id } = await params;
        const template = await prisma.productTemplate.findUnique({
            where: { id }
        });

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json(template);
    } catch (error) {
        console.error('Error fetching template:', error);
        return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
    }
}

// PUT - Update template
export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, colors, sizes, colorMapping, isDefault } = body;

        // If setting as default, unset other defaults
        if (isDefault) {
            await prisma.productTemplate.updateMany({
                where: { isDefault: true, NOT: { id } },
                data: { isDefault: false }
            });
        }

        const template = await prisma.productTemplate.update({
            where: { id },
            data: {
                name,
                colors: JSON.stringify(colors),
                sizes: JSON.stringify(sizes),
                colorMapping: colorMapping ? JSON.stringify(colorMapping) : null,
                isDefault: isDefault || false,
                itemDescription: body.itemDescription,
                itemCurrency: body.itemCurrency,
                hsCode: body.hsCode,
                countryOfOrigin: body.countryOfOrigin,
                customsDescription: body.customsDescription,
                itemValue: body.itemValue !== undefined ? parseFloat(body.itemValue) : 8,
                itemWeight: body.itemWeight !== undefined ? parseFloat(body.itemWeight) : undefined,
                weightUnit: body.weightUnit,
                itemLength: body.itemLength !== undefined ? parseFloat(body.itemLength) : undefined,
                itemWidth: body.itemWidth !== undefined ? parseFloat(body.itemWidth) : undefined,
                itemHeight: body.itemHeight !== undefined ? parseFloat(body.itemHeight) : undefined,
                sizeUnit: body.sizeUnit
            }
        });

        return NextResponse.json(template);
    } catch (error: any) {
        console.error('Error updating template:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Template name already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

// DELETE - Delete template (prevent deleting default)
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { id } = await params;

        const template = await prisma.productTemplate.findUnique({
            where: { id }
        });

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        if (template.isDefault) {
            return NextResponse.json({ error: 'Cannot delete default template' }, { status: 400 });
        }

        await prisma.productTemplate.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}
