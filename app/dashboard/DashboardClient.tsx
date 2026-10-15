'use client';

import React, { useState, useEffect } from 'react';
import { Row, Col, Button, Select, DatePicker, Card, Segmented, Spin, Switch } from 'antd';
import { useLanguage } from '@/components/Providers/LanguageContext';
import {
    ShoppingOutlined,
    DollarOutlined,
    ClockCircleOutlined,
    CustomerServiceOutlined,
    WalletOutlined,
    RiseOutlined
} from '@ant-design/icons';
import TopUpModal from './components/TopUpModal';
import SellerStats from '@/components/Dashboard/SellerStats';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { usePrefetchedRoutes } from '@/hooks/usePrefetchedRoutes';

interface DashboardClientProps {
    user: any;
    stats: any[];
}

export default function DashboardClient({ user, stats }: DashboardClientProps) {
    const { t } = useLanguage();
    const router = useRouter();
    const [topUpModalVisible, setTopUpModalVisible] = useState(false);
    // Filter State
    const [range, setRange] = useState<'day' | 'month' | 'year'>('month');
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Currency State
    const [currency, setCurrency] = useState<'USD' | 'VND'>('USD');
    const [exchangeRate, setExchangeRate] = useState(25000);
    const allOrdersHref = `/dashboard/orders?period=all&start=${encodeURIComponent(dayjs('2000-01-01').startOf('day').toISOString())}&end=${encodeURIComponent(dayjs().endOf('day').toISOString())}`;

    usePrefetchedRoutes([
        '/dashboard/orders',
        '/dashboard/wallet',
        '/dashboard/tickets',
        allOrdersHref,
    ]);

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.rate) setExchangeRate(data.rate);
            }
        } catch (error) {
            console.error('Failed to fetch settings', error);
        }
    };

    const fetchChartData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                range,
                date: selectedDate.toISOString()
            });
            const res = await fetch(`/api/dashboard/stats?${params}`);
            if (res.ok) {
                const data = await res.json();
                setChartData(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        fetchChartData();
    }, [range, selectedDate]);

    const formatCurrency = (value: number) => {
        if (currency === 'VND') {
            return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value * exchangeRate);
        }
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    const handleStatClick = (stat: any) => {
        // Use stat.key if available, fallback to title check for backward compatibility logic but moving to keys is better
        const key = stat.key || '';
        if (key === 'orders') {
            router.push(allOrdersHref);
        } else if (key === 'refunds') {
            // Land on the wallet showing ONLY refund entries.
            router.push('/dashboard/wallet?range=all&type=REFUND');
        } else if (key === 'totalTopUp') {
            router.push('/dashboard/wallet?range=all&type=CREDIT&refType=TOPUP');
        } else if (key === 'totalCost') {
            router.push('/dashboard/wallet?range=all&type=DEBIT');
        } else if (key === 'ordersPending') {
            router.push(allOrdersHref);
        } else if (key === 'unsolvedTickets') {
            router.push('/dashboard/tickets');
        } else if (key === 'awaitingPayment') {
            router.push('/dashboard/wallet?range=all');
        } else if (key === 'balance') {
            router.push('/dashboard/wallet?range=all');
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent m-0">
                    {t.sellerDashboard?.overview || 'Dashboard Overview'}
                </h2>

                <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-2 px-2 border-r border-zinc-200 dark:border-zinc-700 mr-2">
                        <span className={`text-xs font-bold ${currency === 'USD' ? 'text-blue-600' : 'text-zinc-400'}`}>USD</span>
                        <Switch
                            size="small"
                            checked={currency === 'VND'}
                            onChange={(checked) => setCurrency(checked ? 'VND' : 'USD')}
                        />
                        <span className={`text-xs font-bold ${currency === 'VND' ? 'text-blue-600' : 'text-zinc-400'}`}>VND</span>
                    </div>

                    <Segmented
                        options={[
                            { label: t.sellerDashboard?.hourly || 'Hourly', value: 'day' },
                            { label: t.sellerDashboard?.daily || 'Daily', value: 'month' },
                            { label: t.sellerDashboard?.monthly || 'Monthly', value: 'year' },
                        ]}
                        value={range}
                        onChange={(val: any) => setRange(val)}
                    />
                    <DatePicker
                        value={selectedDate}
                        onChange={(date) => setSelectedDate(date || dayjs())}
                        picker={range === 'day' ? 'date' : range}
                        allowClear={false}
                        className="w-32"
                    />
                </div>
            </div>

            <Row gutter={[24, 24]}>
                {stats.map((stat, index) => (
                    <Col xs={24} sm={12} md={8} lg={6} key={index}>
                        <div
                            className="glass-card rounded-2xl p-6 h-full flex flex-col justify-between group hover:translate-y-[-2px] transition-all duration-300 cursor-pointer"
                            onClick={() => handleStatClick(stat)}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">
                                        {t.sellerDashboard?.[stat.key as keyof typeof t.sellerDashboard] || stat.title}
                                    </p>
                                    <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                        {stat.prefix === '$' || stat.title.toLowerCase().includes('balance') || stat.title.toLowerCase().includes('spent') || stat.title.toLowerCase().includes('cost')
                                            ? formatCurrency(typeof stat.value === 'number' ? stat.value : parseFloat(String(stat.value).replace(/[^0-9.-]+/g, "")) || 0)
                                            : (stat.prefix || '') + (typeof stat.value === 'number' ? stat.value.toLocaleString('en-US') : stat.value)
                                        }
                                    </h3>
                                </div>
                                <div
                                    className="p-3 rounded-xl bg-opacity-10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
                                    style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
                                >
                                    {stat.icon}
                                </div>
                            </div>
                            {/* Check key instead of title */}
                            {(stat.key === 'balance' || stat.title === 'Your Balance') && (
                                <Button
                                    type="primary"
                                    block
                                    className="mt-4 bg-gradient-to-r from-sky-500 to-indigo-500 border-none hover:opacity-90 shadow-lg shadow-sky-500/20"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setTopUpModalVisible(true);
                                    }}
                                >
                                    {t.sellerDashboard?.topUpBalance || 'Top Up Balance'}
                                </Button>
                            )}
                        </div>
                    </Col>
                ))}
            </Row>

            <SellerStats allTime />

            <div className="mt-8 space-y-6">
                {/* Charts Row */}
                <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}>
                        <div className="glass-panel rounded-2xl p-6 h-[400px]">
                            <h3 className="text-lg font-bold mb-6 text-zinc-800 dark:text-zinc-200">{t.sellerDashboard?.ordersOverview || 'Orders Overview'}</h3>
                            {loading ? <div className="h-full flex items-center justify-center"><Spin /></div> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            cursor={{ stroke: '#1890ff', strokeWidth: 1, strokeDasharray: '5 5' }}
                                        />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <Area type="monotone" dataKey="orders" stroke="#1890ff" fillOpacity={1} fill="url(#colorOrders)" strokeWidth={3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </Col>

                    <Col xs={24} lg={12}>
                        <div className="glass-panel rounded-2xl p-6 h-[400px]">
                            <h3 className="text-lg font-bold mb-6 text-zinc-800 dark:text-zinc-200">{t.sellerDashboard?.costFulfillment || 'Cost of Fulfillment'}</h3>
                            {loading ? <div className="h-full flex items-center justify-center"><Spin /></div> : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={chartData}>
                                        <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis
                                            stroke="#888888"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => currency === 'VND'
                                                ? `${(value * exchangeRate / 1000000).toFixed(0)}M` // Abbreviate Millions for VND
                                                : `$${value}`
                                            }
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            formatter={(value: any) => [formatCurrency(value as number), 'Cost']}
                                        />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <Bar dataKey="cost" fill="#faad14" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </Col>

                    <Col xs={24}>
                        <div className="glass-panel rounded-2xl p-6 h-[350px]">
                            <h3 className="text-lg font-bold mb-6 text-zinc-800 dark:text-zinc-200">{t.sellerDashboard?.completedTrend || 'Completed Orders Trend'}</h3>
                            {loading ? <div className="h-full flex items-center justify-center"><Spin /></div> : (
                                <ResponsiveContainer width="100%" height={250}>
                                    <LineChart data={chartData}>
                                        <XAxis dataKey="label" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                        <RechartsTooltip
                                            contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                        <Line type="monotone" dataKey="completed" stroke="#52c41a" strokeWidth={3} dot={{ r: 4, fill: '#52c41a' }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </Col>
                </Row>
            </div>

            <TopUpModal
                visible={topUpModalVisible}
                onClose={() => setTopUpModalVisible(false)}
                userId={user.id}
            />
        </div>
    );
}
