'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Table, Select, Space, Tag, Button, Input, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface AssignmentRow {
    sellerId: string;
    sellerName: string;
    designerId: string;
}

interface Designer {
    id: string;
    name: string | null;
    email: string;
}

/**
 * Who looks after whom. Raising a design request for one of a seller's orders
 * sends it to that seller's designer; a seller left on "Whole team" goes to
 * everyone, so nothing is ever stranded.
 */
export default function DesignerAssignments() {
    const { message } = App.useApp();
    const [rows, setRows] = useState<AssignmentRow[]>([]);
    const [designers, setDesigners] = useState<Designer[]>([]);
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/designer-assignments', { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load assignments');
            setRows(data.rows || []);
            setDesigners(data.designers || []);
        } catch (error: any) {
            message.error(error.message || 'Failed to load assignments');
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { load(); }, [load]);

    const assign = async (sellerId: string, designerId: string) => {
        setSavingId(sellerId);
        setRows((prev) => prev.map((r) => (r.sellerId === sellerId ? { ...r, designerId } : r)));
        try {
            const res = await fetch('/api/admin/designer-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sellerId, designerId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            message.success(designerId ? 'Designer assigned' : 'Sent back to the whole team');
        } catch (error: any) {
            message.error(error.message || 'Save failed');
            load();
        } finally {
            setSavingId(null);
        }
    };

    const visible = search.trim()
        ? rows.filter((r) => (r.sellerName || '').toLowerCase().includes(search.trim().toLowerCase()))
        : rows;

    const assigned = rows.filter((r) => r.designerId).length;

    const columns = [
        {
            title: 'SELLER', dataIndex: 'sellerName', width: 260,
            render: (value: string) => <span className="font-medium">{value || '-'}</span>,
        },
        {
            title: 'DESIGNER', dataIndex: 'designerId',
            render: (value: string, record: AssignmentRow) => (
                <Select
                    size="small"
                    style={{ width: 260 }}
                    allowClear
                    loading={savingId === record.sellerId}
                    value={value || undefined}
                    placeholder="Whole team"
                    onChange={(next) => assign(record.sellerId, next || '')}
                    options={designers.map((d) => ({ label: d.name || d.email, value: d.id }))}
                />
            ),
        },
    ];

    return (
        <Card
            className="mt-6"
            title={
                <Space wrap>
                    <span>Who designs for whom</span>
                    <Tag color="purple">{assigned} of {rows.length} sellers assigned</Tag>
                </Space>
            }
            extra={
                <Space>
                    <Input.Search
                        allowClear size="small" style={{ width: 200 }}
                        placeholder="Find a seller..."
                        onSearch={setSearch}
                    />
                    <Tooltip title="Reload">
                        <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading} />
                    </Tooltip>
                </Space>
            }
        >
            <p className="text-sm text-zinc-500 mb-4">
                A request raised for one of a seller&apos;s orders goes to their designer.
                Sellers left on &quot;Whole team&quot; are visible to every designer.
            </p>
            <Table
                rowKey="sellerId"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={visible}
                pagination={{ pageSize: 10, showSizeChanger: false }}
                locale={{ emptyText: designers.length === 0 ? 'Add a designer account under Staff & Designers first.' : 'No sellers found.' }}
            />
        </Card>
    );
}
