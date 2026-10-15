'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Table, Card, Tag, Modal, Tabs, List, Space, Typography, Spin, Empty, Button } from 'antd';
import { Eye, Download } from 'lucide-react';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import weekday from 'dayjs/plugin/weekday';
import * as XLSX from 'xlsx';

dayjs.extend(localeData);
dayjs.extend(weekday);

interface DailyStats {
    date: string;
    orders: number;
    revenue: number;
    cost: number;
    profit: number;
}

interface DailyBreakdownTableProps {
    startDate: string;
    endDate: string;
    sellerId: string | null;
    status: string | null;
}

export default function DailyBreakdownTable({ startDate, endDate, sellerId, status }: DailyBreakdownTableProps) {
    const [data, setData] = useState<DailyStats[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [dailyDetails, setDailyDetails] = useState<{ orders: any[], transactions: any[] }>({ orders: [], transactions: [] });

    // Fetch details for a specific date
    const fetchDailyDetails = async (date: string) => {
        setModalLoading(true);
        setSelectedDate(date);
        setIsModalOpen(true);
        try {
            // Include filters in detail fetch too if appropriate? 
            // The modal is "Daily Details", it usually implies "Show me everything for this day".
            // BUT if the user filtered by Seller A in the main table, clicking "View" should probably 
            // only show Seller A's orders for that day?
            // Yes, let's pass the filters.
            const params = new URLSearchParams({ date });
            if (sellerId) params.append('sellerId', sellerId);
            if (status) params.append('status', status);

            const res = await fetch(`/api/admin/reports/daily-details?${params.toString()}`);
            if (res.ok) {
                const json = await res.json();
                setDailyDetails(json);
            }
        } catch (error) {
            console.error('Failed to fetch daily details', error);
        } finally {
            setModalLoading(false);
        }
    };

    useEffect(() => {
        const fetchMonthlyStats = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ startDate, endDate });
                if (sellerId) params.append('sellerId', sellerId);
                if (status) params.append('status', status);

                const res = await fetch(`/api/admin/stats/monthly-financials?${params.toString()}`);
                if (res.ok) {
                    const json = await res.json();

                    // Sort descending by date
                    const sorted = json.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setData(sorted);
                }
            } catch (error) {
                console.error("Failed to fetch report data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchMonthlyStats();
    }, [startDate, endDate, sellerId, status]);

    // Calculate totals
    const totals = useMemo(() => {
        return {
            orders: data.reduce((acc, d) => acc + d.orders, 0),
            revenue: data.reduce((acc, d) => acc + d.revenue, 0),
            cost: data.reduce((acc, d) => acc + d.cost, 0),
            profit: data.reduce((acc, d) => acc + d.profit, 0)
        };
    }, [data]);

    // Export to Excel
    const exportToExcel = () => {
        const exportData = [
            ...data.map(d => ({
                'Date': dayjs(d.date).format('YYYY-MM-DD'),
                'Orders': d.orders,
                'Total Revenue': d.revenue,
                'Total Cost': d.cost,
                'Net Profit': d.profit
            })),
            {
                'Date': 'TOTAL',
                'Orders': totals.orders,
                'Total Revenue': totals.revenue,
                'Total Cost': totals.cost,
                'Net Profit': totals.profit
            }
        ];

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Financial Report');
        XLSX.writeFile(wb, `financial_report_${dayjs().format('YYYY-MM-DD')}.xlsx`);
    };

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (text: string) => dayjs(text).format('MMMM D, YYYY'),
            width: 150,
        },
        {
            title: 'Orders',
            dataIndex: 'orders',
            key: 'orders',
            align: 'center' as const,
            render: (val: number) => <Tag color="blue">{val}</Tag>,
        },
        {
            title: 'Total Revenue',
            dataIndex: 'revenue',
            key: 'revenue',
            align: 'right' as const,
            render: (val: number) => <span className="font-medium text-emerald-600">${val?.toFixed(2) || '0.00'}</span>,
        },
        {
            title: 'Total Cost',
            dataIndex: 'cost',
            key: 'cost',
            align: 'right' as const,
            render: (val: number) => <span className="text-zinc-500">${val?.toFixed(2) || '0.00'}</span>,
        },
        {
            title: 'Net Profit',
            dataIndex: 'profit',
            key: 'profit',
            align: 'right' as const,
            render: (val: number) => (
                <span className={`font-bold ${val >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    ${val?.toFixed(2) || '0.00'}
                </span>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: DailyStats) => (
                <Button
                    type="text"
                    icon={<Eye size={18} className="text-zinc-500 hover:text-blue-600" />}
                    onClick={() => fetchDailyDetails(record.date)}
                />
            )
        }
    ];

    return (
        <Card
            className="glass-card border-zinc-200 dark:border-zinc-800 shadow-sm"
            styles={{ body: { padding: 0 } }}
            title={
                <div className="flex justify-between items-center">
                    <span className="text-lg font-bold">Financial Report</span>
                    <Button
                        type="primary"
                        icon={<Download size={16} />}
                        onClick={exportToExcel}
                        className="bg-emerald-600 hover:bg-emerald-500"
                    >
                        Export Excel
                    </Button>
                </div>
            }
        >
            <Table
                dataSource={data}
                columns={columns}
                rowKey="date"
                loading={loading}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 600 }}
                summary={() => (
                    <Table.Summary fixed>
                        <Table.Summary.Row className="bg-zinc-100 dark:bg-zinc-800 font-bold">
                            <Table.Summary.Cell index={0}>
                                <span className="font-bold text-lg">TOTAL</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="center">
                                <Tag color="blue" className="text-base px-3">{totals.orders}</Tag>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="right">
                                <span className="font-bold text-emerald-600 text-base">${totals.revenue.toFixed(2)}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right">
                                <span className="text-zinc-500 text-base">${totals.cost.toFixed(2)}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                                <span className={`font-bold text-base ${totals.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    ${totals.profit.toFixed(2)}
                                </span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={5}></Table.Summary.Cell>
                        </Table.Summary.Row>
                    </Table.Summary>
                )}
            />

            <Modal
                title={
                    <div className="flex flex-col">
                        <span className="text-lg font-bold">Daily Details</span>
                        <span className="text-sm font-normal text-zinc-500">
                            {selectedDate ? dayjs(selectedDate).format('MMMM D, YYYY') : ''}
                        </span>
                    </div>
                }
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                width={800}
                centered
            >
                {modalLoading ? (
                    <div className="flex justify-center items-center py-12">
                        <Spin size="large" />
                    </div>
                ) : (
                    <Tabs
                        defaultActiveKey="1"
                        items={[
                            {
                                key: '1',
                                label: `Orders (${dailyDetails.orders.length})`,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto">
                                        {dailyDetails.orders.length > 0 ? (
                                            <Table
                                                dataSource={dailyDetails.orders}
                                                rowKey="id"
                                                pagination={false}
                                                size="small"
                                                columns={[
                                                    {
                                                        title: 'Code',
                                                        dataIndex: 'orderCode',
                                                        key: 'orderCode',
                                                        render: (val) => <span className="font-medium text-blue-600">#{val}</span>
                                                    },
                                                    {
                                                        title: 'Seller',
                                                        dataIndex: ['seller', 'name'],
                                                        key: 'seller',
                                                        render: (val, record) => (
                                                            <div className="flex flex-col">
                                                                <span className="text-zinc-700 font-medium">{val}</span>
                                                                <span className="text-xs text-zinc-400">{record.seller.code}</span>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        title: 'Items',
                                                        dataIndex: 'totalItems',
                                                        key: 'items',
                                                        align: 'center',
                                                        render: (val) => <Tag>{val}</Tag>
                                                    },
                                                    {
                                                        title: 'Amount',
                                                        dataIndex: 'totalAmount',
                                                        key: 'totalAmount',
                                                        align: 'right',
                                                        render: (val) => <span className="font-semibold">${val.toFixed(2)}</span>
                                                    },
                                                    {
                                                        title: 'Shipping',
                                                        dataIndex: 'shippingCost',
                                                        key: 'shippingCost',
                                                        align: 'right',
                                                        render: (val) => val > 0 ? <span className="text-orange-600">${val?.toFixed(2)}</span> : '-'
                                                    },
                                                    {
                                                        title: 'Status',
                                                        dataIndex: 'status',
                                                        key: 'status',
                                                        align: 'right',
                                                        render: (val) => <Tag color={val === 'FULFILLED' ? 'green' : 'orange'}>{val}</Tag>
                                                    }
                                                ]}
                                            />
                                        ) : (
                                            <Empty description="No orders on this day" />
                                        )}
                                    </div>
                                )
                            },
                            {
                                key: '2',
                                label: `Wallet Transactions (${dailyDetails.transactions.length})`,
                                children: (
                                    <div className="max-h-[500px] overflow-y-auto">
                                        {dailyDetails.transactions.length > 0 ? (
                                            <Table
                                                dataSource={dailyDetails.transactions}
                                                rowKey="id"
                                                pagination={false}
                                                size="small"
                                                columns={[
                                                    {
                                                        title: 'Type',
                                                        dataIndex: 'type',
                                                        key: 'type',
                                                        render: (val) => (
                                                            <Tag color={val === 'CREDIT' ? 'green' : 'red'}>
                                                                {val}
                                                            </Tag>
                                                        )
                                                    },
                                                    {
                                                        title: 'Seller',
                                                        dataIndex: ['seller', 'name'],
                                                        key: 'seller',
                                                    },
                                                    {
                                                        title: 'Reference',
                                                        dataIndex: 'refType',
                                                        key: 'refType',
                                                        render: (val, record) => (
                                                            <div className="flex flex-col text-xs">
                                                                <span>{val}</span>
                                                                <span className="text-zinc-400">{record.refId}</span>
                                                            </div>
                                                        )
                                                    },
                                                    {
                                                        title: 'Amount',
                                                        dataIndex: 'amount',
                                                        key: 'amount',
                                                        align: 'right',
                                                        render: (val, record) => (
                                                            <span className={`font-mono font-medium ${record.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>
                                                                {record.type === 'CREDIT' ? '+' : '-'}${val.toFixed(2)}
                                                            </span>
                                                        )
                                                    }
                                                ]}
                                            />
                                        ) : (
                                            <Empty description="No wallet transactions on this day" />
                                        )}
                                    </div>
                                )
                            }
                        ]}
                    />
                )}
            </Modal>
        </Card>
    );
}
