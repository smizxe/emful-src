'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Table, Input, Button, Typography, Space, Tag, Tooltip, Modal, Popconfirm } from 'antd';
import { ReloadOutlined, LinkOutlined, CopyOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

interface DesignFix {
    id: string;
    sellerSku: string;
    sku: string;
    fileLink: string;
    orderCode: string;
    note: string;
    updatedAt: string;
}

/**
 * The seller's own library of designs the shop has made or corrected for them,
 * looked up by their SKU. They can tidy it -- edit or delete a row -- but it is a
 * lookup list only: nothing here changes an order by itself.
 */
export default function DesignFixesPage() {
    const { message } = App.useApp();
    const [fixes, setFixes] = useState<DesignFix[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search.trim()) params.set('search', search.trim());
            const res = await fetch(`/api/design-fixes?${params.toString()}`, { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load fixed designs');
            setFixes(data.fixes || []);
        } catch (error: any) {
            message.error(error.message || 'Failed to load fixed designs');
        } finally {
            setLoading(false);
        }
    }, [search, message]);

    useEffect(() => { load(); }, [load]);

    // Editing one row in a modal; the fields are what the seller can change.
    const [editing, setEditing] = useState<DesignFix | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const saveEdit = async () => {
        if (!editing) return;
        if (!editing.sellerSku.trim() || !editing.fileLink.trim()) {
            message.error('Your SKU and the file are both required');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/design-fixes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: editing.id, sellerSku: editing.sellerSku, sku: editing.sku, fileLink: editing.fileLink, note: editing.note }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not save the design');
            message.success('Design updated');
            setEditing(null);
            await load();
        } catch (error: any) {
            message.error(error.message || 'Could not save the design');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: string) => {
        setDeletingId(id);
        try {
            const res = await fetch(`/api/design-fixes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not delete the design');
            message.success('Design deleted');
            setFixes((prev) => prev.filter((f) => f.id !== id));
        } catch (error: any) {
            message.error(error.message || 'Could not delete the design');
        } finally {
            setDeletingId(null);
        }
    };

    const field = (key: 'sellerSku' | 'sku' | 'fileLink' | 'note', label: string, textarea = false) => (
        <div className="mb-3">
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            {textarea ? (
                <Input.TextArea
                    autoSize={{ minRows: 2, maxRows: 6 }}
                    value={editing?.[key] ?? ''}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))}
                />
            ) : (
                <Input
                    value={editing?.[key] ?? ''}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))}
                />
            )}
        </div>
    );

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            message.success('Link copied');
        } catch {
            message.error('Could not copy the link');
        }
    };

    const columns = [
        {
            title: 'YOUR SKU',
            dataIndex: 'sellerSku',
            width: 180,
            render: (value: string) => <span className="font-semibold">{value}</span>,
        },
        { title: 'PRODUCT', dataIndex: 'sku', width: 160, ellipsis: true, render: (v: string) => v || '-' },
        {
            title: 'FIXED FILE',
            dataIndex: 'fileLink',
            render: (value: string) => (
                <Space size={4} className="w-full">
                    <Text className="text-xs" ellipsis={{ tooltip: value }} style={{ maxWidth: 360 }}>{value}</Text>
                    {/^https?:\/\//i.test(value) ? (
                        <Tooltip title="Open">
                            <Button size="small" type="text" icon={<LinkOutlined />} href={value} target="_blank" rel="noopener noreferrer" />
                        </Tooltip>
                    ) : null}
                    <Tooltip title="Copy link">
                        <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copy(value)} />
                    </Tooltip>
                </Space>
            ),
        },
        { title: 'NOTE', dataIndex: 'note', width: 200, ellipsis: true, render: (v: string) => v || '-' },
        {
            title: 'FROM ORDER', dataIndex: 'orderCode', width: 130,
            render: (v: string) => (v ? <Tag>{v}</Tag> : '-'),
        },
        {
            title: 'UPDATED', dataIndex: 'updatedAt', width: 130,
            render: (v: string) => dayjs(v).format('DD MMM YYYY'),
        },
        {
            title: '',
            key: 'actions',
            width: 90,
            fixed: 'right' as const,
            render: (_: unknown, record: DesignFix) => (
                <Space size={2}>
                    <Tooltip title="Edit">
                        <Button
                            size="small"
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => setEditing({ ...record, sku: record.sku || '', note: record.note || '' })}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this design?"
                        description="It is taken off your list. Your orders are not changed."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        cancelText="Keep"
                        onConfirm={() => remove(record.id)}
                    >
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={deletingId === record.id} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="p-6">
            <Modal
                title="Edit design"
                open={!!editing}
                onCancel={() => setEditing(null)}
                onOk={saveEdit}
                okText="Save"
                confirmLoading={saving}
                destroyOnHidden
            >
                {field('sellerSku', 'Your SKU')}
                {field('sku', 'Product')}
                {field('fileLink', 'File (link)')}
                {field('note', 'Note', true)}
                {editing?.orderCode ? (
                    <div className="text-xs text-zinc-400">From order {editing.orderCode}</div>
                ) : null}
            </Modal>
            <h1 className="text-2xl font-bold mb-1">New/Fixed Designs</h1>
            <p className="text-sm text-zinc-500 mb-6">
                Artwork our design team has made new or corrected for you, kept against your own SKU.
                Next time you order the same SKU, this is the file to use.
            </p>

            <Card
                title={<Space><span>New/Fixed Designs</span><Tag color="blue">{fixes.length}</Tag></Space>}
                extra={
                    <Space>
                        <Input.Search
                            allowClear size="small" style={{ width: 220 }}
                            placeholder="Your SKU, product, order..."
                            onSearch={(value) => setSearch(value)}
                        />
                        <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>
                    </Space>
                }
            >
                <Table
                    rowKey="id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={fixes}
                    pagination={{ pageSize: 20, showSizeChanger: false }}
                    scroll={{ x: 1200 }}
                    locale={{ emptyText: 'Nothing yet. Designs our team fixes for you will show up here.' }}
                />
            </Card>
        </div>
    );
}
