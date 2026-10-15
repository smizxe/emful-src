'use client';

import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Tag, notification, Modal, InputNumber, Space, Typography, Input, Alert, Select } from 'antd';
import { ReloadOutlined, EditOutlined, BankOutlined, InboxOutlined, EyeOutlined, CopyOutlined, DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import { useSearchParams } from 'next/navigation';

// ... rest of imports
import * as XLSX from 'xlsx';
import { useLanguage } from '@/components/Providers/LanguageContext';

// ... interfaces
interface VariantData {
    id: string;
    subSku: string;
    sku: string; // parent SKU
    color: string;
    size: string;
    stock: number;
    onOrder: number;
    reserved: number;
}

interface ProductGroup {
    id: string;
    name: string;
    sku: string;
    totalStock: number;
    variants: VariantData[];
    // Optional: add other product fields if needed
}

type VariantSortBy = 'default' | 'subSku_asc' | 'subSku_desc' | 'size_asc' | 'size_desc' | 'stock_asc' | 'stock_desc' | 'onOrder_desc' | 'reserved_desc';

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

function getSizeRank(size: string) {
    const normalized = (size || '').trim().toUpperCase();
    const index = SIZE_ORDER.indexOf(normalized);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortVariants(variants: VariantData[], sortBy: VariantSortBy) {
    const sorted = [...variants];

    sorted.sort((a, b) => {
        switch (sortBy) {
            case 'subSku_asc':
                return a.subSku.localeCompare(b.subSku);
            case 'subSku_desc':
                return b.subSku.localeCompare(a.subSku);
            case 'size_asc': {
                const sizeRankDiff = getSizeRank(a.size) - getSizeRank(b.size);
                return sizeRankDiff !== 0 ? sizeRankDiff : a.subSku.localeCompare(b.subSku);
            }
            case 'size_desc': {
                const sizeRankDiff = getSizeRank(b.size) - getSizeRank(a.size);
                return sizeRankDiff !== 0 ? sizeRankDiff : a.subSku.localeCompare(b.subSku);
            }
            case 'stock_asc':
                return (a.stock - b.stock) || a.subSku.localeCompare(b.subSku);
            case 'stock_desc':
                return (b.stock - a.stock) || a.subSku.localeCompare(b.subSku);
            case 'onOrder_desc':
                return (b.onOrder - a.onOrder) || a.subSku.localeCompare(b.subSku);
            case 'reserved_desc':
                return (b.reserved - a.reserved) || a.subSku.localeCompare(b.subSku);
            default:
                return a.subSku.localeCompare(b.subSku);
        }
    });

    return sorted;
}

// ... VariantRow Component
const VariantRow = ({ variant, onUpdate, notificationApi }: { variant: VariantData, onUpdate: () => void, notificationApi: any }) => {
    const [loading, setLoading] = useState(false);
    const [stock, setStock] = useState(variant.stock);

    useEffect(() => {
        setStock(variant.stock);
    }, [variant.stock]);

    const handleUpdate = async (newVal: number | null) => {
        if (newVal === null) return;
        const newStock = Math.max(0, newVal);
        setStock(newStock);
        setLoading(true);

        try {
            // Re-use logic: Send array of 1 item to /api/admin/inventory
            const payload = [{
                sku: variant.sku,
                color: variant.color,
                size: variant.size,
                stock: newStock
            }];

            const res = await fetch('/api/admin/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Update failed');

            notificationApi.success({ message: 'Stock updated', description: `${variant.subSku} stock set to ${newStock}` });
            onUpdate(); // Refresh parent data
        } catch (error) {
            notificationApi.error({ message: 'Update failed' });
            setStock(variant.stock); // Revert
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Button
                size="small"
                onClick={() => handleUpdate(stock - 1)}
                disabled={loading || stock <= 0}
            >
                -
            </Button>
            <InputNumber
                size="small"
                min={0}
                value={stock}
                onChange={(val) => handleUpdate(val)}
                disabled={loading}
                className="w-20"
            />
            <Button
                size="small"
                onClick={() => handleUpdate(stock + 1)}
                disabled={loading}
            >
                +
            </Button>
        </div>
    );
};

export default function InventoryPage() {
    const searchParams = useSearchParams();
    const [products, setProducts] = useState<ProductGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [api, contextHolder] = notification.useNotification();
    const { t } = useLanguage();

    // Pagination & Search State
    const [search, setSearch] = useState(searchParams.get('search') || '');
    const [outOfStock, setOutOfStock] = useState(false);
    const [sortBy, setSortBy] = useState<string>('default'); // 'default', 'stock_asc', 'stock_desc'
    const [lowStockCount, setLowStockCount] = useState(0);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 15,
        total: 0
    });

    // Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isReadOnly, setIsReadOnly] = useState(false);
    const [editingProduct, setEditingProduct] = useState<ProductGroup | null>(null);
    const [editedVariants, setEditedVariants] = useState<VariantData[]>([]);
    const [modalSearch, setModalSearch] = useState('');
    const [modalVariantSortBy, setModalVariantSortBy] = useState<VariantSortBy>('default');
    const [expandedVariantSortBy, setExpandedVariantSortBy] = useState<Record<string, VariantSortBy>>({});

    const fetchData = async (page = 1, pageSize = 15, searchTerm = '', showOOS = false, sort = 'default') => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: pageSize.toString(),
                search: searchTerm,
                outOfStock: showOOS.toString()
            });

            if (sort !== 'default') {
                params.append('sortBy', sort);
            }

            const res = await fetch(`/api/admin/inventory?${params}`);
            if (!res.ok) throw new Error('Failed to fetch inventory');
            const data = await res.json();

            setProducts(data.data);
            setLowStockCount(data.lowStockCount || 0);
            setPagination(prev => ({
                ...prev,
                current: data.page,
                total: data.total
            }));
        } catch (error) {
            api.error({ title: 'Error loading inventory' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(pagination.current, pagination.pageSize, search, outOfStock, sortBy);
    }, []);

    const handleTableChange = (newPagination: any) => {
        setPagination(prev => ({ ...prev, current: newPagination.current }));
        fetchData(newPagination.current, newPagination.pageSize, search, outOfStock, sortBy);
    };

    const handleSearch = (value: string) => {
        setSearch(value);
        setPagination(prev => ({ ...prev, current: 1 })); // Reset to page 1
        fetchData(1, pagination.pageSize, value, outOfStock, sortBy);
    };

    const handleFilterOOS = (checked: boolean) => {
        setOutOfStock(checked);
        setPagination(prev => ({ ...prev, current: 1 }));
        fetchData(1, pagination.pageSize, search, checked, sortBy);
    };

    const handleSortChange = (value: string) => {
        setSortBy(value);
        setPagination(prev => ({ ...prev, current: 1 }));
        fetchData(1, pagination.pageSize, search, outOfStock, value);
    };

    const refresh = () => fetchData(pagination.current, pagination.pageSize, search, outOfStock, sortBy);

    const handleView = (record: ProductGroup) => {
        setEditingProduct(record);
        const variants = record.variants ? JSON.parse(JSON.stringify(record.variants)) : [];
        setEditedVariants(variants);
        setModalSearch(''); // Reset modal search
        setIsReadOnly(true);
        setIsModalVisible(true);
    };

    const handleEdit = (record: ProductGroup) => {
        setEditingProduct(record);
        // Safely copy variants, defaulting to empty array if undefined
        const variants = record.variants ? JSON.parse(JSON.stringify(record.variants)) : [];
        setEditedVariants(variants);
        setModalSearch(''); // Reset modal search
        setIsReadOnly(false);
        setIsModalVisible(true);
    };

    const handleStockChange = (variantId: string, newStock: number) => {
        if (isReadOnly) return;
        setEditedVariants(prev => prev.map(v =>
            v.id === variantId ? { ...v, stock: newStock } : v
        ));
    };

    const handleSaveBulk = async () => {
        if (isReadOnly) {
            setIsModalVisible(false);
            return;
        }

        if (!editedVariants.length) return;

        try {
            // Prepare payload: Array of updates
            const payload = editedVariants.map(v => ({
                sku: v.sku, // Parent SKU
                color: v.color,
                size: v.size,
                stock: v.stock
            }));

            const res = await fetch('/api/admin/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Update failed');

            api.success({ title: 'Inventory updated successfully' });
            setIsModalVisible(false);
            setEditingProduct(null);
            fetchData(pagination.current, pagination.pageSize, search, outOfStock, sortBy); // Refresh to get aggregates
        } catch (error) {
            api.error({ title: 'Failed to update inventory' });
        }
    };

    const handleExport = () => {
        async function doExport() {
            try {
                // Fetch all data for export
                const res = await fetch(`/api/admin/inventory?limit=10000&search=${search}`);
                const data = await res.json();

                // Flatten data for export
                const exportData: any[] = [];
                data.data.forEach((p: ProductGroup) => {
                    if (p.variants && p.variants.length > 0) {
                        p.variants.forEach(v => {
                            exportData.push({
                                'Product Name': p.name,
                                'SKU': p.sku,
                                'Sub-SKU': v.subSku,
                                'Color': v.color,
                                'Size': v.size,
                                'On Hand': v.stock,
                                'On Order': v.onOrder,
                                'Reserved': v.reserved
                            });
                        });
                    } else {
                        // Should not happen often but handle single products
                        exportData.push({
                            'Product Name': p.name,
                            'SKU': p.sku,
                            'Sub-SKU': p.sku,
                            'Color': '',
                            'Size': '',
                            'On Hand': p.totalStock,
                            'On Order': 0, // Fallback
                            'Reserved': 0
                        });
                    }
                });

                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(exportData);
                XLSX.utils.book_append_sheet(wb, ws, "Inventory");
                XLSX.writeFile(wb, "Inventory_Export.xlsx");

                api.success({ title: 'Export successful' });
            } catch (error) {
                api.error({ title: 'Export failed' });
            }
        }
        doExport();
    };

    const columns = [
        {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            width: 150,
            render: (sku: string) => <span className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5">{sku}</span>
        },
        {
            title: 'PRODUCT NAME',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <span className="font-medium text-zinc-800 dark:text-zinc-200">{text}</span>
        },
        {
            title: 'TOTAL STOCK',
            dataIndex: 'totalStock',
            key: 'totalStock',
            width: 120,
            render: (total: number) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${total > 0
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                    : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20'
                    }`}>
                    {total}
                </span>
            )
        },
        {
            title: 'ACTIONS',
            key: 'actions',
            align: 'center' as const,
            width: 150,
            render: (_: any, record: ProductGroup) => (
                <Space>
                    <Button
                        icon={<EyeOutlined />}
                        size="small"
                        onClick={() => handleView(record)}
                        className="text-indigo-600 border-indigo-200 hover:text-indigo-700 hover:border-indigo-300 dark:text-indigo-400 dark:border-indigo-500/30 dark:hover:bg-indigo-900/20 bg-transparent"
                    >
                        View
                    </Button>
                    <Button
                        type="primary"
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => handleEdit(record)}
                        className="bg-indigo-600 hover:bg-indigo-500 border-none shadow-md shadow-indigo-500/20"
                    >
                        Edit
                    </Button>
                </Space>
            )
        }
    ];

    // Sub-table for modal or verification? No, requirements say "Bulk Edit Modal"
    const modalColumns = [
        {
            title: 'Color',
            dataIndex: 'color',
            key: 'color',
            render: (c: string) => c || <span className="text-gray-400">N/A</span>
        },
        {
            title: 'Size',
            dataIndex: 'size',
            key: 'size',
            render: (s: string) => s || <span className="text-gray-400">N/A</span>
        },
        {
            title: 'Reserved',
            dataIndex: 'reserved',
            key: 'reserved',
            render: (r: number) => <span className="text-orange-500">{r}</span>
        },
        {
            title: isReadOnly ? 'On Hand' : 'On Hand (Edit)',
            key: 'stock',
            render: (_: any, record: VariantData) => (
                isReadOnly ? (
                    <span className="font-medium">{record.stock}</span>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button
                            size="small"
                            onClick={() => handleStockChange(record.id, Math.max(0, record.stock - 1))}
                        >
                            -
                        </Button>
                        <InputNumber
                            min={0}
                            value={record.stock}
                            onChange={(val) => handleStockChange(record.id, val || 0)}
                            className="w-20"
                            size="small"
                        />
                        <Button
                            size="small"
                            onClick={() => handleStockChange(record.id, record.stock + 1)}
                        >
                            +
                        </Button>
                    </div>
                )
            )
        }
    ];

    // Filter logic for Modal
    const filteredModalVariants = editedVariants.filter(v => {
        if (!modalSearch) return true;
        const lowSearch = modalSearch.toLowerCase();
        return (
            (v.subSku || '').toLowerCase().includes(lowSearch) ||
            v.color.toLowerCase().includes(lowSearch) ||
            v.size.toLowerCase().includes(lowSearch)
        );
    });

    const sortedModalVariants = sortVariants(filteredModalVariants, modalVariantSortBy);

    return (
        <div>
            {contextHolder}
            {lowStockCount > 0 && (
                <div className="mb-6">
                    <Alert
                        message={t.inventoryPage.lowStockWarning}
                        description={
                            <div className="flex items-center gap-2">
                                <span>{t.inventoryPage.lowStockAlert} <b>{lowStockCount}</b> {t.inventoryPage.lowStockAlertEnd}</span>
                                <a className="underline cursor-pointer" onClick={() => handleSortChange('stock_asc')}>
                                    {t.inventoryPage.checkNow}
                                </a>
                            </div>
                        }
                        type="error"
                        showIcon
                        closable
                        className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30"
                    />
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
                        <InboxOutlined style={{ fontSize: '24px' }} />
                    </div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent m-0">
                        {t.inventoryPage.title}
                    </h2>
                </div>
                <div className="flex gap-2 items-center">
                    <Select
                        defaultValue="default"
                        value={sortBy}
                        onChange={handleSortChange}
                        style={{ width: 150 }}
                        options={[
                            { value: 'default', label: 'Default Sort' },
                            { value: 'stock_asc', label: 'Stock: Low->High' },
                            { value: 'stock_desc', label: 'Stock: High->Low' },
                        ]}
                    />
                    <Tag.CheckableTag
                        checked={outOfStock}
                        onChange={handleFilterOOS}
                        className={`cursor-pointer px-3 py-1.5 rounded border border-dashed transition-all select-none
                            ${outOfStock
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'bg-transparent border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-red-400 hover:text-red-500'
                            }
                        `}
                    >
                        Show Out of Stock
                    </Tag.CheckableTag>

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-700 w-[300px] focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                        <InboxOutlined className="text-zinc-400" />
                        <input
                            className="bg-transparent border-none outline-none text-sm text-zinc-700 dark:text-zinc-200 w-full placeholder:text-zinc-400"
                            placeholder="Search SKU or Name"
                            onChange={e => handleSearch(e.target.value)}
                        />
                    </div>
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={handleExport}
                    >
                        Export Excel
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={() => fetchData(pagination.current, pagination.pageSize, search, outOfStock, sortBy)}
                        loading={loading}
                        className="bg-white/50 dark:bg-white/10 border-zinc-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20"
                    >
                        {t.common.refresh}
                    </Button>
                </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden p-1 shadow-sm">
                <Table
                    dataSource={products}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={pagination}
                    onChange={handleTableChange}
                    className="glass-table"
                    expandable={{
                        expandedRowRender: (record) => (
                            <div className="p-4 bg-zinc-50 dark:bg-zinc-900/30 rounded-lg">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Variants / Sub-SKUs</h4>
                                    <Select
                                        value={expandedVariantSortBy[record.id] || 'default'}
                                        onChange={(value) => setExpandedVariantSortBy(prev => ({ ...prev, [record.id]: value }))}
                                        style={{ width: 220 }}
                                        options={[
                                            { value: 'default', label: 'Default Variant Sort' },
                                            { value: 'subSku_asc', label: 'Sub-SKU A->Z' },
                                            { value: 'subSku_desc', label: 'Sub-SKU Z->A' },
                                            { value: 'size_asc', label: 'Size Low->High' },
                                            { value: 'size_desc', label: 'Size High->Low' },
                                            { value: 'stock_asc', label: 'Stock Low->High' },
                                            { value: 'stock_desc', label: 'Stock High->Low' },
                                            { value: 'onOrder_desc', label: 'On Order High->Low' },
                                            { value: 'reserved_desc', label: 'Reserved High->Low' },
                                        ]}
                                    />
                                </div>
                                <Table
                                    dataSource={sortVariants(record.variants || [], expandedVariantSortBy[record.id] || 'default')}
                                    rowKey="id"
                                    pagination={false}
                                    size="small"
                                    columns={[
                                        {
                                            title: 'Sub-SKU',
                                            dataIndex: 'subSku',
                                            key: 'subSku',
                                            render: (text: string) => (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-zinc-700 dark:text-zinc-300 font-semibold bg-white dark:bg-zinc-800 px-2 py-1 border border-zinc-200 dark:border-zinc-700 rounded select-all">
                                                        {text}
                                                    </span>
                                                    <CopyOutlined
                                                        className="text-zinc-400 hover:text-blue-500 cursor-pointer"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(text);
                                                            api.success({ title: 'Copied SKU' });
                                                        }}
                                                    />
                                                </div>
                                            )
                                        },
                                        { title: 'Color', dataIndex: 'color', key: 'color' },
                                        { title: 'Size', dataIndex: 'size', key: 'size' },
                                        {
                                            title: 'On Order',
                                            dataIndex: 'onOrder',
                                            key: 'onOrder',
                                            width: 100,
                                            render: (val: number) => <span className="font-semibold text-blue-600">{val}</span>
                                        },
                                        {
                                            title: 'Stock',
                                            key: 'stock',
                                            width: 300,
                                            render: (_: any, vRecord: VariantData) => (
                                                <VariantRow
                                                    variant={vRecord}
                                                    onUpdate={() => fetchData(pagination.current, pagination.pageSize, search, outOfStock, sortBy)}
                                                    notificationApi={api}
                                                />
                                            )
                                        },
                                        {
                                            title: 'Reserved',
                                            dataIndex: 'reserved',
                                            key: 'reserved',
                                            render: (val: number) => <span className="text-orange-500">{val}</span>
                                        }
                                    ]}
                                />
                            </div>
                        ),
                        rowExpandable: (record) => record.variants && record.variants.length > 0,
                    }}
                />
            </div>

            <Modal
                title={`${isReadOnly ? 'View' : 'Manage'} Inventory: ${editingProduct?.name || ''}`}
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={handleSaveBulk}
                width={700}
                okText={isReadOnly ? "Close" : "Save All Changes"}
                cancelButtonProps={{ style: { display: isReadOnly ? 'none' : 'inline-block' } }}
                maskClosable={true}
            >
                <div className="space-y-4">
                    <div className="text-gray-500">
                        {isReadOnly
                            ? "View current stock levels for each variant."
                            : "Adjust stock levels for each variant below. Changes are saved in bulk."}
                    </div>

                    <div className="flex gap-3">
                        {!isReadOnly && (
                            <Input
                                placeholder="Search Sub-SKU, Color, or Size..."
                                prefix={<InboxOutlined className="text-zinc-400" />}
                                value={modalSearch}
                                onChange={(e) => setModalSearch(e.target.value)}
                                allowClear
                            />
                        )}
                        <Select
                            value={modalVariantSortBy}
                            onChange={(value) => setModalVariantSortBy(value)}
                            style={{ width: 220 }}
                            options={[
                                { value: 'default', label: 'Default Variant Sort' },
                                { value: 'subSku_asc', label: 'Sub-SKU A->Z' },
                                { value: 'subSku_desc', label: 'Sub-SKU Z->A' },
                                { value: 'size_asc', label: 'Size Low->High' },
                                { value: 'size_desc', label: 'Size High->Low' },
                                { value: 'stock_asc', label: 'Stock Low->High' },
                                { value: 'stock_desc', label: 'Stock High->Low' },
                                { value: 'onOrder_desc', label: 'On Order High->Low' },
                                { value: 'reserved_desc', label: 'Reserved High->Low' },
                            ]}
                        />
                    </div>

                    <Table
                        dataSource={sortedModalVariants}
                        columns={modalColumns}
                        rowKey="id"
                        pagination={false}
                        size="small"
                        scroll={{ y: 400 }}
                    />
                </div>
            </Modal>
        </div >
    );
}
