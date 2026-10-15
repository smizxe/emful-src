'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { POSITION_SELECT_OPTIONS } from '@/lib/positions';

const MAX_DESIGNS = 4;

interface EditOrderModalProps {
    visible: boolean;
    onCancel: () => void;
    order: any;
    onSuccess: () => void;
}

export default function EditOrderModal({ visible, onCancel, order, onSuccess }: EditOrderModalProps) {
    const { t } = useLanguage();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const router = useRouter();

    useEffect(() => {
        if (visible && order) {
            // Pre-fill form
            // Assume first job has recipient info
            const firstJob = order.jobs && order.jobs.length > 0 ? order.jobs[0] : {};

            form.setFieldsValue({
                recipientName: firstJob.recipientName || '',
                address1: firstJob.address1 || '',
                address2: firstJob.address2 || '',
                city: firstJob.city || '',
                state: firstJob.state || '',
                zip: firstJob.zip || '',
                country: firstJob.country || order.shippingCountry || '',
                phone: firstJob.phone || ''
            });

            // Pre-fill items
            setItems(order.jobs.map((j: any) => {
                let parsedDesigns: Array<{ url: string; position: string; mockup?: string; type?: string }> = [];
                try {
                    const designs = JSON.parse(j.designs || '[]');
                    if (Array.isArray(designs)) {
                        parsedDesigns = designs.slice(0, MAX_DESIGNS).map((design: any) => ({
                            url: design?.url || '',
                            position: design?.location || design?.position || '',
                            mockup: design?.mockup || '',
                            type: design?.type || 'Embroidery'
                        }));
                    }
                } catch (e) {
                    // ignore parse error
                }

                while (parsedDesigns.length < MAX_DESIGNS) {
                    parsedDesigns.push({
                        url: '',
                        position: '',
                        mockup: '',
                        type: 'Embroidery'
                    });
                }

                return {
                    id: j.id,
                    sku: j.sku,
                    color: j.color,
                    size: j.size,
                    qty: j.qty,
                    notes: j.notes || '',
                    designs: parsedDesigns,
                    key: j.id // Antd table key
                };
            }));
        }
    }, [visible, order, form]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();

            // Validate items
            if (items.length === 0) {
                message.error(t.orderModals.validationItem);
                return;
            }
            for (const item of items) {
                if (!item.sku || !item.qty) {
                    message.error(t.orderModals.validationSku);
                    return;
                }
            }

            setLoading(true);

            const payload = {
                orderId: order.id,
                ...values,
                items
            };

            const res = await fetch('/api/orders/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                if (data.stillDesignRequest && Array.isArray(data.blockers) && data.blockers.length > 0) {
                    // Saved, but the order cannot be approved yet. Say exactly what is
                    // missing rather than letting it look like nothing happened.
                    Modal.warning({
                        title: 'Saved, but still a Design Request',
                        width: 560,
                        content: (
                            <div>
                                <p className="mb-2">This order stays a Design Request until every line resolves:</p>
                                <ul className="list-disc pl-5 space-y-1 text-sm">
                                    {data.blockers.map((b: any, i: number) => (
                                        <li key={i}><b>Item {b.line}</b> - {b.reason}</li>
                                    ))}
                                </ul>
                            </div>
                        ),
                    });
                } else if (data.promoted) {
                    message.success('Saved. The order is complete and moved to Pending Approval.');
                } else {
                    message.success(t.orderModals.successUpdate);
                }
                onSuccess();
                router.refresh(); // Refresh page data
            } else {
                message.error(data.error || t.orderModals.failedUpdate);
            }

        } catch (error) {
            console.error(error);
            message.error(t.orderModals.failedSave);
        } finally {
            setLoading(false);
        }
    };

    const handleItemChange = (key: string, field: string, value: any) => {
        const newItems = [...items];
        const index = newItems.findIndex(i => i.key === key);
        if (index > -1) {
            newItems[index][field] = value;
            setItems(newItems);
        }
    };

    const handleDesignChange = (itemKey: string, designIndex: number, field: string, value: string) => {
        const newItems = [...items];
        const itemIndex = newItems.findIndex(i => i.key === itemKey);
        if (itemIndex > -1) {
            const nextDesigns = [...(newItems[itemIndex].designs || [])];
            nextDesigns[designIndex] = {
                ...(nextDesigns[designIndex] || { url: '', position: '', mockup: '', type: 'Embroidery' }),
                [field]: value
            };
            newItems[itemIndex].designs = nextDesigns;
            setItems(newItems);
        }
    };

    return (
        <Modal
            title={t.orderModals.editOrder}
            open={visible}
            onCancel={onCancel}
            onOk={handleSave}
            confirmLoading={loading}
            width={760}
            okText={t.orderModals.saveChanges}
            styles={{ body: { paddingTop: 12, overflowX: 'hidden' } }}
        >
            <Form form={form} layout="vertical" className="mt-2">
                <div className="mb-2 text-center text-sm font-semibold text-zinc-700">
                    {t.orderModals.recipientDetails}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                    <Form.Item name="recipientName" label={t.orderModals.name} rules={[{ required: true }]} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                    <Form.Item name="phone" label={t.orderModals.phone} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                    <Form.Item name="address1" label={t.orderModals.address1} rules={[{ required: true }]} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                    <Form.Item name="address2" label={t.orderModals.address2} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                    <Form.Item name="city" label={t.orderModals.city} rules={[{ required: true }]} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-2">
                        <Form.Item name="state" label={t.orderModals.state} rules={[{ required: true }]} className="!mb-1.5">
                            <Input />
                        </Form.Item>
                        <Form.Item name="zip" label={t.orderModals.zip} rules={[{ required: true }]} className="!mb-1.5">
                            <Input />
                        </Form.Item>
                    </div>
                    <Form.Item name="country" label={t.orderModals.country} rules={[{ required: true }]} className="!mb-1.5">
                        <Input />
                    </Form.Item>
                </div>

                <div className="mb-2 mt-3 text-center text-sm font-semibold text-zinc-700">
                    {t.orderModals.orderItems}
                </div>
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item.key} className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 px-3 py-2">
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
                                <div className="min-w-0">
                                    <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.sku}</div>
                                    <Input
                                        value={item.sku}
                                        onChange={e => handleItemChange(item.key, 'sku', e.target.value)}
                                        placeholder="SKU"
                                    />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.color}</div>
                                    <Input
                                        value={item.color}
                                        onChange={e => handleItemChange(item.key, 'color', e.target.value)}
                                        placeholder={t.orderModals.color}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.size}</div>
                                    <Input
                                        value={item.size}
                                        onChange={e => handleItemChange(item.key, 'size', e.target.value)}
                                        placeholder={t.orderModals.size}
                                    />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.qty}</div>
                                    <InputNumber
                                        min={1}
                                        value={item.qty}
                                        onChange={val => handleItemChange(item.key, 'qty', val)}
                                        className="w-full"
                                    />
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-1 gap-2">
                                {(item.designs || []).slice(0, MAX_DESIGNS).map((design: any, designIndex: number) => (
                                    <div key={`${item.key}-design-${designIndex}`} className="rounded-md border border-zinc-200 p-2">
                                        <div className="mb-2 text-[11px] font-semibold text-zinc-500">
                                            Position {designIndex + 1}
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                            <div className="min-w-0">
                                                <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.position}</div>
                                                <Select
                                                    value={design.position || undefined}
                                                    onChange={val => handleDesignChange(item.key, designIndex, 'position', val)}
                                                    placeholder={t.orderModals.frontBack}
                                                    options={POSITION_SELECT_OPTIONS}
                                                    showSearch
                                                    className="w-full"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="mb-1 text-[11px] font-medium text-zinc-500">{t.orderModals.designLink}</div>
                                                <Input.TextArea
                                                    value={design.url}
                                                    onChange={e => handleDesignChange(item.key, designIndex, 'url', e.target.value)}
                                                    placeholder="URL"
                                                    autoSize={{ minRows: 1, maxRows: 3 }}
                                                    className="[overflow-wrap:anywhere] [word-break:break-word]"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                {/* The designer works from this, so the seller needs somewhere
                                                    to put it when the import did not carry one. */}
                                                <div className="mb-1 text-[11px] font-medium text-zinc-500">Mockup link</div>
                                                <Input.TextArea
                                                    value={design.mockup || ''}
                                                    onChange={e => handleDesignChange(item.key, designIndex, 'mockup', e.target.value)}
                                                    placeholder="Mockup URL for the designer"
                                                    autoSize={{ minRows: 1, maxRows: 3 }}
                                                    className="[overflow-wrap:anywhere] [word-break:break-word]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-2 min-w-0">
                                <div className="mb-1 text-[11px] font-medium text-zinc-500">Edit Note</div>
                                <Input.TextArea
                                    value={item.notes}
                                    onChange={e => handleItemChange(item.key, 'notes', e.target.value)}
                                    placeholder="Order note"
                                    rows={3}
                                    autoSize={{ minRows: 3, maxRows: 6 }}
                                    className="[overflow-wrap:anywhere] [word-break:break-word]"
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="text-gray-500 text-xs mt-2">
                    {t.orderModals.inventoryWarning}
                </div>
            </Form>
        </Modal>
    );
}
