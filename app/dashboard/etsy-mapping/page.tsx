'use client';

import React, { useEffect, useState } from 'react';
import ListingMockupsCard from '@/components/ListingMockups/ListingMockupsCard';
import { App, Card, Table, Button, Input, Space, Tabs, Popconfirm, Tag, Typography, Upload, Alert, Modal, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined, UploadOutlined, InboxOutlined, EditOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { DEFAULT_POSITION } from '@/lib/positions';

const { Text, Title } = Typography;

interface DesignRow { id: string; etsySku: string; designLink: string; position: string; mockup: string; type: string; productSku: string | null; }
interface StyleRow { id: string; style: string; productSku: string; }
interface ColorRow { id: string; etsyColor: string; internalColor: string; }

export default function EtsyMappingPage() {
    const { message } = App.useApp();
    const [designs, setDesigns] = useState<DesignRow[]>([]);
    const [styles, setStyles] = useState<StyleRow[]>([]);
    const [colors, setColors] = useState<ColorRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // New-row drafts
    const [nd, setNd] = useState({ etsySku: '', designLink: '', position: DEFAULT_POSITION, mockup: '', type: 'Embroidery', productSku: '' });
    const [ns, setNs] = useState({ style: '', productSku: '' });
    const [nc, setNc] = useState({ etsyColor: '', internalColor: '' });

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/etsy-mapping');
            if (res.ok) {
                const data = await res.json();
                setDesigns(data.designs || []);
                setStyles(data.styles || []);
                setColors(data.colors || []);
            }
        } catch { message.error('Failed to load mappings'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const save = async (payload: any, okMsg = 'Saved') => {
        setSaving(true);
        try {
            const res = await fetch('/api/etsy-mapping', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok) { message.success(okMsg); await load(); return true; }
            message.error(data.error || 'Failed'); return false;
        } catch { message.error('Network error'); return false; }
        finally { setSaving(false); }
    };

    const del = (kind: string, id: string) => save({ kind, action: 'delete', id }, 'Deleted');

    // Editing a row in place -- including renaming its Etsy SKU, style or colour,
    // which the add form cannot do (re-adding only ever creates a second row).
    const [editing, setEditing] = useState<{ kind: 'design' | 'style' | 'color'; values: Record<string, string> } | null>(null);
    const startEdit = (kind: 'design' | 'style' | 'color', row: Record<string, any>) => {
        const values: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) values[k] = v == null ? '' : String(v);
        setEditing({ kind, values });
    };
    const saveEdit = async () => {
        if (!editing) return;
        if (await save({ kind: editing.kind, action: 'update', ...editing.values }, 'Mapping updated')) setEditing(null);
    };
    const editField = (key: string, label: string, placeholder = '') => (
        <div key={key} className="mb-3">
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            <Input
                value={editing?.values[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) => setEditing((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: e.target.value } } : prev))}
            />
        </div>
    );
    const rowActions = (kind: 'design' | 'style' | 'color', r: any) => (
        <Space size={4}>
            <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(kind, r)} />
            </Tooltip>
            <Popconfirm title="Delete?" onConfirm={() => del(kind, r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
        </Space>
    );

    // Bulk import the seller's existing MAP sheet (SHIPPING LABEL / FILELINK ...).
    const handleBulkUpload = async (file: File) => {
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            const norm = (k: string) => k.trim().toLowerCase().replace(/[\s_-]+/g, '');
            const mapped = rows.map((r) => {
                const o: any = {};
                Object.keys(r).forEach((k) => { o[norm(k)] = r[k]; });
                return {
                    etsySku: String(o['shippinglabel'] || o['sellersku'] || o['etsysku'] || o['sku'] || '').trim(),
                    designLink: String(o['filelink'] || o['designlink'] || o['design'] || o['design1'] || '').trim(),
                    position: String(o['position'] || o['position1'] || DEFAULT_POSITION).trim(),
                    mockup: String(o['mockup'] || o['mockup1'] || '').trim(),
                    type: String(o['type'] || o['type1'] || 'Embroidery').trim(),
                    productSku: String(o['productsku'] || o['garmentsku'] || '').trim(),
                };
            }).filter((r) => r.etsySku && r.designLink);
            if (mapped.length === 0) { message.error('No rows with Etsy SKU + design link found'); return false; }
            await save({ kind: 'bulkDesign', action: 'bulk', rows: mapped }, `Imported ${mapped.length} design mappings`);
        } catch (e) { message.error('Could not read the file'); }
        return false; // prevent antd auto-upload
    };

    const designCols = [
        { title: 'Etsy SKU', dataIndex: 'etsySku', render: (v: string) => <Tag color="blue">{v}</Tag> },
        { title: 'Design Link', dataIndex: 'designLink', render: (v: string) => <a href={v} target="_blank" rel="noreferrer" className="text-xs break-all">{v}</a> },
        { title: 'Position', dataIndex: 'position', width: 130 },
        { title: 'Mockup', dataIndex: 'mockup', width: 110 },
        { title: 'Type', dataIndex: 'type', width: 110 },
        { title: 'Garment SKU', dataIndex: 'productSku', width: 120, render: (v: string) => v || <Text type="secondary">via style</Text> },
        { title: '', width: 80, render: (_: any, r: DesignRow) => rowActions('design', r) },
    ];
    const styleCols = [
        { title: 'Etsy Style', dataIndex: 'style' },
        { title: 'Garment SKU', dataIndex: 'productSku', render: (v: string) => <Tag color="geekblue">{v}</Tag> },
        { title: '', width: 80, render: (_: any, r: StyleRow) => rowActions('style', r) },
    ];
    const colorCols = [
        { title: 'Etsy Color', dataIndex: 'etsyColor' },
        { title: 'Internal Color', dataIndex: 'internalColor' },
        { title: '', width: 80, render: (_: any, r: ColorRow) => rowActions('color', r) },
    ];

    return (
        <div className="p-2 md:p-4">
            <Title level={3}>Etsy Mapping</Title>

            <Modal
                title={editing?.kind === 'design' ? 'Edit design mapping' : editing?.kind === 'style' ? 'Edit style mapping' : 'Edit color mapping'}
                open={!!editing}
                onCancel={() => setEditing(null)}
                onOk={saveEdit}
                okText="Save"
                confirmLoading={saving}
                destroyOnHidden
            >
                {editing?.kind === 'design' ? (
                    <>
                        {editField('etsySku', 'Etsy SKU', 'e.g. EM-NURSE')}
                        {editField('designLink', 'Design link', 'Google Drive link, or "self design"')}
                        {editField('position', 'Position', DEFAULT_POSITION)}
                        {editField('mockup', 'Mockup', 'Mockup link')}
                        {editField('type', 'Type', 'Embroidery')}
                        {editField('productSku', 'Garment SKU (optional)', 'e.g. EM-18000')}
                    </>
                ) : editing?.kind === 'style' ? (
                    <>
                        {editField('style', 'Etsy style')}
                        {editField('productSku', 'Garment SKU', 'e.g. EM-18000')}
                    </>
                ) : editing?.kind === 'color' ? (
                    <>
                        {editField('etsyColor', 'Etsy color')}
                        {editField('internalColor', 'Internal color')}
                    </>
                ) : null}
            </Modal>
            <Alert
                type="info" showIcon className="mb-4"
                message="Configure once, then import Etsy files directly"
                description="These tables tell the system how to turn an Etsy order into a production order: which design/print goes with each Etsy SKU, which garment blank each style uses, and how Etsy color names map to your variants."
            />

            <Tabs
                items={[
                    {
                        key: 'design', label: `Design (${designs.length})`,
                        children: (
                            <Card size="small">
                                <div className="mb-3 flex flex-wrap gap-2 items-center">
                                    <Input placeholder="Etsy SKU (e.g. EM-NURSE)" value={nd.etsySku} onChange={(e) => setNd({ ...nd, etsySku: e.target.value })} className="w-44" />
                                    <Input placeholder="Design link (Google Drive)" value={nd.designLink} onChange={(e) => setNd({ ...nd, designLink: e.target.value })} className="w-64" />
                                    <Input placeholder="Position" value={nd.position} onChange={(e) => setNd({ ...nd, position: e.target.value })} className="w-36" />
                                    <Input placeholder="Mockup" value={nd.mockup} onChange={(e) => setNd({ ...nd, mockup: e.target.value })} className="w-32" />
                                    <Input placeholder="Type" value={nd.type} onChange={(e) => setNd({ ...nd, type: e.target.value })} className="w-32" />
                                    <Input placeholder="Garment SKU (optional)" value={nd.productSku} onChange={(e) => setNd({ ...nd, productSku: e.target.value })} className="w-40" />
                                    <Button type="primary" icon={<PlusOutlined />} loading={saving}
                                        onClick={async () => { if (await save({ kind: 'design', ...nd })) setNd({ etsySku: '', designLink: '', position: DEFAULT_POSITION, mockup: '', type: 'Embroidery', productSku: '' }); }}>
                                        Add / Update
                                    </Button>
                                    <Upload accept=".xlsx,.xls,.csv" showUploadList={false} beforeUpload={(f) => handleBulkUpload(f as any)}>
                                        <Button icon={<UploadOutlined />}>Import from Excel (MAP)</Button>
                                    </Upload>
                                </div>
                                <Table rowKey="id" size="small" loading={loading} columns={designCols as any} dataSource={designs} pagination={{ pageSize: 10 }} scroll={{ x: 900 }} />
                            </Card>
                        ),
                    },
                    {
                        key: 'style', label: `Style → Blank (${styles.length})`,
                        children: (
                            <Card size="small">
                                <div className="mb-3 flex flex-wrap gap-2 items-center">
                                    <Input placeholder="Etsy style (e.g. Sweatshirt)" value={ns.style} onChange={(e) => setNs({ ...ns, style: e.target.value })} className="w-52" />
                                    <Input placeholder="Garment SKU (e.g. EM-18000)" value={ns.productSku} onChange={(e) => setNs({ ...ns, productSku: e.target.value })} className="w-52" />
                                    <Button type="primary" icon={<PlusOutlined />} loading={saving}
                                        onClick={async () => { if (await save({ kind: 'style', ...ns })) setNs({ style: '', productSku: '' }); }}>
                                        Add / Update
                                    </Button>
                                </div>
                                <Table rowKey="id" size="small" loading={loading} columns={styleCols as any} dataSource={styles} pagination={{ pageSize: 10 }} />
                            </Card>
                        ),
                    },
                    {
                        key: 'color', label: `Color (${colors.length})`,
                        children: (
                            <Card size="small">
                                <Text type="secondary" className="block mb-2">Only needed when an Etsy color name differs from your variant color. Unmapped colors are used as-is.</Text>
                                <div className="mb-3 flex flex-wrap gap-2 items-center">
                                    <Input placeholder="Etsy color" value={nc.etsyColor} onChange={(e) => setNc({ ...nc, etsyColor: e.target.value })} className="w-52" />
                                    <Input placeholder="Internal color" value={nc.internalColor} onChange={(e) => setNc({ ...nc, internalColor: e.target.value })} className="w-52" />
                                    <Button type="primary" icon={<PlusOutlined />} loading={saving}
                                        onClick={async () => { if (await save({ kind: 'color', ...nc })) setNc({ etsyColor: '', internalColor: '' }); }}>
                                        Add / Update
                                    </Button>
                                </div>
                                <Table rowKey="id" size="small" loading={loading} columns={colorCols as any} dataSource={colors} pagination={{ pageSize: 10 }} />
                            </Card>
                        ),
                    },
                ]}
            />
            <ListingMockupsCard />
        </div>
    );
}
