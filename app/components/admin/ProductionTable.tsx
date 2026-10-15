'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Avatar, Input, Select, Card, Row, Col, Table, Button, notification, Space, Tag, Popconfirm, Tooltip, InputNumber, Checkbox, Dropdown, Upload, Image } from 'antd'; // added Popconfirm
import { ReloadOutlined, PrinterOutlined, EyeOutlined, SearchOutlined, FilterOutlined, UserOutlined, StopOutlined, DollarOutlined, CheckCircleFilled, HighlightOutlined, CameraOutlined, DeleteOutlined } from '@ant-design/icons'; // added StopOutlined
import dayjs from 'dayjs'; // imported dayjs
import { usePathname } from 'next/navigation';
import OrderDetailsModal from '@/app/dashboard/orders/OrderDetailsModal';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { getOrderDesignStatus } from '@/lib/designStatus';

export interface Job {
    id: string;
    jobCode: string;
    status: string;
    sku: string;
    subSku?: string;
    productName?: string;
    inventoryStock?: number;
    inventoryOnOrder?: number;
    inventoryReserved?: number;
    color: string | null;
    size: string | null;
    quantity: number;
    qty: number;
    assignedStaff?: { email: string; name: string | null };
    createdAt: string;
    recipientName: string;
    orderId?: string;
    order?: { orderCode: string; priorityProduction?: boolean | null; priorityShipping?: boolean | null };
    shippingLabel?: string | null; // Seller SKU from the import file
    designs?: string | null;
    productPhotos?: string | null;
    sellerId: string;
    seller?: { name: string; id?: string };
}

interface ProductionTableProps {
    refreshTrigger?: number; // Optional prop to trigger refresh from parent
}

import { useSearchParams } from 'next/navigation';

export default function ProductionTable({ refreshTrigger }: ProductionTableProps) {
    const [api, contextHolder] = notification.useNotification();
    const { t } = useLanguage();
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const isAdminView = pathname.startsWith('/admin');

    // Filters
    const [searchText, setSearchText] = useState('');
    const [designFilter, setDesignFilter] = useState('ALL');
    // Antd keeps the current page when the rows change, so a search made from
    // page 3 would land on page 3 of a one-row result and look empty.
    const [page, setPage] = useState(1);

    const [activeFilterKeys, setActiveFilterKeys] = useState<string[]>([]);
    // When on, show only jobs whose order has priority production or shipping.
    const [priorityOnly, setPriorityOnly] = useState(false);
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

    // Modal State
    const [viewOrderModalVisible, setViewOrderModalVisible] = useState(false);
    const [currentOrder, setCurrentOrder] = useState<any>(null);

    // Charge Modal State
    const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
    const [chargeJobId, setChargeJobId] = useState<string | null>(null);
    const [chargeSellerId, setChargeSellerId] = useState<string | null>(null);
    const [chargeAmount, setChargeAmount] = useState<string | number>('');
    const [chargeReason, setChargeReason] = useState('');
    const [chargeLoading, setChargeLoading] = useState(false);
    // 'ADDITIONAL' bills the seller more; 'REDUCE' gives money back (e.g. a discount
    // for a special customer).
    const [chargeMode, setChargeMode] = useState<'ADDITIONAL' | 'REDUCE'>('ADDITIONAL');

    // Tab Definitions
    const items = [
        { label: 'All', key: 'ALL', statuses: [] },
        { label: 'Design Missed', key: 'DESIGN_REQUEST', statuses: ['DESIGN_REQUEST'] },
        { label: t.status.awaitingFunds || 'Awaiting Funds', key: 'AWAITING_FUNDS', statuses: ['AWAITING_FUNDS'] },
        { label: t.status.pendingApproval || 'Pending Approval', key: 'PENDING_APPROVAL', statuses: ['PENDING_APPROVAL'] },
        { label: t.status.received || 'Received', key: 'RECEIVED', statuses: ['RECEIVED'] },
        { label: t.status.inProcess || 'In Process', key: 'IN_PROCESS', statuses: ['IN_PROCESS', 'PRINTING', 'SEWING'] },
        { label: 'Completed', key: 'COMPLETED', statuses: ['COMPLETED', 'READY_TO_SHIP', 'SHIPPED'] },
        { label: 'Cancelled', key: 'CANCELLED', statuses: ['CANCELLED'] }
    ];

    const handleTabChange = (key: string) => {
        if (key === 'ALL') {
            setActiveFilterKeys([]);
            setSelectedStatuses([]);
            return;
        }

        setActiveFilterKeys(prevKeys => {
            const nextKeys = prevKeys.includes(key)
                ? prevKeys.filter(existingKey => existingKey !== key)
                : [...prevKeys, key];

            const nextStatuses = Array.from(new Set(
                nextKeys.flatMap(filterKey => items.find(item => item.key === filterKey)?.statuses || [])
            ));

            setSelectedStatuses(nextStatuses);
            return nextKeys;
        });
    };

    useEffect(() => { setPage(1); }, [searchText, selectedStatuses, activeFilterKeys, designFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch jobs based on selected filters and date range
            const statusQuery = selectedStatuses.length > 0 ? selectedStatuses.join(',') : '';
            const start = searchParams.get('start');
            const end = searchParams.get('end');

            let url = `/api/admin/jobs?status=${statusQuery}`;

            if (start && end) {
                url += `&start=${start}&end=${end}`;
            }
            // Fix: Do NOT default to Today if no date params (supports "All Time")

            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed to fetch jobs');
            const data = await res.json();
            setJobs(data);
        } catch (error) {
            api.error({ message: 'Error loading production jobs' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [refreshTrigger, selectedStatuses, searchParams]);

    // Calculate group info for duplicate Order IDs
    const groupedOrderMeta: Record<string, { position: number; total: number }> = React.useMemo(() => {
        const baseCodeMap: Record<string, string[]> = {};

        jobs.forEach((job: Job) => {
            const orderCode = job.order?.orderCode || '';
            const baseCode = orderCode.replace(/\(\d+\)$/, '').trim();

            if (!baseCodeMap[baseCode]) {
                baseCodeMap[baseCode] = [];
            }
            if (!baseCodeMap[baseCode].includes(orderCode)) {
                baseCodeMap[baseCode].push(orderCode);
            }
        });

        const meta: Record<string, { position: number; total: number }> = {};

        Object.values(baseCodeMap).forEach(orderCodes => {
            orderCodes.sort();
            orderCodes.forEach((code, idx) => {
                meta[code] = {
                    position: idx + 1,
                    total: orderCodes.length
                };
            });
        });

        return meta;
    }, [jobs]);

    const handleBulkPrint = () => {
        if (selectedRowKeys.length === 0) {
            api.warning({ message: 'Select at least one job to print' });
            return;
        }
        const ids = selectedRowKeys.join(',');
        const baseUrl = pathname.startsWith('/staff') ? '/staff/print/labels' : '/admin/print/labels';
        window.open(`${baseUrl}?ids=${ids}`, '_blank');
    };

    const handleViewOrder = async (orderId: string) => {
        if (!orderId) {
            api.warning({ message: 'Order ID missing for this job' });
            return;
        }
        try {
            const res = await fetch(`/api/admin/orders/${orderId}`);
            if (res.ok) {
                const data = await res.json();
                setCurrentOrder(data);
                setViewOrderModalVisible(true);
            } else {
                api.error({ message: 'Failed to load order details' });
            }
        } catch (error) {
            api.error({ message: 'Error loading order details' });
        }
    };

    const handleChargeSubmit = async () => {
        if (!chargeAmount || Number(chargeAmount) <= 0 || !chargeReason.trim()) {
            api.warning({ message: 'Please enter valid amount and reason' });
            return;
        }

        setChargeLoading(true);
        try {
            const res = await fetch('/api/admin/wallet/charge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sellerId: chargeSellerId,
                    amount: Number(chargeAmount),
                    reason: chargeReason,
                    refId: chargeJobId,
                    mode: chargeMode
                })
            });

            if (res.ok) {
                api.success({
                    message: chargeMode === 'REDUCE'
                        ? 'Cost reduced and refunded to the seller'
                        : 'Additional charge applied successfully'
                });
                setIsChargeModalOpen(false);
                setChargeAmount('');
                setChargeReason('');
                fetchData();
            } else {
                const err = await res.json();
                throw new Error(err.error || 'Failed to apply adjustment');
            }
        } catch (error: any) {
            api.error({ message: error.message || 'Error processing adjustment' });
        } finally {
            setChargeLoading(false);
        }
    };

    const openChargeModal = (job: Job) => {
        if (!job.sellerId && !job.seller) {
            // Try to find seller info from job record if flat, or alert error
            api.error({ message: 'Seller info missing for this job' });
            return;
        }
        // Assuming job object might have sellerId directly or nested in seller
        // Based on interface: seller?: { name: string }... wait, Interface Job needs sellerId?
        // Let's check Job interface. It has seller?: { name: string }. 
        // We probably need to ensure API returns sellerId.
        // Assuming API returns sellerId on root (Prisma usually does).
        // Let's cast to any to be safe or update interface. 
        const sId = (job as any).sellerId || (job.seller as any)?.id;

        if (!sId) {
            api.error({ message: 'Cannot identify seller for this job' });
            return;
        }

        setChargeJobId(job.id);
        setChargeSellerId(sId);
        setChargeAmount('');
        setChargeMode('ADDITIONAL');
        setChargeReason(`Additional charge for Job ${job.jobCode}`);
        setIsChargeModalOpen(true);
    };

    // Switching the adjustment type swaps in that type's default reason, but only
    // while the admin hasn't written their own.
    const handleChargeModeChange = (nextMode: 'ADDITIONAL' | 'REDUCE') => {
        const job = jobs.find((candidate) => candidate.id === chargeJobId);
        const defaults = [
            `Additional charge for Job ${job?.jobCode ?? ''}`.trim(),
            'Special Customer',
        ];
        setChargeMode(nextMode);
        if (!chargeReason.trim() || defaults.includes(chargeReason.trim())) {
            setChargeReason(nextMode === 'REDUCE'
                ? 'Special Customer'
                : `Additional charge for Job ${job?.jobCode ?? ''}`.trim());
        }
    };

    const [designRequestJobId, setDesignRequestJobId] = useState<string | null>(null);
    // Where each job stands with the design team, so the row says so at a glance:
    // red once it has been sent, green once the designer has finished it.
    const [designStatusByJob, setDesignStatusByJob] = useState<Record<string, string>>({});

    const loadSentToDesign = async () => {
        try {
            const res = await fetch('/api/design-requests?fields=jobIds');
            if (!res.ok) return;
            const data = await res.json();
            const next: Record<string, string> = {};
            for (const row of data.rows || []) next[row.jobId] = row.status;
            setDesignStatusByJob(next);
        } catch {
            // Without this the button is just not highlighted; nothing breaks.
        }
    };

    /**
     * Inline styles, not Tailwind classes. Tailwind v4 puts its utilities in
     * `@layer utilities`, and antd's own button CSS is unlayered, so antd wins
     * the cascade no matter what order the stylesheets load in. The classes were
     * on the button all along and the icon still rendered plain black.
     */
    const DESIGN_BUTTON_STATES = {
        FINISHED: { title: 'Design finished', color: '#16a34a', background: '#f0fdf4' },
        PENDING: { title: 'Sent to design, waiting', color: '#f59e0b', background: '#fffbeb' },
        NONE: { title: 'Send to design', color: '#9333ea', background: '#faf5ff' },
    } as const;

    // Photos of the finished garment, so the seller can see what they are getting.
    const [photoJob, setPhotoJob] = useState<Job | null>(null);
    const [photoList, setPhotoList] = useState<string[]>([]);
    const [photoBusy, setPhotoBusy] = useState(false);

    const parsePhotos = (raw?: string | null) => {
        try {
            const parsed = JSON.parse(raw || '[]');
            return Array.isArray(parsed) ? parsed.filter((u: unknown) => typeof u === 'string' && u) : [];
        } catch {
            return [];
        }
    };

    const openPhotos = (job: Job) => {
        setPhotoJob(job);
        setPhotoList(parsePhotos(job.productPhotos));
    };

    /** Send one change to the job's photo list and show the list it now holds. */
    const changePhotos = async (jobId: string, change: { add?: string; remove?: string }) => {
        const res = await fetch('/api/admin/jobs/photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, ...change }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not save the photos (error ${res.status})`);
        const photos: string[] = data.photos || [];
        setPhotoList(photos);
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, productPhotos: JSON.stringify(photos) } : j)));
        return photos;
    };

    /**
     * The shop wants the photos full size, exactly as taken. A phone photo is
     * usually over the 4.5 MB the host lets through to our server, so each file
     * goes straight to storage on a one-time link the server signs for it.
     */
    const uploadOnePhoto = async (jobId: string, file: File) => {
        const signRes = await fetch('/api/admin/jobs/photos/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, contentType: file.type, size: file.size }),
        });
        const sign = await signRes.json().catch(() => ({}));
        if (!signRes.ok || !sign.signedUrl) throw new Error(sign.error || `Could not start the upload (error ${signRes.status})`);

        const body = new FormData();
        body.append('cacheControl', '3600');
        body.append('', file);
        const put = await fetch(sign.signedUrl, { method: 'PUT', body });
        if (!put.ok) {
            const detail = await put.json().catch(() => ({}));
            throw new Error(detail.message || detail.error || `Upload failed (error ${put.status})`);
        }
        await changePhotos(jobId, { add: sign.publicUrl });
    };

    // Several photos picked at once go up one after another, so none of them
    // overwrites another's place in the list.
    const uploadPhotos = async (files: File[]) => {
        if (!photoJob || files.length === 0) return;
        const jobId = photoJob.id;
        setPhotoBusy(true);
        let done = 0;
        try {
            for (const file of files) {
                await uploadOnePhoto(jobId, file);
                done += 1;
            }
            api.success({ message: done === 1 ? 'Photo uploaded' : `${done} photos uploaded` });
        } catch (error: any) {
            api.error({
                message: error.message || 'Upload failed',
                description: done > 0 ? `${done} of ${files.length} photos were uploaded before this.` : undefined,
            });
        } finally {
            setPhotoBusy(false);
        }
    };

    const deletePhoto = async (url: string) => {
        if (!photoJob) return;
        setPhotoBusy(true);
        try {
            await changePhotos(photoJob.id, { remove: url });
            api.success({ message: 'Photo deleted' });
        } catch (error: any) {
            api.error({ message: error.message || 'Could not delete the photo' });
        } finally {
            setPhotoBusy(false);
        }
    };

    const designButtonStyle = (jobId: string) => {
        const status = designStatusByJob[jobId];
        if (status === 'FINISHED') return DESIGN_BUTTON_STATES.FINISHED;
        if (status) return DESIGN_BUTTON_STATES.PENDING;
        return DESIGN_BUTTON_STATES.NONE;
    };

    useEffect(() => { loadSentToDesign(); }, []);

    /**
     * Hand a job to the design team. "New" is artwork that does not exist yet,
     * "Revision" is artwork that came back wrong — the designer sees which in
     * their portal and the finished file lands back on this job.
     */
    const sendToDesign = async (job: Job, type: 'NEW' | 'REVISION') => {
        setDesignRequestJobId(job.id);
        try {
            const res = await fetch('/api/design-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId: job.id, type }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send to design');
            setDesignStatusByJob((prev) => ({ ...prev, [job.id]: 'PENDING' }));
            api.success({
                message: type === 'REVISION' ? 'Sent for revision' : 'Sent to design',
                description: `${job.order?.orderCode || job.jobCode} is now in the design queue.`,
            });
        } catch (error: any) {
            api.error({ message: error.message || 'Failed to send to design' });
        } finally {
            setDesignRequestJobId(null);
        }
    };

    const handleStatusChange = async (jobId: string, newStatus: string) => {
        // OPTIMISTIC UPDATE: Update UI immediately
        setJobs(prev => prev.map(job =>
            job.id === jobId ? { ...job, status: newStatus } : job
        ));

        try {
            const res = await fetch('/api/admin/jobs/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId, status: newStatus })
            });

            if (res.ok) {
                api.success({ message: 'Status updated' });
                // No full re-fetch needed - state already updated
            } else {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update status');
            }
        } catch (error: any) {
            // ROLLBACK: Revert optimistic update on error
            api.error({ message: error.message || 'Error updating status' });
            fetchData(); // Re-fetch to get correct state on failure
        }
    };

    const columns = [
        {
            title: t.ordersPage.seller,
            dataIndex: 'seller',
            key: 'seller',
            width: 92,
            render: (seller: any) => <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{seller?.name || 'Unknown'}</span>
        },
        {
            title: t.ordersPage.orderId,
            dataIndex: 'order',
            key: 'order',
            width: 152,
            render: (order: any, record: Job) => {
                const orderCode = order?.orderCode || '';
                const meta = groupedOrderMeta[orderCode];
                const groupDisplay = meta && meta.total > 1 ? ` (${meta.position}/${meta.total})` : '';
                return (
                    <a onClick={() => handleViewOrder(record.orderId || '')} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer">
                        #{orderCode || record.orderId?.slice(0, 8)}
                        {groupDisplay && <span className="text-xs text-zinc-400 ml-1">{groupDisplay}</span>}
                    </a>
                );
            }
        },
        {
            title: t.common.date,
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 96,
            render: (date: string) => <span className="text-sm text-zinc-500">{dayjs(date).format('MMM D, HH:mm')}</span>
        },
        {
            title: t.ordersPage.customer,
            dataIndex: 'recipientName',
            key: 'customer',
            width: 120,
            render: (name: string) => <span className="text-sm text-zinc-800 dark:text-zinc-200">{name}</span>
        },
        {
            title: t.inventoryPage.sku,
            dataIndex: 'sku',
            key: 'sku',
            width: 126,
            render: (sku: string, record: Job) => {
                const colorPart = (record.color || '').toUpperCase().replace(/\s+/g, '');
                const sizePart = (record.size || '').toUpperCase().replace(/\s+/g, '');
                const subSku = record.subSku || `${sku}-${colorPart}${sizePart}`;
                const splitIndex = subSku.indexOf('-');
                const firstLine = splitIndex > -1 ? `${subSku.slice(0, splitIndex + 1)}` : subSku;
                const secondLine = splitIndex > -1 ? subSku.slice(splitIndex + 1) : '';

                return (
                    <div className="max-w-[120px] leading-tight">
                        <div className="font-mono text-[12px] font-bold text-zinc-700 dark:text-zinc-300">{firstLine}</div>
                        {secondLine && (
                            <div className="font-mono text-[12px] font-bold text-zinc-700 dark:text-zinc-300 break-all">{secondLine}</div>
                        )}
                    </div>
                );
            }
        },
        ...(isAdminView ? [
            {
                // P = priority production, S = priority shipping. Merged into one
                // column to keep the table compact; a set flag shows in red.
                title: 'Priority',
                key: 'priority',
                width: 90,
                align: 'center' as const,
                render: (_: any, record: Job) => {
                    const p = Boolean(record.order?.priorityProduction);
                    const s = Boolean(record.order?.priorityShipping);
                    const mark = (label: string, on: boolean, title: string) => (
                        <Tooltip title={`${title}: ${on ? 'Yes' : 'No'}`}>
                            <span
                                className="inline-flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold border"
                                style={on
                                    ? { color: '#ff4d4f', borderColor: '#ff4d4f', background: '#fff1f0' }
                                    : { color: '#d9d9d9', borderColor: '#f0f0f0' }}
                            >
                                {label}
                            </span>
                        </Tooltip>
                    );
                    return (
                        <div className="flex items-center justify-center gap-1">
                            {mark('P', p, 'Priority production')}
                            {mark('S', s, 'Priority shipping')}
                        </div>
                    );
                }
            },
            {
                title: 'Seller SKU',
                key: 'sellerSku',
                width: 140,
                render: (_: any, record: Job) => (
                    record.shippingLabel
                        ? <span className="text-xs font-mono">{record.shippingLabel}</span>
                        : <span className="text-gray-300">—</span>
                )
            }
        ] : []),
        {
            title: t.common.quantity,
            dataIndex: 'qty',
            key: 'qty',
            width: 74,
            render: (qty: number) => <span className="text-sm font-semibold">{qty}</span>
        },
        ...(isAdminView ? [
            {
                title: 'Inventory',
                dataIndex: 'inventoryStock',
                key: 'inventoryStock',
                width: 100,
                render: (_: number, record: Job) => {
                    const colorPart = (record.color || '').toUpperCase().replace(/\s+/g, '');
                    const sizePart = (record.size || '').toUpperCase().replace(/\s+/g, '');
                    const subSku = record.subSku || `${record.sku}-${colorPart}${sizePart}`;
                    const stock = record.inventoryStock || 0;
                    const href = `/admin/inventory?search=${encodeURIComponent(subSku)}`;

                    return (
                        <a href={href} className="block">
                            <div className={`text-sm font-semibold ${stock > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {stock > 0 ? `${stock} stock` : 'Out'}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-indigo-600">
                                Inventory
                            </div>
                        </a>
                    );
                }
            },
            {
                title: 'Purchasing',
                dataIndex: 'inventoryOnOrder',
                key: 'inventoryOnOrder',
                width: 100,
                render: (_: number, record: Job) => {
                    const colorPart = (record.color || '').toUpperCase().replace(/\s+/g, '');
                    const sizePart = (record.size || '').toUpperCase().replace(/\s+/g, '');
                    const subSku = record.subSku || `${record.sku}-${colorPart}${sizePart}`;
                    const onOrder = record.inventoryOnOrder || 0;
                    const href = `/admin/purchasing?search=${encodeURIComponent(subSku)}`;

                    return (
                        <a href={href} className="block">
                            <div className={`text-sm font-semibold ${onOrder > 0 ? 'text-blue-600' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                {onOrder > 0 ? `${onOrder} order` : 'No PO'}
                            </div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-indigo-600">
                                Purchasing
                            </div>
                        </a>
                    );
                }
            }
        ] : []),
        {
            title: 'Design',
            key: 'designStatus',
            width: 80,
            render: (_: any, record: Job) => {
                const design = getOrderDesignStatus([record]);
                if (design.kind === 'HAS_FILE') {
                    return <Tooltip title="Artwork supplied with the order"><span className="text-emerald-600 font-semibold">&#10003;</span></Tooltip>;
                }
                if (design.kind === 'BY_EM_DONE') {
                    return <Tooltip title="Our design team made this"><Tag className="text-[10px] mr-0" style={{ color: '#16a34a', background: '#f0fdf4', borderColor: '#bbf7d0' }}>By emfulfill</Tag></Tooltip>;
                }
                if (design.kind === 'BY_EM') {
                    return <Tooltip title="Waiting on our design team"><Tag className="text-[10px] mr-0" style={{ color: '#9333ea', background: '#faf5ff', borderColor: '#e9d5ff' }}>By emfulfill</Tag></Tooltip>;
                }
                if (design.kind === 'BY_SELLER') {
                    return <Tooltip title="Seller is supplying the artwork"><Tag color="blue" className="text-[10px] mr-0">By seller</Tag></Tooltip>;
                }
                return <Tooltip title="No artwork on this item yet"><Tag color="orange" className="text-[10px] mr-0">No design</Tag></Tooltip>;
            },
        },
        {
            title: 'Staff',
            dataIndex: 'assignedStaff',
            key: 'assignedStaff',
            width: 92,
            render: (staff: any) => <span className="text-sm text-zinc-600 dark:text-zinc-400">{staff?.name || staff?.email?.split('@')[0] || '-'}</span>
        },
        {
            title: 'Production Status',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            render: (status: string, record: Job) => {
                const statusOptions = [
                    { label: t.status.pendingApproval, value: 'PENDING_APPROVAL' },
                    { label: 'Received', value: 'RECEIVED' },
                    { label: t.status.inProcess, value: 'IN_PROCESS' },
                    { label: 'Completed', value: 'COMPLETED' },
                    { label: t.status.cancelled, value: 'CANCELLED' }
                ];

                let color = 'default';
                if (['COMPLETED', 'SHIPPED', 'READY_TO_SHIP'].includes(status)) color = 'success';
                if (['IN_PROCESS', 'PRINTING', 'SEWING'].includes(status)) color = 'processing';
                if (status === 'RECEIVED') color = 'warning';
                if (status === 'CANCELLED') color = 'error';
                if (status === 'DESIGN_REQUEST') color = 'orange';
                if (status === 'AWAITING_FUNDS') color = 'purple';

                // Design Requests are incomplete ($0, no design yet) — the seller
                // completes them into PENDING_APPROVAL. Admin only sees them here; the
                // status is read-only so it can't be forced into production early.
                if (status === 'DESIGN_REQUEST') {
                    return (
                        <Tag color="orange" className="text-[11px]">
                            {t.status.designRequest || 'Design Request'}
                        </Tag>
                    );
                }

                // Imported but the seller's wallet can't cover it yet. Read-only too —
                // a wallet top-up releases it to PENDING_APPROVAL automatically.
                if (status === 'AWAITING_FUNDS') {
                    return (
                        <Tag color="purple" className="text-[11px]">
                            {t.status.awaitingFunds || 'Awaiting Funds'}
                        </Tag>
                    );
                }

                return (
                    <Select
                        value={status}
                        onChange={(val) => handleStatusChange(record.id, val)}
                        size="small"
                        variant="borderless"
                        className="min-w-[120px]"
                        popupMatchSelectWidth={false}
                    >
                        {statusOptions.map(opt => (
                            <Select.Option key={opt.value} value={opt.value}>
                                <Tag color={opt.value === status ? color : 'default'} className="mr-0 text-[11px]">
                                    {opt.label}
                                </Tag>
                            </Select.Option>
                        ))}
                    </Select>
                );
            }
        },
        {
            title: t.common.action,
            key: 'action',
            width: 120,
            render: (_: any, record: Job) => (
                <Space size="small">
                    <Tooltip title="Charge / Reduce Cost">
                        <Button
                            type="text"
                            size="small"
                            icon={<DollarOutlined />}
                            onClick={() => openChargeModal(record)}
                            style={{ color: '#ca8a04', backgroundColor: '#fefce8' }}
                        />
                    </Tooltip>
                        <Tooltip title={parsePhotos(record.productPhotos).length > 0
                            ? `${parsePhotos(record.productPhotos).length} photo(s) for the seller`
                            : 'Upload a photo of the finished item'}>
                            <Button
                                type="text"
                                size="small"
                                icon={<CameraOutlined />}
                                onClick={() => openPhotos(record)}
                                style={parsePhotos(record.productPhotos).length > 0
                                    ? { color: '#0284c7', backgroundColor: '#f0f9ff' }
                                    : { color: '#71717a' }}
                            />
                        </Tooltip>
                    <Dropdown
                        trigger={['click']}
                        menu={{
                            items: [
                                { key: 'NEW', label: 'New design' },
                                { key: 'REVISION', label: 'Revision' },
                            ],
                            onClick: ({ key }) => sendToDesign(record, key as 'NEW' | 'REVISION'),
                        }}
                    >
                        <Tooltip title={designButtonStyle(record.id).title}>
                            <Button
                                type="text"
                                size="small"
                                loading={designRequestJobId === record.id}
                                icon={<HighlightOutlined />}
                                style={{
                                    color: designButtonStyle(record.id).color,
                                    backgroundColor: designButtonStyle(record.id).background,
                                }}
                            />
                        </Tooltip>
                    </Dropdown>
                    <Tooltip title="Print Label">
                        <Button
                            type="text"
                            size="small"
                            icon={<PrinterOutlined />}
                            onClick={() => window.open(pathname.startsWith('/staff') ? `/staff/print/labels?ids=${record.id}` : `/admin/print/labels?ids=${record.id}`, '_blank')}
                            style={{ color: '#71717a' }}
                        />
                    </Tooltip>
                    <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => handleViewOrder(record.orderId || '')}
                        style={{ color: '#71717a' }}
                    />

                    {!['COMPLETED', 'SHIPPED', 'CANCELLED', 'ARCHIVED'].includes(record.status) && (
                        <Popconfirm
                            title="Are you sure you want to cancel this job?"
                            onConfirm={() => handleStatusChange(record.id, 'CANCELLED')}
                            okText="Yes"
                            cancelText="No"
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<StopOutlined />}
                                className="opacity-50 hover:opacity-100"
                            />
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    };

    return (
        <React.Fragment>
            {contextHolder}

            {/* Photos of the finished garment, for the seller to see and download. */}
            <Modal
                title={`Photos for ${photoJob?.order?.orderCode || photoJob?.jobCode || ''}`}
                open={!!photoJob}
                onCancel={() => setPhotoJob(null)}
                footer={null}
                width={640}
            >
                <p className="text-sm text-zinc-500 mb-3">
                    The seller sees these on their order and can download them. Photos are kept full size;
                    delete the ones you no longer need to free up storage.
                </p>
                <Upload
                    accept="image/*"
                    showUploadList={false}
                    multiple
                    beforeUpload={(file, fileList) => {
                        // Called once per picked file; start the whole batch on the first.
                        if (file === fileList[0]) uploadPhotos(fileList as unknown as File[]);
                        return false;
                    }}
                >
                    <Button icon={<CameraOutlined />} loading={photoBusy} type="primary">Upload photo</Button>
                </Upload>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photoList.map((url) => (
                        <div key={url} className="rounded-lg overflow-hidden border border-zinc-200">
                            <Image src={url} alt="Finished item" className="object-cover" height={120} width="100%" />
                            <Popconfirm
                                title="Delete this photo?"
                                description="The seller will no longer see it, and the file is removed for good."
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                                cancelText="Keep"
                                onConfirm={() => deletePhoto(url)}
                            >
                                <Button block danger type="text" icon={<DeleteOutlined />} disabled={photoBusy}>
                                    Delete
                                </Button>
                            </Popconfirm>
                        </div>
                    ))}
                </div>
                {photoList.length === 0 ? (
                    <div className="mt-4 text-sm text-zinc-400">No photos yet.</div>
                ) : null}
            </Modal>
            <div className="mb-6 flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-2 p-1.5 pl-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl inline-flex">
                    {items.map(item => (
                        <button
                            key={item.key}
                            onClick={() => handleTabChange(item.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${(
                                item.key === 'ALL'
                                    ? activeFilterKeys.length === 0
                                    : activeFilterKeys.includes(item.key)
                            )
                                ? 'bg-white dark:bg-zinc-700 text-indigo-600 shadow-sm transform scale-105'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {/* Priority filter — combines with the status tab above. */}
                <button
                    onClick={() => setPriorityOnly(v => !v)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all duration-200 flex items-center gap-1.5 ${priorityOnly
                        ? 'bg-red-500 border-red-500 text-white shadow-sm'
                        : 'border-red-300 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
                        }`}
                >
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold ${priorityOnly ? 'bg-white/20' : 'bg-red-100 text-red-500'}`}>P</span>
                    Priority
                </button>
            </div>

            <Card
                variant="borderless"
                className="shadow-sm rounded-xl overflow-hidden [&_.ant-card-body]:p-3 md:[&_.ant-card-body]:p-4 xl:[&_.ant-card-body]:p-5"
            >
                <div className="flex justify-between items-center mb-4 gap-3">
                    <Input
                        placeholder="Search order, sku, seller sku, seller..."
                        prefix={<SearchOutlined className="text-zinc-400" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="w-72 max-w-full rounded-lg"
                        allowClear
                    />
                    <Space>
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
                        <Button icon={<PrinterOutlined />} onClick={handleBulkPrint}>
                            Print Labels
                        </Button>
                        <Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading} />
                    </Space>
                </div>

                <Table
                    rowSelection={rowSelection}
                    columns={columns}
                    size="small"
                    dataSource={jobs.filter(j => {
                        // Priority filter: keep only jobs whose order has P or S priority.
                        if (priorityOnly && !j.order?.priorityProduction && !j.order?.priorityShipping) {
                            return false;
                        }
                        if (designFilter !== 'ALL' && getOrderDesignStatus([j]).kind !== designFilter) return false;
                        const q = searchText.toLowerCase();
                        return !searchText ||
                            j.jobCode.toLowerCase().includes(q) ||
                            j.sku.toLowerCase().includes(q) ||
                            (j.seller?.name || '').toLowerCase().includes(q) ||
                            (j.recipientName || '').toLowerCase().includes(q) ||
                            (j.order?.orderCode || '').toLowerCase().includes(q) ||
                            // Seller SKU, so a whole batch (e.g. "BOYMOM") can be pulled up at once
                            (j.shippingLabel || '').toLowerCase().includes(q);
                    })}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, current: page, onChange: setPage }}
                    className="glass-table [&_.ant-table-cell]:px-3 [&_.ant-table-cell]:py-3 [&_.ant-table-thead>tr>th]:text-xs [&_.ant-table-tbody>tr>td]:align-top"
                />

                {currentOrder && (
                    <OrderDetailsModal
                        visible={viewOrderModalVisible}
                        onCancel={() => {
                            setViewOrderModalVisible(false);
                            setCurrentOrder(null);
                        }}
                        order={currentOrder}
                        showReportButton={false}
                    />
                )}

                <Modal
                    title="Charge"
                    open={isChargeModalOpen}
                    onOk={handleChargeSubmit}
                    onCancel={() => setIsChargeModalOpen(false)}
                    okText={chargeMode === 'REDUCE' ? 'Reduce Cost' : 'Charge Wallet'}
                    confirmLoading={chargeLoading}
                    okButtonProps={{ danger: chargeMode !== 'REDUCE' }}
                >
                    <div className="space-y-4 pt-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                            <Select
                                style={{ width: '100%' }}
                                value={chargeMode}
                                onChange={handleChargeModeChange}
                                options={[
                                    { label: 'Additional Charge', value: 'ADDITIONAL' },
                                    { label: 'Reduce Cost', value: 'REDUCE' },
                                ]}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                            <InputNumber
                                style={{ width: '100%' }}
                                prefix="$"
                                value={chargeAmount}
                                onChange={(val) => setChargeAmount(val || '')}
                                min={0.01}
                                step={0.01}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                            <Input.TextArea
                                rows={3}
                                value={chargeReason}
                                onChange={(e) => setChargeReason(e.target.value)}
                                placeholder={chargeMode === 'REDUCE'
                                    ? 'E.g. Special Customer, goodwill discount...'
                                    : 'E.g. Extra large size fee, rush processing...'}
                            />
                        </div>
                        {chargeMode === 'REDUCE' ? (
                            <div className="bg-emerald-50 text-emerald-800 p-3 rounded text-xs">
                                <p><strong>Note:</strong> This amount will be refunded to the seller&apos;s wallet and the order total will go down by the same amount.</p>
                            </div>
                        ) : (
                            <div className="bg-yellow-50 text-yellow-800 p-3 rounded text-xs">
                                <p><strong>Note:</strong> This amount will be deducted directly from the seller&apos;s wallet balance as a separate transaction.</p>
                            </div>
                        )}
                    </div>
                </Modal>
            </Card>
        </React.Fragment>
    );
}
