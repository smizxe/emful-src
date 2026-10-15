'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, Upload, Button, message, Select } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

interface ReportTicketModalProps {
    visible: boolean;
    onCancel: () => void;
    orderId: string;
    onSuccess: () => void; // To close both modals or just this one
}

export default function ReportTicketModal({ visible, onCancel, orderId, onSuccess }: ReportTicketModalProps) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (fileList.length === 0) {
                message.error('Please upload evidence image');
                return;
            }

            setLoading(true);

            // 1. Upload Image
            const formData = new FormData();
            formData.append('file', await shrinkImageForUpload(fileList[0].originFileObj as File));

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!uploadRes.ok) throw new Error('Failed to upload image');
            const { url } = await uploadRes.json();

            // 2. Create Ticket
            // Combine Reason + Description for the message
            const initialMessage = `[Reason: ${values.reason}]\n\n${values.description || ''}`;

            const ticketRes = await fetch('/api/tickets/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId,
                    subject: values.subject, // Now a Select value
                    description: initialMessage,
                    attachments: [url] // Send as array
                })
            });

            if (!ticketRes.ok) throw new Error('Failed to create ticket');

            message.success('Report submitted successfully');
            form.resetFields();
            setFileList([]);
            onSuccess();
        } catch (error) {
            console.error(error);
            message.error('Failed to submit report');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="Report Issue"
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={loading}
            okText="Submit Report"
            okButtonProps={{ className: 'bg-red-500 hover:bg-red-600' }}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="subject"
                    label="Issue Type"
                    rules={[{ required: true, message: 'Please select issue type' }]}
                >
                    <Select placeholder="Select Issue Type">
                        <Select.Option value="Reproduce">Reproduce</Select.Option>
                        <Select.Option value="Refund Request">Refund Request</Select.Option>
                        <Select.Option value="Other Issue">Other Issue</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="reason"
                    label="Reason"
                    rules={[{ required: true, message: 'Please select a reason' }]}
                >
                    <Select placeholder="Select Reason">
                        <Select.Option value="Wrong Item Received">Wrong Item Received</Select.Option>
                        <Select.Option value="Damaged Item">Damaged Item</Select.Option>
                        <Select.Option value="Lost in Transit">Lost in Transit</Select.Option>
                        <Select.Option value="Quality Issue">Quality Issue</Select.Option>
                        <Select.Option value="Other">Other</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="description"
                    label="Additional Details (Optional)"
                >
                    <Input.TextArea rows={3} placeholder="Provide any extra details here..." />
                </Form.Item>

                <Form.Item label="Evidence (Required)">
                    <Upload
                        listType="picture"
                        maxCount={1}
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        beforeUpload={() => false} // Manual upload
                    >
                        <Button icon={<UploadOutlined />}>Upload Image</Button>
                    </Upload>
                </Form.Item>
            </Form>
        </Modal>
    );
}
