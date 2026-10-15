import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import dayjs from 'dayjs';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const month = parseInt(searchParams.get('month') || String(dayjs().month()));
        const year = parseInt(searchParams.get('year') || String(dayjs().year()));

        // Get start and end dates for the month
        const startDate = dayjs().year(year).month(month).startOf('month').toDate();
        const endDate = dayjs().year(year).month(month).endOf('month').toDate();

        // Fetch all wallet ledger entries for the month
        const ledgerEntries = await prisma.walletLedger.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                type: true,
                amount: true,
                createdAt: true,
            },
        });

        // Group by date and aggregate credits/debits
        const dailyData: Record<string, { credits: number; debits: number }> = {};

        // Initialize all days of the month
        const daysInMonth = dayjs().year(year).month(month).daysInMonth();
        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = dayjs().year(year).month(month).date(day).format('YYYY-MM-DD');
            dailyData[dateKey] = { credits: 0, debits: 0 };
        }

        // Aggregate ledger entries
        ledgerEntries.forEach((entry) => {
            const dateKey = dayjs(entry.createdAt).format('YYYY-MM-DD');
            if (dailyData[dateKey]) {
                if (entry.type === 'CREDIT') {
                    dailyData[dateKey].credits += entry.amount;
                } else if (entry.type === 'DEBIT') {
                    dailyData[dateKey].debits += entry.amount;
                }
            }
        });

        // Convert to array format for chart
        const chartData = Object.entries(dailyData).map(([date, values]) => ({
            date,
            credits: Math.round(values.credits * 100) / 100,
            debits: Math.round(values.debits * 100) / 100,
        }));

        return NextResponse.json(chartData);
    } catch (error) {
        console.error('Wallet Chart API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
    }
}
