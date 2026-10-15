'use client';

import React, { useEffect, useState } from 'react';
import { DatePicker, Dropdown, Button } from 'antd';
import { CalendarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useRouter, useSearchParams } from 'next/navigation';

const { RangePicker } = DatePicker;

export type FilterType = 'today' | 'thisWeek' | 'thisMonth' | 'custom' | 'all';

export interface DateRangeFilterProps {
    className?: string;
    style?: React.CSSProperties;
}

export default function DateRangeFilter({ className, style }: DateRangeFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Initialize state from URL or defaults
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [showRangePicker, setShowRangePicker] = useState(false);

    useEffect(() => {
        const type = searchParams.get('period') as FilterType;
        if (type) {
            setFilterType(type);
            if (type === 'custom') {
                const start = searchParams.get('start');
                const end = searchParams.get('end');
                if (start && end) {
                    setCustomRange([dayjs(start), dayjs(end)]);
                    setShowRangePicker(true);
                }
            } else {
                setShowRangePicker(false);
            }
        } else {
            // Default to All Time if no filter is active
            const start = searchParams.get('start');
            const end = searchParams.get('end');
            if (!start || !end) {
                const startStr = dayjs('2000-01-01').startOf('day').toISOString();
                const endStr = dayjs().endOf('day').toISOString();

                const params = new URLSearchParams(searchParams.toString());
                params.set('period', 'all');
                params.set('start', startStr);
                params.set('end', endStr);
                router.replace(`?${params.toString()}`);
            } else {
                setFilterType('all');
                setShowRangePicker(false);
            }
        }
    }, [searchParams, router]);

    const updateUrl = (type: FilterType, range?: [Dayjs, Dayjs]) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('period', type);

        if (type === 'all') {
            params.set('start', dayjs('2000-01-01').startOf('day').toISOString());
            params.set('end', dayjs().endOf('day').toISOString());
            router.push(`?${params.toString()}`);
            return;
        }

        let startStr = '';
        let endStr = '';

        if (type === 'today') {
            startStr = dayjs().startOf('day').toISOString();
            endStr = dayjs().endOf('day').toISOString();
        } else if (type === 'thisWeek') {
            // Monday to Sunday
            startStr = dayjs().startOf('week').add(1, 'day').startOf('day').toISOString();
            endStr = dayjs().endOf('week').add(1, 'day').endOf('day').toISOString();
        } else if (type === 'thisMonth') {
            startStr = dayjs().startOf('month').toISOString();
            endStr = dayjs().endOf('month').toISOString();
        } else if (type === 'custom' && range) {
            startStr = range[0].startOf('day').toISOString();
            endStr = range[1].endOf('day').toISOString();
        }

        if (startStr && endStr) {
            params.set('start', startStr);
            params.set('end', endStr);
            router.push(`?${params.toString()}`);
        }
    };

    const handleFilterChange = (type: FilterType) => {
        setFilterType(type);
        if (type === 'custom') {
            setShowRangePicker(true);
        } else {
            setShowRangePicker(false);
            setCustomRange(null);
            updateUrl(type);
        }
    };

    const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
        if (dates && dates[0] && dates[1]) {
            const range: [Dayjs, Dayjs] = [dates[0], dates[1]];
            setCustomRange(range);
            updateUrl('custom', range);
        }
    };

    const getFilterLabel = () => {
        switch (filterType) {
            case 'today': return 'Today';
            case 'all': return 'All Time';
            case 'thisWeek': return 'This Week';
            case 'thisMonth': return 'This Month';
            case 'custom': return customRange
                ? `${customRange[0].format('MMM D')} - ${customRange[1].format('MMM D')}`
                : 'Custom';
            default: return 'All Time';
        }
    };

    const filterItems = [
        { key: 'today', label: 'Today' },
        { key: 'all', label: 'All Time' },
        { key: 'thisWeek', label: 'This Week' },
        { key: 'thisMonth', label: 'This Month' },
        { key: 'custom', label: 'Custom Range' },
    ];

    return (
        <div className={`flex items-center gap-2 ${className || ''}`} style={style}>
            <Dropdown
                menu={{
                    items: filterItems,
                    onClick: ({ key }) => handleFilterChange(key as FilterType)
                }}
                trigger={['click']}
            >
                <Button icon={<CalendarOutlined />} className="flex items-center gap-2">
                    {getFilterLabel()}
                </Button>
            </Dropdown>

            {showRangePicker && (
                <RangePicker
                    value={customRange}
                    onChange={handleRangeChange}
                    size="middle"
                />
            )}
        </div>
    );
}
