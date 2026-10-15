'use client';

import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Spin, Modal, Button, Empty } from 'antd';
import { Eye } from 'lucide-react';
import dayjs from 'dayjs';

interface ProductionStats {
    date: string;
    totalOrders: number;
    received: number; // Received/Paid
    processing: number; // In Process
    shipped: number; // Shipped/Completed
    cancelled: number; // Cancelled/Rejected
}

interface ProductionReportProps {
    startDate: string;
    endDate: string;
    sellerId: string | null;
    status: string | null;
}

export default function ProductionReport({ startDate, endDate, sellerId, status }: ProductionReportProps) {
    const [data, setData] = useState<ProductionStats[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [dailyDetails, setDailyDetails] = useState<{ orders: any[] }>({ orders: [] });

    const fetchDailyDetails = async (date: string) => {
        setModalLoading(true);
        setSelectedDate(date);
        setIsModalOpen(true);
        try {
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
        const fetchData = async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ startDate, endDate });
                if (sellerId) params.append('sellerId', sellerId);
                if (status) params.append('status', status);

                const res = await fetch(`/api/admin/stats/monthly-production?${params.toString()}`);
                if (res.ok) {
                    const json = await res.json();
                    const sorted = json.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    setData(sorted);
                }
            } catch (error) {
                console.error("Failed to fetch production stats", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [startDate, endDate, sellerId, status]);

    const columns = [
        {
            title: 'Date',
            dataIndex: 'date',
            key: 'date',
            render: (text: string) => dayjs(text).format('MMMM D, YYYY'),
            width: 200,
        },
        {
            title: 'Total Orders',
            dataIndex: 'totalOrders',
            key: 'totalOrders',
            align: 'center' as const,
            render: (val: number) => <span className="font-bold">{val}</span>,
        },
        {
            title: 'Received',
            dataIndex: 'received',
            key: 'received',
            align: 'center' as const,
            render: (val: number) => (val > 0 ? <Tag color="blue">{val}</Tag> : <span className="text-zinc-300">-</span>),
        },
        {
            title: 'Processing',
            dataIndex: 'processing',
            key: 'processing',
            align: 'center' as const,
            render: (val: number) => (val > 0 ? <Tag color="orange">{val}</Tag> : <span className="text-zinc-300">-</span>),
        },
        {
            title: 'Shipped / Completed',
            dataIndex: 'shipped',
            key: 'shipped',
            align: 'center' as const,
            render: (val: number) => (val > 0 ? <Tag color="green">{val}</Tag> : <span className="text-zinc-300">-</span>),
        },
        {
            title: 'Cancelled / Rejected',
            dataIndex: 'cancelled',
            key: 'cancelled',
            align: 'center' as const,
            render: (val: number) => (val > 0 ? <Tag color="red">{val}</Tag> : <span className="text-zinc-300">-</span>),
        },
        {
            title: 'Action',
            key: 'action',
            width: 80,
            align: 'center' as const,
            render: (_: any, record: ProductionStats) => (
                <Button
                    type="text"
                    icon={<Eye size={18} className="text-zinc-500 hover:text-blue-600" />}
                    onClick={() => fetchDailyDetails(record.date)}
                />
            )
        }
    ];

    return (
        <Card className="glass-card border-zinc-200 dark:border-zinc-800 shadow-sm" styles={{ body: { padding: 0 } }}>
            <Table
                dataSource={data}
                columns={columns}
                rowKey="date"
                loading={loading}
                pagination={{ pageSize: 15 }}
                scroll={{ x: 800 }}
            />

            <Modal
                title={
                    <div className="flex flex-col">
                        <span className="text-lg font-bold">Production Details</span>
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
                                        title: 'Created At',
                                        dataIndex: 'createdAt',
                                        key: 'createdAt',
                                        render: (val) => <span className="text-zinc-500">{dayjs(val).format('HH:mm')}</span>
                                    },
                                    {
                                        title: 'Amount',
                                        dataIndex: 'totalAmount',
                                        key: 'totalAmount',
                                        align: 'right',
                                        render: (val) => <span className="font-semibold">${val?.toFixed(2)}</span>
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
                                        render: (val) => {
                                            let color = 'default';
                                            if (val === 'COMPLETED' || val === 'SHIPPED') color = 'green';
                                            else if (val === 'IN_PROCESS') color = 'orange';
                                            else if (val === 'CANCELLED' || val === 'REJECTED') color = 'red';
                                            else if (val === 'RECEIVED' || val === 'PAID') color = 'blue';

                                            return <Tag color={color}>{val}</Tag>;
                                        }
                                    }
                                ]}
                            />
                        ) : (
                            <Empty description="No orders found for this day" />
                        )}
                    </div>
                )}
            </Modal>
        </Card>
    );
}
