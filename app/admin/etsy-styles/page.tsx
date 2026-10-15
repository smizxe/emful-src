'use client';

import React, { useEffect, useState } from 'react';
import ListingMockupsCard from '@/components/ListingMockups/ListingMockupsCard';
import { App, Card, Table, Button, Input, Popconfirm, Tag, Typography, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface StyleRow { id: string; style: string; productSku: string; }

export default function GlobalEtsyStylesPage() {
    const { message } = App.useApp();
    const [rows, setRows] = useState<StyleRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState({ style: '', productSku: '' });

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/etsy-styles');
            if (res.ok) { const d = await res.json(); setRows(d.styles || []); }
        } catch { message.error('Failed to load'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async (payload: any, ok = 'Saved') => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/etsy-styles', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            const d = await res.json();
            if (res.ok) { message.success(ok); await load(); return true; }
            message.error(d.error || 'Failed'); return false;
        } catch { message.error('Network error'); return false; }
        finally { setSaving(false); }
    };

    const columns = [
        { title: 'Etsy Style (case-insensitive)', dataIndex: 'style' },
        { title: 'Garment Blank SKU', dataIndex: 'productSku', render: (v: string) => <Tag color="geekblue">{v}</Tag> },
        {
            title: '', width: 60, render: (_: any, r: StyleRow) => (
                <Popconfirm title="Delete?" onConfirm={() => save({ action: 'delete', id: r.id }, 'Deleted')}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
            )
        },
    ];

    return (
        <div className="p-4 max-w-3xl">
            <Title level={3}>Etsy Style → Blank (global default)</Title>
            <Alert
                type="info" showIcon className="mb-4"
                message="Applies to every seller"
                description="When a seller converts/imports an Etsy file, the garment blank (Product SKU) is filled from the Etsy 'Style and Size' value using this table — so sellers don't each have to configure it. Matching is case-insensitive (SWEATSHIRT = Sweatshirt). A seller can still override a style in their own Etsy Mapping."
            />

            <Card size="small">
                <div className="mb-3 flex flex-wrap gap-2 items-center">
                    <Input placeholder="Style (e.g. Sweatshirt, Hoodie, Tshirt)" value={draft.style} onChange={e => setDraft({ ...draft, style: e.target.value })} className="w-64" />
                    <Input placeholder="Blank SKU (e.g. EM-18000)" value={draft.productSku} onChange={e => setDraft({ ...draft, productSku: e.target.value })} className="w-48" />
                    <Button type="primary" icon={<PlusOutlined />} loading={saving}
                        onClick={async () => { if (await save({ style: draft.style, productSku: draft.productSku })) setDraft({ style: '', productSku: '' }); }}>
                        Add / Update
                    </Button>
                </div>
                <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={rows} pagination={false} />
                <Text type="secondary" className="block mt-3 text-xs">Common values: Sweatshirt → EM-18000, Hoodie → EM-18500, Tshirt / T-shirt → your tee SKU (e.g. EM-3001 or EM-5000).</Text>
            </Card>
            <ListingMockupsCard pickSeller />
        </div>
    );
}
