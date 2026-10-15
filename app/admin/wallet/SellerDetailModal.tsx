'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Tabs, Table, Tag, Spin, Empty, Pagination, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import OrderDetailsModal from '@/app/dashboard/orders/OrderDetailsModal';

interface SellerDetailModalProps {
    sellerId: string | null;
    sellerName: string;
    sellerBalance: number;
    sellerTopUp: number;
    open: boolean;
    onClose: () => void;
    dateRange?: [Dayjs, Dayjs] | null;
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
    jobs: { recipientName: string; qty: number; priceToCharge?: number; shippingCost?: number; extraFees?: number }[];
}

interface Transaction {
    id: string;
    type: string;
    amount: number;
    displayAmount?: number | null;
    createdAt: string;
    note: string;
    orderId?: string;
    orderCode?: string;
}

interface TransactionSummary {
    totalTopUp: number;
    totalCost: number;
    totalRefund: number;
    totalAmount: number;
    currentBalance: number;
}

const STATUS_COLORS: Record<string, string> = {
    PENDING_APPROVAL: 'orange',
    RECEIVED: 'blue',
    IN_PROCESS: 'cyan',
    READY_TO_SHIP: 'purple',
    SHIPPED: 'geekblue',
    COMPLETED: 'green',
    CANCELLED: 'red',
    REJECTED: 'volcano',
};

const TYPE_COLORS: Record<string, string> = {
    CREDIT: 'green',
    DEBIT: 'red',
    REFUND: 'blue',
    ADMIN_TOP_UP: 'gold',
    ADDITIONAL_CHARGE: 'volcano',
};

export default function SellerDetailModal({
    sellerId,
    sellerName,
    sellerBalance,
    sellerTopUp,
    open,
    onClose,
    dateRange
}: SellerDetailModalProps) {
    const [activeTab, setActiveTab] = useState('orders');

    // Orders state
    const [orders, setOrders] = useState<Order[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersFetched, setOrdersFetched] = useState(false);
    const [ordersPage, setOrdersPage] = useState(1);
    const [ordersTotal, setOrdersTotal] = useState(0);
    const [ordersTotalAmount, setOrdersTotalAmount] = useState(0);

    // Transactions state
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [transLoading, setTransLoading] = useState(false);
    const [transFetched, setTransFetched] = useState(false);
    const [transPage, setTransPage] = useState(1);
    const [transTotal, setTransTotal] = useState(0);
    const [transSummary, setTransSummary] = useState<TransactionSummary | null>(null);

    const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
    const [orderDetailVisible, setOrderDetailVisible] = useState(false);

    const pageSize = 20;

    const getOrderGrandTotal = (order: Order) => {
        const jobsTotal = order.jobs.reduce(
            (sum, job) => sum + ((job.priceToCharge || 0) * job.qty) + (job.shippingCost || 0) + (job.extraFees || 0),
            0
        );
        const priorityTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
            + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
        return Number((jobsTotal + priorityTotal).toFixed(2));
    };

    // Reset on open
    useEffect(() => {
        if (open && sellerId) {
            setOrdersFetched(false);
            setTransFetched(false);
            setOrdersPage(1);
            setTransPage(1);
            setActiveTab('orders');
        }
    }, [open, sellerId]);

    // Fetch Orders (lazy)
    const fetchOrders = useCallback(async (page: number) => {
        if (!sellerId) return;
        setOrdersLoading(true);
        try {
            const params = new URLSearchParams({
                sellerId,
                page: String(page),
                limit: String(pageSize),
                includeTotal: ordersFetched ? 'false' : 'true'  // Only fetch totals on first load to save API cost
            });
            if (dateRange) {
                params.append('start', dateRange[0].startOf('day').toISOString());
                params.append('end', dateRange[1].endOf('day').toISOString());
            }
            const res = await fetch(`/api/admin/orders?${params}`);
            const data = await res.json();
            if (data.data) {
                setOrders(data.data);
                // Only update totals if they were included in response
                if (data.meta?.total !== undefined) {
                    setOrdersTotal(data.meta.total);
                    setOrdersTotalAmount(data.meta.totalAmount || 0);
                }
            } else {
                // Fallback: API returned array directly (no includeTotal)
                setOrders(Array.isArray(data) ? data : []);
            }
            setOrdersFetched(true);
        } catch (e) {
            console.error('Orders fetch error', e);
        } finally {
            setOrdersLoading(false);
        }
    }, [sellerId, dateRange, ordersFetched]);

    const handleViewOrder = async (orderId: string) => {
        try {
            const res = await fetch(`/api/admin/orders/${orderId}`);
            if (!res.ok) throw new Error('Failed to load order details');
            const data = await res.json();
            setSelectedOrderDetail(data);
            setOrderDetailVisible(true);
        } catch (error) {
            console.error('Order detail fetch error', error);
        }
    };

    const renderOrderCodeLink = (orderId?: string, orderCode?: string, className = 'font-mono text-blue-600 hover:text-blue-800 hover:underline') => {
        if (!orderCode) {
            return '-';
        }

        if (!orderId) {
            return <span className={className}>{orderCode}</span>;
        }

        return (
            <button
                type="button"
                onClick={() => handleViewOrder(orderId)}
                className={className}
            >
                {orderCode}
            </button>
        );
    };

    const renderTransactionNote = (record: Transaction) => {
        if (!record.note) {
            return '-';
        }

        if (record.orderCode) {
            const segments = record.note.split(record.orderCode);
            if (segments.length > 1) {
                return (
                    <span>
                        {segments[0]}
                        {renderOrderCodeLink(record.orderId, record.orderCode)}
                        {segments.slice(1).join(record.orderCode)}
                    </span>
                );
            }

            return (
                <span>
                    {record.note}
                    <span className="mx-1 text-zinc-400">|</span>
                    <span className="text-zinc-500">Order Code:</span>{' '}
                    {renderOrderCodeLink(record.orderId, record.orderCode)}
                </span>
            );
        }

        return record.note;
    };

    const displayedTotalAmount = activeTab === 'transactions' && transSummary
        ? transSummary.totalAmount
        : ordersTotalAmount;
    const displayedTopUp = activeTab === 'transactions' && transSummary
        ? transSummary.totalTopUp
        : sellerTopUp;
    const displayedBalance = activeTab === 'transactions' && transSummary
        ? transSummary.currentBalance
        : sellerBalance;

    const summaryContent = (
        <div className="text-sm">
            <span className="font-medium">Total Orders:</span> <span className="font-bold">{ordersTotal}</span>
            <span className="mx-2">|</span>
            <span className="font-medium">Total Amount:</span> <span className="font-bold text-emerald-600">${displayedTotalAmount.toFixed(2)}</span>
            <span className="mx-2">|</span>
            <span className="font-medium">Amount Topped Up:</span> <span className="font-bold text-emerald-600">${displayedTopUp.toFixed(2)}</span>
            <span className="mx-2">|</span>
            <span className="font-medium">Current Balance:</span> <span className={`font-bold ${displayedBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>${displayedBalance.toFixed(2)}</span>
        </div>
    );

    // Fetch Transactions (lazy)
    const fetchTransactions = useCallback(async (page: number) => {
        if (!sellerId) return;
        setTransLoading(true);
        try {
            const params = new URLSearchParams({
                sellerId,
                page: String(page),
                limit: String(pageSize)
            });
            const res = await fetch(`/api/admin/wallet?${params}`);
            const data = await res.json();
            // API returns { transactions: [...] } format
            setTransactions(data.transactions || []);
            setTransTotal(data.transactions?.length >= pageSize ? (page * pageSize) + 1 : page * pageSize);
            setTransSummary(data.summary || null);
            setTransFetched(true);
        } catch (e) {
            console.error('Transactions fetch error', e);
        } finally {
            setTransLoading(false);
        }
    }, [sellerId]);

    const handleExport = async (tabKey: string) => {
        if (!sellerId) return;
        try {
            let dataToExport: any[] = [];
            let sheetName = '';
            let fileName = '';

            if (tabKey === 'orders') {
                // Optimization: if all orders fit on current page, use cached data
                if (ordersTotal <= pageSize && orders.length > 0) {
                    dataToExport = orders.map((o: any) => ({
                        'Order Code': o.orderCode,
                        'Customer': o.jobs?.[0]?.recipientName || '-',
                        'Status': o.status,
                        'Total Amount': getOrderGrandTotal(o),
                        'Date': dayjs(o.createdAt).format('YYYY-MM-DD HH:mm')
                    }));
                    dataToExport.push({});
                    dataToExport.push({ 'Order Code': 'TOTAL', 'Total Amount': ordersTotalAmount });
                } else {
                    const params = new URLSearchParams({
                        sellerId,
                        limit: '1000',
                        includeTotal: 'true'
                    });
                    if (dateRange) {
                        params.append('start', dateRange[0].startOf('day').toISOString());
                        params.append('end', dateRange[1].endOf('day').toISOString());
                    }
                    const res = await fetch(`/api/admin/orders?${params}`);
                    const data = await res.json();
                    const ordersData = data.data || [];

                    dataToExport = ordersData.map((o: any) => ({
                        'Order Code': o.orderCode,
                        'Customer': o.jobs?.[0]?.recipientName || '-',
                        'Status': o.status,
                        'Total Amount': getOrderGrandTotal(o),
                        'Date': dayjs(o.createdAt).format('YYYY-MM-DD HH:mm')
                    }));
                    dataToExport.push({});
                    dataToExport.push({ 'Order Code': 'TOTAL', 'Total Amount': data.meta?.totalAmount || 0 });
                }

                sheetName = 'Orders';
                fileName = `orders_${sellerName}_${dayjs().format('YYYY-MM-DD')}.xlsx`;

            } else {
                // Optimization: if all transactions fit on current page, use cached data
                if (transactions.length > 0 && transactions.length < pageSize) {
                    dataToExport = transactions.map((t: any) => ({
                        'Type': t.type,
                        'Amount': t.displayAmount ?? t.amount,
                        'Order': t.orderCode || '-',
                        'Note': t.note,
                        'Date': dayjs(t.createdAt).format('YYYY-MM-DD HH:mm')
                    }));
                } else {
                    const params = new URLSearchParams({
                        sellerId,
                        limit: '1000'
                    });
                    const res = await fetch(`/api/admin/wallet?${params}`);
                    const data = await res.json();
                    const transData = data.transactions || [];

                    dataToExport = transData.map((t: any) => ({
                        'Type': t.type,
                        'Amount': t.displayAmount ?? t.amount,
                        'Order': t.orderCode || '-',
                        'Note': t.note,
                        'Date': dayjs(t.createdAt).format('YYYY-MM-DD HH:mm')
                    }));
                }
                // Add Summary Row
                dataToExport.push({});
                dataToExport.push({ 'Type': 'CURRENT BALANCE', 'Amount': sellerBalance });

                sheetName = 'Transactions';
                fileName = `transactions_${sellerName}_${dayjs().format('YYYY-MM-DD')}.xlsx`;
            }

            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            XLSX.writeFile(wb, fileName);

        } catch (error) {
            console.error('Export error', error);
        }
    };

    // Load data when tab becomes active
    useEffect(() => {
        if (!open || !sellerId) return;

        if (activeTab === 'orders' && !ordersFetched) {
            fetchOrders(ordersPage);
        } else if (activeTab === 'transactions' && !transFetched) {
            fetchTransactions(transPage);
        }
    }, [open, sellerId, activeTab, ordersFetched, transFetched, fetchOrders, fetchTransactions, ordersPage, transPage]);

    // Order columns
    const orderColumns = [
        {
            title: 'Order Code',
            dataIndex: 'orderCode',
            key: 'orderCode',
            render: (code: string, record: Order) => (
                <button
                    type="button"
                    onClick={() => handleViewOrder(record.id)}
                    className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                >
                    {code}
                </button>
            )
        },
        {
            title: 'Customer',
            key: 'customer',
            render: (_: any, record: Order) => record.jobs[0]?.recipientName || '-'
        },
        {
            title: 'Items',
            key: 'items',
            render: (_: any, record: Order) => record.jobs.reduce((sum, j) => sum + j.qty, 0)
        },
        {
            title: 'Amount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            render: (_: number, record: Order) => <span className="font-semibold">${getOrderGrandTotal(record).toFixed(2)}</span>
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag>
        },
        {
            title: 'Date',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (d: string) => dayjs(d).format('MMM D, YYYY HH:mm')
        },
    ];

    // Transaction columns
    const getTransactionDisplay = (record: Transaction) => {
        const absoluteAmount = Math.abs(record.displayAmount ?? record.amount ?? 0);
        const isOutflow = record.type === 'DEBIT' || record.type === 'ADDITIONAL_CHARGE';

        return {
            amount: absoluteAmount,
            className: isOutflow ? 'text-red-600' : 'text-green-600',
            prefix: isOutflow ? '-' : '+',
        };
    };

    const transColumns = [
        {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            render: (t: string) => <Tag color={TYPE_COLORS[t] || 'default'}>{t}</Tag>
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            render: (_: number, record: Transaction) => {
                const display = getTransactionDisplay(record);
                return (
                <span className={display.className}>
                    {display.prefix}${display.amount.toFixed(2)}
                </span>
                );
            }
        },
        {
            title: 'Order',
            dataIndex: 'orderCode',
            key: 'orderCode',
            render: (_: string, record: Transaction) => renderOrderCodeLink(record.orderId, record.orderCode)
        },
        {
            title: 'Note',
            key: 'note',
            ellipsis: true,
            render: (_: string, record: Transaction) => renderTransactionNote(record)
        },
        {
            title: 'Date',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (d: string) => dayjs(d).format('MMM D, YYYY HH:mm')
        },
    ];

    const items = [
        {
            key: 'orders',
            label: `Orders`,
            children: (
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center mb-2 px-1">
                        {summaryContent}
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleExport('orders')}
                        >
                            Export
                        </Button>
                    </div>
                    <Spin spinning={ordersLoading}>
                        {orders.length > 0 ? (
                            <>
                                <Table
                                    dataSource={orders}
                                    columns={orderColumns}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    scroll={{ x: 700 }}
                                />
                                <div className="flex justify-end mt-4">
                                    <Pagination
                                        current={ordersPage}
                                        pageSize={pageSize}
                                        total={ordersTotal}
                                        onChange={(p) => { setOrdersPage(p); fetchOrders(p); }}
                                        showSizeChanger={false}
                                        size="small"
                                    />
                                </div>
                            </>
                        ) : !ordersLoading ? (
                            <Empty description="No orders found" />
                        ) : null}

                    </Spin>
                </div>
            )
        },
        {
            key: 'transactions',
            label: 'Transactions',
            children: (
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center mb-2 px-1">
                        {summaryContent}
                        <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleExport('transactions')}
                        >
                            Export
                        </Button>
                    </div>
                    <Spin spinning={transLoading}>
                        {transactions.length > 0 ? (
                            <>
                                <Table
                                    dataSource={transactions}
                                    columns={transColumns}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    scroll={{ x: 600 }}
                                />
                                <div className="flex justify-end mt-4">
                                    <Pagination
                                        current={transPage}
                                        pageSize={pageSize}
                                        total={transTotal}
                                        onChange={(p) => { setTransPage(p); fetchTransactions(p); }}
                                        showSizeChanger={false}
                                        size="small"
                                    />
                                </div>
                            </>
                        ) : !transLoading ? (
                            <Empty description="No transactions found" />
                        ) : null}

                    </Spin>
                </div>
            )
        }
    ];

    return (
        <Modal
            title={<span className="text-lg font-semibold">{sellerName}</span>}
            open={open}
            onCancel={onClose}
            footer={null}
            width={900}
            destroyOnClose
        >
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={items}
                className="mt-2"
            />

            {selectedOrderDetail && (
                <OrderDetailsModal
                    visible={orderDetailVisible}
                    onCancel={() => {
                        setOrderDetailVisible(false);
                        setSelectedOrderDetail(null);
                    }}
                    order={selectedOrderDetail}
                    showReportButton={false}
                />
            )}
        </Modal>
    );
}
