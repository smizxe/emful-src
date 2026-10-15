'use client';

import React, { useEffect, useState } from 'react';
import { Table, Button, DatePicker, Card, Spin, Tag } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import * as XLSX from 'xlsx';
import SellerDetailModal from './SellerDetailModal';

const { RangePicker } = DatePicker;

interface SellerStat {
    sellerId: string;
    sellerName: string;
    sellerCode: string;
    email: string;
    totalTopUp: number;
    totalOrders: number;
    jobCancel: number;
    realOrders: number;
    totalCost: number;
    refund: number;
    realCost: number;
    balance: number;
}

interface Props {
    onSellerClick?: (sellerId: string) => void;
    externalDateRange?: [Dayjs, Dayjs] | null;
}

export default function SellerStatsTable({ onSellerClick, externalDateRange }: Props) {
    const [loading, setLoading] = useState(false);
    const [allStats, setAllStats] = useState<SellerStat | null>(null);
    const [sellers, setSellers] = useState<SellerStat[]>([]);
    const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        total: 0
    });

    // Modal state
    const [selectedSeller, setSelectedSeller] = useState<{ id: string; name: string; balance: number; totalTopUp: number } | null>(null);

    // ... (logic)


    // Sync with external date range
    useEffect(() => {
        if (externalDateRange !== undefined) {
            setDateRange(externalDateRange);
        }
    }, [externalDateRange]);

    const fetchStats = async (page = 1, pageSize = 20) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append('page', page.toString());
            params.append('limit', pageSize.toString());

            if (dateRange) {
                params.append('start', dateRange[0].startOf('day').toISOString());
                params.append('end', dateRange[1].endOf('day').toISOString());
            }
            const res = await fetch(`/api/admin/wallet/seller-stats?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setAllStats(data.all);
                setSellers(data.sellers);
                if (data.meta) {
                    setPagination({
                        current: data.meta.page,
                        pageSize: data.meta.limit,
                        total: data.meta.total
                    });
                }
            }
        } catch (error) {
            console.error('Failed to fetch seller stats', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats(1, pagination.pageSize); // Reset to page 1 on date change
    }, [dateRange]);

    const handleTableChange = (newPagination: any) => {
        fetchStats(newPagination.current, newPagination.pageSize);
    };

    // Export function needs to fetch ALL data if we want to export everything, 
    // OR just export current page? Usually users expect to export ALL.
    // To export ALL, we might need a separate API call without limit, or loop.
    // For now, let's keep it simple and just export what's loaded (User might complain).
    // Better: Add a "limit=10000" param for export.
    const exportToExcel = async () => {
        setLoading(true);
        try {
            // Fetch ALL for export
            const params = new URLSearchParams();
            params.append('limit', '10000'); // Fetch mostly all
            if (dateRange) {
                params.append('start', dateRange[0].startOf('day').toISOString());
                params.append('end', dateRange[1].endOf('day').toISOString());
            }

            const res = await fetch(`/api/admin/wallet/seller-stats?${params.toString()}`);
            if (!res.ok) throw new Error('Export fetch failed');

            const data = await res.json();
            const exportSellers = data.sellers;
            const exportAllStats = data.all;

            const exportData = [
                ...(exportAllStats ? [{
                    'Seller': 'ALL SELLERS',
                    'Total Top Up': exportAllStats.totalTopUp,
                    'Total Orders': exportAllStats.totalOrders,
                    'Job Cancel': exportAllStats.jobCancel,
                    'Real Orders': exportAllStats.realOrders,
                    'Total Cost': exportAllStats.totalCost,
                    'Refund': exportAllStats.refund,
                    'Real Cost': exportAllStats.realCost,
                    'Balance': exportAllStats.balance
                }] : []),
                ...exportSellers.map((s: any) => ({
                    'Seller': s.sellerName,
                    'Total Top Up': s.totalTopUp,
                    'Total Orders': s.totalOrders,
                    'Job Cancel': s.jobCancel,
                    'Real Orders': s.realOrders,
                    'Total Cost': s.totalCost,
                    'Refund': s.refund,
                    'Real Cost': s.realCost,
                    'Balance': s.balance
                }))
            ];

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Seller Statistics');

            const dateStr = dateRange
                ? `${dateRange[0].format('YYYY-MM-DD')}_to_${dateRange[1].format('YYYY-MM-DD')}`
                : 'all_time';
            XLSX.writeFile(wb, `seller_stats_${dateStr}.xlsx`);
        } catch (error) {
            console.error('Export error:', error);
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            title: 'SELLER',
            dataIndex: 'sellerName',
            key: 'sellerName',
            fixed: 'left' as const,
            width: 150,
            render: (name: string, record: SellerStat) => (
                <div
                    className={`cursor-pointer hover:text-blue-600 ${record.sellerId === 'ALL' ? 'font-bold text-lg' : ''}`}
                    onClick={() => {
                        if (record.sellerId !== 'ALL') {
                            setSelectedSeller({
                                id: record.sellerId,
                                name: record.sellerName,
                                balance: record.balance,
                                totalTopUp: record.totalTopUp
                            });
                            onSellerClick?.(record.sellerId);
                        }
                    }}
                >
                    {name}
                </div>
            )
        },
        {
            title: 'TOTAL TOP UP',
            dataIndex: 'totalTopUp',
            key: 'totalTopUp',
            align: 'right' as const,
            render: (val: number) => <span className="font-semibold text-emerald-600">${val.toFixed(2)}</span>
        },
        {
            title: 'TOTAL ORDERS',
            dataIndex: 'totalOrders',
            key: 'totalOrders',
            align: 'center' as const,
            render: (val: number) => <Tag color="blue">{val}</Tag>
        },
        {
            title: 'JOB CANCEL',
            dataIndex: 'jobCancel',
            key: 'jobCancel',
            align: 'center' as const,
            render: (val: number) => val > 0 ? <Tag color="red">{val}</Tag> : <span className="text-zinc-400">0</span>
        },
        {
            title: 'REAL ORDERS',
            dataIndex: 'realOrders',
            key: 'realOrders',
            align: 'center' as const,
            render: (val: number) => <Tag color="green">{val}</Tag>
        },
        {
            title: 'TOTAL COST',
            dataIndex: 'totalCost',
            key: 'totalCost',
            align: 'right' as const,
            render: (val: number) => <span className="font-medium">${val.toFixed(2)}</span>
        },
        {
            title: 'REFUND',
            dataIndex: 'refund',
            key: 'refund',
            align: 'right' as const,
            render: (val: number) => val > 0 ? <span className="text-orange-500">${val.toFixed(2)}</span> : <span className="text-zinc-400">$0.00</span>
        },
        {
            title: 'REAL COST',
            dataIndex: 'realCost',
            key: 'realCost',
            align: 'right' as const,
            render: (val: number) => <span className="font-semibold text-zinc-700 dark:text-zinc-300">${val.toFixed(2)}</span>
        },
        {
            title: 'BALANCE',
            dataIndex: 'balance',
            key: 'balance',
            align: 'right' as const,
            render: (val: number) => (
                <span className={`font-bold ${val >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    ${val.toFixed(2)}
                </span>
            )
        }
    ];

    // Combine ALL row + individual sellers
    const dataSource = allStats ? [allStats, ...sellers] : sellers;

    return (
        <Card
            title={<span className="text-lg font-bold">Seller Statistics</span>}
            extra={
                <div className="flex gap-2 items-center flex-wrap">
                    <RangePicker
                        value={dateRange}
                        onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                        allowClear
                        placeholder={['Start Date', 'End Date']}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => fetchStats(pagination.current, pagination.pageSize)} loading={loading}>
                        Refresh
                    </Button>
                    <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={exportToExcel}
                        className="bg-emerald-600 hover:bg-emerald-500"
                    >
                        Export Excel
                    </Button>
                </div>
            }
            className="glass-card mb-6"
        >
            <Table
                dataSource={dataSource}
                columns={columns}
                rowKey="sellerId"
                loading={loading}
                pagination={pagination}
                onChange={handleTableChange}
                scroll={{ x: 1200 }}
                rowClassName={(record) => record.sellerId === 'ALL' ? 'bg-zinc-100 dark:bg-zinc-800' : ''}
                className="glass-table"
            />

            {/* Seller Detail Modal */}
            <SellerDetailModal
                sellerId={selectedSeller?.id || null}
                sellerName={selectedSeller?.name || ''}
                sellerBalance={selectedSeller?.balance || 0}
                sellerTopUp={selectedSeller?.totalTopUp || 0}
                open={!!selectedSeller}
                onClose={() => setSelectedSeller(null)}
                dateRange={dateRange}
            />
        </Card>
    );
}
