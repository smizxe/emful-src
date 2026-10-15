'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Switch, Table, Button, App, ColorPicker, Space, Popconfirm, InputNumber } from 'antd';
import { DeleteOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons';
import { inferColorHex } from '@/lib/productColors';

interface Template {
    id: string;
    name: string;
    isDefault: boolean;
    colors: string;
    sizes: string;
    colorMapping: string | null;
    itemValue?: number;
    itemDescription?: string;
    itemCurrency?: string;
    hsCode?: string;
    countryOfOrigin?: string;
    customsDescription?: string;
    itemWeight?: number;
    weightUnit?: string;
    itemLength?: number;
    itemWidth?: number;
    itemHeight?: number;
    sizeUnit?: string;
}

interface TemplateModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function TemplateModal({ open, onCancel, onSuccess }: TemplateModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [colorMapping, setColorMapping] = useState<Record<string, string>>({});
    const [currentColors, setCurrentColors] = useState<string[]>([]);

    const fetchTemplates = async () => {
        try {
            const res = await fetch('/api/admin/templates');
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
            }
        } catch (error) {
            message.error('Failed to load templates');
        }
    };

    useEffect(() => {
        if (open) {
            fetchTemplates();
            resetForm();
        }
    }, [open]);

    const resetForm = () => {
        form.resetFields();
        setSelectedTemplate(null);
        setColorMapping({});
        setCurrentColors([]);
    };

    const loadTemplate = (template: Template) => {
        setSelectedTemplate(template);
        const colors = JSON.parse(template.colors || '[]');
        const sizes = JSON.parse(template.sizes || '[]');
        const mapping = template.colorMapping ? JSON.parse(template.colorMapping) : {};

        form.setFieldsValue({
            name: template.name,
            colors,
            sizes,
            isDefault: template.isDefault,
            itemValue: template.itemValue,
            itemDescription: template.itemDescription,
            itemCurrency: template.itemCurrency,
            hsCode: template.hsCode,
            countryOfOrigin: template.countryOfOrigin,
            customsDescription: template.customsDescription,
            itemWeight: template.itemWeight,
            weightUnit: template.weightUnit,
            itemLength: template.itemLength,
            itemWidth: template.itemWidth,
            itemHeight: template.itemHeight,
            sizeUnit: template.sizeUnit
        });
        setCurrentColors(colors);
        setColorMapping(mapping);
    };

    const handleColorsChange = (colors: string[]) => {
        setCurrentColors(colors);
        const newMapping = { ...colorMapping };
        colors.forEach(c => {
            if (!(c in newMapping)) newMapping[c] = inferColorHex(c);
        });
        Object.keys(newMapping).forEach(k => {
            if (!colors.includes(k)) delete newMapping[k];
        });
        setColorMapping(newMapping);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const payload = {
                name: values.name,
                colors: values.colors || [],
                sizes: values.sizes || [],
                colorMapping,
                isDefault: values.isDefault || false,
                itemValue: values.itemValue,
                itemDescription: values.itemDescription,
                itemCurrency: values.itemCurrency,
                hsCode: values.hsCode,
                countryOfOrigin: values.countryOfOrigin,
                customsDescription: values.customsDescription,
                itemWeight: values.itemWeight,
                weightUnit: values.weightUnit,
                itemLength: values.itemLength,
                itemWidth: values.itemWidth,
                itemHeight: values.itemHeight,
                sizeUnit: values.sizeUnit
            };

            const url = selectedTemplate
                ? `/api/admin/templates/${selectedTemplate.id}`
                : '/api/admin/templates';

            const method = selectedTemplate ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save template');
            }

            message.success(selectedTemplate ? 'Template updated' : 'Template created');
            fetchTemplates();
            if (!selectedTemplate) resetForm();
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAs = async () => {
        try {
            const values = await form.validateFields();
            const newName = await new Promise<string>((resolve) => {
                Modal.confirm({
                    title: 'Save Template As',
                    content: (
                        <Input
                            placeholder="Enter new template name"
                            id="new-template-name"
                            defaultValue={values.name + ' Copy'}
                        />
                    ),
                    onOk: () => {
                        const input = document.getElementById('new-template-name') as HTMLInputElement;
                        resolve(input?.value || values.name + ' Copy');
                    }
                });
            });

            setLoading(true);

            const payload = {
                name: newName,
                colors: values.colors || [],
                sizes: values.sizes || [],
                colorMapping,
                isDefault: false,
                itemValue: values.itemValue,
                itemDescription: values.itemDescription,
                itemCurrency: values.itemCurrency,
                hsCode: values.hsCode,
                countryOfOrigin: values.countryOfOrigin,
                customsDescription: values.customsDescription,
                itemWeight: values.itemWeight,
                weightUnit: values.weightUnit,
                itemLength: values.itemLength,
                itemWidth: values.itemWidth,
                itemHeight: values.itemHeight,
                sizeUnit: values.sizeUnit
            };

            const res = await fetch('/api/admin/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save template');
            }

            message.success('Template saved as: ' + newName);
            fetchTemplates();
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete');
            }
            message.success('Template deleted');
            fetchTemplates();
            if (selectedTemplate?.id === id) resetForm();
        } catch (error: any) {
            message.error(error.message);
        }
    };

    const colorColumns = [
        { title: 'Color Name', dataIndex: 'color', key: 'color' },
        {
            title: 'Hex Code',
            key: 'hex',
            render: (_: any, record: { color: string }) => (
                <ColorPicker
                    value={colorMapping[record.color] || inferColorHex(record.color)}
                    onChange={(_, hex) => setColorMapping(prev => ({ ...prev, [record.color]: hex }))}
                    showText
                />
            )
        }
    ];

    return (
        <Modal
            title="Manage Product Templates"
            open={open}
            onCancel={onCancel}
            width={900}
            footer={null}
        >
            <div className="flex gap-6">
                {/* Template List */}
                <div className="w-1/3 border-r pr-4">
                    <div className="font-semibold mb-3 text-zinc-600">Templates</div>
                    <div className="space-y-2 max-h-96 overflow-auto">
                        {templates.map(t => (
                            <div
                                key={t.id}
                                className={`p-3 rounded-lg cursor-pointer border transition-all ${selectedTemplate?.id === t.id
                                    ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/30 dark:border-indigo-500'
                                    : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:hover:bg-zinc-700'
                                    }`}
                                onClick={() => loadTemplate(t)}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">{t.name}</span>
                                    {t.isDefault && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded dark:bg-green-900/30 dark:text-green-400">
                                            Default
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    {JSON.parse(t.colors || '[]').length} colors, {JSON.parse(t.sizes || '[]').length} sizes
                                </div>
                            </div>
                        ))}
                        {templates.length === 0 && (
                            <div className="text-zinc-400 text-center py-4">No templates yet</div>
                        )}
                    </div>
                    <Button
                        type="dashed"
                        block
                        className="mt-3"
                        onClick={resetForm}
                    >
                        + New Template
                    </Button>
                </div>

                {/* Template Form */}
                <div className="w-2/3">
                    <Form form={form} layout="vertical">
                        <Form.Item
                            name="name"
                            label="Template Name"
                            rules={[{ required: true, message: 'Name is required' }]}
                        >
                            <Input placeholder="e.g., T-Shirt Standard" />
                        </Form.Item>

                        <Form.Item name="isDefault" valuePropName="checked" label="Set as Default">
                            <Switch />
                        </Form.Item>

                        <Form.Item name="colors" label="Colors">
                            <Select
                                mode="tags"
                                placeholder="Add colors"
                                onChange={handleColorsChange}
                            />
                        </Form.Item>

                        <Form.Item name="sizes" label="Sizes">
                            <Select
                                mode="tags"
                                placeholder="Add sizes"
                            />
                        </Form.Item>

                        <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700 mb-4">
                            <div className="font-semibold mb-3 text-sm text-zinc-600">Shipping & Customs Defaults</div>
                            <div className="grid grid-cols-2 gap-3">
                                <Form.Item name="itemValue" label="Item Value" className="mb-2">
                                    <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" placeholder="8" size="small" />
                                </Form.Item>
                                <Form.Item name="itemCurrency" label="Currency" className="mb-2">
                                    <Select size="small">
                                        <Select.Option value="CAD">CAD</Select.Option>
                                        <Select.Option value="USD">USD</Select.Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="countryOfOrigin" label="Origin" className="mb-2">
                                    <Input placeholder="MX" size="small" />
                                </Form.Item>
                                <Form.Item name="hsCode" label="HS Code" className="mb-2">
                                    <Input placeholder="6110..." size="small" />
                                </Form.Item>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-2">
                                <Form.Item name="itemWeight" label="Weight" className="mb-2 col-span-2">
                                    <InputNumber style={{ width: '100%' }} min={0} precision={3} size="small" />
                                </Form.Item>
                                <Form.Item name="weightUnit" label="Unit" className="mb-2">
                                    <Select size="small">
                                        <Select.Option value="kg">kg</Select.Option>
                                        <Select.Option value="lb">lb</Select.Option>
                                    </Select>
                                </Form.Item>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <Form.Item name="itemLength" label="L" className="mb-0">
                                    <InputNumber style={{ width: '100%' }} min={0} size="small" />
                                </Form.Item>
                                <Form.Item name="itemWidth" label="W" className="mb-0">
                                    <InputNumber style={{ width: '100%' }} min={0} size="small" />
                                </Form.Item>
                                <Form.Item name="itemHeight" label="H" className="mb-0">
                                    <InputNumber style={{ width: '100%' }} min={0} size="small" />
                                </Form.Item>
                            </div>
                        </div>

                        {currentColors.length > 0 && (
                            <div className="mb-4">
                                <div className="text-sm font-medium mb-2">Color Appearance</div>
                                <Table
                                    dataSource={currentColors.map(c => ({ key: c, color: c }))}
                                    columns={colorColumns}
                                    pagination={false}
                                    size="small"
                                />
                            </div>
                        )}

                        <div className="flex gap-2 mt-6">
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                onClick={handleSave}
                                loading={loading}
                            >
                                {selectedTemplate ? 'Update' : 'Create'}
                            </Button>
                            {selectedTemplate && (
                                <>
                                    <Button
                                        icon={<CopyOutlined />}
                                        onClick={handleSaveAs}
                                    >
                                        Save As...
                                    </Button>
                                    <Popconfirm
                                        title="Delete this template?"
                                        onConfirm={() => handleDelete(selectedTemplate.id)}
                                        disabled={selectedTemplate.isDefault}
                                    >
                                        <Button
                                            danger
                                            icon={<DeleteOutlined />}
                                            disabled={selectedTemplate.isDefault}
                                        >
                                            Delete
                                        </Button>
                                    </Popconfirm>
                                </>
                            )}
                        </div>
                    </Form>
                </div>
            </div>
        </Modal>
    );
}
