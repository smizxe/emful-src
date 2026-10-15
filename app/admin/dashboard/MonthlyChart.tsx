
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
} from 'recharts';
import { Card, Spin, Select, Segmented, Space } from 'antd';
import dayjs from 'dayjs';

interface ChartData {
    date: string;
    wallet: number;
    orders: number;
    releases: number;
    displayDate: string;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

interface MonthlyChartProps {
    onDateSelect?: (date: string) => void;
    selectedDate?: string | null;
    activeMetric: 'Orders' | 'Wallet' | 'Releases';
    setActiveMetric: (metric: 'Orders' | 'Wallet' | 'Releases') => void;
}

export default function MonthlyChart({ onDateSelect, selectedDate, activeMetric, setActiveMetric }: MonthlyChartProps) {
    const [data, setData] = useState<ChartData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(dayjs().month());
    const [selectedYear, setSelectedYear] = useState(dayjs().year());


    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/stats/monthly?month=${selectedMonth}&year=${selectedYear}`);
            if (res.ok) {
                const json = await res.json();

                // Filter logic: If current month, show only up to today
                const now = dayjs();
                const isCurrentMonth = now.month() === selectedMonth && now.year() === selectedYear;

                let filteredData = json;
                if (isCurrentMonth) {
                    filteredData = json.filter((d: any) => dayjs(d.date).date() <= now.date());
                }

                // Transform visual display of date (e.g. "09")
                const processed = filteredData.map((d: any) => ({
                    ...d,
                    displayDate: dayjs(d.date).format('DD'),
                }));

                setData(processed);
            }
        } catch (error) {
            console.error('Failed to fetch monthly stats', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Reset selected date logic could go here if we wanted to clear selection on month change
    }, [selectedMonth, selectedYear]);

    // Configuration for Pastel Theme
    const config = {
        Orders: { color: '#a8a4e6', name: 'Daily Orders', gradient: ['#a8a4e6', '#e0defc'] }, // Soft Purple
        Wallet: { color: '#9fd3c7', name: 'Daily Wallet', gradient: ['#9fd3c7', '#dcf5ef'] }, // Soft Teal
        Releases: { color: '#f7b7a3', name: 'Product Releases', gradient: ['#f7b7a3', '#ffe4db'] }  // Soft Coral
    };

    const currentConfig = config[activeMetric];

    // Custom dot component (Visual only - renders on all data points)
    const CustomDot = (props: any) => {
        const { cx, cy, payload } = props;

        const handleClick = (e: any) => {
            e.stopPropagation();
            if (payload && payload.date) {
                console.log('Dot clicked! Date:', payload.date);
                if (onDateSelect) onDateSelect(payload.date);
            }
        };

        return (
            <circle
                cx={cx}
                cy={cy}
                r={5}
                fill={currentConfig.color}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={handleClick}
            />
        );
    };

    // Custom Active Dot component (Renders when hovering)
    const CustomActiveDot = (props: any) => {
        const { cx, cy, payload } = props;

        const handleClick = (e: any) => {
            e.stopPropagation();
            if (payload && payload.date) {
                console.log('Active Dot clicked! Date:', payload.date);
                if (onDateSelect) onDateSelect(payload.date);
            }
        };

        return (
            <circle
                cx={cx}
                cy={cy}
                r={8}
                fill={currentConfig.color}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor: 'pointer' }}
                onClick={handleClick}
            />
        );
    };



    // Custom Cursor component (Handles click on vertical space)
    const CustomCursor = (props: any) => {
        const { x, y, width, height, payload } = props;

        const handleClick = () => {
            if (payload && payload.length > 0) {
                const date = payload[0].payload.date;
                console.log('Cursor clicked! Date:', date);
                if (onDateSelect) onDateSelect(date);
            }
        };

        return (
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={handleClick}
            />
        );
    };

    return (
        <Card
            className="glass-card border-0 shadow-sm"
            styles={{ body: { padding: '24px', width: '100%' } }}
        >
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-zinc-700 dark:text-zinc-200">
                        Performance Overview
                    </h3>
                    <p className="text-zinc-400 text-sm">Monthly analytics for {MONTHS[selectedMonth]} {selectedYear}</p>
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
                    <div className="bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                        <Segmented
                            options={['Orders', 'Wallet', 'Releases']}
                            value={activeMetric}
                            onChange={(val: any) => setActiveMetric(val)}
                            className="bg-transparent"
                        />
                    </div>
                </Space>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-[350px]">
                    <Spin size="large" />
                </div>
            ) : (
                <div
                    style={{ width: '100%', height: 350, outline: 'none' }}
                    className="outline-none"
                    tabIndex={-1}
                >
                    <style jsx global>{`
                        /* Aggressively remove all outlines for this chart */
                        .recharts-wrapper,
                        .recharts-surface,
                        .recharts-responsive-container,
                        .recharts-layer,
                        .recharts-tooltip-cursor,
                        div[class^="recharts-"],
                        svg.recharts-surface {
                            outline: none !important;
                            border: none !important;
                            box-shadow: none !important;
                        }
                        
                        /* Remove focus rings specifically */
                        *:focus, *:focus-visible {
                            outline: none !important;
                            box-shadow: none !important;
                        }
                    `}</style>
                    <ResponsiveContainer width="100%" height="100%" className="[&_path]:outline-none [&_svg]:outline-none" id="chart-container">
                        <AreaChart
                            data={data}
                            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={currentConfig.color} stopOpacity={0.4} />
                                    <stop offset="95%" stopColor={currentConfig.color} stopOpacity={0} />
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
                                tickFormatter={(val: any) => activeMetric === 'Wallet' ? `$${val}` : val}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                }}
                                itemStyle={{ color: currentConfig.color, fontWeight: 600 }}
                                cursor={<CustomCursor />} /* Use Custom Cursor for interaction */
                            />
                            <Area
                                type="monotone"
                                dataKey={activeMetric.toLowerCase()}
                                stroke={currentConfig.color}
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorMetric)"
                                dot={<CustomDot />}
                                activeDot={<CustomActiveDot />}
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
