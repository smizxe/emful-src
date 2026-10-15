import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminApi } from '@/lib/auth-guard';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const adminGuardResponse = await requireAdminApi();
    if (adminGuardResponse) return adminGuardResponse;
    try {
        const { searchParams } = new URL(request.url);
        const startParam = searchParams.get('start');
        const endParam = searchParams.get('end');

        let startDate: Date;
        let endDate: Date;

        if (startParam && startParam.includes('T')) {
            startDate = new Date(startParam);
        } else {
            startDate = startParam
                ? dayjs(startParam).startOf('day').toDate()
                : dayjs('2000-01-01').startOf('day').toDate();
        }

        if (endParam && endParam.includes('T')) {
            endDate = new Date(endParam);
        } else {
            endDate = endParam
                ? dayjs(endParam).endOf('day').toDate()
                : dayjs().endOf('day').toDate();
        }

        const jobs = await prisma.job.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                createdAt: true,
                status: true
            }
        });

        const bucketsMap = new Map<string, {
            date: string;
            total: number;
            pendingApproval: number;
            received: number;
            inProcess: number;
            completed: number;
            cancelled: number;
            rejected: number;
        }>();

        let current = dayjs(startDate);
        while (current.isBefore(dayjs(endDate).add(1, 'day'))) {
            const key = current.format('YYYY-MM-DD');
            bucketsMap.set(key, {
                date: key,
                total: 0,
                pendingApproval: 0,
                received: 0,
                inProcess: 0,
                completed: 0,
                cancelled: 0,
                rejected: 0
            });
            current = current.add(1, 'day');
        }

        jobs.forEach((job) => {
            const key = dayjs(job.createdAt).format('YYYY-MM-DD');
            const bucket = bucketsMap.get(key);
            if (!bucket) return;

            bucket.total += 1;

            if (job.status === 'PENDING_APPROVAL') {
                bucket.pendingApproval += 1;
            } else if (job.status === 'RECEIVED') {
                bucket.received += 1;
            } else if (['IN_PROCESS', 'PRINTING', 'SEWING'].includes(job.status)) {
                bucket.inProcess += 1;
            } else if (['COMPLETED', 'READY_TO_SHIP', 'SHIPPED'].includes(job.status)) {
                bucket.completed += 1;
            } else if (job.status === 'CANCELLED') {
                bucket.cancelled += 1;
            } else if (job.status === 'REJECTED') {
                bucket.rejected += 1;
            }
        });

        const chartData = Array.from(bucketsMap.values());
        const totalChart = chartData.map((bucket) => ({
            name: dayjs(bucket.date).format('D/M'),
            value: bucket.total
        }));
        const pendingApprovalCount = jobs.filter((job) => job.status === 'PENDING_APPROVAL').length;
        const receivedCount = jobs.filter((job) => job.status === 'RECEIVED').length;
        const inProcessCount = jobs.filter((job) => ['IN_PROCESS', 'PRINTING', 'SEWING'].includes(job.status)).length;
        const completedCount = jobs.filter((job) => ['COMPLETED', 'READY_TO_SHIP', 'SHIPPED'].includes(job.status)).length;
        const cancelledCount = jobs.filter((job) => job.status === 'CANCELLED').length;
        const rejectedCount = jobs.filter((job) => job.status === 'REJECTED').length;

        const response = NextResponse.json({
            total: {
                count: jobs.length,
                chartData: totalChart
            },
            pendingApproval: {
                count: pendingApprovalCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.pendingApproval }))
            },
            received: {
                count: receivedCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.received }))
            },
            inProcess: {
                count: inProcessCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.inProcess }))
            },
            completed: {
                count: completedCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.completed }))
            },
            cancelled: {
                count: cancelledCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.cancelled }))
            },
            rejected: {
                count: rejectedCount,
                chartData: chartData.map((bucket) => ({ name: dayjs(bucket.date).format('D/M'), value: bucket.rejected }))
            }
        });
        response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60');
        return response;

    } catch (error) {
        console.error('Stats Error:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
