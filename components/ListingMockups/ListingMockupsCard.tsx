'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Upload, Button, Input, Select, Space, Tag, Popconfirm, Empty, Image, Typography } from 'antd';
import { UploadOutlined, DeleteOutlined, FileExcelOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;

interface FileSummary {
    fileName: string;
    rowCount: number;
    skuCount: number;
    uploadedBy: string;
    updatedAt: string;
}

interface Match {
    sku: string;
    imageUrl: string;
    images: string[];
}

/**
 * The seller's Etsy listings file, kept as a file rather than a list: there are
 * far too many listings to show. Uploading a new one replaces the old one. Only
 * SKU and IMAGE1 are read from it, and the photo becomes the mockup link when an
 * imported order leaves its mockup blank.
 *
 * `pickSeller` is for admin and staff, who manage any seller's file.
 */
export default function ListingMockupsCard({ pickSeller = false }: { pickSeller?: boolean }) {
    const { message } = App.useApp();
    const [sellers, setSellers] = useState<Array<{ sellerId: string; sellerName: string }>>([]);
    const [sellerId, setSellerId] = useState<string>('');
    const [file, setFile] = useState<FileSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [search, setSearch] = useState('');
    const [matches, setMatches] = useState<Match[] | null>(null);

    useEffect(() => {
        if (!pickSeller) return;
        fetch('/api/admin/designer-assignments')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => { if (data) setSellers(data.rows || []); })
            .catch(() => { /* the picker just stays empty */ });
    }, [pickSeller]);

    const query = useCallback((extra = '') => {
        const params = new URLSearchParams();
        if (pickSeller && sellerId) params.set('sellerId', sellerId);
        return `/api/listing-mockups?${params.toString()}${extra}`;
    }, [pickSeller, sellerId]);

    const load = useCallback(async () => {
        if (pickSeller && !sellerId) { setFile(null); return; }
        setLoading(true);
        try {
            const res = await fetch(query(), { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not load the listings file');
            setFile(data.file || null);
        } catch (error: any) {
            message.error(error.message || 'Could not load the listings file');
        } finally {
            setLoading(false);
        }
    }, [pickSeller, sellerId, query, message]);

    useEffect(() => { load(); setMatches(null); }, [load]);

    const upload = async (picked: File) => {
        if (pickSeller && !sellerId) {
            message.warning('Choose a seller first');
            return false;
        }
        setUploading(true);
        try {
            const body = new FormData();
            body.append('file', picked);
            if (pickSeller) body.append('sellerId', sellerId);
            const res = await fetch('/api/listing-mockups', { method: 'POST', body });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            setFile(data.file);
            setMatches(null);
            message.success(`Loaded ${data.file.skuCount} SKUs with a listing photo. The previous file was replaced.`);
        } catch (error: any) {
            message.error(error.message || 'Upload failed');
        } finally {
            setUploading(false);
        }
        return false;
    };

    const remove = async () => {
        try {
            const res = await fetch(query(), { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');
            setFile(null);
            setMatches(null);
            message.success('Listings file removed');
        } catch (error: any) {
            message.error(error.message || 'Delete failed');
        }
    };

    const lookUp = async (value: string) => {
        setSearch(value);
        if (!value.trim()) { setMatches(null); return; }
        try {
            const res = await fetch(query(`&search=${encodeURIComponent(value.trim())}`), { cache: 'no-store' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Search failed');
            setMatches(data.matches || []);
        } catch (error: any) {
            message.error(error.message || 'Search failed');
        }
    };

    const ready = !pickSeller || !!sellerId;

    return (
        <Card
            className="mt-6"
            loading={loading && !file}
            title={<Space><FileExcelOutlined /><span>Etsy Listings - Mockup Links</span></Space>}
            extra={pickSeller ? (
                <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Choose a seller"
                    style={{ width: 220 }}
                    value={sellerId || undefined}
                    onChange={setSellerId}
                    options={sellers.map((s) => ({ label: s.sellerName, value: s.sellerId }))}
                />
            ) : null}
        >
            <p className="text-sm text-zinc-500 mb-4">
                Upload the listings export from Etsy. Only the <b>SKU</b> and <b>IMAGE1</b> columns are used:
                when an imported order leaves its mockup blank, the listing photo for that seller SKU fills it in.
                Uploading a new file replaces the old one.
            </p>

            {!ready ? (
                <Empty description="Choose a seller to see their listings file" />
            ) : (
                <>
                    {file ? (
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="font-medium truncate"><FileExcelOutlined className="mr-1" />{file.fileName}</div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    <Tag color="green" className="mr-1">{file.skuCount} SKUs</Tag>
                                    from {file.rowCount} listings · updated {dayjs(file.updatedAt).format('DD MMM YYYY HH:mm')}
                                    {file.uploadedBy ? ` by ${file.uploadedBy}` : ''}
                                </div>
                            </div>
                            <Space>
                                <Upload accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={(f) => upload(f as File)}>
                                    <Button icon={<UploadOutlined />} loading={uploading}>Replace file</Button>
                                </Upload>
                                <Popconfirm
                                    title="Remove this listings file?"
                                    description="Orders already imported keep their mockups."
                                    okText="Remove"
                                    okButtonProps={{ danger: true }}
                                    onConfirm={remove}
                                >
                                    <Button danger icon={<DeleteOutlined />}>Remove</Button>
                                </Popconfirm>
                            </Space>
                        </div>
                    ) : (
                        <div className="mb-4">
                            <Upload accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={(f) => upload(f as File)}>
                                <Button type="primary" icon={<UploadOutlined />} loading={uploading}>Upload listings file</Button>
                            </Upload>
                        </div>
                    )}

                    {file ? (
                        <>
                            <Input.Search
                                allowClear
                                placeholder="Check a seller SKU, e.g. EM-NURSE"
                                prefix={<SearchOutlined />}
                                onSearch={lookUp}
                                style={{ maxWidth: 360 }}
                            />
                            {matches !== null ? (
                                matches.length === 0 ? (
                                    <div className="text-sm text-zinc-400 mt-3">No SKU matching &quot;{search}&quot; in this file.</div>
                                ) : (
                                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {matches.map((m) => (
                                            <div key={m.sku} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                                                <Image src={m.imageUrl} alt={m.sku} height={110} width="100%" className="object-cover" />
                                                <div className="p-2">
                                                    <Text className="text-xs font-semibold" ellipsis={{ tooltip: m.sku }}>{m.sku}</Text>
                                                    {m.images.length > 1 ? (
                                                        <div className="text-[10px] text-zinc-400">{m.images.length} listing photos, first is used</div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ) : null}
                        </>
                    ) : null}
                </>
            )}
        </Card>
    );
}
