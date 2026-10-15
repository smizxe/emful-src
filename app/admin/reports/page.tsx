'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { DatePicker, Typography, Space, Tabs, Button, Segmented, Select } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import DailyBreakdownTable from './DailyBreakdownTable';
import ProductionReport from './ProductionReport';

const { RangePicker } = DatePicker;

type RangeValue = [Dayjs | null, Dayjs | null] | null;

// Quick filter presets
// Quick filter presets
const getPresetRanges = (): Record<string, [Dayjs, Dayjs]> => {
    const today = dayjs();
    return {
        'All Time': [dayjs('2026-01-01').startOf('year'), today.endOf('day')],
        'Today': [dayjs().startOf('day'), today.endOf('day')],
        'Last 7 Days': [today.subtract(6, 'day').startOf('day'), today.endOf('day')], // Inclusive 7 days
        'This Month': [today.startOf('month'), today.endOf('day')],
        'Last Month': [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')],
        'Last 30 Days': [today.subtract(29, 'day').startOf('day'), today.endOf('day')], // Inclusive 30 days
    };
};

export default function ReportsPage() {
    const today = dayjs();

    // Default: This Month (start of month to today)
    const [dateRange, setDateRange] = useState<RangeValue>([
        today.startOf('month'),
        today.endOf('day')
    ]);

    const [sellers, setSellers] = useState<{ id: string; name: string; code: string }[]>([]);
    const [selectedSeller, setSelectedSeller] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

    // Fetch sellers on mount
    useEffect(() => {
        const fetchSellers = async () => {
            try {
                const res = await fetch('/api/admin/sellers');
                if (res.ok) {
                    const data = await res.json();
                    setSellers(data);
                }
            } catch (error) {
                console.error('Failed to fetch sellers', error);
            }
        };
        fetchSellers();
    }, []);

    // Use ISO timestamps to preserve timezone info for server-side parsing
    const startDate = dateRange?.[0]?.startOf('day').toISOString() || today.startOf('month').toISOString();
    const endDate = dateRange?.[1]?.endOf('day').toISOString() || today.endOf('day').toISOString();

    const presetRanges = useMemo(() => getPresetRanges(), []);

    // Disable future dates
    const disabledDate = (current: Dayjs) => {
        return current && current > dayjs().endOf('day');
    };

    const items = [
        {
            key: 'financial',
            label: 'Financial Report',
            children: <DailyBreakdownTable startDate={startDate} endDate={endDate} sellerId={selectedSeller} status={selectedStatus} />,
        },
        {
            key: 'production',
            label: 'Production Report',
            children: <ProductionReport startDate={startDate} endDate={endDate} sellerId={selectedSeller} status={selectedStatus} />,
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent m-0">
                        Detailed Reports
                    </h1>
                    <p className="text-zinc-500 mt-1">
                        Filter by date, seller, and order status.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap">
                    {/* Quick Filter Buttons */}
                    <div className="flex gap-2 flex-wrap justify-center">
                        {Object.entries(presetRanges).map(([label, range]) => (
                            <Button
                                key={label}
                                size="small"
                                type={
                                    dateRange?.[0]?.isSame(range[0], 'day') &&
                                        dateRange?.[1]?.isSame(range[1], 'day')
                                        ? 'primary'
                                        : 'default'
                                }
                                onClick={() => setDateRange(range)}
                                className="text-xs"
                            >
                                {label}
                            </Button>
                        ))}
                    </div>

                    {/* Date Range Picker */}
                    <RangePicker
                        value={dateRange}
                        onChange={(dates) => setDateRange(dates)}
                        disabledDate={disabledDate}
                        size="large"
                        format="MMM D, YYYY"
                        className="min-w-[240px]"
                        allowClear={false}
                    />

                    {/* Seller Filter */}
                    <Select
                        placeholder="All Sellers"
                        value={selectedSeller}
                        onChange={setSelectedSeller}
                        allowClear
                        showSearch
                        optionFilterProp="children"
                        className="w-[200px]"
                        size="large"
                        options={sellers.map((s) => ({ label: `${s.name} (${s.code})`, value: s.id }))}
                    />

                    {/* Status Filter */}
                    <Select
                        placeholder="All Statuses"
                        value={selectedStatus}
                        onChange={setSelectedStatus}
                        allowClear
                        className="w-[160px]"
                        size="large"
                        options={[
                            { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
                            { label: 'Received / Paid', value: 'RECEIVED' },
                            { label: 'In Process', value: 'IN_PROCESS' },
                            { label: 'Ready to Ship', value: 'READY_TO_SHIP' },
                            { label: 'Shipped', value: 'SHIPPED' },
                            { label: 'Completed', value: 'COMPLETED' },
                            { label: 'Cancelled', value: 'CANCELLED' },
                            { label: 'Rejected', value: 'REJECTED' },
                        ]}
                    />
                </div>
            </div>

            <Tabs defaultActiveKey="financial" items={items} type="card" className="glass-tabs" />
        </div>
    );
}
