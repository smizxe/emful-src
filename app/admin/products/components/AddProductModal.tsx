'use client';

import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, message } from 'antd';

interface AddProductModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: (product: any) => void;
}

export default function AddProductModal({ visible, onClose, onSuccess }: AddProductModalProps) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (values: any) => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });

            if (response.ok) {
                const newProduct = await response.json();
                message.success('Product added successfully');
                form.resetFields();
                onSuccess(newProduct.product);
                onClose();
            } else {
                const error = await response.json();
                message.error(error.error || 'Failed to add product');
            }
        } catch (error) {
            message.error('Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title="Add New Product"
            open={visible}
            onCancel={onClose}
            onOk={() => form.submit()}
            confirmLoading={loading}
            okText="Add Product"
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                initialValues={{ stock: 100 }}
            >
                <Form.Item
                    name="name"
                    label="Product Name"
                    rules={[{ required: true, message: 'Please enter product name' }]}
                >
                    <Input placeholder="e.g. Vintage T-Shirt" />
                </Form.Item>

                <Form.Item
                    name="sku"
                    label="SKU"
                    rules={[{ required: true, message: 'Please enter SKU' }]}
                >
                    <Input placeholder="e.g. TSHIRT-001" />
                </Form.Item>

                <div style={{ display: 'flex', gap: '16px' }}>
                    <Form.Item
                        name="price"
                        label="Price ($)"
                        rules={[{ required: true, message: 'Enter price' }]}
                        style={{ flex: 1 }}
                    >
                        <InputNumber
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                            placeholder="0.00"
                        />
                    </Form.Item>

                    <Form.Item
                        name="stock"
                        label="Stock"
                        rules={[{ required: true, message: 'Enter stock' }]}
                        style={{ flex: 1 }}
                    >
                        <InputNumber
                            min={0}
                            step={1}
                            style={{ width: '100%' }}
                            placeholder="100"
                        />
                    </Form.Item>
                </div>

                <Form.Item
                    name="category"
                    label="Category"
                >
                    <Select placeholder="Select category">
                        <Select.Option value="Clothing">Clothing</Select.Option>
                        <Select.Option value="Hats">Hats</Select.Option>
                        <Select.Option value="Accessories">Accessories</Select.Option>
                        <Select.Option value="Uncategorized">Uncategorized</Select.Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="imageUrl"
                    label="Image URL"
                    extra="Provide a direct link to the product image."
                >
                    <Input placeholder="https://example.com/image.jpg" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
