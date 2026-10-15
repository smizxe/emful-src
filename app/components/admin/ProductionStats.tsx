'use client';

import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import { useSearchParams } from 'next/navigation';

interface ChartData {
    name: string;
    value: number;
}

interface StatsBlock {
    count: number;
    chartData: ChartData[];
}

interface StatsData {
    total: StatsBlock;
    pendingApproval: StatsBlock;
    received: StatsBlock;
    inProcess: StatsBlock;
    completed: StatsBlock;
    cancelled: StatsBlock;
    rejected: StatsBlock;
}

export default function ProductionStats() {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();

    const fetchStats = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams(searchParams.toString());
            const start = params.get('start');
            const end = params.get('end');

            let url = '/api/admin/production/stats';
            if (start && end) {
                url += `?start=${start}&end=${end}`;
            } else {
                url += `?start=${dayjs('2000-01-01').toISOString()}&end=${dayjs().endOf('day').toISOString()}`;
            }

            const res = await fetch(url);
            if (res.ok) {
                setStats(await res.json());
            }
        } catch (error) {
            console.error('Failed to load stats');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [searchParams]);

    const renderSparkline = (data: ChartData[], color: string) => (
        <div style={{ width: 80, height: 24 }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.length > 0 ? data : [{ name: '1', value: 0 }, { name: '2', value: 0 }]}>
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );

    const cardClass = 'flex items-center justify-between gap-3 px-4 py-3 min-w-[220px] flex-1 basis-[220px] border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white/40 dark:bg-zinc-900/20';

    if (loading && !stats) {
        return <div className="mb-6 flex justify-center"><Spin /></div>;
    }

        return (
        <div className="mb-6">
            <div className="flex flex-wrap gap-4 border-y border-zinc-200 dark:border-zinc-700 py-4">
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Total Orders</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.total.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.total.chartData || [], '#8b5cf6')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Pending Approval</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.pendingApproval.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.pendingApproval.chartData || [], '#ec4899')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders Received</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.received.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.received.chartData || [], '#3b82f6')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders In Process</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.inProcess.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.inProcess.chartData || [], '#f97316')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders Complete</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.completed.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.completed.chartData || [], '#10b981')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Rejected Orders</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.rejected.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.rejected.chartData || [], '#f97316')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Cancelled Orders</span>
                        <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{stats?.cancelled.count || 0}</span>
                    </div>
                    {renderSparkline(stats?.cancelled.chartData || [], '#ef4444')}
                </div>
            </div>
        </div>
    );
}
