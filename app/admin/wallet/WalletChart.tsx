'use client';

import React, { useEffect, useState } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { Card, Spin, Select, Space } from 'antd';
import dayjs from 'dayjs';

interface ChartData {
    date: string;
    credits: number;
    debits: number;
    displayDate: string;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default function WalletChart() {
    const [data, setData] = useState<ChartData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(dayjs().month());
    const [selectedYear, setSelectedYear] = useState(dayjs().year());

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/wallet/chart?month=${selectedMonth}&year=${selectedYear}`);
            if (res.ok) {
                const json = await res.json();

                // Filter: If current month, show only up to today
                const now = dayjs();
                const isCurrentMonth = now.month() === selectedMonth && now.year() === selectedYear;

                let filteredData = json;
                if (isCurrentMonth) {
                    filteredData = json.filter((d: any) => dayjs(d.date).date() <= now.date());
                }

                // Transform visual display of date
                const processed = filteredData.map((d: any) => ({
                    ...d,
                    displayDate: dayjs(d.date).format('DD'),
                }));

                setData(processed);
            }
        } catch (error) {
            console.error('Failed to fetch wallet chart data', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedMonth, selectedYear]);

    return (
        <Card
            className="glass-card border-0 shadow-sm mb-6"
            styles={{ body: { padding: '24px', width: '100%' } }}
        >
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-zinc-700 dark:text-zinc-200">
                        Wallet Activity
                    </h3>
                    <p className="text-zinc-400 text-sm">
                        Daily credits & debits for {MONTHS[selectedMonth]} {selectedYear}
                    </p>
                </div>

                <Space wrap>
                    <Select
                        value={selectedMonth}
                        onChange={setSelectedMonth}
                        className="w-32"
                        variant="borderless"
                        options={MONTHS.map((m, i) => ({ label: m, value: i }))}
                    />
                    <Select
                        value={selectedYear}
                        onChange={setSelectedYear}
                        className="w-24"
                        variant="borderless"
                        options={Array.from({ length: 5 }, (_, i) => ({
                            label: dayjs().year() - i,
                            value: dayjs().year() - i
                        }))}
                    />
                </Space>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-[250px]">
                    <Spin size="large" />
                </div>
            ) : (
                <div style={{ width: '100%', height: 250 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorDebits" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis
                                dataKey="displayDate"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                                dy={10}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#a1a1aa', fontSize: 12 }}
                                tickFormatter={(val: any) => `$${val}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                }}
                                formatter={(value) => [`$${(value as number)?.toFixed(2) ?? '0.00'}`]}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="credits"
                                name="Credits"
                                stroke="#10b981"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorCredits)"
                            />
                            <Area
                                type="monotone"
                                dataKey="debits"
                                name="Debits"
                                stroke="#ef4444"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorDebits)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
