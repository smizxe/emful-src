'use client';

import React from 'react';
import { Table, Tag, Card, Checkbox } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';

interface OrderType {
    id: string;
    orderCode: string;
    status: string;
    shippingStatus?: string | null;
    totalAmount: number;
    trackingNumber: string | null;
    createdAt: Date;
    source?: string;
    jobs?: any[];
    priorityProduction?: boolean;
    priorityShipping?: boolean;
    priorityProductionFee?: number;
    priorityShippingFee?: number;
}

import { EyeOutlined, WarningOutlined, EditOutlined, DownloadOutlined, PrinterOutlined, CopyOutlined, CameraOutlined, DeleteOutlined } from '@ant-design/icons';
import { Button, Tooltip, Select, Input, message, Modal, Image, Popconfirm } from 'antd';
import { useEffect, useState, useMemo } from 'react';
// OrderDetailsModal import removed
import ReportTicketModal from './ReportTicketModal';
import EditOrderModal from './EditOrderModal';

import { useRouter } from 'next/navigation';
import { SearchOutlined } from '@ant-design/icons';

import { useLanguage } from '@/components/Providers/LanguageContext';
import { getShippingStatusLabel } from '@/lib/shippingStatus';
import { getOrderDesignStatus } from '@/lib/designStatus';
import { getOrderStatusLabel } from '@/lib/orderStatus';

// Sellers asked to size the columns themselves, Excel-style. Widths are remembered
// per browser so the layout someone sets up stays put between visits.
const MIN_COLUMN_WIDTH = 44;
const COLUMN_WIDTHS_STORAGE_KEY = 'emfulfill.sellerOrders.columnWidths';

/**
 * Header cell with a drag handle on its right edge. Dragging reports the new width
 * to the table; the handle swallows the click so resizing never triggers the sorter.
 */
function ResizableTitle({ onResize, width, ...thProps }: any) {
    if (!width || typeof onResize !== 'function') {
        return <th {...thProps} />;
    }

    const beginResize = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const startX = event.clientX;
        const startWidth = Number(width);

        const handleMove = (moveEvent: MouseEvent) => {
            onResize(Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX));
        };
        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        // Keep the resize cursor while dragging even if the pointer leaves the header.
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    return (
        <th {...thProps} style={{ ...thProps.style, position: 'relative' }}>
            {thProps.children}
            <span
                className="orders-col-resizer"
                onMouseDown={beginResize}
                onClick={(event) => event.stopPropagation()}
            />
        </th>
    );
}

export default function OrdersTable({ orders }: { orders: any[] }) {
    const router = useRouter();
    const { t } = useLanguage();
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [designFilter, setDesignFilter] = useState<string>('ALL');
    const [searchText, setSearchText] = useState('');
    // Antd keeps the current page when the rows change, so a search made from
    // page 3 would land on page 3 of a one-row result and look empty.
    const [page, setPage] = useState(1);
    const [designChoiceId, setDesignChoiceId] = useState<string | null>(null);

    // Photos of the finished garment the shop uploaded for this order.
    const [photoOrder, setPhotoOrder] = useState<OrderType | null>(null);

    const orderPhotos = (order?: OrderType | null): string[] => {
        const out: string[] = [];
        for (const job of order?.jobs || []) {
            try {
                const parsed = JSON.parse(job?.productPhotos || '[]');
                if (Array.isArray(parsed)) out.push(...parsed.filter((u: unknown) => typeof u === 'string' && u));
            } catch {
                // a malformed value just means no photos for that item
            }
        }
        return Array.from(new Set(out));
    };

    // The same photos with the item each belongs to, so one can be deleted.
    const orderPhotoEntries = (order?: OrderType | null): { jobId: string; url: string }[] => {
        const seen = new Set<string>();
        const out: { jobId: string; url: string }[] = [];
        for (const job of order?.jobs || []) {
            let parsed: unknown = [];
            try { parsed = JSON.parse(job?.productPhotos || '[]'); } catch { parsed = []; }
            if (!Array.isArray(parsed)) continue;
            for (const url of parsed) {
                if (typeof url !== 'string' || !url || seen.has(url)) continue;
                seen.add(url);
                out.push({ jobId: job.id, url });
            }
        }
        return out;
    };

    const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);

    /** Photos are kept full size, so a seller can delete the ones they have saved, freeing the storage. */
    const deletePhoto = async (jobId: string, url: string) => {
        setDeletingPhoto(url);
        try {
            const res = await fetch('/api/orders/photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, remove: url }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Could not delete the photo (error ${res.status})`);
            const remaining: string[] = data.photos || [];
            // Show the change straight away; the list behind it refreshes too.
            setPhotoOrder((prev) => {
                if (!prev) return prev;
                const next = { ...prev, jobs: (prev.jobs || []).map((j: any) => (j.id === jobId ? { ...j, productPhotos: JSON.stringify(remaining) } : j)) };
                return orderPhotos(next).length > 0 ? next : null;
            });
            message.success('Photo deleted');
            router.refresh();
        } catch (error: any) {
            message.error(error.message || 'Could not delete the photo');
        } finally {
            setDeletingPhoto(null);
        }
    };

    const downloadPhoto = async (url: string, index: number) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const href = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = href;
            link.download = `${photoOrder?.orderCode || 'order'}-photo-${index + 1}.${(url.split('.').pop() || 'jpg').split('?')[0]}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(href);
        } catch {
            // Falling back to a new tab still lets them save it by hand.
            window.open(url, '_blank', 'noopener');
        }
    };

    /**
     * An order that came in without artwork needs an answer: the seller is
     * sending it, or emfulfill designs it. Choosing emfulfill puts the item in
     * the design queue, where the designer prices the work.
     */
    const chooseDesignBy = async (orderId: string, designBy: 'SELLER' | 'EM') => {
        setDesignChoiceId(orderId);
        try {
            const res = await fetch('/api/orders/design-by', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, designBy }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not save your choice');
            message.success(designBy === 'EM'
                ? 'We will design it for you. Our team will quote the price on the order.'
                : 'Noted - send us the artwork when it is ready.');
            router.refresh();
        } catch (error: any) {
            message.error(error.message || 'Could not save your choice');
        } finally {
            setDesignChoiceId(null);
        }
    };

    const [priorityUpdatingId, setPriorityUpdatingId] = useState<string | null>(null);
    const [priorityFeeSettings, setPriorityFeeSettings] = useState({
        priorityProductionFee: 0,
        priorityShippingFee: 0
    });

    useEffect(() => {
        fetch('/api/settings')
            .then((res) => res.ok ? res.json() : null)
            .then((settings) => {
                if (!settings) return;
                setPriorityFeeSettings({
                    priorityProductionFee: Number(settings.priorityProductionFee || 0),
                    priorityShippingFee: Number(settings.priorityShippingFee || 0)
                });
            })
            .catch(() => {
                setPriorityFeeSettings({ priorityProductionFee: 0, priorityShippingFee: 0 });
            });
    }, []);

    // Priority (production + shipping) can be changed while the order is still
    // PENDING_APPROVAL or RECEIVED — i.e. before production actually starts. Once it
    // moves to IN_PROCESS (or later), both are locked so nothing changes mid-production.
    const isProductionPriorityAllowed = (status: string | undefined) => (
        ['PENDING_APPROVAL', 'RECEIVED'].includes(String(status || '').toUpperCase())
    );

    // Shipping priority follows the same status rule as production. It intentionally
    // does NOT lock on an assigned tracking number — in this workflow tracking is set
    // early (even at RECEIVED), which was wrongly locking the checkbox.
    const isShippingPriorityAllowed = (status: string | undefined) => (
        ['PENDING_APPROVAL', 'RECEIVED'].includes(String(status || '').toUpperCase())
    );

    // CSS fix for sort column background in light/dark mode
    const sortColumnCss = `
        .glass-table .ant-table-column-sort {
            background: transparent !important;
        }
        .glass-table .ant-table-thead th.ant-table-column-has-sorters:hover {
            background: rgba(0, 0, 0, 0.04) !important;
        }
        .dark .glass-table .ant-table-thead th.ant-table-column-has-sorters:hover {
            background: rgba(255, 255, 255, 0.04) !important;
        }
        .glass-table .ant-table-thead th.ant-table-column-sort {
            background: rgba(0, 0, 0, 0.02) !important;
        }
        .dark .glass-table .ant-table-thead th.ant-table-column-sort {
            background: rgba(255, 255, 255, 0.02) !important;
        }
        td.ant-table-column-sort {
            background-color: transparent !important;
        }

        /* Compact mode: the 12-column orders table used to run past the right edge
           on a normal laptop, so sellers had to scroll sideways to reach Report and
           Action. Tighter padding + smaller type pull the whole table back on screen.
           NOTE: do not add overflow-x here - antd already scrolls .ant-table-content. */
        .orders-compact .ant-table {
            font-size: 12px;
        }
        .orders-compact .ant-table-thead > tr > th {
            padding: 8px 6px !important;
            font-size: 11px;
            white-space: nowrap;
        }
        .orders-compact .ant-table-tbody > tr > td {
            padding: 8px 6px !important;
        }
        .orders-compact .ant-table-tbody .ant-checkbox-wrapper {
            font-size: 11px;
        }
        .orders-compact .ant-btn {
            padding-inline: 4px;
        }

        /* Excel-style drag handle sitting on each header's right edge. */
        .orders-col-resizer {
            position: absolute;
            top: 0;
            bottom: 0;
            right: -4px;
            width: 8px;
            cursor: col-resize;
            user-select: none;
            touch-action: none;
            z-index: 2;
        }
        .orders-col-resizer::after {
            content: '';
            position: absolute;
            top: 25%;
            bottom: 25%;
            left: 3px;
            width: 2px;
            border-radius: 2px;
            background: transparent;
            transition: background 0.15s;
        }
        .orders-col-resizer:hover::after,
        .orders-col-resizer:active::after {
            background: rgba(14, 165, 233, 0.75);
        }
    `;

    // Edit Order State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingOrder, setEditingOrder] = useState<any>(null);

    // Seller-adjusted column widths, keyed by column key. Empty = use the defaults.
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

    useEffect(() => {
        try {
            const saved = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
            if (saved) setColumnWidths(JSON.parse(saved) || {});
        } catch {
            // Storage can be unavailable (private mode) — fall back to the defaults.
        }
    }, []);

    const handleColumnResize = (columnKey: string) => (nextWidth: number) => {
        setColumnWidths((previous) => {
            const updated = { ...previous, [columnKey]: nextWidth };
            try {
                window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // Not being able to remember the size shouldn't break resizing.
            }
            return updated;
        });
    };

    const resetColumnWidths = () => {
        setColumnWidths({});
        try {
            window.localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
        } catch {
            // ignore
        }
    };

    // ... useMemo ...
    useEffect(() => { setPage(1); }, [searchText, statusFilter, designFilter]);

    const filteredOrders = useMemo(() => {
        let result = orders;

        // 1. Status Filter
        if (statusFilter && statusFilter !== 'ALL') {
            result = result.filter(o => (o.status || '').toUpperCase() === statusFilter);
        }

        // Who is making the artwork, and whether it has arrived.
        if (designFilter && designFilter !== 'ALL') {
            result = result.filter(o => getOrderDesignStatus(o.jobs).kind === designFilter);
        }

        // 2. Search Filter
        if (searchText) {
            const lowerSearch = searchText.toLowerCase();
            result = result.filter(o => {
                const orderCodeMatch = (o.orderCode || '').toLowerCase().includes(lowerSearch);
                const trackingMatch = (o.trackingNumber || '').toLowerCase().includes(lowerSearch);
                const jobsMatch = o.jobs?.some((j: any) =>
                    (j.recipientName || '').toLowerCase().includes(lowerSearch) ||
                    (j.phone || '').toLowerCase().includes(lowerSearch)
                );

                return orderCodeMatch || trackingMatch || jobsMatch;
            });
        }

        return result;
    }, [orders, statusFilter, designFilter, searchText]);

    // Calculate group info for duplicate Order IDs (e.g., ORDER123, ORDER123(1), ORDER123(2))
    const groupedOrderMeta: Record<string, { position: number; total: number }> = useMemo(() => {
        const baseCodeMap: Record<string, string[]> = {}; // baseCode -> [orderCode1, orderCode2, ...]

        orders.forEach((order: any) => {
            const orderCode = order.orderCode || '';
            // Strip suffix: ORDER123(1) -> ORDER123
            const baseCode = orderCode.replace(/\(\d+\)$/, '').trim();

            if (!baseCodeMap[baseCode]) {
                baseCodeMap[baseCode] = [];
            }
            // Avoid duplicates
            if (!baseCodeMap[baseCode].includes(orderCode)) {
                baseCodeMap[baseCode].push(orderCode);
            }
        });

        const meta: Record<string, { position: number; total: number }> = {};

        Object.values(baseCodeMap).forEach(orderCodes => {
            // Sort to maintain consistent order (ORDER123, ORDER123(1), ORDER123(2))
            orderCodes.sort();
            orderCodes.forEach((code, idx) => {
                meta[code] = {
                    position: idx + 1,
                    total: orderCodes.length
                };
            });
        });

        return meta;
    }, [orders]);

    // ... state ...
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [orderForTicket, setOrderForTicket] = useState<any>(null);

    const handleEditOrder = (order: any) => {
        setEditingOrder(order);
        setEditModalVisible(true);
    };

    const handleReportIssue = (order: any) => {
        setOrderForTicket(order);
        setReportModalVisible(true);
    };

    const handlePriorityChange = async (
        order: OrderType,
        field: 'priorityProduction' | 'priorityShipping',
        checked: boolean
    ) => {
        setPriorityUpdatingId(`${order.id}:${field}`);
        try {
            const res = await fetch('/api/orders/priority', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: order.id,
                    priorityProduction: field === 'priorityProduction' ? checked : Boolean(order.priorityProduction),
                    priorityShipping: field === 'priorityShipping' ? checked : Boolean(order.priorityShipping)
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update priority');

            const adjustment = Number(data.priorityAdjustment || 0);
            if (adjustment > 0) {
                message.success(`Priority updated. Wallet charged $${adjustment.toFixed(2)}`);
            } else if (adjustment < 0) {
                message.success(`Priority updated. Wallet refunded $${Math.abs(adjustment).toFixed(2)}`);
            } else {
                message.success('Priority updated');
            }
            router.refresh();
        } catch (error: any) {
            message.error(error.message || 'Failed to update priority');
        } finally {
            setPriorityUpdatingId(null);
        }
    };

    // Selection State
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

    const handlePrintInvoice = () => {
        if (selectedRowKeys.length === 0) {
            console.warn('Select at least one order');
            return;
        }
        const ids = selectedRowKeys.join(',');
        window.open(`/print/invoices?ids=${selectedRowKeys.join(',')}`, '_blank');
    };

    const handleExport = () => {
        // ... (Export logic remains same, can be long, so I'll preserve it or assume it's fine to keep English for Excel export headers? usually okay, but user requested FULL web. But code replacement chunk limit. I'll focus on UI first. The instruction says "columns/filter options".)
        // I will keep handleExport mostly as is or I need to copy it precisely.
        // To be safe and concise, I will skip replacing handleExport in this specific call if it's too long, 
        // BUT I'm replacing the whole component body start.
        // I'll try to keep handleExport in the replacement.
        const exportData: any[] = [];
        let stt = 1;

        filteredOrders.forEach(o => {
            const items = o.jobs || [];
            if (items.length > 0) {
                items.forEach((item: any) => {
                    const itemTotal = (item.priceToCharge * item.qty) + (item.shippingCost || 0) + (item.extraFees || 0);
                    const addressParts = [
                        item.address1,
                        item.address2,
                        item.city,
                        item.state,
                        item.zip,
                        item.country
                    ].filter(Boolean).join(', ');

                    exportData.push({
                        'STT': stt++,
                        'Created Date': new Date(o.createdAt).toLocaleDateString(),
                        'Order ID': o.orderCode,
                        'Owner': o.source || 'Seller',
                        'Status': o.status,
                        'Tracking number': o.trackingNumber || '',
                        'Shipping Name': item.recipientName || '',
                        'Shipping Phone': item.phone || '',
                        'Shipping Address': addressParts,
                        'Product SKU': item.sku,
                        'Color': item.color || '',
                        'Size': item.size || '',
                        'Quantity': item.qty,
                        'Unit Price': item.priceToCharge,
                        'Design Fee': 0,
                        'Extra Fee': item.extraFees || 0,
                        'Shipping Fees/Handling Fees': item.shippingCost || 0,
                        'Total Cost': itemTotal
                    });
                });
            } else {
                exportData.push({
                    'STT': stt++,
                    'Created Date': new Date(o.createdAt).toLocaleDateString(),
                    'Order ID': o.orderCode,
                    'Owner': o.source || 'Seller',
                    'Status': o.status,
                    'Tracking number': o.trackingNumber || '',
                    'Shipping Name': '',
                    'Shipping Phone': '',
                    'Shipping Address': '',
                    'Product SKU': '',
                    'Color': '',
                    'Size': '',
                    'Quantity': 0,
                    'Unit Price': 0,
                    'Design Fee': 0,
                    'Extra Fee': 0,
                    'Shipping Fees/Handling Fees': 0,
                    'Total Cost': o.totalAmount || 0
                });
            }
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportData);
        // ... styling ...
        const wscols = [
            { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 20 },
            { wch: 25 }, { wch: 15 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 8 },
            { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 }
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, 'Orders');
        XLSX.writeFile(wb, `Orders_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const columns: ColumnsType<OrderType> = [
        {
            title: 'No.',
            key: 'index',
            width: 44,
            render: (_: any, __: any, index: number) => (
                <span className="text-zinc-400 text-xs">{(index + 1)}</span>
            )
        },
        {
            title: t.ordersPage.orderId?.toUpperCase() || 'ORDER ID',
            dataIndex: 'orderCode',
            key: 'orderCode',
            width: 108,
            sorter: (a: any, b: any) => (a.orderCode || '').localeCompare(b.orderCode || ''),
            render: (text, record) => {
                const meta = groupedOrderMeta[text];
                const groupDisplay = meta && meta.total > 1 ? ` (${meta.position}/${meta.total})` : '';
                return (
                    <span
                        className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-sky-500 transition-colors cursor-pointer"
                        onClick={() => router.push(`/dashboard/orders/${record.orderCode}`)}
                    >
                        {text}
                        {groupDisplay && <span className="text-xs text-zinc-400 ml-1">{groupDisplay}</span>}
                    </span>
                );
            },
        },
        {
            title: t.common.recipientName?.toUpperCase() || 'RECIPIENT',
            key: 'recipientName',
            width: 96,
            ellipsis: true,
            render: (_, record) => (
                <span className="text-zinc-700 dark:text-zinc-300 font-medium" title={record.jobs?.[0]?.recipientName || ''}>
                    {record.jobs?.[0]?.recipientName || '-'}
                </span>
            ),
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            width: 106,
            render: (status) => {
                const statusLower = status?.toLowerCase() || '';
                let badgeClass = 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';

                if (statusLower.includes('cancel') || statusLower.includes('reject')) {
                    badgeClass = 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400';
                } else if (statusLower.includes('fund')) {
                    // Awaiting Funds — imported but the wallet can't cover it yet.
                    badgeClass = 'bg-violet-500/20 text-violet-700 border-violet-500/40 dark:text-violet-300 font-semibold';
                } else if (statusLower.includes('design')) {
                    // Design Request — incomplete, waiting on the seller to add info.
                    // Orange so it stands out clearly in the orders list.
                    badgeClass = 'bg-orange-500/20 text-orange-700 border-orange-500/40 dark:text-orange-300 font-semibold';
                } else if (statusLower.includes('completed') || statusLower.includes('paid')) {
                    badgeClass = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                } else if (statusLower.includes('received')) {
                    badgeClass = 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.2)]';
                } else if (statusLower.includes('process')) {
                    badgeClass = 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400';
                } else if (statusLower.includes('pending')) {
                    badgeClass = 'bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400';
                }

                return (
                    <span className={`
                        px-3 py-1 rounded-full text-xs font-medium border
                        ${badgeClass}
                        backdrop-blur-sm transition-all duration-300
                    `}>
                        {getOrderStatusLabel(status)}
                    </span>
                );
            },
        },
        {
            // Replaces the old Source column, which only ever said "Direct".
            title: 'DESIGN',
            key: 'designStatus',
            width: 118,
            render: (_, record) => {
                const design = getOrderDesignStatus(record.jobs);

                // Artwork is in. Nothing left to decide.
                if (design.kind === 'HAS_FILE') {
                    return (
                        <Tooltip title="Artwork came with the import">
                            <span className="font-semibold" style={{ color: '#16a34a' }}>&#10003;</span>
                        </Tooltip>
                    );
                }
                if (design.kind === 'BY_EM_DONE') {
                    return (
                        <Tooltip title="Our design team made this and it is on the order">
                            <Tag className="text-[10px] mr-0" style={{ color: '#16a34a', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                By emfulfill
                            </Tag>
                        </Tooltip>
                    );
                }

                // Still waiting on artwork, so the answer can always be changed --
                // including after the order has been received.
                const tip = design.kind === 'BY_EM'
                    ? 'Our design team is making this. You can still change who designs it.'
                    : design.kind === 'BY_SELLER'
                        ? 'You are sending the artwork. You can still hand it to us instead.'
                        : design.total > 1
                            ? `${design.missingCount} of ${design.total} items have no artwork yet - who is making it?`
                            : 'No artwork yet - who is making it?';

                return (
                    <Tooltip title={tip}>
                        <Select
                            size="small"
                            style={{ width: '100%' }}
                            placeholder="Who designs?"
                            loading={designChoiceId === record.id}
                            value={design.designBy || undefined}
                            onChange={(value: 'SELLER' | 'EM') => chooseDesignBy(record.id, value)}
                            options={[
                                { label: 'I will send it', value: 'SELLER' },
                                { label: 'emfulfill designs it', value: 'EM' },
                            ]}
                        />
                    </Tooltip>
                );
            },
        },
        {
            // What the finished garment actually looks like, uploaded by the shop.
            title: 'PHOTO',
            key: 'productPhoto',
            width: 74,
            render: (_, record) => {
                const photos = orderPhotos(record);
                if (photos.length === 0) return <span className="text-zinc-300">-</span>;
                return (
                    <Tooltip title={`${photos.length} photo(s) of your finished order`}>
                        <Button
                            type="text"
                            size="small"
                            icon={<CameraOutlined />}
                            onClick={() => setPhotoOrder(record)}
                            style={{ color: '#0284c7', backgroundColor: '#f0f9ff' }}
                        >
                            <span className="text-[11px]">{photos.length}</span>
                        </Button>
                    </Tooltip>
                );
            },
        },

        {
            title: t.common.total?.toUpperCase() || 'TOTAL',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 70,
            sorter: (a: any, b: any) => (a.totalAmount || 0) - (b.totalAmount || 0),
            render: (val) => (
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {val ? `$${val.toFixed(2)}` : '$0.00'}
                </span>
            )
        },
        {
            title: 'PRIORITY',
            key: 'priority',
            width: 130,
            render: (_, record) => {
                const canUpdateProduction = isProductionPriorityAllowed(record.status);
                const canUpdateShipping = isShippingPriorityAllowed(record.status);
                // Show the fee that applies: the one locked onto the order once it's
                // been charged, otherwise the current admin-configured rate. The
                // fallback keeps a price visible on older orders whose stored fee is 0.
                const productionFee = (record.priorityProduction ? Number(record.priorityProductionFee || 0) : 0)
                    || priorityFeeSettings.priorityProductionFee;
                const shippingFee = (record.priorityShipping ? Number(record.priorityShippingFee || 0) : 0)
                    || priorityFeeSettings.priorityShippingFee;
                const feeLabel = (fee: number) => (
                    <span className={`ml-1 font-medium ${fee > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {fee > 0 ? `+$${fee.toFixed(2)}` : 'Free'}
                    </span>
                );
                return (
                    <div className="flex flex-col gap-0.5 text-[11px] whitespace-nowrap">
                        <Checkbox
                            checked={Boolean(record.priorityProduction)}
                            disabled={!canUpdateProduction || priorityUpdatingId !== null}
                            onChange={(event) => handlePriorityChange(record, 'priorityProduction', event.target.checked)}
                            className="text-[11px]"
                        >
                            Prod.
                            {feeLabel(productionFee)}
                        </Checkbox>
                        <Checkbox
                            checked={Boolean(record.priorityShipping)}
                            disabled={!canUpdateShipping || priorityUpdatingId !== null}
                            onChange={(event) => handlePriorityChange(record, 'priorityShipping', event.target.checked)}
                            className="text-[11px]"
                        >
                            Ship.
                            {feeLabel(shippingFee)}
                        </Checkbox>
                    </div>
                );
            }
        },
        {
            title: t.common.date?.toUpperCase() || 'DATE CREATED',
            dataIndex: 'createdAt',
            key: 'createdAt',
            sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            defaultSortOrder: 'descend' as const,
            sortDirections: ['descend', 'ascend'] as const,
            width: 80,
            render: (date: Date) => (
                <span className="text-zinc-500 dark:text-zinc-400 text-[11px] whitespace-nowrap">
                    {new Date(date).toLocaleDateString('en-US')}
                </span>
            )
        },
        {
            title: 'SHIPPING STATUS',
            dataIndex: 'shippingStatus',
            key: 'shippingStatus',
            width: 98,
            render: (status: string | null, record) => {
                const shippingStatus = status || (record.trackingNumber ? 'LABEL_CREATED' : 'PENDING');
                let badgeClass = 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';

                if (shippingStatus === 'DELIVERED') {
                    badgeClass = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400';
                } else if (shippingStatus === 'IN_TRANSIT') {
                    badgeClass = 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400';
                } else if (shippingStatus === 'RECEIVED') {
                    badgeClass = 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400';
                } else if (shippingStatus === 'LABEL_CREATED') {
                    badgeClass = 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400';
                } else if (shippingStatus === 'EXCEPTION') {
                    badgeClass = 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400';
                }

                return (
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${badgeClass}`}>
                        {getShippingStatusLabel(shippingStatus)}
                    </span>
                );
            }
        },
        {
            title: t.common.trackingId?.toUpperCase() || 'TRACKING ID',
            dataIndex: 'trackingNumber',
            key: 'trackingNumber',
            width: 112,
            render: (id) => (
                id ? (
                    <div className="flex items-center gap-1 min-w-0">
                        {/* Tracking numbers are long enough to blow the table past the
                            screen, so truncate here - the full value stays on hover
                            and the copy button still copies it in full. */}
                        <a
                            href={`https://stallionexpress.ca/tracking/?tracking=${id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={id}
                            className="text-indigo-600 dark:text-indigo-400 font-mono text-[11px] hover:underline truncate"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {id}
                        </a>
                        <Tooltip title="Copy Tracking ID">
                            <Button
                                type="text"
                                size="small"
                                icon={<CopyOutlined className="text-xs" />}
                                className="text-zinc-400 hover:text-indigo-500 h-6 w-6 min-w-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(id);
                                    message.success('Copied to clipboard');
                                }}
                            />
                        </Tooltip>
                    </div>
                ) : (
                    <span className="text-zinc-400 font-mono text-xs">-</span>
                )
            ),
        },
        {
            title: t.common.report?.toUpperCase() || 'REPORT',
            key: 'report',
            align: 'center',
            width: 56,
            render: (_, record) => {
                const s = (record.status || '').toUpperCase();
                const canReport = s.includes('SHIPPED') || s.includes('COMPLETED') || s.includes('RECEIVED');

                return (
                    <Tooltip title={canReport ? "Report Issue / Refund Request" : "Order must be shipped to report issue"}>
                        <Button
                            type="text"
                            danger
                            disabled={!canReport}
                            icon={<WarningOutlined />}
                            onClick={() => canReport && handleReportIssue(record)}
                            className={canReport ? "hover:bg-red-50 dark:hover:bg-red-900/20" : "opacity-30"}
                        />
                    </Tooltip>
                );
            }
        },
        {
            title: t.common.action?.toUpperCase() || 'ACTION',
            key: 'action',
            // Must fit THREE buttons (view / print / edit). At 86px only two fitted,
            // so the edit pencil was clipped on narrow screens while a wide monitor
            // stretched the column enough to reveal it.
            width: 104,
            render: (_, record) => {
                const canEdit = (record.status || '').toUpperCase() === 'PENDING_APPROVAL' ||
                    (record.status || '').toUpperCase() === 'RECEIVED' ||
                    (record.status || '').toUpperCase() === 'DESIGN_REQUEST' ||
                    (record.status || '').toUpperCase() === 'AWAITING_FUNDS';
                return (
                    <div className="flex flex-nowrap items-center gap-0.5">
                        <Tooltip title="View Details">
                            <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                className="text-zinc-500 hover:text-sky-500"
                                onClick={() => router.push(`/dashboard/orders/${record.orderCode}`)}
                            />
                        </Tooltip>
                        <Tooltip title="Print Invoice">
                            <Button
                                type="text"
                                size="small"
                                icon={<PrinterOutlined />}
                                className="text-zinc-500 hover:text-indigo-500"
                                onClick={() => window.open(`/print/invoices?ids=${record.orderCode}`, '_blank')}
                            />
                        </Tooltip>
                        {canEdit && (
                            <Tooltip title="Edit Order">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<EditOutlined />}
                                    className="text-zinc-500 hover:text-blue-500"
                                    onClick={() => handleEditOrder(record)}
                                />
                            </Tooltip>
                        )}
                    </div>
                );
            }
        }
    ];

    // Apply any width the seller dragged to, and give each header a resize handle.
    const resizableColumns = columns.map((column: any) => {
        const width = columnWidths[column.key as string] ?? column.width;
        return {
            ...column,
            width,
            onHeaderCell: () => ({ width, onResize: handleColumnResize(column.key as string) }),
        };
    });

    // The table must be at least as wide as its columns, otherwise widening one
    // column would squeeze the others instead of extending the table.
    const totalColumnWidth = resizableColumns.reduce(
        (sum: number, column: any) => sum + (Number(column.width) || 0),
        0
    );
    const tableScrollX = Math.max(1080, totalColumnWidth + 40);
    const hasCustomWidths = Object.keys(columnWidths).length > 0;

    return (
        <div className="glass-panel rounded-2xl p-1 overflow-hidden">
            <style>{sortColumnCss}</style>

            {/* Photos of the finished order, to look at or save. */}
            <Modal
                title={`Your order ${photoOrder?.orderCode || ''}`}
                open={!!photoOrder}
                onCancel={() => setPhotoOrder(null)}
                footer={null}
                width={680}
            >
                <p className="text-sm text-zinc-500 mb-3">
                    Photos of your finished order, full size. Delete the ones you have saved and no longer need.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {orderPhotoEntries(photoOrder).map(({ jobId, url }, i) => (
                        <div key={url} className="rounded-lg overflow-hidden border border-zinc-200">
                            <Image src={url} alt={`Finished item ${i + 1}`} height={150} width="100%" className="object-cover" />
                            {/* Stacked, so both stay easy to tap on a phone-width tile. */}
                            <div className="flex flex-col border-t border-zinc-100">
                                <Button
                                    block
                                    size="small"
                                    type="text"
                                    icon={<DownloadOutlined />}
                                    onClick={() => downloadPhoto(url, i)}
                                >
                                    Download
                                </Button>
                                <Popconfirm
                                    title="Delete this photo?"
                                    description="It is removed for good, for you and for us."
                                    okText="Delete"
                                    okButtonProps={{ danger: true }}
                                    cancelText="Keep"
                                    onConfirm={() => deletePhoto(jobId, url)}
                                >
                                    <Button block size="small" type="text" danger icon={<DeleteOutlined />} loading={deletingPhoto === url}>
                                        Delete
                                    </Button>
                                </Popconfirm>
                            </div>
                        </div>
                    ))}
                </div>
            </Modal>
            {/* Filter Bar */}
            <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <Input
                        prefix={<SearchOutlined className="text-zinc-400" />}
                        placeholder="Search Order ID, Recipient, Phone..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        className="w-full sm:w-[300px]"
                    />
                    <Select
                        placeholder="Filter by Status"
                        allowClear
                        style={{ width: 200 }}
                        onChange={val => setStatusFilter(val)}
                        options={[
                            { label: 'All Statuses', value: 'ALL' },
                            { label: 'Design Missed', value: 'DESIGN_REQUEST' },
                            { label: 'Awaiting Funds', value: 'AWAITING_FUNDS' },
                            { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
                            { label: 'Received', value: 'RECEIVED' },
                            { label: 'In Process', value: 'IN_PROCESS' },
                            { label: 'Shipped', value: 'SHIPPED' },
                            { label: 'Completed', value: 'COMPLETED' },
                            { label: 'Cancelled', value: 'CANCELLED' },
                        ]}
                    />
                    <Select
                        placeholder="Filter by Design"
                        allowClear
                        style={{ width: 190 }}
                        value={designFilter === 'ALL' ? undefined : designFilter}
                        onChange={val => setDesignFilter(val || 'ALL')}
                        options={[
                            { label: 'All designs', value: 'ALL' },
                            { label: 'No design yet', value: 'MISSING' },
                            { label: 'By seller', value: 'BY_SELLER' },
                            { label: 'By emfulfill - waiting', value: 'BY_EM' },
                            { label: 'By emfulfill - done', value: 'BY_EM_DONE' },
                            { label: 'Design file supplied', value: 'HAS_FILE' },
                        ]}
                    />
                </div>

                <div className="flex gap-2">
                    {hasCustomWidths && (
                        <Tooltip title="Restore the default column widths">
                            <Button type="default" onClick={resetColumnWidths}>
                                Reset Columns
                            </Button>
                        </Tooltip>
                    )}
                    <Button
                        type="default"
                        icon={<PrinterOutlined />}
                        onClick={handlePrintInvoice}
                    >
                        Print Invoice
                    </Button>
                    <Button
                        type="default"
                        icon={<DownloadOutlined />}
                        onClick={handleExport}
                    >
                        Export Excel
                    </Button>
                </div>
            </div>

            <Table
                rowSelection={{
                    selectedRowKeys,
                    onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={resizableColumns}
                components={{ header: { cell: ResizableTitle } }}
                dataSource={filteredOrders}
                rowKey="id"
                pagination={{ pageSize: 10, current: page, onChange: setPage }}
                size="small"
                className="glass-table orders-compact"
                // A concrete width (never `x: true`, which makes the table width auto)
                // keeps the layout deterministic. The default budget fits all 12
                // columns on a normal laptop; it grows with whatever widths the seller
                // drags to, so widening a column extends the table instead of
                // squeezing its neighbours.
                scroll={{ x: tableScrollX }}
            />

            {orderForTicket && (
                <ReportTicketModal
                    visible={reportModalVisible}
                    onCancel={() => setReportModalVisible(false)}
                    orderId={orderForTicket.id}
                    onSuccess={() => setReportModalVisible(false)}
                />
            )}

            {editingOrder && (
                <EditOrderModal
                    visible={editModalVisible}
                    onCancel={() => setEditModalVisible(false)}
                    order={editingOrder}
                    onSuccess={() => setEditModalVisible(false)}
                />
            )}
        </div>
    );
}
