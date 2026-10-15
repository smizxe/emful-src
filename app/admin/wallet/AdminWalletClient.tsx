'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Button, Tag, notification, Modal, Form, Select, InputNumber, Tabs, Popconfirm, Input, Segmented } from 'antd';
import { WalletOutlined, PlusOutlined, ReloadOutlined, CheckCircleOutlined, SettingOutlined, CreditCardOutlined, SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import PaymentMethodsTab from '@/app/components/admin/PaymentMethodsTab';
import WalletChart from './WalletChart';
import SellerStatsTable from './SellerStatsTable';
import { useLanguage } from '@/components/Providers/LanguageContext';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

interface Transaction {
    id: string;
    type: string;
    amount: number;
    status: string;
    createdAt: string;
    user: {
        email: string;
        name: string | null;
    };
    isRequest?: boolean;
    currency?: string;
    exchangeRate?: number | null;
    amountReceived?: number | null;
    refId?: string | null;
    orderCode?: string | null;
    recipientName?: string | null;
    note?: string | null;
    evidenceUrl?: string | null;
}

interface User {
    id: string;
    email: string;
    name: string | null;
    balance: number;
}

interface AdminWalletClientProps {
    initialData: { transactions: Transaction[], users: User[] };
    initialRate: number;
    initialPriorityFees: {
        priorityProductionFee: number;
        priorityShippingFee: number;
    };
}

export default function AdminWalletClient({ initialData, initialRate, initialPriorityFees }: AdminWalletClientProps) {
    const router = useRouter();
    const [data, setData] = useState<{ transactions: Transaction[], users: User[] }>(initialData);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [rateModalVisible, setRateModalVisible] = useState(false);
    const [currentRate, setCurrentRate] = useState(initialRate);
    const [priorityProductionFee, setPriorityProductionFee] = useState(initialPriorityFees.priorityProductionFee);
    const [priorityShippingFee, setPriorityShippingFee] = useState(initialPriorityFees.priorityShippingFee);
    const [form] = Form.useForm();
    const [rateForm] = Form.useForm();
    const [api, contextHolder] = notification.useNotification();
    const { t } = useLanguage();
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

    useEffect(() => {
        setData(initialData);
    }, [initialData]);

    useEffect(() => {
        setCurrentRate(initialRate);
    }, [initialRate]);

    useEffect(() => {
        setPriorityProductionFee(initialPriorityFees.priorityProductionFee);
        setPriorityShippingFee(initialPriorityFees.priorityShippingFee);
    }, [initialPriorityFees]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [walletRes, settingsRes] = await Promise.all([
                fetch('/api/admin/wallet'),
                fetch('/api/settings')
            ]);

            if (!walletRes.ok || !settingsRes.ok) {
                throw new Error('Failed to fetch data');
            }

            const [walletData, settingsData] = await Promise.all([
                walletRes.json(),
                settingsRes.json()
            ]);

            setData(walletData);
            if (settingsData.rate) {
                setCurrentRate(settingsData.rate);
            }
            setPriorityProductionFee(settingsData.priorityProductionFee || 0);
            setPriorityShippingFee(settingsData.priorityShippingFee || 0);
        } catch (error) {
            api.error({ title: 'Error loading admin wallet data' });
            // console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (rateModalVisible) {
            rateForm.setFieldsValue({
                rate: currentRate,
                priorityProductionFee,
                priorityShippingFee
            });
        }
    }, [rateModalVisible, currentRate, priorityProductionFee, priorityShippingFee, rateForm]);

    const handleManualTopUp = async (values: any) => {
        try {
            const res = await fetch('/api/admin/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            if (!res.ok) throw new Error('Transaction failed');

            api.success({ title: 'Top-up successful' });
            setIsModalVisible(false);
            form.resetFields();
            await fetchData();
            router.refresh();
        } catch (error) {
            api.error({ title: 'Failed to top up' });
        }
    };

    const handleUpdateBillingSettings = async (values: any) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values)
            });
            if (!res.ok) throw new Error('Failed to update billing settings');
            const data = await res.json();

            api.success({ title: 'Billing settings updated' });
            setCurrentRate(data.rate);
            setPriorityProductionFee(data.priorityProductionFee || 0);
            setPriorityShippingFee(data.priorityShippingFee || 0);
            setRateModalVisible(false);
            router.refresh();
        } catch (error) {
            api.error({ title: 'Failed to update billing settings' });
        }
    };

    const handleApproveRequest = async (requestId: string) => {
        try {
            const res = await fetch('/api/admin/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'confirm_request',
                    topupRequestId: requestId
                })
            });
            if (!res.ok) throw new Error('Confirmation failed');

            api.success({ title: 'Request approved successfully' });
            await fetchData();
            router.refresh();
        } catch (error) {
            api.error({ title: 'Failed to approve request' });
        }
    };

    const handleCancelRequest = async (requestId: string) => {
        try {
            const res = await fetch('/api/admin/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'cancel_request',
                    topupRequestId: requestId
                })
            });
            if (!res.ok) throw new Error('Cancel failed');

            api.success({ title: 'Request cancelled successfully' });
            await fetchData();
            router.refresh();
        } catch (error) {
            api.error({ title: 'Failed to cancel request' });
        }
    };

    // Calculate Date Range for Seller Stats based on global filter
    const statsDateRange = useMemo(() => {
        if (dateFilter === 'all') return null;
        const now = dayjs();
        let start: any;
        switch (dateFilter) {
            case 'today': start = now.startOf('day'); break;
            case 'week': start = now.subtract(7, 'day').startOf('day'); break;
            case 'month': start = now.startOf('month'); break;
            default: return null;
        }
        return [start, now.endOf('day')] as [any, any];
    }, [dateFilter]);

    const columnsHistory = [
        {
            title: 'DATE',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text: string) => <span className="text-zinc-500 dark:text-zinc-500">{new Date(text).toLocaleString()}</span>,
        },
        {
            title: 'USER',
            dataIndex: ['user', 'email'],
            key: 'user',
            render: (email: string, record: Transaction) => (
                <div>
                    <div className="font-medium text-zinc-700 dark:text-zinc-300">{email}</div>
                    {record.user.name && <div className="text-xs text-zinc-400">{record.user.name}</div>}
                </div>
            )
        },
        {
            title: 'ORDER CODE',
            key: 'orderCode',
            render: (record: Transaction) => (
                record.orderCode ?
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{record.orderCode}</span>
                    : (record.refId ? <span className="font-mono text-zinc-400 text-xs">{record.refId.slice(0, 8)}...</span> : <span className="text-zinc-400">-</span>)
            )
        },
        {
            title: 'CUSTOMER',
            dataIndex: 'recipientName',
            key: 'recipientName',
            render: (name: string) => name ? <span className="text-zinc-700 dark:text-zinc-300">{name}</span> : <span className="text-zinc-400">-</span>
        },
        {
            title: 'TYPE',
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => {
                let colorClass = '';
                if (type === 'REFUND') {
                    colorClass = 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border-orange-200 dark:border-orange-500/20';
                } else if (type === 'CREDIT' || type.includes('TOP_UP')) {
                    colorClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
                } else if (type === 'DEBIT') {
                    colorClass = 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20';
                } else {
                    colorClass = 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
                }

                return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${colorClass}`}>
                        {type.replace(/_/g, ' ')}
                    </span>
                );
            },
        },
        {
            title: 'NOTE',
            dataIndex: 'note',
            key: 'note',
            render: (note: string) => note ? <span className="text-xs text-zinc-500 max-w-32 truncate block">{note}</span> : '-'
        },
        {
            title: 'AMOUNT',
            dataIndex: 'amount',
            key: 'amount',
            render: (amount: number) => <span className="font-bold text-zinc-800 dark:text-zinc-100">${amount.toFixed(2)}</span>,
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    {status}
                </span>
            ),
        },
    ];

    // Export Transaction History to Excel
    const exportTransactionHistory = () => {
        const exportData = filteredHistory.map(t => ({
            'Date': new Date(t.createdAt).toLocaleString(),
            'User Email': t.user?.email || '',
            'User Name': t.user?.name || '',
            'Order Code': t.orderCode || t.refId || '',
            'Customer': t.recipientName || '',
            'Type': t.type,
            'Note': t.note || '',
            'Amount': t.amount,
            'Status': t.status
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transaction History');
        XLSX.writeFile(wb, `transaction_history_${dayjs().format('YYYY-MM-DD')}.xlsx`);
    };

    const columnsPending = [
        {
            title: 'DATE',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text: string) => <span className="text-zinc-500 dark:text-zinc-500">{new Date(text).toLocaleString()}</span>,
        },
        {
            title: 'USER',
            dataIndex: ['user', 'email'],
            key: 'user',
            render: (email: string) => <span className="font-medium text-zinc-700 dark:text-zinc-300">{email}</span>
        },
        {
            title: 'SENT AMOUNT (VND)',
            key: 'amountVnd',
            render: (r: Transaction) => (
                <div>
                    <div className="font-bold text-zinc-800">{r.currency === 'VND' ? `${r.amount.toLocaleString()} VND` : '-'}</div>
                    {r.exchangeRate && <div className="text-xs text-zinc-500">Rate: {r.exchangeRate.toLocaleString()}</div>}
                </div>
            )
        },
        {
            title: 'RECEIVE (USD)',
            key: 'amountUsd',
            render: (r: Transaction) => (
                <span className="font-bold text-emerald-600">
                    ${(r.amountReceived ?? r.amount).toFixed(2)}
                </span>
            )
        },
        {
            title: 'EVIDENCE',
            dataIndex: 'evidenceUrl',
            key: 'evidenceUrl',
            render: (url: string) => (
                url ?
                    <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        View Proof
                    </a>
                    : <span className="text-gray-400">No Proof</span>
            ),
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                    {status}
                </span>
            ),
        },
        {
            title: 'ACTION',
            key: 'action',
            render: (_: any, record: Transaction) => (
                <div className="flex items-center gap-2">
                    <Popconfirm
                        title="Approve this top-up?"
                        onConfirm={() => handleApproveRequest(record.id)}
                        okText="Approve"
                        cancelText="Keep"
                    >
                        <Button type="primary" size="small" icon={<CheckCircleOutlined />} className="bg-emerald-600 hover:bg-emerald-500 border-none shadow-md shadow-emerald-500/20">
                            Approve
                        </Button>
                    </Popconfirm>
                    <Popconfirm
                        title="Cancel this top-up request?"
                        onConfirm={() => handleCancelRequest(record.id)}
                        okText="Cancel Request"
                        cancelText="Keep"
                    >
                        <Button danger size="small">
                            Cancel
                        </Button>
                    </Popconfirm>
                </div>
            )
        }
    ];

    const pendingRequests = data.transactions.filter(t => t.status === 'PENDING');
    const history = data.transactions.filter(t => t.status !== 'PENDING');

    // Filter transactions based on search and date filter
    const filteredTransactions = useMemo(() => {
        let filtered = [...data.transactions];

        // Apply search filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.user?.email?.toLowerCase().includes(term) ||
                t.user?.name?.toLowerCase().includes(term) ||
                t.type?.toLowerCase().includes(term)
            );
        }

        // Apply date filter
        if (dateFilter !== 'all') {
            const now = dayjs();
            let startDate: dayjs.Dayjs;

            switch (dateFilter) {
                case 'today':
                    startDate = now.startOf('day');
                    break;
                case 'week':
                    startDate = now.subtract(7, 'day').startOf('day');
                    break;
                case 'month':
                    startDate = now.startOf('month');
                    break;
                default:
                    startDate = dayjs(0);
            }

            filtered = filtered.filter(t => {
                const created = dayjs(t.createdAt);
                return created.isAfter(startDate) || created.isSame(startDate, 'second');
            });
        }

        return filtered;
    }, [data.transactions, searchTerm, dateFilter]);

    const filteredPending = filteredTransactions.filter(t => t.status === 'PENDING');
    const filteredHistory = filteredTransactions.filter(t => t.status !== 'PENDING');

    return (
        <div>
            {contextHolder}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">{t.walletPage.title}</h1>
                <div className="flex flex-wrap gap-2 items-center">
                    <Input
                        placeholder="Search by email, name..."
                        prefix={<SearchOutlined className="text-zinc-400" />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        allowClear
                        className="w-52"
                    />
                    <Segmented
                        options={[
                            { label: 'All', value: 'all' },
                            { label: 'Today', value: 'today' },
                            { label: 'Week', value: 'week' },
                            { label: 'Month', value: 'month' },
                        ]}
                        value={dateFilter}
                        onChange={(val: any) => setDateFilter(val)}
                    />
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => setRateModalVisible(true)}
                        className="h-10 px-4 rounded-xl"
                    >
                        Billing Settings
                    </Button>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-5 px-2">
                        Rate {currentRate.toLocaleString('en-US')} | Priority Production ${priorityProductionFee.toFixed(2)} | Priority Shipping ${priorityShippingFee.toFixed(2)}
                    </div>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setIsModalVisible(true)}
                        className="bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-500/20 h-10 px-5 rounded-xl font-semibold"
                    >
                        Manual Add Funds
                    </Button>
                </div>
            </div>

            {/* Seller Statistics Table */}
            <SellerStatsTable externalDateRange={statsDateRange} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
                    <div className="z-10 relative">
                        <div className="text-zinc-500 dark:text-zinc-400 mb-1 font-medium">{t.walletPage.totalBalance}</div>
                        <div className="text-3xl font-bold text-zinc-800 dark:text-zinc-100">
                            ${data.users.reduce((acc, user) => acc + user.balance, 0).toFixed(2)}
                        </div>
                    </div>
                </div>
                <div className="glass-card p-6 flex flex-col justify-between relative overflow-hidden group">
                    <div className="z-10 relative">
                        <div className="text-zinc-500 dark:text-zinc-400 mb-1 font-medium">{t.walletPage.pendingTopUps}</div>
                        <div className="text-3xl font-bold text-orange-500">
                            {pendingRequests.length}
                        </div>
                    </div>
                </div>
            </div>

            <WalletChart />

            <div className="glass-panel p-2 rounded-2xl">
                <div className="flex justify-end px-4 py-2">
                    <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} type="text">{t.common.refresh}</Button>
                </div>
                <Tabs
                    items={[
                        {
                            key: '1',
                            label: <span className="mx-2">Pending Requests ({filteredPending.length})</span>,
                            children: (
                                <Table
                                    dataSource={filteredPending}
                                    columns={columnsPending}
                                    rowKey="id"
                                    loading={loading}
                                    pagination={{ pageSize: 10 }}
                                    className="glass-table"
                                />
                            )
                        },
                        {
                            key: '2',
                            label: <span className="mx-2">{t.walletPage.transactionHistory}</span>,
                            children: (
                                <div>
                                    <div className="flex justify-end mb-4 px-2">
                                        <Button
                                            type="primary"
                                            icon={<DownloadOutlined />}
                                            onClick={exportTransactionHistory}
                                            className="bg-emerald-600 hover:bg-emerald-500"
                                        >
                                            Export Excel
                                        </Button>
                                    </div>
                                    <Table
                                        dataSource={filteredHistory}
                                        columns={columnsHistory}
                                        rowKey="id"
                                        loading={loading}
                                        pagination={{ pageSize: 20 }}
                                        className="glass-table"
                                        scroll={{ x: 1000 }}
                                    />
                                </div>
                            )
                        },
                        {
                            key: '3',
                            label: <span className="mx-2"><CreditCardOutlined /> Payment Methods</span>,
                            children: <PaymentMethodsTab />
                        }
                    ]}
                    className="px-2"
                />
            </div>

            <Modal
                title="Manual Add Funds (Admin)"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleManualTopUp}>
                    <Form.Item name="userId" label="User" rules={[{ required: true }]}>
                        <Select showSearch optionFilterProp="label">
                            {data.users.map(user => (
                                <Select.Option key={user.id} value={user.id} label={user.email}>
                                    {user.email} (Bal: ${user.balance})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="amount" label="Amount ($)" rules={[{ required: true }]}>
                        <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="type" label="Type" initialValue="ADMIN_TOP_UP">
                        <Select>
                            <Select.Option value="ADMIN_TOP_UP">Top Up</Select.Option>
                            <Select.Option value="ADJUSTMENT">Adjustment</Select.Option>
                            <Select.Option value="BONUS">Bonus</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title="Billing Settings"
                open={rateModalVisible}
                onCancel={() => setRateModalVisible(false)}
                onOk={() => rateForm.submit()}
                width={400}
            >
                <Form form={rateForm} layout="vertical" onFinish={handleUpdateBillingSettings}>
                    <Form.Item
                        name="rate"
                        label="VND per 1 USD"
                        rules={[{ required: true, message: 'Please enter rate' }]}
                        extra={`Current: ${currentRate.toLocaleString()} VND = 1 USD`}
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value!.replace(/\$\s?|(,*)/g, '')}
                        />
                    </Form.Item>
                    <Form.Item
                        name="priorityProductionFee"
                        label="Priority Production Fee ($)"
                        extra="Seller pays this when Priority Production is selected. Use 0 for free."
                    >
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="$" />
                    </Form.Item>
                    <Form.Item
                        name="priorityShippingFee"
                        label="Priority Shipping Fee ($)"
                        extra="Seller pays this when Priority Shipping is selected. Use 0 for free."
                    >
                        <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="$" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
