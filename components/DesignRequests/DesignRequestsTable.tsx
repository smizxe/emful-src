'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Card, Table, Tag, Input, InputNumber, Select, Button, Typography, Space, Tooltip, DatePicker } from 'antd';
import { ReloadOutlined, LinkOutlined, DeleteOutlined, WarningOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface DesignRequestRow {
    id: string;
    jobId: string;
    orderCode: string;
    sellerName: string;
    customerName: string;
    sku: string;
    sellerSku: string;
    type: 'NEW' | 'REVISION' | string;
    designLink: string;
    status: 'PENDING' | 'FINISHED' | string;
    fileLink: string;
    price: number | null;
    assignedDesignerId?: string;
    /** Every position on the job, each with its own mockup. One price covers them all. */
    positions?: Array<{ index: number; position: string; mockup: string; link: string; type: string; fileLink: string }>;
    sheetNote?: string;
    assignedDesignerName?: string;
    note: string;
    createdAt: string;
    finishedAt?: string | null;
}

type Period = 'ALL' | 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM';

/**
 * The design queue, shared by the admin page, the staff page and the designer
 * portal.
 *
 * Admin owns what the job is and what reference the designer gets (type, design
 * link). The designer owns the finished file, the price and whether it is done.
 * `canAdmin` decides which half is editable; the server says who may set the
 * status.
 *
 * The date range and totals are there so the shop and the designer can settle
 * up for a month and export the same numbers to Excel.
 */
export default function DesignRequestsTable({ canAdmin }: { canAdmin: boolean }) {
    const { message } = App.useApp();
    const [rows, setRows] = useState<DesignRequestRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [search, setSearch] = useState('');
    // Antd keeps the current page when the rows change, so a search made from
    // page 3 would land on page 3 of a one-row result and look empty.
    const [page, setPage] = useState(1);

    const [period, setPeriod] = useState<Period>('ALL');
    const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
    // Only a designer marks work finished, so the server tells us who is looking.
    const [canDesign, setCanDesign] = useState(false);
    const [designers, setDesigners] = useState<Array<{ id: string; name: string | null; email: string }>>([]);
    const [sellers, setSellers] = useState<Array<{ sellerId: string; sellerName: string }>>([]);
    const [sellerFilter, setSellerFilter] = useState('ALL');

    // Admin can move a request to another designer, so it needs the roster.
    useEffect(() => {
        if (!canAdmin) return;
        let cancelled = false;
        fetch('/api/admin/designer-assignments')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data || cancelled) return;
                setDesigners(data.designers || []);
                setSellers(data.rows || []);
            })
            .catch(() => { /* the column just falls back to a plain name */ });
        return () => { cancelled = true; };
    }, [canAdmin]);

    // Whole days, so "1 Oct to 31 Oct" really covers both ends.
    const activeRange = useMemo<[Dayjs, Dayjs] | null>(() => {
        if (period === 'THIS_MONTH') return [dayjs().startOf('month'), dayjs().endOf('month')];
        if (period === 'LAST_MONTH') {
            const prev = dayjs().subtract(1, 'month');
            return [prev.startOf('month'), prev.endOf('month')];
        }
        if (period === 'CUSTOM' && range) return [range[0].startOf('day'), range[1].endOf('day')];
        return null;
    }, [period, range]);

    useEffect(() => { setPage(1); }, [search, statusFilter, sellerFilter, period, range]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'ALL') params.set('status', statusFilter);
            if (sellerFilter !== 'ALL') params.set('sellerId', sellerFilter);
            if (search.trim()) params.set('search', search.trim());
            if (activeRange) {
                params.set('from', activeRange[0].toISOString());
                params.set('to', activeRange[1].toISOString());
            }
            const res = await fetch(`/api/design-requests?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load design requests');
            setRows(data.requests || []);
            setCanDesign(Boolean(data.canDesign));
        } catch (error: any) {
            message.error(error.message || 'Failed to load design requests');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, sellerFilter, search, activeRange, message]);

    useEffect(() => { load(); }, [load]);

    const patch = async (id: string, payload: Record<string, unknown>) => {
        setSavingId(id);
        // Show the change straight away; reload below reconciles with the server.
        setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...payload } as DesignRequestRow : row)));
        try {
            const res = await fetch('/api/design-requests', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...payload }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            // The API returns the bare row; keep the positions this table built and
            // refresh each one's finished link from what was just saved.
            setRows((prev) => prev.map((row) => {
                if (row.id !== id) return row;
                let saved: Array<{ index: number; link: string }> = [];
                try { saved = JSON.parse(data.request?.fileLinks || '[]'); } catch { saved = []; }
                const positions = (row.positions || []).map((pos) => ({
                    ...pos,
                    fileLink: saved.find((f) => Number(f.index) === pos.index)?.link ?? pos.fileLink,
                }));
                return { ...row, ...data.request, positions, sheetNote: row.sheetNote };
            }));
        } catch (error: any) {
            message.error(error.message || 'Save failed');
            load();
        } finally {
            setSavingId(null);
        }
    };

    const remove = async (id: string) => {
        try {
            const res = await fetch(`/api/design-requests?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
            message.success('Design request removed');
            load();
        } catch (error: any) {
            message.error(error.message || 'Delete failed');
        }
    };

    /** Export exactly what is on screen, so both sides settle on the same numbers. */
    const exportExcel = async () => {
        if (rows.length === 0) {
            message.info('Nothing to export for this range');
            return;
        }
        setExporting(true);
        try {
            const XLSX = await import('xlsx');
            const sheetRows = rows.map((row) => ({
                'Seller': row.sellerName,
                'Order ID': row.orderCode,
                'Customer': row.customerName,
                'SKU': row.sku,
                'Seller SKU': row.sellerSku,
                'Request': row.type === 'REVISION' ? 'Revision' : 'New',
                'Mockup / Design': row.designLink,
                'Note': row.note,
                'Status': row.status === 'FINISHED' ? 'Finished' : 'Pending',
                'Link File': (row.positions || []).filter((p) => p.fileLink).length > 0
                    ? (row.positions || []).filter((p) => p.fileLink).map((p) => `${p.position || '#' + (p.index + 1)}: ${p.fileLink}`).join('; ')
                    : row.fileLink,
                'Price': row.price ?? '',
                'Created': dayjs(row.createdAt).format('YYYY-MM-DD'),
                'Finished': row.finishedAt ? dayjs(row.finishedAt).format('YYYY-MM-DD') : '',
            }));
            // A totals line so the sheet can be handed over as-is.
            sheetRows.push({
                'Seller': '', 'Order ID': '', 'Customer': '', 'SKU': '', 'Seller SKU': '',
                'Request': '', 'Mockup / Design': '', 'Note': '', 'Status': 'TOTAL',
                'Link File': '', 'Price': totalPrice, 'Created': '', 'Finished': '',
            } as any);

            const sheet = XLSX.utils.json_to_sheet(sheetRows);
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, sheet, 'Design Requests');

            const label = activeRange
                ? `${activeRange[0].format('YYYYMMDD')}-${activeRange[1].format('YYYYMMDD')}`
                : 'all';
            XLSX.writeFile(book, `design-requests-${label}.xlsx`);
            message.success('Excel downloaded');
        } catch (error: any) {
            message.error(error.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    // Only open something that is actually a link. A bare word here would be read
    // as a relative path and land the user on a page of this app instead.
    const isOpenable = (value: string) => /^https?:\/\//i.test((value || '').trim());

    /**
     * Inputs have an intrinsic width and will happily overflow a table cell,
     * spilling a long URL across the columns beside it. `min-w-0` on both the
     * row and the input is what lets them shrink to the column instead.
     */
    const linkCell = (value: string, onSave: (next: string) => void, editable: boolean, placeholder: string) => (
        <div className="flex items-center gap-1 w-full min-w-0">
            {editable ? (
                <Input
                    size="small"
                    className="flex-1 min-w-0"
                    defaultValue={value}
                    placeholder={placeholder}
                    title={value}
                    onBlur={(e) => { if (e.target.value !== value) onSave(e.target.value); }}
                    onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
                />
            ) : (
                <Text className="text-xs flex-1 min-w-0" ellipsis={{ tooltip: value }}>{value || '-'}</Text>
            )}
            {isOpenable(value) ? (
                <Tooltip title="Open link">
                    <Button className="shrink-0" size="small" type="text" icon={<LinkOutlined />} href={value.trim()} target="_blank" rel="noopener noreferrer" />
                </Tooltip>
            ) : value ? (
                <Tooltip title="Not a link - paste a full https:// address to make it openable">
                    <WarningOutlined className="shrink-0 text-amber-500" />
                </Tooltip>
            ) : null}
        </div>
    );

    const columns: ColumnsType<DesignRequestRow> = useMemo(() => [
        { title: 'SELLER', dataIndex: 'sellerName', width: 100, ellipsis: true, render: (v) => v || '-' },
        {
            title: 'ORDER ID', dataIndex: 'orderCode', width: 105, ellipsis: true,
            render: (v) => <span className="font-semibold">{v || '-'}</span>,
        },
        { title: 'CUSTOMER', dataIndex: 'customerName', width: 110, ellipsis: true, render: (v) => v || '-' },
        { title: 'SKU', dataIndex: 'sku', width: 95, ellipsis: true, render: (v) => v || '-' },
        { title: 'SELLER SKU', dataIndex: 'sellerSku', width: 110, ellipsis: true, render: (v) => v || '-' },
        {
            title: 'REQUEST', dataIndex: 'type', width: 95,
            render: (value, record) => (canAdmin ? (
                <Select
                    size="small" value={value} style={{ width: '100%' }}
                    onChange={(next) => patch(record.id, { type: next })}
                    options={[{ label: 'New', value: 'NEW' }, { label: 'Revision', value: 'REVISION' }]}
                />
            ) : (
                <Tag color={value === 'REVISION' ? 'orange' : 'blue'}>{value === 'REVISION' ? 'Revision' : 'New'}</Tag>
            )),
        },
        {
            title: 'DESIGNER', dataIndex: 'assignedDesignerName', width: 120,
            render: (value: string, record) => (canAdmin ? (
                <Select
                    size="small" style={{ width: '100%' }} allowClear
                    value={record.assignedDesignerId || undefined}
                    placeholder="Whole team"
                    onChange={(next) => patch(record.id, { assignedDesignerId: next || '' })}
                    options={designers.map((d) => ({ label: d.name || d.email, value: d.id }))}
                />
            ) : (
                value ? <Tag color="purple">{value}</Tag> : <span className="text-zinc-400">Team</span>
            )),
        },
        {
            title: 'MOCKUP / DESIGN', dataIndex: 'designLink', width: 230,
            render: (value, record) => {
                const positions = record.positions || [];
                if (positions.length === 0) {
                    return linkCell(value, (next) => patch(record.id, { designLink: next }), canAdmin, 'Reference link');
                }
                // Everything the sheet carried for this job, in order. One price
                // on the row covers all of them.
                return (
                    <div className="flex flex-col gap-0.5 min-w-0">
                        {positions.map((p, i) => (
                            <div key={i} className="flex items-center gap-1 min-w-0">
                                <Tag className="text-[9px] mr-0 shrink-0" color="default">{p.position || `#${i + 1}`}</Tag>
                                {p.mockup ? (
                                    <a href={p.mockup} target="_blank" rel="noopener noreferrer" className="text-[10px] truncate" title={p.mockup}>
                                        mockup {i + 1}
                                    </a>
                                ) : <span className="text-[10px] text-zinc-400">no mockup</span>}
                                {p.link ? (
                                    <a href={p.link} target="_blank" rel="noopener noreferrer" className="text-[10px] truncate" title={p.link}>
                                        · file
                                    </a>
                                ) : null}
                            </div>
                        ))}
                    </div>
                );
            },
        },
        {
            title: 'NOTE', dataIndex: 'note', width: 190,
            render: (value, record) => (
                <div className="w-full min-w-0">
                    <Input.TextArea
                        size="small"
                        className="w-full min-w-0"
                        // Long notes grow downwards instead of running off the cell.
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        defaultValue={value}
                        placeholder="Note for the designer"
                        onBlur={(e) => { if (e.target.value !== value) patch(record.id, { note: e.target.value }); }}
                    />
                </div>
            ),
        },
        {
            title: 'STATUS', dataIndex: 'status', width: 100,
            render: (value, record) => (canDesign ? (
                <Select
                    size="small" value={value} style={{ width: '100%' }} loading={savingId === record.id}
                    onChange={(next) => patch(record.id, { status: next })}
                    options={[{ label: 'Pending', value: 'PENDING' }, { label: 'Finished', value: 'FINISHED' }]}
                />
            ) : (
                <Tooltip title="Only the designer marks this finished">
                    <Tag color={value === 'FINISHED' ? 'green' : 'orange'}>
                        {value === 'FINISHED' ? 'Finished' : 'Pending'}
                    </Tag>
                </Tooltip>
            )),
        },
        {
            title: 'LINK FILE', dataIndex: 'fileLink', width: 210,
            render: (value, record) => {
                const positions = record.positions || [];
                // A single position, or an old request with none, keeps one box.
                if (positions.length <= 1) {
                    const only = positions[0];
                    if (!only) {
                        return linkCell(value, (next) => patch(record.id, { fileLink: next }), true, 'Finished artwork link');
                    }
                    return linkCell(only.fileLink || value, (next) => patch(record.id, {
                        fileLinks: [{ index: only.index, position: only.position, link: next }],
                    }), true, `${only.position || 'File'} link`);
                }
                // One box per position, each written back onto its own place on
                // the order -- a chest and a sleeve are two separate files.
                return (
                    <div className="flex flex-col gap-1 min-w-0">
                        {positions.map((p) => (
                            <div key={p.index} className="flex items-center gap-1 min-w-0">
                                <Tag className="text-[9px] mr-0 shrink-0">{p.position || `#${p.index + 1}`}</Tag>
                                <div className="flex-1 min-w-0">
                                    {linkCell(p.fileLink, (next) => patch(record.id, {
                                        fileLinks: [{ index: p.index, position: p.position, link: next }],
                                    }), true, 'link')}
                                </div>
                            </div>
                        ))}
                    </div>
                );
            },
        },
        {
            title: 'PRICE', dataIndex: 'price', width: 85,
            render: (value, record) => (
                <InputNumber
                    size="small" prefix="$" min={0} step={0.5} style={{ width: '100%' }}
                    defaultValue={value ?? undefined} placeholder="0.00"
                    onBlur={(e) => {
                        const raw = (e.target as HTMLInputElement).value;
                        const next = raw === '' ? null : Number(raw);
                        if (next !== value) patch(record.id, { price: next });
                    }}
                />
            ),
        },
        {
            title: 'DATE', dataIndex: 'createdAt', width: 85,
            render: (value: string, record) => (
                <Tooltip title={record.finishedAt ? `Finished ${dayjs(record.finishedAt).format('DD MMM YYYY HH:mm')}` : 'Not finished yet'}>
                    <span className="text-xs">{dayjs(value).format('DD MMM YY')}</span>
                </Tooltip>
            ),
        },
        ...(canAdmin ? [{
            title: '', key: 'actions', width: 40, fixed: 'right' as const,
            render: (_: unknown, record: DesignRequestRow) => (
                <Tooltip title="Remove this request">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => remove(record.id)} />
                </Tooltip>
            ),
        }] : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [canAdmin, canDesign, savingId, designers]);

    const pending = rows.filter((row) => row.status !== 'FINISHED').length;
    const finishedRows = rows.filter((row) => row.status === 'FINISHED');
    const totalPrice = rows.reduce((sum, row) => sum + Number(row.price || 0), 0);
    const finishedPrice = finishedRows.reduce((sum, row) => sum + Number(row.price || 0), 0);

    const rangeLabel = activeRange
        ? `${activeRange[0].format('DD MMM')} - ${activeRange[1].format('DD MMM YYYY')}`
        : 'All time';

    return (
        <Card
            title={
                <Space wrap size={6}>
                    <span>Design Requests</span>
                    <Tag>{rows.length} in {rangeLabel}</Tag>
                    <Tag color="orange">{pending} pending</Tag>
                    <Tooltip title="Total of every price in this range">
                        <Tag color="blue">${totalPrice.toFixed(2)} total</Tag>
                    </Tooltip>
                    <Tooltip title={`${finishedRows.length} finished in this range`}>
                        <Tag color="green">${finishedPrice.toFixed(2)} finished</Tag>
                    </Tooltip>
                </Space>
            }
            extra={
                <Space wrap size={6}>
                    <Input.Search
                        allowClear size="small" style={{ width: 200 }}
                        placeholder="Order, customer, SKU..."
                        onSearch={(value) => setSearch(value)}
                    />
                    <Select
                        size="small" value={statusFilter} style={{ width: 130 }}
                        onChange={setStatusFilter}
                        options={[
                            { label: 'All statuses', value: 'ALL' },
                            { label: 'Pending', value: 'PENDING' },
                            { label: 'Finished', value: 'FINISHED' },
                        ]}
                    />
                    {canAdmin ? (
                        <Select
                            size="small" value={sellerFilter} style={{ width: 150 }}
                            onChange={setSellerFilter}
                            showSearch
                            optionFilterProp="label"
                            options={[
                                { label: 'All sellers', value: 'ALL' },
                                ...sellers.map((s) => ({ label: s.sellerName, value: s.sellerId })),
                            ]}
                        />
                    ) : null}
                    <Select
                        size="small" value={period} style={{ width: 130 }}
                        onChange={(next) => { setPeriod(next); if (next !== 'CUSTOM') setRange(null); }}
                        options={[
                            { label: 'All time', value: 'ALL' },
                            { label: 'This month', value: 'THIS_MONTH' },
                            { label: 'Last month', value: 'LAST_MONTH' },
                            { label: 'Custom range', value: 'CUSTOM' },
                        ]}
                    />
                    {period === 'CUSTOM' ? (
                        <RangePicker
                            size="small"
                            value={range}
                            onChange={(value) => setRange(value as [Dayjs, Dayjs] | null)}
                            format="DD/MM/YYYY"
                        />
                    ) : null}
                    <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
                    <Button size="small" icon={<DownloadOutlined />} onClick={exportExcel} loading={exporting}>Excel</Button>
                </Space>
            }
        >
            <div className="design-queue">
            <Table
                rowKey="id\"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={rows}
                // Fixed layout is what keeps a long URL inside its own column.
                tableLayout="fixed"
                pagination={{ pageSize: 20, showSizeChanger: false, current: page, onChange: setPage }}
                scroll={{ x: 1595 }}
                locale={{ emptyText: 'No design requests in this range.' }}
            />
            </div>
            <style jsx global>{`
                /* The queue is wide by nature; shrinking the type is what lets a
                   whole row fit on screen instead of being dragged sideways. */
                .design-queue .ant-table { font-size: 11px; }
                .design-queue .ant-table-thead > tr > th { padding: 6px 6px !important; font-size: 10px; letter-spacing: .02em; }
                .design-queue .ant-table-tbody > tr > td { padding: 4px 6px !important; }
                .design-queue .ant-input,
                .design-queue .ant-input-number-input,
                .design-queue .ant-select-selection-item,
                .design-queue textarea.ant-input { font-size: 11px; }
                .design-queue .ant-tag { font-size: 10px; line-height: 16px; margin-inline-end: 2px; }
                .design-queue .ant-btn-sm { padding-inline: 4px; }
            `}</style>
        </Card>
    );
}
