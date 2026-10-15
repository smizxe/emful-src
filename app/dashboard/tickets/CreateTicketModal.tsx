'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Form, Input, Upload, Button, message, Select, Spin, Tag } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

interface CreateTicketModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

interface OrderOption {
    id: string;
    orderCode: string;
    status: string;
    shippingStatus: string;
}

// Canonical subject strings the admin side string-matches on to route the ticket.
// "Reproduce" is treated as a replacement request by the admin (see TicketManagement).
const ORDER_SUBJECTS = ['Reproduce', 'Refund'] as const;

export default function CreateTicketModal({ visible, onCancel, onSuccess }: CreateTicketModalProps) {
    const { t } = useLanguage();
    const tp: any = t.ticketsPage;
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [attachments, setAttachments] = useState<string[]>([]);

    // Order typeahead state
    const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
    const [searching, setSearching] = useState(false);
    const searchSeq = useRef(0);

    const resetAll = useCallback(() => {
        form.resetFields();
        setAttachments([]);
        setOrderOptions([]);
    }, [form]);

    useEffect(() => {
        if (!visible) resetAll();
    }, [visible, resetAll]);

    // Debounced seller-scoped order search for the order-ID picker.
    const searchOrders = useCallback((raw: string) => {
        const q = raw.trim();
        const seq = ++searchSeq.current;

        if (!q) {
            setOrderOptions([]);
            setSearching(false);
            return;
        }

        setSearching(true);
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(`/api/orders/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                // Ignore out-of-order responses so the latest keystroke wins.
                if (seq !== searchSeq.current) return;
                setOrderOptions(res.ok && Array.isArray(data.orders) ? data.orders : []);
            } catch {
                if (seq === searchSeq.current) setOrderOptions([]);
            } finally {
                if (seq === searchSeq.current) setSearching(false);
            }
        }, 300);

        return () => clearTimeout(handle);
    }, []);

    const handleUpload = async (options: any) => {
        const { file, onSuccess: uploadSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', await shrinkImageForUpload(file));

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                setAttachments(prev => [...prev, data.url]);
                uploadSuccess('Ok');
            } else {
                onError('Upload failed');
            }
        } catch (err) {
            onError('Upload error');
        }
    };

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const res = await fetch('/api/tickets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: values.subject,
                    description: values.description,
                    attachments,
                    orderId: values.orderId,
                }),
            });

            if (res.ok) {
                message.success(tp.createSuccess || 'Ticket created successfully');
                resetAll();
                onSuccess();
            } else {
                const data = await res.json();
                message.error(data.error || 'Failed to create ticket');
            }
        } catch (error) {
            message.error('Error creating ticket');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={tp.createTitle}
            open={visible}
            onCancel={onCancel}
            footer={null}
            destroyOnClose
        >
            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Form.Item
                    name="orderId"
                    label={tp.orderId || 'Order ID'}
                    rules={[{ required: true, message: tp.orderIdRequired || 'Please select an order' }]}
                >
                    <Select
                        showSearch
                        placeholder={tp.orderIdPlaceholder || 'Type an order ID to search...'}
                        filterOption={false}
                        onSearch={searchOrders}
                        notFoundContent={searching ? <Spin size="small" /> : (tp.orderIdEmpty || 'No matching orders')}
                        options={orderOptions.map((o) => ({
                            value: o.id,
                            label: (
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium">{o.orderCode}</span>
                                    <Tag color="blue" className="!m-0">{o.shippingStatus}</Tag>
                                </div>
                            ),
                        }))}
                    />
                </Form.Item>

                <Form.Item
                    name="subject"
                    label={tp.issueType || 'Issue Type'}
                    rules={[{ required: true, message: tp.issueTypeRequired || 'Please select an issue type' }]}
                >
                    <Select placeholder={tp.issueTypePlaceholder || 'Select issue type'}>
                        {ORDER_SUBJECTS.map((s) => (
                            <Select.Option key={s} value={s}>
                                {tp[`subject${s}`] || s}
                            </Select.Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    name="description"
                    label={tp.description}
                    rules={[{ required: true, message: 'Please describe your issue' }]}
                >
                    <Input.TextArea rows={4} placeholder="Detailed explanation..." />
                </Form.Item>

                <Form.Item label={tp.attachmentsOptional || 'Attachments (Optional)'}>
                    <Upload
                        customRequest={handleUpload}
                        multiple
                        listType="picture"
                        onRemove={() => true}
                    >
                        <Button icon={<UploadOutlined />}>{tp.uploadImages || 'Upload Images'}</Button>
                    </Upload>
                </Form.Item>

                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>{tp.cancel}</Button>
                    <Button type="primary" htmlType="submit" loading={loading} className="bg-blue-600">
                        {tp.submit}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
}
