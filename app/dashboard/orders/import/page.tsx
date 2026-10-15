'use client';

import React, { useState } from 'react';
import { Card, Upload, Button, App, Steps, Result, Table, Tag, Typography, Alert, Space, Collapse, Descriptions, Checkbox, Segmented, Modal } from 'antd';
import {
    InboxOutlined, CheckCircleOutlined, WalletOutlined, DollarCircleOutlined, CalculatorOutlined, DownloadOutlined, InfoCircleOutlined, ExpandOutlined, CompressOutlined, EyeOutlined, LinkOutlined


} from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/Providers/LanguageContext';
import * as XLSX from 'xlsx';
import { Input, Select } from 'antd';
import { POSITION_SELECT_OPTIONS } from '@/lib/positions';

const { Dragger } = Upload;
const { Text } = Typography;

export default function ImportOrdersPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const { t } = useLanguage();

    const [currentStep, setCurrentStep] = useState(0);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [uploading, setUploading] = useState(false);

    // Parsed Data State
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [importResult, setImportResult] = useState<any>(null);
    const [walletBalance, setWalletBalance] = useState<number>(0);
    const [analysisSummary, setAnalysisSummary] = useState<any>(null);
    const [priorityFeeSettings, setPriorityFeeSettings] = useState({
        priorityProductionFee: 0,
        priorityShippingFee: 0
    });

    // Expand/Collapse state
    const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

    // "Error Import" dialog — lists every rejected row (Order Id + reason) in one
    // place instead of making the seller hunt through the review table.
    const [errorModal, setErrorModal] = useState<{
        open: boolean;
        fileName: string;
        rows: { orderId: string; error: string }[];
    }>({ open: false, fileName: '', rows: [] });

    const collectRowErrors = (rows: any[]) => {
        const problems: { orderId: string; error: string }[] = [];
        rows.forEach((row: any, idx: number) => {
            const errors: string[] = Array.isArray(row?.errors) ? row.errors : [];
            if (errors.length === 0) return;
            const orderId = String(row?.id || row?.sourceOrderCode || '').trim() || `Row ${idx + 1}`;
            errors.forEach((error) => problems.push({ orderId, error: String(error) }));
        });
        return problems;
    };

    const downloadErrorReport = () => {
        const rows = [['Order Id', 'Error'], ...errorModal.rows.map((r) => [r.orderId, r.error])];
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        const csv = XLSX.utils.sheet_to_csv(sheet);
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `import-errors-${(errorModal.fileName || 'file').replace(/\.[^.]+$/, '')}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // 'standard' = the emfulfill template; 'etsy' = a raw Etsy export auto-mapped.
    const [importSource, setImportSource] = useState<'standard' | 'etsy'>('standard');
    const [converting, setConverting] = useState(false);

    // Convert an Etsy file into a pre-filled emfulfill template and download it,
    // so the seller can add the per-order design/positions in Excel then import.
    const handleEtsyToTemplate = async (format: 'xlsx' | 'csv' = 'xlsx') => {
        if (fileList.length === 0) { message.warning('Select an Etsy file first'); return; }
        setConverting(true);
        try {
            const fd = new FormData();
            fd.append('file', (fileList[0].originFileObj || fileList[0]) as any);
            fd.append('format', format);
            const res = await fetch('/api/import/etsy-template', { method: 'POST', body: fd });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                message.error(d.error || 'Convert failed');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'csv' ? 'emfulfill_from_etsy.csv' : 'emfulfill_from_etsy.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            message.success(format === 'csv'
                ? 'CSV downloaded. Paste it into your Google Sheet template, fill designs, then import as "emfulfill Template".'
                : 'Template downloaded. Fill in the design / position columns, then import it as "emfulfill Template".');
        } catch (e) {
            message.error('Convert error');
        } finally {
            setConverting(false);
        }
    };

    const handleFileUpload = async () => {
        const formData = new FormData();
        fileList.forEach((file) => {
            formData.append('file', (file.originFileObj || file) as any);
        });
        if (importSource === 'etsy') {
            formData.append('source', 'etsy');
        }

        setUploading(true);
        try {
            const res = await fetch('/api/import', { method: 'POST', body: formData });
            const data = await res.json();

            if (res.ok && data.success && data.dryRun) {
                const rows = data.parsedOrders.map((o: any, idx: number) => ({
                    ...o,
                    key: o.id || o.tempId || `row-${idx}`
                }));
                setParsedData(rows);
                setAnalysisSummary(data.summary || null);
                setWalletBalance(data.walletBalance || 0);
                setPriorityFeeSettings(data.priorityFees || {
                    priorityProductionFee: 0,
                    priorityShippingFee: 0
                });
                // Pre-select fully-valid orders AND design-request (incomplete)
                // orders — both are importable; design requests come in at $0.
                const validKeys = rows.filter((r: any) => r.valid || r.incomplete).map((r: any) => r.key);
                setSelectedRowKeys(validKeys);
                setExpandedRowKeys([]); // Start collapsed
                setCurrentStep(1);

                // Surface every rejected row up-front in one dialog, the way the
                // rows would otherwise only be visible by scanning the table.
                const problems = collectRowErrors(rows);
                if (problems.length > 0) {
                    setErrorModal({
                        open: true,
                        fileName: fileList[0]?.name || 'import file',
                        rows: problems
                    });
                }
            } else {
                setAnalysisSummary(null);
                message.error(data.error || 'Failed to parse file');
            }
        } catch (error) {
            console.error(error);
            message.error('Network error during upload');
        } finally {
            setUploading(false);
        }
    };

    const handleConfirmImport = async () => {
        if (selectedRowKeys.length === 0) {
            message.warning('Please select at least one order to import');
            return;
        }

        // A short wallet no longer blocks the import — the server parks those orders
        // as "Awaiting Funds" and tells us how much is missing.
        setUploading(true);
        try {
            const ordersToImport = parsedData.filter(row => selectedRowKeys.includes(row.key));

            const res = await fetch('/api/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orders: ordersToImport })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setImportResult({
                    success: true,
                    count: data.importedCount,
                    message: data.message,
                    fundsShort: Boolean(data.fundsShort),
                    shortfall: Number(data.shortfall || 0),
                    totalCost: Number(data.totalCost || 0),
                    walletBalance: Number(data.walletBalance || 0)
                });
                setCurrentStep(2);
            } else if (Array.isArray(data.duplicateOrders) && data.duplicateOrders.length > 0) {
                // Show the same "Error Import" dialog for server-side rejections.
                setErrorModal({
                    open: true,
                    fileName: fileList[0]?.name || 'import file',
                    rows: data.duplicateOrders.flatMap((d: any) =>
                        (d.errors || []).map((error: string) => ({
                            orderId: String(d.orderCode || d.source || '').trim() || '-',
                            error: String(error)
                        }))
                    )
                });
            } else {
                message.error(data.error || 'Import failed');
            }
        } catch (error) {
            console.error(error);
            message.error('Import execution failed');
        } finally {
            setUploading(false);
        }
    };

    // Expand All / Collapse All
    const handleExpandAll = () => {
        setExpandedRowKeys(parsedData.map(r => r.key));
    };

    const handleCollapseAll = () => {
        setExpandedRowKeys([]);
    };

    const getPriorityTotal = (order: any) => {
        const productionFee = order.priorityProduction ? Number(order.priorityProductionFee || priorityFeeSettings.priorityProductionFee || 0) : 0;
        const shippingFee = order.priorityShipping ? Number(order.priorityShippingFee || priorityFeeSettings.priorityShippingFee || 0) : 0;
        return Number((productionFee + shippingFee).toFixed(2));
    };

    const handlePriorityToggle = (key: React.Key, field: 'priorityProduction' | 'priorityShipping', checked: boolean) => {
        setParsedData(prev => prev.map(row => {
            if (row.key !== key) return row;

            const nextRow = {
                ...row,
                [field]: checked,
                priorityProductionFee: row.priorityProductionFee ?? priorityFeeSettings.priorityProductionFee,
                priorityShippingFee: row.priorityShippingFee ?? priorityFeeSettings.priorityShippingFee,
            };
            const baseCost = Number(nextRow.baseCost ?? ((row.totalCost || 0) - getPriorityTotal(row)));
            const totalCost = Number((baseCost + getPriorityTotal(nextRow)).toFixed(2));

            return {
                ...nextRow,
                baseCost,
                totalCost
            };
        }));
    };

    const [recomputing, setRecomputing] = useState(false);

    // --- Inline editing of review rows (fix wrong SKU/color/size/designs, then recompute) ---
    const getDesigns = (item: any): any[] => {
        try { const d = JSON.parse(item?.designs || '[]'); return Array.isArray(d) ? d : []; } catch { return []; }
    };
    const patchItem = (key: React.Key, patch: any) => {
        setParsedData(prev => prev.map(o => o.key === key
            ? { ...o, items: [{ ...(o.items?.[0] || {}), ...patch }] }
            : o));
    };
    const patchOrder = (key: React.Key, patch: any) => {
        setParsedData(prev => prev.map(o => o.key === key ? { ...o, ...patch } : o));
    };
    const setDesigns = (key: React.Key, designs: any[]) => {
        patchItem(key, { designs: JSON.stringify(designs) });
    };

    // Rebuild the standard template from the (edited) review rows and re-upload so
    // the server re-parses, re-validates and re-prices everything — including
    // per-position embroidery fees driven by the design positions.
    const handleRecompute = async () => {
        setRecomputing(true);
        try {
            const maxK = Math.max(1, ...parsedData.map(o => getDesigns(o.items?.[0]).length || 0));
            const rows = parsedData.map((o: any) => {
                const it = o.items?.[0] || {};
                const designs = getDesigns(it);
                const row: any = {
                    'ORDER ID': o.tempId || o.id || o.sourceOrderCode || '',
                    'PRODUCT SKU': it.sku || '',
                    'QUANTITY': it.qty || 1,
                    'COLOR': it.color || '',
                    'SIZE': it.size || '',
                    'SHIPPING NAME': o.recipientName || '',
                    'SHIPPING PHONE': o.phone || '',
                    'Address1': o.address1 || '',
                    'Address2': o.address2 || '',
                    'City': o.city || '',
                    'State': o.state || '',
                    'Zip': o.zip || '',
                    'Country': o.country || '',
                    'SELLER SKU': it.shippingLabel || '',
                    'NOTE': it.notes || '',
                };
                for (let k = 1; k <= maxK; k++) {
                    const d = designs[k - 1] || {};
                    row[`POSITION ${k}`] = d.location || d.position || '';
                    row[`DESIGN ${k}`] = d.url || '';
                    row[`MOCKUP ${k}`] = d.mockup || '';
                    row[`TYPE ${k}`] = d.type || 'Embroidery';
                }
                return row;
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Orders');
            const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
            const file = new File([buf], 'recompute.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/import', { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok && data.success && data.dryRun) {
                const newRows = data.parsedOrders.map((o: any, idx: number) => ({ ...o, key: o.id || o.tempId || `row-${idx}` }));
                setParsedData(newRows);
                setWalletBalance(data.walletBalance || 0);
                setSelectedRowKeys(newRows.filter((r: any) => r.valid || r.incomplete).map((r: any) => r.key));
                message.success('Prices recalculated');
            } else {
                message.error(data.error || 'Recompute failed');
            }
        } catch (e) {
            console.error(e);
            message.error('Recompute error');
        } finally {
            setRecomputing(false);
        }
    };

    // Expandable Row Render - Editable Item Details
    const expandedRowRender = (record: any) => {
        const item = record.items?.[0] || {};
        const designs = getDesigns(item);
        return (
            <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 space-y-3">
                <div className="flex flex-wrap gap-3">
                    <label className="text-xs">Product SKU
                        <Input size="small" className="w-40 block" value={item.sku}
                            onChange={(e) => patchItem(record.key, { sku: e.target.value })} />
                    </label>
                    <label className="text-xs">Color
                        <Input size="small" className="w-32 block" value={item.color}
                            onChange={(e) => patchItem(record.key, { color: e.target.value })} />
                    </label>
                    <label className="text-xs">Size
                        <Input size="small" className="w-24 block" value={item.size}
                            onChange={(e) => patchItem(record.key, { size: e.target.value })} />
                    </label>
                    <label className="text-xs">Qty
                        <Input size="small" type="number" className="w-20 block" value={item.qty}
                            onChange={(e) => patchItem(record.key, { qty: Number(e.target.value) || 1 })} />
                    </label>
                    <label className="text-xs">Seller SKU
                        <Input size="small" className="w-36 block" value={item.shippingLabel}
                            onChange={(e) => patchItem(record.key, { shippingLabel: e.target.value })} />
                    </label>
                </div>

                <div className="flex gap-4 text-xs text-zinc-500">
                    <span>Price: <b>${item.priceToCharge?.toFixed(2) || '0.00'}</b></span>
                    <span>Shipping: <b>${item.shippingCost?.toFixed(2) || '0.00'}</b></span>
                    <span>Extra fees: <b className="text-amber-600">${item.extraFees?.toFixed(2) || '0.00'}</b></span>
                </div>

                <label className="text-xs block">Notes (personalization)
                    <Input.TextArea size="small" autoSize={{ minRows: 1, maxRows: 4 }} value={item.notes}
                        onChange={(e) => patchItem(record.key, { notes: e.target.value })} />
                </label>

                <div>
                    <div className="flex items-center justify-between mb-1">
                        <Text strong className="text-xs">Designs / print positions (drives extra fees)</Text>
                        <Button size="small" onClick={() => setDesigns(record.key, [...designs, { location: 'CENTER_CHEST', url: '', mockup: '', type: 'Embroidery' }])}>+ Add position</Button>
                    </div>
                    {designs.length === 0 && <Text type="secondary" className="text-xs">No designs — add at least Position 1.</Text>}
                    {designs.map((d: any, i: number) => (
                        <div key={i} className="flex flex-wrap gap-2 mb-1 items-center">
                            <Select size="small" className="w-40" placeholder="Position" showSearch
                                options={POSITION_SELECT_OPTIONS} value={d.location || d.position || undefined}
                                onChange={(val) => { const nd = [...designs]; nd[i] = { ...d, location: val }; setDesigns(record.key, nd); }} />
                            <Input size="small" className="w-64" placeholder="Design link" value={d.url || ''}
                                onChange={(e) => { const nd = [...designs]; nd[i] = { ...d, url: e.target.value }; setDesigns(record.key, nd); }} />
                            <Input size="small" className="w-32" placeholder="Mockup" value={d.mockup || ''}
                                onChange={(e) => { const nd = [...designs]; nd[i] = { ...d, mockup: e.target.value }; setDesigns(record.key, nd); }} />
                            <Input size="small" className="w-28" placeholder="Type" value={d.type || ''}
                                onChange={(e) => { const nd = [...designs]; nd[i] = { ...d, type: e.target.value }; setDesigns(record.key, nd); }} />
                            <Button size="small" danger onClick={() => setDesigns(record.key, designs.filter((_: any, j: number) => j !== i))}>×</Button>
                        </div>
                    ))}
                </div>

                {record.errors && record.errors.length > 0 && (
                    <Alert type="error" showIcon className="text-xs" message={record.errors.join('; ')} />
                )}
            </div>
        );
    };

    // Table Columns
    const columns: ColumnsType<any> = [
        {
            title: 'Status',
            key: 'valid',
            render: (_, record) => (
                record.duplicate
                    ? <Tag color="warning">Duplicate</Tag>
                    : record.valid
                        ? <Tag color="success">Valid</Tag>
                        : record.incomplete
                            ? <Tag color="orange">Design Request</Tag>
                            : <Tag color="error">Error</Tag>
            ),
            width: 110
        },
        {
            title: 'Order ID',
            dataIndex: 'id',
            key: 'id',
            render: (text) => text || <Text type="secondary">(New)</Text>
        },
        {
            title: 'Recipient',
            dataIndex: 'recipientName',
            key: 'recipient',
        },
        {
            title: 'Address',
            key: 'address',
            render: (_, record) => (
                <div className="text-xs">
                    {record.address1}{record.address2 && `, ${record.address2}`}<br />
                    {record.city}, {record.state} {record.zip}<br />
                    {record.country}
                </div>
            )
        },
        {
            title: 'Items',
            key: 'itemCount',
            render: (_, record) => (
                <Text>{record.items?.length || 0} item(s)</Text>
            ),
            width: 100
        },
        {
            title: 'Cost',
            dataIndex: 'totalCost',
            key: 'cost',
            render: (val, record) => (
                <div>
                    <Text strong type="success">${val ? val.toFixed(2) : '0.00'}</Text>
                    {record.incomplete ? (
                        <div className="text-[11px] text-yellow-600">priced after completion</div>
                    ) : getPriorityTotal(record) > 0 && (
                        <div className="text-[11px] text-blue-500">
                            includes priority ${getPriorityTotal(record).toFixed(2)}
                        </div>
                    )}
                </div>
            ),
            width: 100
        },
        {
            title: 'Priority Production',
            key: 'priorityProduction',
            render: (_, record) => (
                <Checkbox
                    checked={Boolean(record.priorityProduction)}
                    disabled={!record.valid}
                    onChange={(event) => handlePriorityToggle(record.key, 'priorityProduction', event.target.checked)}
                >
                    ${Number(record.priorityProductionFee ?? priorityFeeSettings.priorityProductionFee ?? 0).toFixed(2)}
                </Checkbox>
            ),
            width: 170
        },
        {
            title: 'Priority Shipping',
            key: 'priorityShipping',
            render: (_, record) => (
                <Checkbox
                    checked={Boolean(record.priorityShipping)}
                    disabled={!record.valid}
                    onChange={(event) => handlePriorityToggle(record.key, 'priorityShipping', event.target.checked)}
                >
                    ${Number(record.priorityShippingFee ?? priorityFeeSettings.priorityShippingFee ?? 0).toFixed(2)}
                </Checkbox>
            ),
            width: 160
        },
        {
            title: 'Issues',
            dataIndex: 'errors',
            key: 'errors',
            render: (errors) => (
                errors && errors.length > 0 ? (
                    <div className="text-xs text-red-500 max-h-20 overflow-y-auto">
                        {errors.map((e: string, i: number) => <div key={i}>- {e}</div>)}
                    </div>
                ) : <CheckCircleOutlined className="text-green-500" />
            )
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Button
                    type="text"
                    icon={<EyeOutlined />}
                    onClick={() => {
                        if (expandedRowKeys.includes(record.key)) {
                            setExpandedRowKeys(expandedRowKeys.filter(k => k !== record.key));
                        } else {
                            setExpandedRowKeys([...expandedRowKeys, record.key]);
                        }
                    }}
                >
                    {expandedRowKeys.includes(record.key) ? 'Hide' : 'View'}
                </Button>
            ),
            width: 100
        }
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (newSelectedRowKeys: React.Key[]) => {
            setSelectedRowKeys(newSelectedRowKeys);
        },
        getCheckboxProps: (record: any) => ({
            // Design-request (incomplete) orders can be imported too — at $0, to be
            // completed later. Only hard-blocked rows (duplicate / bad qty) are locked.
            disabled: !record.valid && !record.incomplete,
        }),
    };

    const props = {
        onRemove: (file: UploadFile) => {
            const index = fileList.indexOf(file);
            const newFileList = fileList.slice();
            newFileList.splice(index, 1);
            setFileList(newFileList);
        },
        beforeUpload: (file: UploadFile) => {
            setFileList([file]);
            return false;
        },
        fileList,
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">{t.importPage.title}</h1>

            <Steps
                current={currentStep}
                className="mb-8"
                items={[
                    { title: t.importPage.uploadFile, subTitle: t.importPage.dragAndDrop?.substring(0, 15) + '...' },
                    { title: t.common.view, subTitle: t.ordersPage.items },
                    { title: t.common.success, subTitle: t.status.completed }
                ]}
            />

            {/* Step 0: Upload */}
            {currentStep === 0 && (
                <Card title="Upload File">
                    <div className="mb-4">
                        <Segmented
                            block
                            value={importSource}
                            onChange={(val) => setImportSource(val as 'standard' | 'etsy')}
                            options={[
                                { label: 'emfulfill Template', value: 'standard' },
                                { label: 'Etsy Order File', value: 'etsy' },
                            ]}
                        />
                    </div>

                    {importSource === 'etsy' && (
                        <Alert
                            type="info"
                            showIcon
                            className="mb-4"
                            message="Import directly from an Etsy order export"
                            description={
                                <span>
                                    Upload the raw Etsy “Sold Order Items” CSV. Orders are auto-filled from your{' '}
                                    <a onClick={() => router.push('/dashboard/etsy-mapping')} className="text-blue-600 cursor-pointer font-medium">Etsy Mapping</a>{' '}
                                    (design, garment style and colors). Any Etsy SKU without a mapping will show as invalid — add it in Etsy Mapping, then re-upload.
                                </span>
                            }
                        />
                    )}

                    <Dragger {...props} accept=".xlsx,.xls,.xlsm,.csv" maxCount={1}>
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag file here</p>
                        <p className="ant-upload-hint">
                            {importSource === 'etsy'
                                ? 'Upload the raw Etsy Sold Order Items export (.csv). No manual mapping needed.'
                                : 'Supports Excel (.xlsx, .xls, .xlsm) and CSV files. Design 1 & Position 1 are required.'}
                        </p>
                    </Dragger>
                    <Button
                        type="primary"
                        onClick={handleFileUpload}
                        disabled={fileList.length === 0}
                        loading={uploading}
                        className="mt-4 w-full"
                        size="large"
                    >
                        {importSource === 'etsy' ? 'Analyze & Import Directly' : 'Analyze File'}
                    </Button>

                    {importSource === 'etsy' && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => handleEtsyToTemplate('xlsx')}
                                disabled={fileList.length === 0}
                                loading={converting}
                            >
                                Convert → Excel (.xlsx)
                            </Button>
                            <Button
                                icon={<LinkOutlined />}
                                onClick={() => handleEtsyToTemplate('csv')}
                                disabled={fileList.length === 0}
                                loading={converting}
                            >
                                Convert → Google Sheet (.csv)
                            </Button>
                        </div>
                    )}

                    <div className="mt-6">
                        <Space className="w-full justify-between flex-wrap" align="center">
                            <Text strong>Need a template?</Text>
                            <Space wrap>
                                <Button
                                    icon={<DownloadOutlined />}
                                    href="/emfulfill_order_import_template.xlsx"
                                    download="emfulfill_order_import_template.xlsx"
                                >
                                    Excel Template
                                </Button>
                                <Button
                                    icon={<LinkOutlined />}
                                    href="https://docs.google.com/spreadsheets/d/1vgRRohQGiWwxOlqi8MyxHKh-aDVTMHXE/edit?usp=drive_link&ouid=109690427497018949890&rtpof=true&sd=true"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Google Sheet Template
                                </Button>
                            </Space>
                        </Space>
                    </div>

                    <div className="mt-8">
                        <Collapse
                            items={[{
                                key: '1',
                                label: <Space><InfoCircleOutlined className="text-blue-500" /> <Text strong>Import Rules & Requirements</Text></Space>,
                                children: (
                                    <ul className="list-disc pl-5 space-y-1 text-zinc-600">
                                        <li><Text strong>File Format:</Text> Excel (.xlsx, .xls, .xlsm) or CSV.</li>
                                        <li><Text strong>Design 1 & Position 1:</Text> Must be present together. If you specify a design file, you must specify the print position.</li>
                                        <li><Text strong>Required Fields:</Text>
                                            <ul className="list-circle pl-5 mt-1">
                                                <li>Order ID (leave blank for new auto-gen ID)</li>
                                                <li>SKU (must match an existing product variant)</li>
                                                <li>Recipient Name</li>
                                                <li>Address Line 1</li>
                                                <li>City, State, Zip, Country</li>
                                            </ul>
                                        </li>
                                        <li><Text strong>Missing info → Design Request:</Text> Rows missing SKU/blank, a design link or a position still import — at $0 with status "Design Request". Complete them later in Orders → Edit and they become Pending Approval and get priced. Only duplicates and invalid quantities are blocked.</li>
                                    </ul>
                                )
                            }]}
                        />
                    </div>
                </Card>
            )}

            {/* Step 1: Review Table */}
            {currentStep === 1 && (
                <Card
                    title={
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <span>Review Orders ({selectedRowKeys.length} selected)</span>
                            <div className="flex items-center gap-2">
                                <Button icon={<ExpandOutlined />} onClick={handleExpandAll} size="small">
                                    Expand All
                                </Button>
                                <Button icon={<CompressOutlined />} onClick={handleCollapseAll} size="small">
                                    Collapse All
                                </Button>
                                <Button icon={<CalculatorOutlined />} onClick={handleRecompute} loading={recomputing} size="small" type="primary" ghost>
                                    Save &amp; Recompute
                                </Button>
                                <span className="text-gray-500 mx-2">
                                    Total Cost: <span className="text-green-600 font-bold">
                                        ${parsedData.filter(r => selectedRowKeys.includes(r.key)).reduce((acc, curr) => acc + curr.totalCost, 0).toFixed(2)}
                                    </span>
                                </span>
                                <Button onClick={() => {
                                    setCurrentStep(0);
                                    setFileList([]);
                                    setParsedData([]);
                                    setSelectedRowKeys([]);
                                    setAnalysisSummary(null);
                                }}>
                                    Cancel
                                </Button>
                                <Button type="primary" onClick={handleConfirmImport} loading={uploading}>
                                    Import Selected
                                </Button>
                            </div>
                        </div>
                    }
                >
                    <div className="mb-8">
                        <Alert
                            message="Check the orders you want to import. Click 'View' or expand rows to see item details."
                            type="info"
                            showIcon
                        />
                    </div>

                    {analysisSummary?.designRequestOrders > 0 && (
                        <div className="mb-6">
                            <Alert
                                message={`${analysisSummary.designRequestOrders} order(s) are missing info — importable as "Design Request"`}
                                description="These orders don't have enough info yet (SKU/blank, design link or position). They import at $0 with status Design Request. Fill in the missing info later in Orders → Edit and they automatically become Pending Approval and get priced. Only duplicates and bad quantities are blocked."
                                type="warning"
                                showIcon
                            />
                        </div>
                    )}

                    {analysisSummary?.duplicateCount > 0 && (
                        <div className="mb-6">
                            <Alert
                                message={`Detected ${analysisSummary.duplicateCount} duplicate order(s)`}
                                description={`Blocked ${analysisSummary.duplicateInFileCount || 0} duplicate order(s) inside this file and ${analysisSummary.duplicateExistingCount || 0} order(s) that already exist in the system. Duplicate orders cannot be selected for import.`}
                                type="warning"
                                showIcon
                            />
                        </div>
                    )}

                    {/* Balance & Stats Cards */}
                    {(() => {
                        const selectedTotal = parsedData.filter(r => selectedRowKeys.includes(r.key)).reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
                        const isInsufficient = selectedTotal > walletBalance;
                        const remaining = walletBalance - selectedTotal;

                        return (
                            <div className="mb-6 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Wallet Balance Card */}
                                    <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm flex items-center justify-between">
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Wallet Balance</p>
                                            <p className={`text-2xl font-bold ${walletBalance === 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                                                ${walletBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600">
                                            <WalletOutlined style={{ fontSize: '24px' }} />
                                        </div>
                                    </div>

                                    {/* Selected Cost Card */}
                                    <div className={`p-4 rounded-lg border shadow-sm flex items-center justify-between ${isInsufficient ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700'}`}>
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Selected Total</p>
                                            <p className={`text-2xl font-bold ${isInsufficient ? 'text-red-600' : 'text-blue-600'}`}>
                                                ${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className={`p-3 rounded-full ${isInsufficient ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600'}`}>
                                            <DollarCircleOutlined style={{ fontSize: '24px' }} />
                                        </div>
                                    </div>

                                    {/* Remaining Card */}
                                    <div className={`p-4 rounded-lg border shadow-sm flex items-center justify-between ${remaining < 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700'}`}>
                                        <div>
                                            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wider">Remaining (Est)</p>
                                            <p className={`text-2xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                ${remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                        <div className={`p-3 rounded-full ${remaining < 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-green-50 dark:bg-green-900/20 text-green-600'}`}>
                                            <CalculatorOutlined style={{ fontSize: '24px' }} />
                                        </div>
                                    </div>
                                </div>

                                {isInsufficient && (
                                    <Alert
                                        message={<span className="font-bold">Not enough balance — orders will wait for funds</span>}
                                        description={`You can still import. These orders will be saved with status "Awaiting Funds" (missing $${(selectedTotal - walletBalance).toFixed(2)}) and move to Pending Approval automatically once you top up your wallet.`}
                                        type="warning"
                                        showIcon
                                        className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"
                                    />
                                )}
                            </div>
                        );
                    })()}
                    <Table
                        dataSource={parsedData}
                        columns={columns}
                        rowSelection={rowSelection}
                        pagination={false}
                        size="small"
                        rowClassName={(record) => record.duplicate ? 'bg-amber-50 dark:bg-amber-900/10' : record.incomplete ? 'bg-yellow-50 dark:bg-yellow-900/10' : !record.valid ? 'bg-red-50 dark:bg-red-900/10' : ''}
                        expandable={{
                            expandedRowRender,
                            expandedRowKeys,
                            onExpand: (expanded, record) => {
                                if (expanded) {
                                    setExpandedRowKeys([...expandedRowKeys, record.key]);
                                } else {
                                    setExpandedRowKeys(expandedRowKeys.filter(k => k !== record.key));
                                }
                            },
                            rowExpandable: () => true,
                        }}
                        scroll={{ x: 1300, y: 'calc(100vh - 500px)' }}
                    />
                </Card>
            )}

            {/* Step 2: Result */}
            {currentStep === 2 && importResult && (
                <Card>
                    <Result
                        status={importResult.fundsShort ? 'warning' : 'success'}
                        title={importResult.fundsShort ? 'Imported — waiting for funds' : 'Import Successful!'}
                        subTitle={importResult.fundsShort
                            ? `Created ${importResult.count} orders with status AWAITING FUNDS.`
                            : `Created ${importResult.count} orders. Status: PENDING_APPROVAL.`}
                        extra={[
                            <Button key="view" onClick={() => router.push('/dashboard/orders')}>
                                View Orders
                            </Button>,
                            <Button type="primary" key="console" onClick={() => {
                                setCurrentStep(0);
                                setFileList([]);
                                setParsedData([]);
                                setSelectedRowKeys([]);
                                setAnalysisSummary(null);
                            }}>
                                Import More
                            </Button>
                        ]}
                    >
                        {importResult.fundsShort ? (
                            <Alert
                                type="warning"
                                showIcon
                                message={`You need $${Number(importResult.shortfall).toFixed(2)} more to release these orders`}
                                description={
                                    <div className="text-sm">
                                        <div>Orders total: <b>${Number(importResult.totalCost).toFixed(2)}</b></div>
                                        <div>Wallet balance: <b>${Number(importResult.walletBalance).toFixed(2)}</b></div>
                                        <div className="mt-1">
                                            Missing: <b className="text-red-600">${Number(importResult.shortfall).toFixed(2)}</b>
                                        </div>
                                        <div className="mt-2">
                                            Your orders are saved with status <b>Awaiting Funds</b>. Top up your wallet and
                                            they move to <b>Pending Approval</b> automatically — no need to import again.
                                        </div>
                                    </div>
                                }
                                action={
                                    <Button size="small" type="primary" onClick={() => router.push('/dashboard/wallet')}>
                                        Top Up
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="desc">
                                <Text>
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} /> Your orders have been created and are waiting for Admin Approval.
                                </Text>
                                <br />
                                <Text type="secondary" className="ml-5">
                                    Note: Wallet will be deducted only when Admin approves the order.
                                </Text>
                            </div>
                        )}
                    </Result>
                </Card>
            )}

            {/* Error Import dialog — one line per rejected row, with a downloadable report */}
            <Modal
                open={errorModal.open}
                onCancel={() => setErrorModal((prev) => ({ ...prev, open: false }))}
                onOk={() => setErrorModal((prev) => ({ ...prev, open: false }))}
                okText="OK"
                cancelButtonProps={{ style: { display: 'none' } }}
                width={640}
                title={<span className="text-red-600 font-semibold">Error Import</span>}
            >
                <div className="mb-3 text-sm">
                    File: <b>{errorModal.fileName}</b>
                </div>

                <div className="max-h-[320px] overflow-y-auto pr-1">
                    {errorModal.rows.map((row, i) => (
                        <div key={i} className="flex gap-2 py-1 text-sm border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                            <span className="font-semibold whitespace-nowrap">Order Id</span>
                            <span className="font-mono">{row.orderId}</span>
                            <span>:</span>
                            <span className="text-red-600">{row.error}</span>
                        </div>
                    ))}
                </div>

                <Button
                    type="link"
                    icon={<DownloadOutlined />}
                    className="mt-3 !px-0"
                    onClick={downloadErrorReport}
                >
                    Download File
                </Button>
            </Modal>
        </div>
    );
}
