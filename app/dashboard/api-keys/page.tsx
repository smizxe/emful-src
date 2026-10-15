'use client';

import React, { useEffect, useState } from 'react';
import { App, Card, Table, Button, Input, Modal, Tag, Typography, Popconfirm, Alert, Space } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined, ApiOutlined } from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;

interface KeyRow { id: string; name: string; prefix: string; lastUsedAt: string | null; revoked: boolean; createdAt: string; }

export default function ApiKeysPage() {
    const { message } = App.useApp();
    const [keys, setKeys] = useState<KeyRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => { setBaseUrl(window.location.origin); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/api-keys');
            if (res.ok) { const d = await res.json(); setKeys(d.keys || []); }
        } catch { message.error('Failed to load keys'); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const createKey = async () => {
        setCreating(true);
        try {
            const res = await fetch('/api/api-keys', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', name: newName || 'API Key' }),
            });
            const d = await res.json();
            if (res.ok) { setCreatedKey(d.key.plain); setNewName(''); load(); }
            else message.error(d.error || 'Failed');
        } catch { message.error('Network error'); }
        finally { setCreating(false); }
    };

    const revoke = async (id: string) => {
        const res = await fetch('/api/api-keys', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'revoke', id }),
        });
        if (res.ok) { message.success('Key revoked'); load(); } else message.error('Failed to revoke');
    };

    const copy = (t: string) => { navigator.clipboard?.writeText(t); message.success('Copied'); };

    const columns = [
        { title: 'Name', dataIndex: 'name' },
        { title: 'Key', dataIndex: 'prefix', render: (p: string) => <Text code>{p}…</Text> },
        { title: 'Last used', dataIndex: 'lastUsedAt', render: (d: string | null) => d ? new Date(d).toLocaleString() : <Text type="secondary">never</Text> },
        { title: 'Status', dataIndex: 'revoked', render: (r: boolean) => r ? <Tag color="red">Revoked</Tag> : <Tag color="green">Active</Tag> },
        { title: 'Created', dataIndex: 'createdAt', render: (d: string) => new Date(d).toLocaleDateString() },
        {
            title: '', render: (_: any, r: KeyRow) => !r.revoked && (
                <Popconfirm title="Revoke this key? Apps using it will stop working." onConfirm={() => revoke(r.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>Revoke</Button>
                </Popconfirm>
            )
        },
    ];

    const curlList = `curl -H "Authorization: Bearer YOUR_KEY" \\\n  "${baseUrl || 'https://your-domain'}/api/v1/orders?status=RECEIVED&limit=50"`;
    const curlDetail = `curl -H "Authorization: Bearer YOUR_KEY" \\\n  "${baseUrl || 'https://your-domain'}/api/v1/orders/4117727512"`;
    const createExample = `curl -X POST "${baseUrl || 'https://your-domain'}/api/v1/orders" \\
  -H "Authorization: Bearer YOUR_KEY" -H "Content-Type: application/json" \\
  -d '{
    "originalId": "MY-ORDER-1",
    "items": [{
      "sku": "EM-18000", "color": "Navy", "size": "M", "quantity": 1,
      "designs": [{ "url": "https://.../design.png", "position": "CENTER_CHEST", "mockup": "https://.../mockup.png", "type": "Embroidery" }]
    }],
    "shippingAddress": {
      "fullName": "Jane Doe", "phone": "555-1234",
      "address1": "123 Main St", "city": "Austin", "state": "TX", "zip": "78701", "country": "US"
    }
  }'`;

    return (
        <div className="p-2 md:p-4 max-w-5xl">
            <Title level={3}><ApiOutlined /> API Keys</Title>
            <Alert type="info" showIcon className="mb-4"
                message="Integrate emfulfill from your own system"
                description="Generate a key, then call the REST API below with it. Keep keys secret — anyone with a key can read your orders. Revoke a leaked key anytime." />

            <Card size="small" className="mb-6" title="Your keys"
                extra={<Space><Input placeholder="Key name (e.g. My Shop)" value={newName} onChange={e => setNewName(e.target.value)} size="small" style={{ width: 180 }} /><Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={createKey}>Generate key</Button></Space>}>
                <Table rowKey="id" size="small" loading={loading} columns={columns as any} dataSource={keys} pagination={false} />
            </Card>

            <Card size="small" title="API documentation">
                <Paragraph><Text strong>Base URL:</Text> <Text code>{baseUrl || 'https://your-domain'}</Text></Paragraph>
                <Paragraph><Text strong>Authentication:</Text> send your key in the header <Text code>Authorization: Bearer YOUR_KEY</Text>. All requests are scoped to your seller account only.</Paragraph>
                <Paragraph><Text strong>Rate limit:</Text> 120 requests per minute per key (HTTP 429 if exceeded).</Paragraph>

                <Title level={5} className="!mt-4">GET /api/v1/products</Title>
                <Paragraph type="secondary" className="!mb-1">Catalog of valid SKUs + variants (color / size / price) to use when creating orders.</Paragraph>
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-xs overflow-x-auto">{`curl -H "Authorization: Bearer YOUR_KEY" "${baseUrl || 'https://your-domain'}/api/v1/products"`}</pre>

                <Title level={5} className="!mt-4">GET /api/v1/orders</Title>
                <Paragraph type="secondary" className="!mb-1">List your orders. Query params: <Text code>status</Text>, <Text code>from</Text> (ISO date), <Text code>to</Text>, <Text code>limit</Text> (≤100), <Text code>offset</Text>.</Paragraph>
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-xs overflow-x-auto">{curlList}</pre>

                <Title level={5} className="!mt-4">GET /api/v1/orders/{'{orderCode}'}</Title>
                <Paragraph type="secondary" className="!mb-1">Full detail of one order incl. line items, designs, status and tracking.</Paragraph>
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-xs overflow-x-auto">{curlDetail}</pre>

                <Title level={5} className="!mt-4">GET /api/v1/orders/{'{orderCode}'}/status</Title>
                <Paragraph type="secondary" className="!mb-1">Lightweight status + tracking lookup.</Paragraph>
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-xs overflow-x-auto">{`curl -H "Authorization: Bearer YOUR_KEY" "${baseUrl || 'https://your-domain'}/api/v1/orders/4117727512/status"`}</pre>

                <Title level={5} className="!mt-4">POST /api/v1/orders</Title>
                <Paragraph type="secondary" className="!mb-1">Create an order. Prices are computed server-side from the SKU/variant + print positions; the order starts in <Text code>PENDING_APPROVAL</Text>.</Paragraph>
                <pre className="bg-zinc-100 dark:bg-zinc-800 p-3 rounded text-xs overflow-x-auto">{createExample}</pre>

                <Paragraph type="secondary" className="!mt-4 text-xs">Errors: 401 (missing/invalid key), 404 (not found), 422 (validation — see <Text code>details</Text>), 429 (rate limit).</Paragraph>
            </Card>

            <Modal open={!!createdKey} onCancel={() => setCreatedKey(null)} onOk={() => setCreatedKey(null)} okText="Done, I've copied it" title="Your new API key">
                <Alert type="warning" showIcon className="mb-3" message="Copy it now — you won't be able to see it again." />
                <div className="flex gap-2 items-center">
                    <Input readOnly value={createdKey || ''} />
                    <Button icon={<CopyOutlined />} onClick={() => copy(createdKey || '')}>Copy</Button>
                </div>
            </Modal>
        </div>
    );
}
