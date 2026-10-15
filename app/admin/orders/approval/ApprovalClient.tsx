'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Table, Button, Modal, message, Space, Input, Tag, App } from 'antd';
import { CheckOutlined, CloseOutlined, UserOutlined, ShoppingOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { formatDateTimeInTimeZone } from '@/lib/dateTime';

interface Job {
    id: string;
    sku: string;
    color: string;
    size: string;
    qty: number;
    priceToCharge: number;
    shippingCost?: number;
    extraFees?: number;
    recipientName: string;
    address1: string;
    address2: string | null;
    city: string;
    state: string;
    zip: string;
    country: string;
    designs: string;
    designPosition: string;
    mockupLinks: string | null;
    designLinks: string | null;
    status: string;
}

interface Order {
    id: string;
    orderCode: string;
    status: string;
    totalAmount: number;
    priorityProduction?: boolean;
    priorityShipping?: boolean;
    priorityProductionFee?: number;
    priorityShippingFee?: number;
    createdAt: string;
    jobs: Job[];
    seller?: {
        id: string;
        name: string;
    };
}

interface SellerGroup {
    sellerId: string;
    sellerName: string;
    orders: Order[];
    totalAmount: number;
    orderCount: number;
    latestCreatedAt: string;
}

const getOrderPriorityFee = (order: Order) => (
    (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
    + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0)
);

const getOrderGrandTotal = (order: Order) => Number((
    order.jobs.reduce(
        (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
        0
    ) + getOrderPriorityFee(order)
).toFixed(2));

export default function ApprovalClient({
    orders: initialOrders,
    businessTimeZone,
    approveEndpoint = '/api/admin/orders/approve'
}: {
    orders: any[];
    businessTimeZone: string;
    approveEndpoint?: string;
}) {
    const router = useRouter();
    const { modal, message } = App.useApp(); // Use hook instead of static methods
    const { t } = useLanguage();

    // Data State
    const [orders, setOrders] = useState<Order[]>(initialOrders);
    const [loading, setLoading] = useState(false);
    const [selectedOrderKeys, setSelectedOrderKeys] = useState<React.Key[]>([]);
    const [expandedSellerKeys, setExpandedSellerKeys] = useState<React.Key[]>([]);

    // Rejection State
    const [rejectModalVisible, setRejectModalVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    useEffect(() => {
        setOrders(initialOrders);
    }, [initialOrders]);

    // Override Ant Design sorted column background which causes dark mode issues
    const sortParamsCss = `
        /* Default Sort Background Fix */
        .glass-table .ant-table-column-sort {
            background: transparent !important;
        }
        .dark .glass-table .ant-table-column-sort {
            background: transparent !important;
        }
        
        /* Hover State Fix for Sortable Headers */
        .glass-table .ant-table-thead th.ant-table-column-has-sorters:hover {
            background: rgba(0, 0, 0, 0.05) !important;
        }
        .dark .glass-table .ant-table-thead th.ant-table-column-has-sorters:hover {
            background: rgba(255, 255, 255, 0.05) !important;
        }

        /* Active Sort State Fix */
        .glass-table .ant-table-thead th.ant-table-column-sort {
            background: rgba(0, 0, 0, 0.02) !important;
        }
        .dark .glass-table .ant-table-thead th.ant-table-column-sort {
            background: rgba(255, 255, 255, 0.02) !important;
        }

        /* Ensure specific columns don't get the gray background */
        td.ant-table-column-sort {
            background-color: transparent !important;
        }
    `;

    // Group orders by seller
    const sellerGroups: SellerGroup[] = useMemo(() => {
        const grouped = new Map<string, SellerGroup>();

        // Sort orders by date (newest first) before grouping
        const sortedOrders = [...orders].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        for (const order of sortedOrders) {
            const sellerId = order.seller?.id || 'unknown';
            const sellerName = order.seller?.name || 'Unknown Seller';

            if (!grouped.has(sellerId)) {
                grouped.set(sellerId, {
                    sellerId,
                    sellerName,
                    orders: [],
                    totalAmount: 0,
                    orderCount: 0,
                    latestCreatedAt: order.createdAt
                });
            }

            const group = grouped.get(sellerId)!;
            group.orders.push(order);
            group.totalAmount += getOrderGrandTotal(order);
            group.orderCount += 1;
            if (new Date(order.createdAt).getTime() > new Date(group.latestCreatedAt).getTime()) {
                group.latestCreatedAt = order.createdAt;
            }
        }

        // Sort groups by total amount (desc) to prioritize larger orders
        return Array.from(grouped.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [orders]);

    const handleAction = (orderId: string, action: 'APPROVE' | 'REJECT') => {
        if (action === 'REJECT') {
            setSelectedOrderId(orderId);
            setRejectReason('');
            setRejectModalVisible(true);
            return;
        }

        modal.confirm({
            title: 'Are you sure you want to APPROVE this order?',
            content: 'Production process will start.',
            okText: 'Approve',
            okType: 'primary',
            onOk: async () => submitAction(orderId, 'APPROVE')
        });
    };

    const submitAction = async (orderId: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
        try {
            setLoading(true);
            const res = await fetch(approveEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, action, rejectionReason: reason }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            message.success(`Order ${action}D successfully`);
            setOrders(prev => prev.filter(o => o.id !== orderId));
            setSelectedOrderKeys(prev => prev.filter(k => k !== orderId));
            router.refresh();
            setRejectModalVisible(false);
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBulkApprove = (orderIds?: React.Key[]) => {
        const idsToApprove = orderIds || selectedOrderKeys;
        if (idsToApprove.length === 0) return;

        modal.confirm({
            title: `Approve ${idsToApprove.length} orders?`,
            content: 'This will start production for all selected orders.',
            okText: 'Approve All',
            okType: 'primary',
            onOk: async () => {
                setLoading(true);
                try {
                    for (const id of idsToApprove) {
                        try {
                            const res = await fetch(approveEndpoint, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: id, action: 'APPROVE' }),
                            });
                            if (!res.ok) console.error(`Failed to approve ${id}`);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    message.success('Bulk approval process completed');
                    setOrders(prev => prev.filter(o => !idsToApprove.includes(o.id)));
                    setSelectedOrderKeys([]);
                    router.refresh();
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleApproveAllForSeller = (sellerId: string) => {
        const sellerOrders = orders.filter(o => (o.seller?.id || 'unknown') === sellerId);
        const orderIds = sellerOrders.map(o => o.id);
        handleBulkApprove(orderIds);
    };

    const handleExpandAll = () => {
        setExpandedSellerKeys(sellerGroups.map(g => g.sellerId));
    };

    const handleCollapseAll = () => {
        setExpandedSellerKeys([]);
    };

    // Group Selection Logic
    const handleSelectSeller = (sellerId: string, selected: boolean) => {
        const group = sellerGroups.find(g => g.sellerId === sellerId);
        if (!group) return;

        const groupOrderIds = group.orders.map(o => o.id);

        if (selected) {
            // Add all group orders to selection, avoiding duplicates
            setSelectedOrderKeys(prev => {
                const current = new Set(prev);
                groupOrderIds.forEach(id => current.add(id));
                return Array.from(current);
            });
        } else {
            // Remove all group orders from selection
            setSelectedOrderKeys(prev => prev.filter(k => !groupOrderIds.includes(k as string)));
        }
    };

    // Check if a seller is fully selected, partially selected, or not selected
    const getSellerSelectionState = (sellerId: string) => {
        const group = sellerGroups.find(g => g.sellerId === sellerId);
        if (!group) return { checked: false, indeterminate: false };

        const groupOrderIds = group.orders.map(o => o.id);
        const selectedCount = groupOrderIds.filter(id => selectedOrderKeys.includes(id)).length;

        const allSelected = selectedCount === groupOrderIds.length && groupOrderIds.length > 0;
        const someSelected = selectedCount > 0 && selectedCount < groupOrderIds.length;

        return { checked: allSelected, indeterminate: someSelected };
    };

    // Order Detail Expansion (nested in seller expansion)
    const renderOrderDetails = (order: Order) => {
        return (
            <div className="bg-white/50 dark:bg-black/20 p-4 rounded-xl backdrop-blur-sm border border-zinc-200 dark:border-zinc-700">
                <h4 className="font-bold text-zinc-700 dark:text-zinc-300 mb-3">Order Items ({order.jobs.length})</h4>
                <div className="space-y-3">
                    {order.jobs.map((job: Job, index: number) => {
                        let designs: any[] = [];
                        try {
                            designs = JSON.parse(job.designs || '[]');
                        } catch (e) { designs = []; }

                        const fullAddress = [
                            job.address1,
                            job.address2,
                            job.city,
                            job.state,
                            job.zip,
                            job.country
                        ].filter(Boolean).join(', ');

                        return (
                            <div key={job.id || index} className="flex flex-col sm:flex-row justify-between items-start gap-4 p-3 bg-white/60 dark:bg-black/40 rounded-lg">
                                <div>
                                    <div className="font-semibold text-zinc-800 dark:text-zinc-200">{job.sku} - {job.color}/{job.size}</div>
                                    <div className="text-sm text-zinc-500 dark:text-zinc-400">Qty: {job.qty} | Price: ${job.priceToCharge}</div>
                                    <div className="text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-1">
                                        Ship to: <span className="text-zinc-800 dark:text-zinc-300">{job.recipientName}</span>
                                    </div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 break-all">
                                        {fullAddress}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 w-full sm:w-auto">
                                    {designs.map((d: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between gap-2 text-xs border border-zinc-200 dark:border-zinc-700 p-2 rounded bg-white/80 dark:bg-black/20">
                                            <span className="font-bold text-zinc-700 dark:text-zinc-300">{d.location}:</span>
                                            <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 underline truncate max-w-[150px]">
                                                View Design
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Inner orders table for each seller group
    const renderSellerOrders = (sellerGroup: SellerGroup) => {
        const orderColumns = [
            {
                title: 'ORDER CODE',
                dataIndex: 'orderCode',
                key: 'orderCode',
                sorter: (a: Order, b: Order) => a.orderCode.localeCompare(b.orderCode),
                render: (text: string) => <span className="font-bold text-zinc-800 dark:text-zinc-200">{text}</span>
            },
            {
                title: 'ITEMS',
                dataIndex: 'jobs',
                key: 'totalItems',
                render: (jobs: Job[]) => <span className="text-zinc-600 dark:text-zinc-400">{jobs.length} items</span>
            },
            {
                title: 'TOTAL',
                dataIndex: 'totalAmount',
                key: 'totalAmount',
                sorter: (a: Order, b: Order) => a.totalAmount - b.totalAmount,
                render: (_: number, record: Order) => <span className="font-bold text-emerald-600 dark:text-emerald-400">${getOrderGrandTotal(record).toFixed(2)}</span>
            },
            {
                title: 'DATE',
                dataIndex: 'createdAt',
                key: 'createdAt',
                sorter: (a: Order, b: Order) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                defaultSortOrder: 'descend' as const,
                render: (date: string) => (
                    <span className="text-zinc-500">
                        {formatDateTimeInTimeZone(date, businessTimeZone)}
                    </span>
                )
            },
            {
                title: 'ACTIONS',
                key: 'action',
                render: (_: any, record: Order) => (
                    <Space>
                        <Button
                            type="primary"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => handleAction(record.id, 'APPROVE')}
                            loading={loading}
                            className="bg-emerald-500 hover:bg-emerald-600 border-none shadow-md shadow-emerald-500/20"
                        >
                            Approve
                        </Button>
                        <Button
                            danger
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => handleAction(record.id, 'REJECT')}
                            loading={loading}
                        >
                            Reject
                        </Button>
                    </Space>
                )
            }
        ];

        return (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50">
                <Table
                    rowSelection={{
                        selectedRowKeys: selectedOrderKeys,
                        onChange: (keys) => setSelectedOrderKeys(keys),
                    }}
                    columns={orderColumns}
                    dataSource={sellerGroup.orders}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    expandable={{
                        expandedRowRender: renderOrderDetails,
                    }}
                    className="nested-order-table"
                />
            </div>
        );
    };

    // Main seller group columns
    const sellerColumns = [
        {
            title: <span><UserOutlined className="mr-2" />SELLER</span>,
            dataIndex: 'sellerName',
            key: 'sellerName',
            sorter: (a: SellerGroup, b: SellerGroup) => a.sellerName.localeCompare(b.sellerName),
            render: (name: string) => (
                <span className="font-bold text-zinc-800 dark:text-zinc-200 text-base">{name}</span>
            )
        },
        {
            title: <span><ShoppingOutlined className="mr-2" />PENDING ORDERS</span>,
            dataIndex: 'orderCount',
            key: 'orderCount',
            sorter: (a: SellerGroup, b: SellerGroup) => a.orderCount - b.orderCount,
            render: (count: number) => (
                <Tag color="blue" className="text-sm px-3 py-1">
                    {count} {count === 1 ? 'order' : 'orders'}
                </Tag>
            )
        },
        {
            title: 'TOTAL AMOUNT',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            sorter: (a: SellerGroup, b: SellerGroup) => a.totalAmount - b.totalAmount,
            defaultSortOrder: 'descend' as const,
            render: (val: number) => (
                <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">${val.toFixed(2)}</span>
            )
        },
        {
            title: 'DATE',
            dataIndex: 'latestCreatedAt',
            key: 'latestCreatedAt',
            sorter: (a: SellerGroup, b: SellerGroup) => (
                new Date(a.latestCreatedAt).getTime() - new Date(b.latestCreatedAt).getTime()
            ),
            render: (date: string) => (
                <span className="text-zinc-500 dark:text-zinc-400">
                    {formatDateTimeInTimeZone(date, businessTimeZone)}
                </span>
            )
        },
        {
            title: 'ACTIONS',
            key: 'action',
            render: (_: any, record: SellerGroup) => (
                <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    onClick={() => handleApproveAllForSeller(record.sellerId)}
                    loading={loading}
                    className="bg-emerald-500 hover:bg-emerald-600 border-none shadow-md shadow-emerald-500/20"
                >
                    Approve All ({record.orderCount})
                </Button>
            )
        }
    ];

    return (
        <div>
            <style>{sortParamsCss}</style>
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 dark:from-pink-300 dark:to-purple-400 bg-clip-text text-transparent">
                    Order Approval
                </h2>
                <Space>
                    <Button onClick={handleExpandAll} disabled={sellerGroups.length === 0}>
                        Expand All
                    </Button>
                    <Button onClick={handleCollapseAll} disabled={expandedSellerKeys.length === 0}>
                        Collapse All
                    </Button>
                    {selectedOrderKeys.length > 0 && (
                        <Button
                            type="primary"
                            icon={<CheckOutlined />}
                            onClick={() => handleBulkApprove()}
                            className="bg-emerald-600"
                            loading={loading}
                        >
                            Approve Selected ({selectedOrderKeys.length})
                        </Button>
                    )}
                </Space>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="glass-panel rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{sellerGroups.length}</div>
                    <div className="text-sm text-zinc-500">Sellers with Pending Orders</div>
                </div>
                <div className="glass-panel rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{orders.length}</div>
                    <div className="text-sm text-zinc-500">Total Pending Orders</div>
                </div>
                <div className="glass-panel rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        ${orders.reduce((sum, o) => sum + getOrderGrandTotal(o), 0).toFixed(2)}
                    </div>
                    <div className="text-sm text-zinc-500">Total Pending Amount</div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-1 overflow-hidden">
                <Table
                    rowSelection={{
                        onSelect: (record, selected) => handleSelectSeller(record.sellerId, selected),
                        onSelectAll: (selected, selectedRows, changeRows) => {
                            if (selected) {
                                // Select ALL sellers
                                const allOrderIds = orders.map(o => o.id);
                                setSelectedOrderKeys(allOrderIds);
                            } else {
                                setSelectedOrderKeys([]);
                            }
                        },
                        getCheckboxProps: (record) => {
                            const state = getSellerSelectionState(record.sellerId);
                            // Do not return 'checked' here as it conflicts with selectedRowKeys
                            return {
                                indeterminate: state.indeterminate
                            };
                        },
                        selectedRowKeys: sellerGroups.filter(g => getSellerSelectionState(g.sellerId).checked).map(g => g.sellerId),
                    }}
                    columns={sellerColumns}
                    dataSource={sellerGroups}
                    rowKey="sellerId"
                    expandable={{
                        expandedRowRender: renderSellerOrders,
                        expandedRowKeys: expandedSellerKeys,
                        onExpand: (expanded, record) => {
                            if (expanded) {
                                setExpandedSellerKeys(prev => [...prev, record.sellerId]);
                            } else {
                                setExpandedSellerKeys(prev => prev.filter(k => k !== record.sellerId));
                            }
                        }
                    }}
                    className="glass-table seller-grouped-table"
                    pagination={{ pageSize: 20 }}
                />
            </div>

            {/* Rejection Modal */}
            <Modal
                title="Reject Order"
                open={rejectModalVisible}
                onOk={() => {
                    if (!rejectReason.trim()) {
                        message.error('Please provide a reason for rejection');
                        return;
                    }
                    if (selectedOrderId) {
                        submitAction(selectedOrderId, 'REJECT', rejectReason);
                    }
                }}
                onCancel={() => setRejectModalVisible(false)}
                okText="Reject Order"
                okButtonProps={{ danger: true, loading: loading }}
            >
                <div>
                    <p className="mb-2 text-gray-500">Please provide a reason. The seller will see this message.</p>
                    <Input.TextArea
                        rows={4}
                        placeholder="e.g. Invalid shipping address, Model out of stock..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                    />
                </div>
            </Modal>
        </div>
    );
}
