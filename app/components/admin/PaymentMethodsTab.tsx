'use client';

import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Upload, Space, notification, Image, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import ImgCrop from 'antd-img-crop';
import { useLanguage } from '@/components/Providers/LanguageContext';
import RichTextEditor from '@/components/Shared/RichTextEditor';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

interface PaymentMethod {
    id: string;
    name: string;
    currency: string;
    qrImageUrl?: string;
    accountInfo?: string;
    note?: string;
    isActive: boolean;
    sortOrder: number;
    createdAt: string;
}

const PaymentMethodsTab: React.FC = () => {
    const { t } = useLanguage();
    const [notificationApi, contextHolder] = notification.useNotification();
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
    const [form] = Form.useForm();
    const [uploading, setUploading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [noteContent, setNoteContent] = useState<string>('');

    const fetchPaymentMethods = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/payment-methods');
            if (res.ok) {
                const data = await res.json();
                setPaymentMethods(data);
            }
        } catch (error) {
            console.error('Error fetching payment methods:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaymentMethods();
    }, []);

    const handleOpenModal = (method?: PaymentMethod) => {
        if (method) {
            setEditingMethod(method);
            setNoteContent(method.note || '');
            if (method.qrImageUrl) {
                setFileList([
                    {
                        uid: '-1',
                        name: 'QR Code',
                        status: 'done',
                        url: method.qrImageUrl,
                    },
                ]);
            } else {
                setFileList([]);
            }
        } else {
            setEditingMethod(null);
            setNoteContent('');
            setFileList([]);
        }
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        setEditingMethod(null);
        setNoteContent('');
        setFileList([]);
    };

    useEffect(() => {
        if (modalOpen) {
            // Use setTimeout to ensure the Form inside Modal is mounted and connected
            const timer = setTimeout(() => {
                if (editingMethod) {
                    form.setFieldsValue({
                        name: editingMethod.name,
                        currency: editingMethod.currency,
                        accountInfo: editingMethod.accountInfo,
                        sortOrder: editingMethod.sortOrder,
                        isActive: editingMethod.isActive,
                    });
                } else {
                    form.resetFields();
                    form.setFieldsValue({
                        currency: 'VND',
                        sortOrder: 0,
                        isActive: true,
                    });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [modalOpen, editingMethod, form]);

    const handleUploadChange: UploadProps['onChange'] = ({ fileList: newFileList }) => {
        setFileList(newFileList);
    };

    const handleCustomUpload = async (options: any) => {
        const { file, onSuccess, onError } = options;
        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', await shrinkImageForUpload(file));

            const res = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                onSuccess(data, file);
                setFileList([
                    {
                        uid: file.uid,
                        name: file.name,
                        status: 'done',
                        url: data.url,
                    },
                ]);
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            onError(error);
            notificationApi.error({ message: 'Failed to upload image' });
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            // Get uploaded image URL
            let qrImageUrl = editingMethod?.qrImageUrl;
            if (fileList.length > 0 && fileList[0].url) {
                qrImageUrl = fileList[0].url;
            } else if (fileList.length === 0) {
                qrImageUrl = undefined;
            }

            const payload = {
                ...values,
                note: noteContent,
                qrImageUrl,
                ...(editingMethod && { id: editingMethod.id }),
            };

            const method = editingMethod ? 'PUT' : 'POST';
            const res = await fetch('/api/admin/payment-methods', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                notificationApi.success({
                    message: editingMethod ? 'Payment method updated' : 'Payment method created',
                });
                handleCloseModal();
                fetchPaymentMethods();
            } else {
                const error = await res.json();
                notificationApi.error({ message: error.error || 'Operation failed' });
            }
        } catch (error) {
            console.error('Submit error:', error);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/payment-methods?id=${id}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                notificationApi.success({ message: 'Payment method deleted' });
                fetchPaymentMethods();
            } else {
                notificationApi.error({ message: 'Failed to delete' });
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const handleToggleActive = async (record: PaymentMethod) => {
        try {
            const res = await fetch('/api/admin/payment-methods', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: record.id,
                    isActive: !record.isActive,
                }),
            });

            if (res.ok) {
                notificationApi.success({
                    message: record.isActive ? 'Payment method deactivated' : 'Payment method activated',
                });
                fetchPaymentMethods();
            }
        } catch (error) {
            console.error('Toggle error:', error);
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
        },

        {
            title: 'Currency',
            dataIndex: 'currency',
            key: 'currency',
            render: (currency: string) => (
                <span className={currency === 'VND' ? 'text-blue-600' : 'text-green-600'}>
                    {currency}
                </span>
            ),
        },
        {
            title: 'QR Code',
            dataIndex: 'qrImageUrl',
            key: 'qrImageUrl',
            render: (url: string) =>
                url ? (
                    <Image src={url} alt="QR" width={50} height={50} style={{ objectFit: 'cover' }} />
                ) : (
                    <span className="text-gray-400">No QR</span>
                ),
        },
        {
            title: 'Active',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean, record: PaymentMethod) => (
                <Switch
                    checked={isActive}
                    onChange={() => handleToggleActive(record)}
                    size="small"
                />
            ),
        },
        {
            title: 'Order',
            dataIndex: 'sortOrder',
            key: 'sortOrder',
        },
        {
            title: t.common.action,
            key: 'action',
            render: (_: any, record: PaymentMethod) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => handleOpenModal(record)}
                    />
                    <Popconfirm
                        title="Delete this payment method?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Button icon={<DeleteOutlined />} size="small" danger />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            {contextHolder}

            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Payment Methods</h3>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => handleOpenModal()}
                >
                    Add Payment Method
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={paymentMethods}
                rowKey="id"
                loading={loading}
                pagination={false}
            />

            <Modal
                title={editingMethod ? 'Edit Payment Method' : 'Add Payment Method'}
                open={modalOpen}
                onCancel={handleCloseModal}
                onOk={handleSubmit}
                okText={t.common.save}
                cancelText={t.common.cancel}
                width={600}
            >
                <Form form={form} layout="vertical" className="mt-4">
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Please enter a name' }]}
                    >
                        <Input placeholder="e.g. VN Bank Transfer, PayPal" />
                    </Form.Item>

                    <Form.Item name="currency" label="Currency">
                        <Select>
                            <Select.Option value="VND">VND (with conversion)</Select.Option>
                            <Select.Option value="USD">USD (direct)</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="accountInfo" label="Account Info">
                        <Input.TextArea
                            rows={2}
                            placeholder="Bank account number, PayPal email, etc."
                        />
                    </Form.Item>

                    <Form.Item label="Note for Sellers">
                        <RichTextEditor
                            value={noteContent}
                            onChange={setNoteContent}
                            placeholder="Instructions or notes visible to sellers..."
                        />
                    </Form.Item>

                    <Form.Item label="QR Code Image">
                        <ImgCrop rotationSlider showReset aspect={1} showGrid>
                            <Upload
                                listType="picture-card"
                                fileList={fileList}
                                onChange={handleUploadChange}
                                customRequest={handleCustomUpload}
                                maxCount={1}
                                accept="image/*"
                            >
                                {fileList.length === 0 && (
                                    <div>
                                        <UploadOutlined />
                                        <div style={{ marginTop: 8 }}>Upload</div>
                                    </div>
                                )}
                            </Upload>
                        </ImgCrop>
                    </Form.Item>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="sortOrder" label="Sort Order">
                            <Input type="number" placeholder="0" />
                        </Form.Item>

                        <Form.Item name="isActive" label="Active" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </div>
                </Form>
            </Modal>
        </div>
    );
};

export default PaymentMethodsTab;
