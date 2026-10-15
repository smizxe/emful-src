'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Table, DatePicker, Segmented, Button, Tag } from 'antd';
import { PrinterOutlined, DownloadOutlined, CloseCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useLanguage } from '@/components/Providers/LanguageContext';
import OrderDetailsModal from '@/app/dashboard/orders/OrderDetailsModal';

interface Transaction {
    id: string;
    type: string;
    amount: number;
    currency: string;
    refType: string;
    refId: string;
    orderId?: string | null;
    orderCode?: string | null;
    recipientName?: string | null;
    note: string;
    createdAt: string;
}

interface BillingSummary {
    totalOrders: number;
    totalAmount: number;
    amountToppedUp: number;
    currentBalance: number;
}

export default function WalletClient() {
    const { t } = useLanguage();
    const searchParams = useSearchParams();
    // The dashboard stat cards deep-link here, e.g. ?type=REFUND to show refunds only.
    const initialRange = (searchParams.get('range') as 'day' | 'month' | 'year' | 'all') || 'all';
    const [range, setRange] = useState<'day' | 'month' | 'year' | 'all'>(initialRange);
    const [typeFilter, setTypeFilter] = useState<string | null>(searchParams.get('type'));
    const [refTypeFilter, setRefTypeFilter] = useState<string | null>(searchParams.get('refType'));
    const [selectedDate, setSelectedDate] = useState(dayjs());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentBalance, setCurrentBalance] = useState(0);
    const [summary, setSummary] = useState<BillingSummary>({
        totalOrders: 0,
        totalAmount: 0,
        amountToppedUp: 0,
        currentBalance: 0
    });
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);
    const [orderDetailVisible, setOrderDetailVisible] = useState(false);

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                range,
                date: selectedDate.toISOString()
            });
            if (typeFilter) params.set('type', typeFilter);
            if (refTypeFilter) params.set('refType', refTypeFilter);
            const res = await fetch(`/api/billing/transactions?${params}`);
            if (res.ok) {
                const data = await res.json();
                setTransactions(data.transactions || []);
                setCurrentBalance(data.currentBalance || 0);
                setSummary({
                    totalOrders: data.summary?.totalOrders || 0,
                    totalAmount: data.summary?.totalAmount || 0,
                    amountToppedUp: data.summary?.amountToppedUp || 0,
                    currentBalance: data.summary?.currentBalance || data.currentBalance || 0
                });
            }
        } catch (error) {
            console.error('Failed to fetch transactions', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, [range, selectedDate, typeFilter, refTypeFilter]);

    const handleViewOrder = async (orderId?: string | null) => {
        if (!orderId) return;
        try {
            const res = await fetch(`/api/orders/${orderId}`);
            if (!res.ok) throw new Error('Failed to load order details');
            const data = await res.json();
            setSelectedOrderDetail(data);
            setOrderDetailVisible(true);
        } catch (error) {
            console.error('Order detail fetch error', error);
        }
    };

    const renderOrderCodeLink = (record: Transaction, className = 'font-mono text-blue-600 hover:text-blue-800 hover:underline') => {
        if (!record.orderCode) {
            return null;
        }

        if (!record.orderId) {
            return <span className={className}>{record.orderCode}</span>;
        }

        return (
            <button
                type="button"
                className={className}
                onClick={() => handleViewOrder(record.orderId)}
            >
                {record.orderCode}
            </button>
        );
    };

    const renderNote = (record: Transaction) => {
        if (!record.note) return '-';

        if (record.orderCode) {
            const segments = record.note.split(record.orderCode);
            if (segments.length > 1) {
                return (
                    <span className="text-sm text-zinc-600 dark:text-zinc-300">
                        {segments[0]}
                        {renderOrderCodeLink(record, 'font-mono text-blue-600 hover:text-blue-800 hover:underline')}
                        {segments.slice(1).join(record.orderCode)}
                    </span>
                );
            }

            return (
                <span className="text-sm text-zinc-600 dark:text-zinc-300">
                    {record.note}
                    <span className="mx-1 text-zinc-400">|</span>
                    <span className="text-zinc-500">Order Code:</span>{' '}
                    {renderOrderCodeLink(record, 'font-mono text-blue-600 hover:text-blue-800 hover:underline')}
                </span>
            );
        }

        return <span className="text-sm text-zinc-600 dark:text-zinc-300">{record.note}</span>;
    };

    const handlePrint = () => {
        // Open a print window
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            // Ending Balance = Current Balance (already in wallet)

            // Keep invoice print in English for now or basic
            printWindow.document.write(`
                <html>
                <head>
                    <title>${t.walletPage.invoiceHeader} - ${selectedDate.format('DD/MM/YYYY')}</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .header { margin-bottom: 30px; }
                        .total { margin-top: 20px; font-weight: bold; font-size: 1.2em; text-align: right; }
                        .footer { margin-top: 50px; text-align: center; color: #888; font-size: 0.8em; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${t.walletPage.invoiceHeader}</h1>
                        <p>${t.walletPage.dateRange}: ${range.toUpperCase()} - ${selectedDate.format('DD/MM/YYYY')}</p>
                        <p>${t.walletPage.generatedOn}: ${dayjs().format('DD/MM/YYYY HH:mm')}</p>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                        <thead>
                            <tr>
                                <th>${t.walletPage.date}</th>
                                <th>${t.walletPage.type}</th>
                                <th>${t.walletPage.reference}</th>
                                <th>${t.walletPage.note}</th>
                                <th>${t.walletPage.amount}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${transactions.map(t => `
                                <tr>
                                    <td>${dayjs(t.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                                    <td>${t.type}</td>
                                    <td>${t.orderCode || (t.refType + ' #' + (t.refId || '-'))}</td>
                                    <td>${t.note || ''}</td>
                                    <td>${t.type === 'DEBIT' ? '-' : ''}$${t.amount.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="total">
                        Ending Balance: $${currentBalance.toFixed(2)}
                    </div>

                    <div class="footer">
                        <p>${t.walletPage.thankYou}</p>
                    </div>

                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    const columns = [
        {
            title: t.common.date,
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (d: string) => dayjs(d).format('DD/MM/YYYY HH:mm')
        },
        {
            title: t.walletPage.type,
            dataIndex: 'type',
            key: 'type',
            render: (type: string) => (
                <Tag color={['CREDIT', 'REFUND', 'DEPOSIT'].includes(type) ? 'green' : 'red'}>{type}</Tag>
            )
        },
        {
            title: t.walletPage.amount,
            dataIndex: 'amount',
            key: 'amount',
            render: (amount: number, record: Transaction) => {
                const isPositive = ['CREDIT', 'REFUND', 'DEPOSIT'].includes(record.type);
                return (
                    <span className={isPositive ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {record.type === 'DEBIT' ? '-' : '+'}${amount.toFixed(2)}
                    </span>
                );
            }
        },
        {
            title: t.common.reference || t.walletPage.reference,
            key: 'ref',
            render: (_: any, record: Transaction) => (
                record.orderCode
                    ? renderOrderCodeLink(record)
                    : <span>{record.refType} <span className="text-gray-400">#{record.refId?.substring(0, 8)}...</span></span>
            )
        },
        {
            title: t.common.note || t.walletPage.note,
            key: 'note',
            render: (_: any, record: Transaction) => renderNote(record)
        }
    ];

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent m-0">
                    {t.walletPage.billingTitle || 'Billing & Invoices'}
                </h1>

                <div className="w-full md:hidden grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-zinc-500">Total Orders</div>
                        <div className="mt-1 text-xl font-bold text-blue-600">{summary.totalOrders}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-zinc-500">Total Amount</div>
                        <div className="mt-1 text-xl font-bold text-emerald-600">${summary.totalAmount.toFixed(2)}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-zinc-500">Amount Topped Up</div>
                        <div className="mt-1 text-xl font-bold text-emerald-600">${summary.amountToppedUp.toFixed(2)}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                        <div className="text-xs uppercase tracking-wide text-zinc-500">Current Balance</div>
                        <div className={`mt-1 text-xl font-bold ${summary.currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            ${summary.currentBalance.toFixed(2)}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 flex-wrap">
                    {(typeFilter || refTypeFilter) && (
                        <Tag
                            color="blue"
                            className="cursor-pointer flex items-center gap-1 !mr-0"
                            onClick={() => { setTypeFilter(null); setRefTypeFilter(null); }}
                        >
                            {refTypeFilter === 'TOPUP' ? (t.walletPage.topUps || 'Top-ups') : (typeFilter === 'REFUND' ? t.walletPage.refundsOnly : t.walletPage.paymentsOnly)}
                            <CloseCircleFilled />
                        </Tag>
                    )}
                    <Segmented
                        options={[
                            { label: t.walletPage.all, value: 'all' },
                            { label: t.walletPage.day, value: 'day' },
                            { label: t.walletPage.month, value: 'month' },
                            { label: t.walletPage.year, value: 'year' },
                        ]}
                        value={range}
                        onChange={(val: any) => setRange(val)}
                    />
                    {range !== 'all' && (
                        <DatePicker
                            value={selectedDate}
                            onChange={(date) => setSelectedDate(date || dayjs())}
                            picker={range === 'day' ? 'date' : range}
                            allowClear={false}
                            className="w-32"
                        />
                    )}
                    <Button
                        type="primary"
                        icon={<PrinterOutlined />}
                        onClick={handlePrint}
                        disabled={transactions.length === 0}
                    >
                        {t.walletPage.printInvoice}
                    </Button>
                </div>
            </div>

            <div className="hidden md:grid grid-cols-4 gap-4 mb-6">
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Total Orders</div>
                    <div className="mt-2 text-2xl font-bold text-blue-600">{summary.totalOrders}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Total Amount</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-600">${summary.totalAmount.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Amount Topped Up</div>
                    <div className="mt-2 text-2xl font-bold text-emerald-600">${summary.amountToppedUp.toFixed(2)}</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
                    <div className="text-xs uppercase tracking-wide text-zinc-500">Current Balance</div>
                    <div className={`mt-2 text-2xl font-bold ${summary.currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        ${summary.currentBalance.toFixed(2)}
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-1 overflow-hidden">
                <Table
                    dataSource={transactions}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    className="glass-table"
                />
            </div>

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
        </div>
    );
}
