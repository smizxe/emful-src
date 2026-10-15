import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

// GET - List all templates
export async function GET() {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const templates = await prisma.productTemplate.findMany({
            orderBy: [
                { isDefault: 'desc' },
                { name: 'asc' }
            ]
        });
        return NextResponse.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

// POST - Create new template
export async function POST(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const body = await request.json();
        const { name, colors, sizes, colorMapping, isDefault } = body;

        if (!name || !colors || !sizes) {
            return NextResponse.json({ error: 'Name, colors, and sizes are required' }, { status: 400 });
        }

        // If setting as default, unset other defaults
        if (isDefault) {
            await prisma.productTemplate.updateMany({
                where: { isDefault: true },
                data: { isDefault: false }
            });
        }

        const template = await prisma.productTemplate.create({
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
        console.error('Error creating template:', error);
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'Template name already exists' }, { status: 400 });
        }
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}
