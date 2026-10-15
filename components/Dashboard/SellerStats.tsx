'use client';

import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useSearchParams } from 'next/navigation';

interface ChartData {
    name: string;
    value: number;
}

interface StatsData {
    total: { count: number; chartData: ChartData[] };
    pendingApproval: { count: number; chartData: ChartData[] };
    received: { count: number; chartData: ChartData[] };
    inProcess: { count: number; chartData: ChartData[] };
    completed: { count: number; chartData: ChartData[] };
    cancelled: { count: number; chartData: ChartData[] };
    rejected: { count: number; chartData: ChartData[] };
}

interface SellerStatsProps {
    allTime?: boolean;
}

export default function SellerStats({ allTime }: SellerStatsProps = {}) {
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const searchParams = useSearchParams();

    const fetchStats = async () => {
        setLoading(true);
        try {
            let params: URLSearchParams;
            if (allTime) {
                params = new URLSearchParams({
                    start: new Date('2000-01-01').toISOString(),
                    end: new Date().toISOString()
                });
            } else {
                params = new URLSearchParams(searchParams.toString());
            }
            const res = await fetch(`/api/dashboard/stats/orders?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (error) {
            console.error('Failed to load seller stats');
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
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={1.5}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );

    if (loading && !stats) {
        return <div className="mb-6 flex justify-center py-8"><Spin /></div>;
    }

    const cardClass = 'flex items-center justify-between gap-3 px-4 py-3 min-w-[220px] flex-1 basis-[220px] border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white/40 dark:bg-zinc-900/20';

    return (
        <div className="mb-6">
            <div className="flex flex-wrap gap-4 border-y border-zinc-200 dark:border-zinc-700 py-4">
                {/* Total Orders */}
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Total Orders</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.total.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.total.chartData || [], '#8b5cf6')}
                </div>

                {/* Orders Received */}
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Pending Approval Orders</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.pendingApproval.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.pendingApproval.chartData || [], '#ec4899')}
                </div>

                {/* Orders Received */}
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders Received</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.received.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.received.chartData || [], '#3b82f6')}
                </div>

                {/* Orders In Process */}
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders In Process</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.inProcess.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.inProcess.chartData || [], '#f97316')}
                </div>

                {/* Orders Complete */}
                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Orders Complete</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.completed.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.completed.chartData || [], '#10b981')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Cancelled Orders</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.cancelled.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.cancelled.chartData || [], '#ef4444')}
                </div>

                <div className={cardClass}>
                    <div className="flex flex-col">
                        <span className="text-xs text-zinc-500 whitespace-nowrap">Rejected Orders</span>
                        <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                                {stats?.rejected.count || 0}
                            </span>
                        </div>
                    </div>
                    {renderSparkline(stats?.rejected.chartData || [], '#f97316')}
                </div>
            </div>
        </div>
    );
}
