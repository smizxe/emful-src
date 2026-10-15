import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import {
    PRIORITY_PRODUCTION_FEE_KEY,
    PRIORITY_SHIPPING_FEE_KEY,
    getPriorityFeeSettings
} from '@/lib/priorityFees';

export async function GET() {
    try {
        const [setting, priorityFees] = await Promise.all([
            prisma.systemSetting.findUnique({
                where: { key: 'VND_USD_RATE' }
            }),
            getPriorityFeeSettings()
        ]);
        const response = NextResponse.json({
            rate: setting ? parseFloat(setting.value) : 25000,
            ...priorityFees
        });
        response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        return response;
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value;

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { rate, priorityProductionFee, priorityShippingFee } = await request.json();

        const parsedRate = Number(rate);
        const parsedPriorityProductionFee = Number(priorityProductionFee ?? 0);
        const parsedPriorityShippingFee = Number(priorityShippingFee ?? 0);

        if (!parsedRate || isNaN(parsedRate) || parsedRate <= 0) {
            return NextResponse.json({ error: 'Invalid rate' }, { status: 400 });
        }

        if (
            !Number.isFinite(parsedPriorityProductionFee)
            || !Number.isFinite(parsedPriorityShippingFee)
            || parsedPriorityProductionFee < 0
            || parsedPriorityShippingFee < 0
        ) {
            return NextResponse.json({ error: 'Invalid priority fee' }, { status: 400 });
        }

        const setting = await prisma.systemSetting.upsert({
            where: { key: 'VND_USD_RATE' },
            update: { value: parsedRate.toString() },
            create: {
                key: 'VND_USD_RATE',
                value: parsedRate.toString(),
                description: 'Exchange rate from VND to USD'
            }
        });

        await prisma.$transaction([
            prisma.systemSetting.upsert({
                where: { key: PRIORITY_PRODUCTION_FEE_KEY },
                update: { value: parsedPriorityProductionFee.toString() },
                create: {
                    key: PRIORITY_PRODUCTION_FEE_KEY,
                    value: parsedPriorityProductionFee.toString(),
                    description: 'Priority production fee in USD'
                }
            }),
            prisma.systemSetting.upsert({
                where: { key: PRIORITY_SHIPPING_FEE_KEY },
                update: { value: parsedPriorityShippingFee.toString() },
                create: {
                    key: PRIORITY_SHIPPING_FEE_KEY,
                    value: parsedPriorityShippingFee.toString(),
                    description: 'Priority shipping fee in USD'
                }
            })
        ]);

        return NextResponse.json({
            success: true,
            rate: parseFloat(setting.value),
            priorityProductionFee: parsedPriorityProductionFee,
            priorityShippingFee: parsedPriorityShippingFee
        });
    } catch (error) {
        console.error('SETTINGS_API_UPDATE_ERROR:', error);
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
}
