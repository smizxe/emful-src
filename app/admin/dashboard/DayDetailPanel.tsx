'use client';

import React, { useEffect, useState } from 'react';
import { Card, Spin, List, Typography, Tag, Empty, Divider, Statistic } from 'antd';
import { ShoppingOutlined, DollarOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

interface DayDetailPanelProps {
    selectedDate: string | null;
    activeMetric: 'Orders' | 'Wallet' | 'Releases';
}

interface DailyStats {
    totalOrders: number;
    totalRevenue: number;
    totalCost: number;
    netProfit: number;
    orders: any[];
    transactions: any[];
    jobs: any[];
}

export default function DayDetailPanel({ selectedDate, activeMetric }: DayDetailPanelProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DailyStats | null>(null);

    useEffect(() => {
        if (!selectedDate) return;

        console.log('DayDetailPanel: selectedDate changed to:', selectedDate); // Debug log

        const fetchDailyDetails = async () => {
            setLoading(true);
            try {
                // We'll need to create this API endpoint
                const res = await fetch(`/api/admin/stats/daily?date=${selectedDate}`);
                if (res.ok) {
                    const json = await res.json();
                    setData(json);
                } else {
                    setData(null);
                }
            } catch (error) {
                console.error("Failed to fetch daily stats", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDailyDetails();
    }, [selectedDate]);

    if (!selectedDate) {
        return (
            <Card className="glass-card h-full flex items-center justify-center">
                <Empty description="Select a date from the chart to view details" />
            </Card>
        );
    }

    const formattedDate = dayjs(selectedDate).format('MMMM D, YYYY');

    return (
        <Card className="glass-card h-full border-0 shadow-sm" styles={{ body: { padding: '24px', height: '100%' } }}>
            <div className="flex items-center gap-2 mb-6 text-zinc-500">
                <CalendarOutlined />
                <span className="font-medium">{formattedDate}</span>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spin />
                </div>
            ) : data ? (
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl">
                            <Statistic
                                title={<span className="text-purple-600 dark:text-purple-300 font-medium">Orders</span>}
                                value={data.totalOrders}
                                prefix={<ShoppingOutlined />}
                                styles={{ content: { color: '#9333ea', fontWeight: 'bold' } }}
                            />
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl">
                            <Statistic
                                title={<span className="text-emerald-600 dark:text-emerald-300 font-medium">Revenue</span>}
                                value={data.totalRevenue}
                                precision={2}
                                prefix="$"
                                styles={{ content: { color: '#10b981', fontWeight: 'bold' } }}
                            />
                        </div>
                    </div>

                    <Divider className="my-2" />

                    {/* Cost Breakdown */}
                    <div>
                        <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">Financials</h4>
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-zinc-600">Total Cost (Base + Ship)</span>
                            <span className="font-medium text-zinc-900">${data.totalCost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-zinc-600">Net Profit</span>
                            <span className={`font-bold ${data.netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                ${data.netProfit.toFixed(2)}
                            </span>
                        </div>
                    </div>

                    <Divider className="my-2" />

                    {/* Dynamic List based on Metric */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider m-0">
                                Recent {activeMetric}
                            </h4>
                            <span className="text-xs text-blue-500 cursor-pointer hover:underline">View All</span>
                        </div>
                        <div className="space-y-2">
                            {(activeMetric === 'Orders' ? data.orders : activeMetric === 'Wallet' ? data.transactions : data.jobs)
                                .slice(0, 5)
                                .map((item: any, idx: number) => {
                                    if (activeMetric === 'Orders') {
                                        return (
                                            <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-100 last:border-0">
                                                <div>
                                                    <div className="font-medium text-zinc-800">{item.orderCode}</div>
                                                    <div className="text-xs text-zinc-400">{item.seller?.name || 'Unknown'}</div>
                                                </div>
                                                <Tag color={item.status === 'COMPLETED' ? 'success' : 'processing'}>{item.status}</Tag>
                                            </div>
                                        );
                                    }
                                    if (activeMetric === 'Wallet') {
                                        return (
                                            <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-100 last:border-0">
                                                <div>
                                                    <div className="font-medium text-zinc-800">{item.type}</div>
                                                    <div className="text-xs text-zinc-400">{item.seller?.name || 'System'}</div>
                                                </div>
                                                <span className={item.amount >= 0 ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>
                                                    {item.amount >= 0 ? '+' : ''}${item.amount}
                                                </span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-100 last:border-0">
                                            <div>
                                                <div className="font-medium text-zinc-800">Job #{item.id.toString().slice(-4)}</div>
                                                <div className="text-xs text-zinc-400">Order: {item.order?.orderCode}</div>
                                            </div>
                                            <Tag color={item.status === 'COMPLETED' ? 'geekblue' : 'default'}>{item.status}</Tag>
                                        </div>
                                    );
                                })}
                        </div>
                        {((activeMetric === 'Orders' && data.orders.length === 0) ||
                            (activeMetric === 'Wallet' && data.transactions.length === 0) ||
                            (activeMetric === 'Releases' && data.jobs.length === 0)) && (
                                <div className="text-center text-zinc-400 py-4">No {activeMetric.toLowerCase()} today</div>
                            )}
                    </div>

                </div>
            ) : (
                <Empty description="No data for this date" />
            )}
        </Card>
    );
}
