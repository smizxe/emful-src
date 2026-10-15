
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');

    const now = new Date();
    // Default to current year/month if not specified
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth(); // 0-indexed

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0); // Last day of month

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    // Initialize map for all days in the month
    const dailyStats = new Map<string, { wallet: number; orders: number; releases: number }>();

    // Determine the last day to loop to.
    // If viewing current month, we might want to include all days to show "0" for future days 
    // OR just loop to endOfMonth and let frontend handle truncation.
    // The user said "from new month only show 9 days", which is the frontend logic mostly, 
    // but the API can just return everything for the month and frontend filters.
    // Let's return full month structure.
    for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
        dailyStats.set(formatDate(d), { wallet: 0, orders: 0, releases: 0 });
    }

    // 1. Daily Wallet (Topups Confirmed)
    const topups = await prisma.topupRequest.findMany({
        where: {
            status: 'CONFIRMED',
            confirmedAt: {
                gte: startOfMonth,
                lte: endOfMonth
            }
        }
    });

    topups.forEach(t => {
        if (t.confirmedAt) {
            const date = formatDate(t.confirmedAt);
            if (dailyStats.has(date)) {
                const stat = dailyStats.get(date)!;
                stat.wallet += t.amount;
            }
        }
    });

    // 2. Daily Orders (Created At)
    const orders = await prisma.order.findMany({
        where: {
            createdAt: {
                gte: startOfMonth,
                lte: endOfMonth
            }
        }
    });

    orders.forEach(o => {
        const date = formatDate(o.createdAt);
        if (dailyStats.has(date)) {
            const stat = dailyStats.get(date)!;
            stat.orders += 1;
        }
    });

    // 3. Product Releases (Assuming Jobs created or Products created? User said "Product Release Chart" but context was "Production Release" page implies Jobs?)
    // "Production Release" page lists Jobs. So "Product Release" chart likely means "Jobs released to production"?
    // The user also has a "Production Release" page which lists Jobs.
    // I will count JOBS created.
    const jobs = await prisma.job.findMany({
        where: {
            createdAt: {
                gte: startOfMonth,
                lte: endOfMonth
            }
        }
    });

    jobs.forEach(j => {
        const date = formatDate(j.createdAt);
        if (dailyStats.has(date)) {
            const stat = dailyStats.get(date)!;
            stat.releases += 1;
        }
    });

    // Convert map to array
    const result = Array.from(dailyStats.entries()).sort().map(([date, stats]) => ({
        date,
        ...stats
    }));

    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    return response;
}
