'use client';
import React, { useState, useEffect } from 'react';
import { Modal, Typography, Form, InputNumber, Input, Button, notification, Divider, Upload, Tabs, Empty, Spin, Image } from 'antd';
import { UploadOutlined, BankOutlined, DollarOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { RichTextContent } from '@/components/Shared/RichTextEditor';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

const { Text, Title, Paragraph } = Typography;
const MIN_TOPUP_USD = 100;

interface PaymentMethod {
    id: string;
    name: string;
    currency: string;
    qrImageUrl?: string;
    accountInfo?: string;
    note?: string;
}

interface TopUpModalProps {
    visible: boolean;
    onClose: () => void;
    userId: string;
    email?: string;
    onSuccess?: () => void;
}

export default function TopUpModal({ visible, onClose, userId, email, onSuccess }: TopUpModalProps) {
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [form] = Form.useForm();
    const [rate, setRate] = useState<number>(25000);
    const [api, contextHolder] = notification.useNotification();
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

    const getEstimatedUsd = (amount?: number) => {
        if (!amount || !selectedMethod) return 0;
        return selectedMethod.currency === 'VND' ? amount / rate : amount;
    };

    // Fetch settings and payment methods
    useEffect(() => {
        if (visible) {
            // Fetch exchange rate
            fetch('/api/settings').then(r => r.json()).then(d => {
                if (d.rate) setRate(d.rate);
            });

            // Fetch payment methods
            setLoadingMethods(true);
            fetch('/api/payment-methods')
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setPaymentMethods(data);
                        // Select first method by default
                        if (data.length > 0) {
                            setSelectedMethod(data[0]);
                        }
                    }
                })
                .catch(err => console.error('Error fetching payment methods:', err))
                .finally(() => setLoadingMethods(false));
        }
    }, [visible]);

    // Display email only as requested  
    const transferNote = email || 'your-email';

    // Sync form value when transferNote changes (e.g. email loads)
    useEffect(() => {
        if (visible) {
            setFileList([]);
        }
        // Only set form fields if form is actually rendered (methods loaded and exist)
        if (visible && !loadingMethods && paymentMethods.length > 0) {
            form.setFieldsValue({ note: transferNote });
        }
    }, [transferNote, visible, form, loadingMethods, paymentMethods.length]);

    const handleSubmit = async (values: any) => {
        if (!selectedMethod) {
            api.error({ title: 'Please select a payment method' });
            return;
        }

        const estimatedUsd = getEstimatedUsd(values.amount);
        if (estimatedUsd < MIN_TOPUP_USD) {
            api.error({
                title: 'Top-up amount is too low',
                description: `Minimum top-up is $${MIN_TOPUP_USD}. Current amount is $${estimatedUsd.toFixed(2)}.`
            });
            return;
        }

        setLoading(true);
        try {
            let evidenceUrl = '';

            // Upload Proof if exists
            if (fileList.length > 0) {
                const formData = new FormData();
                formData.append('file', await shrinkImageForUpload(fileList[0].originFileObj as File));
                formData.append('folder', 'topups/evidence');

                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                if (!uploadRes.ok) {
                    const uploadData = await uploadRes.json().catch(() => ({}));
                    throw new Error(uploadData.error || 'Failed to upload evidence');
                }

                const data = await uploadRes.json();
                evidenceUrl = data.url;
            }

            // Calculate USD amount based on currency
            let amountToSend = values.amount;
            let currency = selectedMethod.currency;

            const res = await fetch('/api/wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amountToSend,
                    currency: currency,
                    transferContent: values.note || transferNote,
                    evidenceUrl,
                    paymentMethodId: selectedMethod.id
                })
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to submit request');
            }

            api.success({ title: 'Top-up request submitted successfully' });
            form.resetFields();
            setFileList([]);
            onClose();
            if (onSuccess) onSuccess();

        } catch (error: any) {
            api.error({
                title: 'Failed to submit request',
                description: error.message || 'Failed to submit request'
            });
        } finally {
            setLoading(false);
        }
    };

    const renderPaymentMethodContent = () => {
        if (!selectedMethod) {
            return <Empty description="No payment methods available" />;
        }

        const isVND = selectedMethod.currency === 'VND';

        return (
            <div>
                {/* QR Code and Account Info */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    {selectedMethod.qrImageUrl ? (
                        <div style={{
                            margin: '10px auto',
                            padding: '10px',
                            backgroundColor: '#f5f5f5',
                            borderRadius: '8px',
                            width: 'fit-content'
                        }}>
                            <Image
                                src={selectedMethod.qrImageUrl}
                                alt="QR Code"
                                width={180}
                                style={{ borderRadius: '8px' }}
                            />
                        </div>
                    ) : (
                        <div className="p-4 bg-gray-100 rounded-lg text-gray-500">
                            No QR code available
                        </div>
                    )}
                </div>

                {/* Account Info */}
                {selectedMethod.accountInfo && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mb-4">
                        <Text strong>Account Info:</Text>
                        <Paragraph className="mb-0 mt-1" style={{ whiteSpace: 'pre-wrap' }}>
                            {selectedMethod.accountInfo}
                        </Paragraph>
                    </div>
                )}

                {/* Admin Note */}
                {selectedMethod.note && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg mb-4">
                        <Text strong>Note:</Text>
                        <div className="mt-1 prose prose-sm max-w-none">
                            <RichTextContent html={selectedMethod.note} />
                        </div>
                    </div>
                )}

                {/* Transfer Note */}
                <div className="mb-4 text-center">
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                        Transfer Content: <Text code>{transferNote}</Text>
                    </Text>
                </div>

                <Divider>Submit Your Request</Divider>

                {/* Form */}
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    {isVND ? (
                        <>
                            <Form.Item
                                name="amount"
                                label={`Amount Transferred (VND) - Rate: ${rate.toLocaleString('en-US')} VND/$`}
                                rules={[{ required: true, message: 'Please enter amount' }]}
                            >
                                <InputNumber
                                    style={{ width: '100%' }}
                                    min={1000}
                                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                    parser={value => value?.replace(/\$\s?|(,*)/g, '') as any}
                                    suffix="VND"
                                    placeholder="e.g. 2,500,000"
                                />
                            </Form.Item>

                            <Form.Item shouldUpdate={(prev, curr) => prev.amount !== curr.amount}>
                                {({ getFieldValue }) => {
                                    const amount = getFieldValue('amount') || 0;
                                    const estimatedUsd = getEstimatedUsd(amount);
                                    const meetsMinimum = estimatedUsd >= MIN_TOPUP_USD;
                                    return (
                                        <div className="space-y-1">
                                            <div className="text-right font-medium text-emerald-600">
                                                Estimated: ${estimatedUsd.toFixed(2)} USD
                                            </div>
                                            {!meetsMinimum && amount > 0 && (
                                                <div className="text-right text-xs text-red-500">
                                                    Minimum top-up is ${MIN_TOPUP_USD}
                                                </div>
                                            )}
                                        </div>
                                    );
                                }}
                            </Form.Item>
                        </>
                    ) : (
                        <Form.Item
                            name="amount"
                            label="Amount Transferred (USD)"
                            rules={[{ required: true, message: 'Please enter amount' }]}
                        >
                            <InputNumber
                                style={{ width: '100%' }}
                                min={MIN_TOPUP_USD}
                                precision={2}
                                suffix="USD"
                                placeholder={`e.g. ${MIN_TOPUP_USD}.00`}
                            />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="note"
                        label="Transfer Content / Transaction Ref"
                        initialValue={transferNote}
                    >
                        <Input placeholder="Enter transaction code or content used" />
                    </Form.Item>

                    <Form.Item label="Proof of Transfer (Optional)">
                        <Upload
                            listType="picture"
                            maxCount={1}
                            fileList={fileList}
                            onChange={({ fileList }) => setFileList(fileList)}
                            beforeUpload={() => false}
                        >
                            <Button icon={<UploadOutlined />}>Upload Evidence</Button>
                        </Upload>
                    </Form.Item>

                    <Form.Item>
                        <Button type="primary" htmlType="submit" loading={loading} block size="large">
                            Submit Request
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        );
    };

    return (
        <Modal
            title="Top Up Balance"
            open={visible}
            onCancel={onClose}
            footer={null}
            centered
            width={650}
        >
            {contextHolder}
            <div style={{ padding: '0 10px' }}>
                {loadingMethods ? (
                    <div className="flex justify-center py-10">
                        <Spin size="large" />
                    </div>
                ) : paymentMethods.length === 0 ? (
                    <Empty description="No payment methods configured. Please contact admin." />
                ) : paymentMethods.length === 1 ? (
                    null
                ) : (
                    <Tabs
                        items={paymentMethods.map(method => ({
                            key: method.id,
                            label: (
                                <span>
                                    {method.currency === 'VND' ? <BankOutlined className="mr-1" /> : <DollarOutlined className="mr-1" />}
                                    {method.name}
                                    <span className="ml-1 text-xs text-gray-400">({method.currency})</span>
                                </span>
                            ),
                        }))}
                        onChange={(key) => {
                            const method = paymentMethods.find(m => m.id === key);
                            if (method) {
                                setSelectedMethod(method);
                                form.resetFields(['amount']);
                            }
                        }}
                        activeKey={selectedMethod?.id}
                    />
                )}

                {!loadingMethods && paymentMethods.length > 0 && renderPaymentMethodContent()}
            </div>
        </Modal>
    );
}
