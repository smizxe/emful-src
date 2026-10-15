'use client';

import React, { useMemo, useState } from 'react';
import { Table, Tag, Button, Space, Input, Select } from 'antd';
import { ReloadOutlined, SearchOutlined, DownOutlined, UpOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DateRangeFilter from '@/components/Shared/DateRangeFilter';
import { useRouter } from 'next/navigation';
import { getShippingStatusLabel } from '@/lib/shippingStatus';

interface OrderHistoryClientProps {
    initialOrders: any[];
}

export default function OrderHistoryClient({ initialOrders }: OrderHistoryClientProps) {
    const router = useRouter();
    const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

    const statusOptions = [
        { label: 'Ready to Ship', value: 'READY_TO_SHIP' },
        { label: 'Shipped', value: 'SHIPPED' },
        { label: 'Completed', value: 'COMPLETED' },
        { label: 'Cancelled', value: 'CANCELLED' }
    ];

    const filteredOrders = useMemo(() => {
        let filtered = [...initialOrders];

        if (selectedStatus.length > 0) {
            filtered = filtered.filter((order: any) => selectedStatus.includes(order.status));
        }

        if (searchText.trim()) {
            const term = searchText.toLowerCase();
            filtered = filtered.filter((order: any) =>
                order.orderCode.toLowerCase().includes(term) ||
                (order.jobs?.[0]?.recipientName || '').toLowerCase().includes(term)
            );
        }

        return filtered;
    }, [initialOrders, searchText, selectedStatus]);

    const handleExpandAll = () => {
        setExpandedRowKeys(filteredOrders.map((o: any) => o.id));
    };

    const handleCollapseAll = () => {
        setExpandedRowKeys([]);
    };

    const expandedRowRender = (record: any) => {
        // Assume first job holds the address info for the order
        const job = record.jobs?.[0] || {};

        const fullAddress = [
            job.address1,
            job.address2,
            job.city,
            job.state,
            job.zip,
            job.country
        ].filter(Boolean).join(', ');

        return (
            <div className="bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Col: Order Items */}
                    <div>
                        <h4 className="font-bold text-zinc-700 dark:text-zinc-300 mb-3 border-b pb-2">Order Items ({record.jobs.length})</h4>
                        <div className="space-y-4">
                            {record.jobs.map((j: any, index: number) => {
                                let designs: any[] = [];
                                try { designs = JSON.parse(j.designs || '[]'); } catch (e) { designs = []; }

                                return (
                                    <div key={j.id || index} className="p-3 bg-white dark:bg-black/40 rounded-lg border border-zinc-100 dark:border-zinc-800">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-zinc-800 dark:text-zinc-200">{j.sku}</div>
                                                <div className="text-sm text-zinc-500">{j.color} / {j.size}</div>
                                                <div className="text-sm font-medium mt-1">Qty: {j.qty}</div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                {designs.map((d: any, idx: number) => (
                                                    <a key={idx} href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
                                                        {d.location} Design
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Col: Stallion / Shipping Info */}
                    <div>
                        <h4 className="font-bold text-zinc-700 dark:text-zinc-300 mb-3 border-b pb-2">Stallion Shipping Info</h4>
                        <div className="bg-white dark:bg-black/40 p-4 rounded-lg border border-zinc-100 dark:border-zinc-800 space-y-3">
                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="text-zinc-500">Recipient:</span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">{job.recipientName}</span>

                                <span className="text-zinc-500">Phone:</span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">{job.phone || 'N/A'}</span>

                                <span className="text-zinc-500">Full Address:</span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200 break-words">{fullAddress}</span>

                                <span className="text-zinc-500">Country:</span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">{job.country}</span>
                            </div>

                            <div className="border-t border-dashed border-zinc-200 dark:border-zinc-700 my-3"></div>

                            <div className="grid grid-cols-[100px_1fr] gap-2 text-sm">
                                <span className="text-zinc-500">Carrier:</span>
                                <span className="font-semibold text-indigo-600">{record.carrier || 'Stallion Express'}</span>

                                <span className="text-zinc-500">Tracking:</span>
                                <span className="font-mono text-zinc-800 dark:text-zinc-200 select-all">{record.trackingNumber || 'N/A'}</span>

                                <span className="text-zinc-500">Shipping Status:</span>
                                <span className="font-medium text-zinc-800 dark:text-zinc-200">{getShippingStatusLabel(record.shippingStatus)}</span>

                                <span className="text-zinc-500">Shipping Cost:</span>
                                <span className="font-medium text-emerald-600">${record.shippingCost?.toFixed(2) || '0.00'}</span>
                            </div>

                            {record.trackingNumber && (
                                <div className="mt-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                    <Button
                                        type="dashed"
                                        size="small"
                                        block
                                        icon={<PrinterOutlined />}
                                        onClick={() => window.open(`https://stallionexpress.ca/tracking/?tracking=${record.trackingNumber}`, '_blank')}
                                    >
                                        Track on Stallion
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const columns = [
        {
            title: 'Order ID',
            dataIndex: 'orderCode',
            key: 'orderCode',
            render: (text: string) => <span className="font-bold text-zinc-700 dark:text-zinc-300">{text}</span>
        },
        {
            title: 'Recipient',
            dataIndex: 'recipientName',
            key: 'recipient',
            render: (_: any, r: any) => r.jobs?.[0]?.recipientName || 'N/A'
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text: string) => dayjs(text).format('DD/MM/YYYY HH:mm')
        },
        {
            title: 'Items',
            key: 'items',
            render: (_: any, r: any) => {
                const totalQty = r.jobs?.reduce((sum: number, job: any) => sum + (job.qty || 0), 0) || 0;
                return <Tag>{totalQty} items</Tag>;
            }
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'default';
                if (status === 'COMPLETED' || status === 'SHIPPED') color = 'success';
                if (status === 'READY_TO_SHIP') color = 'processing';
                if (status === 'CANCELLED') color = 'error';
                return <Tag color={color}>{status.replace('_', ' ')}</Tag>;
            }
        },
        {
            title: 'Shipping Status',
            dataIndex: 'shippingStatus',
            key: 'shippingStatus',
            render: (status: string | null) => {
                const shippingStatus = status || 'PENDING';
                let color = 'default';
                if (shippingStatus === 'DELIVERED') color = 'success';
                if (shippingStatus === 'IN_TRANSIT') color = 'processing';
                if (shippingStatus === 'RECEIVED') color = 'cyan';
                if (shippingStatus === 'EXCEPTION') color = 'error';
                if (shippingStatus === 'LABEL_CREATED') color = 'warning';
                return <Tag color={color}>{getShippingStatusLabel(shippingStatus)}</Tag>;
            }
        },
        {
            title: 'Tracking',
            dataIndex: 'trackingNumber',
            key: 'trackingNumber',
            render: (text: string | null) => text ? (
                <span className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{text}</span>
            ) : <span className="text-zinc-300">-</span>
        },
        {
            title: 'Total',
            dataIndex: 'totalAmount',
            key: 'total',
            render: (val: number) => <span className="font-bold text-emerald-600">${val?.toFixed(2)}</span>
        },
        {
            title: 'Ship Fee',
            dataIndex: 'shippingCost',
            key: 'shippingCost',
            render: (val: number) => val > 0 ? (
                <span className="text-zinc-500">${val?.toFixed(2)}</span>
            ) : <span className="text-zinc-300">-</span>
        }
    ];

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Order History</h1>
                <div className="flex gap-2">
                    <Button onClick={handleExpandAll} icon={<DownOutlined />}>Expand All</Button>
                    <Button onClick={handleCollapseAll} icon={<UpOutlined />}>Collapse All</Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4 items-center bg-white dark:bg-zinc-900 p-3 rounded-lg shadow-sm border border-zinc-100 dark:border-zinc-800">
                <Input
                    placeholder="Search Order ID / Recipient..."
                    prefix={<SearchOutlined />}
                    onChange={e => setSearchText(e.target.value)}
                    className="w-full sm:w-64"
                />
                <Select
                    mode="multiple"
                    placeholder="Filter Status"
                    style={{ minWidth: 200 }}
                    options={statusOptions}
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                    maxTagCount="responsive"
                    allowClear
                />
                <DateRangeFilter />
                <Button icon={<ReloadOutlined />} onClick={() => router.refresh()} type="primary" ghost>
                    Refresh
                </Button>
            </div>

            <div className="bg-white dark:bg-[#141414] rounded-xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
                <Table
                    dataSource={filteredOrders}
                    columns={columns}
                    rowKey="id"
                    expandable={{
                        expandedRowRender,
                        expandedRowKeys,
                        onExpand: (expanded, record: any) => {
                            if (expanded) setExpandedRowKeys(prev => [...prev, record.id]);
                            else setExpandedRowKeys(prev => prev.filter(k => k !== record.id));
                        }
                    }}
                    className="glass-table"
                />
            </div>
        </div>
    );
}
