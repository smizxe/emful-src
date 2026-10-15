'use client';

import React, { useEffect, useState } from 'react';
import { Table, Button, Input, InputNumber, notification, Tooltip, Tag, Select } from 'antd';
import { ShoppingCartOutlined, DownloadOutlined, ReloadOutlined, PlusOutlined, CheckOutlined, EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { useSearchParams } from 'next/navigation';

interface PurchasingItem {
    id: string;
    productName: string;
    sku: string;
    subSku: string;
    color: string;
    size: string;
    onHand: number;
    onOrder: number;
    reserved: number;
    futureFree: number;
}

export default function PurchasingPage() {
    const searchParams = useSearchParams();
    const [data, setData] = useState<PurchasingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [total, setTotal] = useState(0);
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [sortBy, setSortBy] = useState('sku');

    // Action States
    const [actionLoading, setActionLoading] = useState<string | null>(null); // 'id-action'
    const [inputValues, setInputValues] = useState<{ [key: string]: number | null }>({}); // 'id-action': value
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState<number | null>(null);

    const [api, contextHolder] = notification.useNotification();

    const fetchData = async (p = page, ps = pageSize, s = search, sb = sortBy) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: p.toString(),
                limit: ps.toString(),
                search: s,
                sortBy: sb
            });
            const res = await fetch(`/api/admin/purchasing?${params}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const result = await res.json();
            setData(result.data);
            setTotal(result.total);
            setPage(result.page);
        } catch (error) {
            api.error({ title: 'Failed to load purchasing data' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSearch = (value: string) => {
        setSearch(value);
        setPage(1);
        fetchData(1, pageSize, value, sortBy);
    };

    const handleSortChange = (value: string) => {
        setSortBy(value);
        setPage(1);
        fetchData(1, pageSize, search, value);
    };

    const handleAction = async (item: PurchasingItem, action: 'PLACE_ORDER' | 'RECEIVE') => {
        const key = `${item.id}-${action}`;
        const qty = inputValues[key];

        if (!qty || qty <= 0) {
            api.warning({ title: 'Please enter a valid quantity' });
            return;
        }

        setActionLoading(key);
        try {
            const res = await fetch('/api/admin/purchasing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    sku: item.sku,
                    color: item.color,
                    size: item.size,
                    quantity: qty
                })
            });

            if (!res.ok) throw new Error('Action failed');

            api.success({ title: action === 'PLACE_ORDER' ? 'Order Placed' : 'Stock Received' });

            // Clear input
            setInputValues(prev => ({ ...prev, [key]: null }));

            // Refresh data
            fetchData(page, pageSize, search, sortBy);
        } catch (error) {
            api.error({ title: 'Operation failed' });
        } finally {
            setActionLoading(null);
        }
    };

    const handleUpdateStock = async (item: PurchasingItem) => {
        if (editValue === null || editValue < 0) {
            api.warning({ title: 'Please enter a valid stock amount' });
            return;
        }

        try {
            const res = await fetch('/api/admin/purchasing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_ON_HAND',
                    sku: item.sku,
                    color: item.color,
                    size: item.size,
                    quantity: editValue
                })
            });

            if (!res.ok) throw new Error('Update failed');

            api.success({ title: 'Stock updated successfully' });
            setEditingId(null);
            setEditValue(null);
            fetchData(page, pageSize, search, sortBy);
        } catch (error) {
            api.error({ title: 'Failed to update stock' });
        }
    };

    const handleExport = () => {
        // Export current view or getAll? 
        // For simplicity, let's export current data. Ideally, we should fetch ALL for export.
        // Let's quickly fetch all (limit=10000) for export if possible, otherwise just current page.
        // I will implement "Export All" by calling API with high limit.

        async function doExport() {
            try {
                const res = await fetch(`/api/admin/purchasing?limit=10000&search=${search}&sortBy=${sortBy}`);
                const result = await res.json();
                const exportData = result.data.map((item: any) => ({
                    'Product Name': item.productName,
                    'SKU': item.sku,
                    'Sub-SKU': item.subSku,
                    'Color': item.color,
                    'Size': item.size,
                    'On Hand': item.onHand,
                    'On Order': item.onOrder,
                    'Reserved': item.reserved,
                    'Future Free': item.futureFree
                }));

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(exportData);
                XLSX.utils.book_append_sheet(wb, ws, "Purchasing Data");
                XLSX.writeFile(wb, "Purchasing_Export.xlsx");

                api.success({ title: 'Export successful' });
            } catch (error) {
                api.error({ title: 'Export failed' });
            }
        }
        doExport();
    };

    const columns = [
        {
            title: 'Sub-SKU',
            dataIndex: 'subSku',
            key: 'subSku',
            width: 200,
            render: (text: string, record: PurchasingItem) => (
                <div>
                    <div className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{text}</div>
                    <div className="text-xs text-zinc-500">{record.productName}</div>
                </div>
            )
        },
        {
            title: 'On Hand',
            dataIndex: 'onHand',
            key: 'onHand',
            width: 100,
            render: (val: number, record: PurchasingItem) => {
                if (editingId === record.id) {
                    return (
                        <div className="flex items-center gap-1">
                            <InputNumber
                                size="small"
                                min={0}
                                value={editValue}
                                onChange={setEditValue}
                                className="w-16"
                                autoFocus
                            />
                            <Button
                                size="small"
                                type="text"
                                icon={<SaveOutlined className="text-green-600" />}
                                onClick={() => handleUpdateStock(record)}
                            />
                            <Button
                                size="small"
                                type="text"
                                icon={<CloseOutlined className="text-red-500" />}
                                onClick={() => { setEditingId(null); setEditValue(null); }}
                            />
                        </div>
                    );
                }
                return (
                    <div className="group flex items-center gap-2">
                        <span className="font-semibold text-zinc-700">{val}</span>
                        <EditOutlined
                            className="text-zinc-400 hover:text-blue-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => { setEditingId(record.id); setEditValue(val); }}
                        />
                    </div>
                );
            }
        },
        {
            title: 'On Order',
            dataIndex: 'onOrder',
            key: 'onOrder',
            width: 100,
            render: (val: number) => <span className="font-semibold text-blue-600">{val}</span>
        },
        {
            title: 'Reserved',
            dataIndex: 'reserved',
            key: 'reserved',
            width: 100,
            render: (val: number) => <span className="text-orange-500">{val}</span>
        },
        {
            title: 'Future Free',
            dataIndex: 'futureFree',
            key: 'futureFree',
            width: 120,
            render: (val: number) => (
                <Tag color={val < 0 ? 'red' : 'green'} className="font-bold text-sm px-2 py-1">
                    {val}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: PurchasingItem) => (
                <div className="flex flex-col gap-2">
                    {/* Place Order Row */}
                    <div className="flex items-center gap-2">
                        <InputNumber
                            size="small"
                            min={1}
                            placeholder="Qty"
                            className="w-20"
                            value={inputValues[`${record.id}-PLACE_ORDER`] || null}
                            onChange={(val) => setInputValues(prev => ({ ...prev, [`${record.id}-PLACE_ORDER`]: val }))}
                        />
                        <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => handleAction(record, 'PLACE_ORDER')}
                            loading={actionLoading === `${record.id}-PLACE_ORDER`}
                            className="bg-blue-600"
                        >
                            Place Order
                        </Button>
                    </div>

                    {/* Receive Row */}
                    <div className="flex items-center gap-2">
                        <InputNumber
                            size="small"
                            min={1}
                            placeholder="Qty"
                            className="w-20"
                            value={inputValues[`${record.id}-RECEIVE`] || null}
                            onChange={(val) => setInputValues(prev => ({ ...prev, [`${record.id}-RECEIVE`]: val }))}
                        />
                        <Button
                            type="default"
                            size="small"
                            icon={<CheckOutlined />}
                            onClick={() => handleAction(record, 'RECEIVE')}
                            loading={actionLoading === `${record.id}-RECEIVE`}
                            className="text-green-600 border-green-200 hover:text-green-700 hover:border-green-300"
                        >
                            Receive
                        </Button>
                    </div>
                </div>
            )
        }
    ];

    return (
        <div className="p-6">
            {contextHolder}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold mb-1">Purchasing Management</h1>
                    <p className="text-zinc-500">Manage supplier orders and calculate future stock availability.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={handleExport}
                    >
                        Export Excel
                    </Button>
                </div>
            </div>

            <div className="mb-4 flex gap-4">
                <Input.Search
                    placeholder="Search SKU, Sub-SKU, or Product Name..."
                    onSearch={handleSearch}
                    style={{ width: 300 }}
                    allowClear
                />
                <Select
                    value={sortBy}
                    onChange={handleSortChange}
                    style={{ width: 180 }}
                    options={[
                        { value: 'sku', label: 'Sort by: SKU' },
                        { value: 'lowestOnHand', label: 'Lowest On Hand' },
                        { value: 'lowestFutureFree', label: 'Lowest Future Free' },
                        { value: 'highestReserved', label: 'Highest Reserved' },
                        { value: 'highestOnOrder', label: 'Highest On Order' }
                    ]}
                />
                <Button icon={<ReloadOutlined />} onClick={() => fetchData(page, pageSize, search, sortBy)}>Refresh</Button>
            </div>

            <Table
                columns={columns}
                dataSource={data}
                rowKey="id"
                loading={loading}
                pagination={{
                    current: page,
                    pageSize: pageSize,
                    total: total,
                    onChange: (p, ps) => {
                        setPage(p);
                        setPageSize(ps);
                        fetchData(p, ps, search, sortBy);
                    }
                }}
                className="glass-table shadow-sm rounded-lg overflow-hidden border border-zinc-200"
            />
        </div>
    );
}
