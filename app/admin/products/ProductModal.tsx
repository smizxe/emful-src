'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Switch, Select, InputNumber, Table, Checkbox, Divider, Button, Upload, App, ColorPicker, Space } from 'antd';
import { PlusOutlined, FileOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import dynamic from 'next/dynamic';
import { inferColorHex } from '@/lib/productColors';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });
import 'react-quill-new/dist/quill.snow.css';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

interface ProductModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    product?: any | null;
}

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


export default function ProductModal({ open, onCancel, onSuccess, product }: ProductModalProps) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [description, setDescription] = useState<string>('');
    const isEdit = !!product;

    // Template state
    const [templates, setTemplates] = useState<Template[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

    // Special pricing toggles
    const [enableColorPricing, setEnableColorPricing] = useState(false);
    const [enableSizePricing, setEnableSizePricing] = useState(false);

    // Price adjustments
    const [colorAdjustments, setColorAdjustments] = useState<Record<string, number>>({});
    const [sizeAdjustments, setSizeAdjustments] = useState<Record<string, number>>({});

    // Track current colors/sizes
    const [currentColors, setCurrentColors] = useState<string[]>([]);
    const [currentSizes, setCurrentSizes] = useState<string[]>([]);

    // Color Hex Mapping
    const [colorMapping, setColorMapping] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            if (product) {
                const productDescription = product.description || '';
                setDescription(productDescription);

                form.setFieldsValue({
                    sku: product.sku,
                    name: product.name,
                    isActive: product.isActive,
                    description: productDescription,
                    colors: product.colors || [],
                    sizes: product.sizes || [],
                    basePrice: product.basePrice || 0,
                    itemValue: product.itemValue ?? 8,
                    itemDescription: product.itemDescription,
                    itemCurrency: product.itemCurrency || 'CAD',
                    hsCode: product.hsCode || '6110.20.20.41',
                    countryOfOrigin: product.countryOfOrigin || 'MX',
                    customsDescription: product.customsDescription,
                    itemWeight: product.itemWeight ?? 0.36,
                    weightUnit: product.weightUnit || 'kg',
                    itemLength: product.itemLength ?? 20,
                    itemWidth: product.itemWidth ?? 12,
                    itemHeight: product.itemHeight ?? 6,
                    sizeUnit: product.sizeUnit || 'cm',
                    shippingRates: product.shippingRates ? JSON.parse(product.shippingRates) : [],
                    extraFees: product.extraFees ? JSON.parse(product.extraFees) : []
                });

                let initialImages: string[] = [];
                try {
                    initialImages = JSON.parse(product.images || '[]');
                } catch (e) { }

                const files: UploadFile[] = initialImages.map((url: string, index: number) => ({
                    uid: `-${index}`,
                    name: `image-${index}`,
                    status: 'done',
                    url: url,
                }));

                setFileList(files);
                setCurrentColors(product.colors || []);
                setCurrentSizes(product.sizes || []);

                // Load color mapping
                let mapping: Record<string, string> = {};
                try {
                    mapping = product.colorMapping ? JSON.parse(product.colorMapping) : {};
                } catch (e) { }
                setColorMapping(mapping);

                // Load saved pricing adjustments
                let savedPricing: any = {};
                try {
                    savedPricing = product.pricingAdjustments ? JSON.parse(product.pricingAdjustments) : {};
                } catch (e) { }

                setEnableColorPricing(!!savedPricing.enableColor);
                setEnableSizePricing(!!savedPricing.enableSize);

                const colorAdj: Record<string, number> = savedPricing.color || {};
                const sizeAdj: Record<string, number> = savedPricing.size || {};

                // Ensure all current colors/sizes have entries
                (product.colors || []).forEach((c: string) => {
                    if (!(c in colorAdj)) colorAdj[c] = 0;
                });
                (product.sizes || []).forEach((s: string) => {
                    if (!(s in sizeAdj)) sizeAdj[s] = 0;
                });

                setColorAdjustments(colorAdj);
                setSizeAdjustments(sizeAdj);
            } else {
                // New product - fetch templates and apply default
                form.resetFields();
                setFileList([]);
                setDescription('');
                setColorAdjustments({});
                setSizeAdjustments({});
                setEnableColorPricing(false);
                setEnableSizePricing(false);
                setSelectedTemplateId(null);
                setCurrentColors([]);
                setCurrentSizes([]);
                setColorMapping({});

                // Fetch templates
                fetch('/api/admin/templates')
                    .then(res => res.json())
                    .then((data: Template[]) => {
                        setTemplates(data);
                        // Find and apply default template
                        const defaultTemplate = data.find(t => t.isDefault);
                        if (defaultTemplate) {
                            const colors = JSON.parse(defaultTemplate.colors || '[]');
                            const sizes = JSON.parse(defaultTemplate.sizes || '[]');
                            const mapping = defaultTemplate.colorMapping
                                ? JSON.parse(defaultTemplate.colorMapping)
                                : {};

                            form.setFieldsValue({
                                isActive: true,
                                colors,
                                sizes,
                                basePrice: 0,
                                // Template values
                                itemValue: defaultTemplate.itemValue,
                                itemDescription: defaultTemplate.itemDescription,
                                itemCurrency: defaultTemplate.itemCurrency,
                                hsCode: defaultTemplate.hsCode,
                                countryOfOrigin: defaultTemplate.countryOfOrigin,
                                customsDescription: defaultTemplate.customsDescription,
                                itemWeight: defaultTemplate.itemWeight,
                                weightUnit: defaultTemplate.weightUnit,
                                itemLength: defaultTemplate.itemLength,
                                itemWidth: defaultTemplate.itemWidth,
                                itemHeight: defaultTemplate.itemHeight,
                                sizeUnit: defaultTemplate.sizeUnit
                            });
                            setCurrentColors(colors);
                            setCurrentSizes(sizes);
                            setColorMapping(mapping);
                            setSelectedTemplateId(defaultTemplate.id);
                        } else {
                            form.setFieldsValue({
                                isActive: true,
                                colors: [],
                                sizes: [],
                                basePrice: 0
                            });
                        }
                    })
                    .catch(err => {
                        console.error('Failed to fetch templates:', err);
                        form.setFieldsValue({
                            isActive: true,
                            colors: [],
                            sizes: [],
                            basePrice: 0
                        });
                    });
            }
        }
    }, [open, product, form]);

    const handleUpload = async (options: any) => {
        const { onSuccess: onUploadSuccess, onError, file } = options;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', await shrinkImageForUpload(file));

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) {
                onUploadSuccess(data.url);
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            message.error('Upload failed');
            onError(error);
        } finally {
            setUploading(false);
        }
    };

    const handleChange: UploadProps['onChange'] = ({ fileList: newFileList }) => {
        const updatedList = newFileList.map(file => {
            if (file.response) file.url = file.response;
            return file;
        });
        setFileList(updatedList);
    };

    const handleValuesChange = (changedValues: any, allValues: any) => {
        if ('colors' in changedValues) {
            const newColors = allValues.colors || [];
            setCurrentColors(newColors);

            const newMapping = { ...colorMapping };
            newColors.forEach((c: string) => {
                if (!(c in newMapping)) newMapping[c] = inferColorHex(c);
            });
            Object.keys(newMapping).forEach(k => {
                if (!newColors.includes(k)) delete newMapping[k];
            });
            setColorMapping(newMapping);

            const updated = { ...colorAdjustments };
            newColors.forEach((c: string) => {
                if (!(c in updated)) updated[c] = 0;
            });
            Object.keys(updated).forEach(k => {
                if (!newColors.includes(k)) delete updated[k];
            });
            setColorAdjustments(updated);
        }
        if ('sizes' in changedValues) {
            const newSizes = allValues.sizes || [];
            setCurrentSizes(newSizes);
            const updated = { ...sizeAdjustments };
            newSizes.forEach((s: string) => {
                if (!(s in updated)) updated[s] = 0;
            });
            Object.keys(updated).forEach(k => {
                if (!newSizes.includes(k)) delete updated[k];
            });
            setSizeAdjustments(updated);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            values.sku = values.sku.toUpperCase();
            const basePrice = parseFloat(values.basePrice) || 0;
            const colors = values.colors?.length > 0 ? values.colors : [null];
            const sizes = values.sizes?.length > 0 ? values.sizes : [null];

            const variants: any[] = [];
            colors.forEach((color: string | null) => {
                sizes.forEach((size: string | null) => {
                    const colorAdj = (enableColorPricing && color) ? (colorAdjustments[color] || 0) : 0;
                    const sizeAdj = (enableSizePricing && size) ? (sizeAdjustments[size] || 0) : 0;
                    variants.push({ color, size, basePrice: basePrice + colorAdj + sizeAdj });
                });
            });

            const payload = {
                sku: values.sku,
                name: values.name,
                description: values.description,
                images: fileList.map(f => f.url).filter(Boolean),
                isActive: values.isActive,
                variants,
                shippingRates: JSON.stringify(values.shippingRates || []),
                extraFees: JSON.stringify(values.extraFees || []),
                colorMapping: JSON.stringify(colorMapping),
                itemValue: values.itemValue ?? 8,
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
                sizeUnit: values.sizeUnit,
                pricingAdjustments: JSON.stringify({
                    enableColor: enableColorPricing,
                    enableSize: enableSizePricing,
                    color: enableColorPricing ? colorAdjustments : {},
                    size: enableSizePricing ? sizeAdjustments : {}
                })
            };

            const url = isEdit ? `/api/admin/products/${product.id}` : '/api/admin/products';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save');

            message.success(isEdit ? 'Product updated' : 'Product created');
            onSuccess();
            onCancel();
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const colorColumns = [
        { title: 'Color', dataIndex: 'color', key: 'color' },
        {
            title: 'Price Adjustment ($)',
            dataIndex: 'adjustment',
            key: 'adjustment',
            render: (_: any, record: { color: string }) => (
                <InputNumber
                    value={colorAdjustments[record.color] || 0}
                    onChange={(val) => setColorAdjustments(prev => ({ ...prev, [record.color]: val || 0 }))}
                    precision={2}
                    style={{ width: 120 }}
                    prefix="+"
                />
            )
        }
    ];

    const sizeColumns = [
        { title: 'Size', dataIndex: 'size', key: 'size' },
        {
            title: 'Price Adjustment ($)',
            dataIndex: 'adjustment',
            key: 'adjustment',
            render: (_: any, record: { size: string }) => (
                <InputNumber
                    value={sizeAdjustments[record.size] || 0}
                    onChange={(val) => setSizeAdjustments(prev => ({ ...prev, [record.size]: val || 0 }))}
                    precision={2}
                    style={{ width: 120 }}
                    prefix="+"
                />
            )
        }
    ];

    const colorVisualColumns = [
        { title: 'Color Name', dataIndex: 'color', key: 'color' },
        {
            title: 'Visual',
            dataIndex: 'visual',
            key: 'visual',
            render: (_: any, record: { color: string }) => (
                <ColorPicker
                    value={colorMapping[record.color] || inferColorHex(record.color)}
                    onChange={(_, hex) => setColorMapping(prev => ({ ...prev, [record.color]: hex }))}
                    showText
                />
            )
        }
    ];

    const colorData = currentColors.map(c => ({ key: c, color: c }));
    const sizeData = currentSizes.map(s => ({ key: s, size: s }));

    return (
        <Modal
            title={isEdit ? 'Edit Product' : 'Create Product'}
            open={open}
            onCancel={onCancel}
            onOk={handleSubmit}
            confirmLoading={loading}
            width={800}
        >
            {/* Template Selector - only show for new products */}
            {!isEdit && templates.length > 0 && (
                <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <div className="flex items-center gap-3">
                        <FileOutlined className="text-indigo-500" />
                        <span className="text-sm font-medium">Use Template:</span>
                        <Select
                            style={{ width: 200 }}
                            value={selectedTemplateId}
                            onChange={(id) => {
                                const template = templates.find(t => t.id === id);
                                if (template) {
                                    const colors = JSON.parse(template.colors || '[]');
                                    const sizes = JSON.parse(template.sizes || '[]');
                                    const mapping = template.colorMapping
                                        ? JSON.parse(template.colorMapping)
                                        : {};
                                    form.setFieldsValue({
                                        colors,
                                        sizes,
                                        // Template values
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
                                    setCurrentSizes(sizes);
                                    setColorMapping(mapping);
                                    setSelectedTemplateId(id);
                                }
                            }}
                            placeholder="Select template"
                            allowClear
                        >
                            {templates.map(t => (
                                <Select.Option key={t.id} value={t.id}>
                                    {t.name} {t.isDefault && '(Default)'}
                                </Select.Option>
                            ))}
                        </Select>
                    </div>
                </div>
            )}
            <Form form={form} layout="vertical" onValuesChange={handleValuesChange}>
                <div className="grid grid-cols-2 gap-4">
                    <Form.Item name="sku" label="SKU" rules={[{ required: true }]}>
                        <Input placeholder="E.g. TS-001" disabled={isEdit} />
                    </Form.Item>
                    <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
                        <Input placeholder="New Product" />
                    </Form.Item>
                </div>

                <Form.Item name="description" label="Description">
                    <ReactQuill
                        theme="snow"
                        value={description}
                        onChange={(value) => {
                            setDescription(value);
                            form.setFieldValue('description', value);
                        }}
                        style={{ height: 200, marginBottom: 50 }}
                    />
                </Form.Item>

                <div className="grid grid-cols-2 gap-4">
                    <Form.Item name="basePrice" label="Base Price ($)" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" />
                    </Form.Item>
                    <Form.Item name="isActive" label="Status" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-zinc-200 dark:border-zinc-700 mb-6">
                    <div className="font-semibold mb-4 text-zinc-700 dark:text-zinc-300">Shipping & Customs Info (Stallion Export)</div>
                    <div className="grid grid-cols-3 gap-4">
                        <Form.Item name="itemValue" label="Item Value" tooltip="Customs value">
                            <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="$" placeholder="8" />
                        </Form.Item>
                        <Form.Item name="itemCurrency" label="Currency">
                            <Select>
                                <Select.Option value="CAD">CAD</Select.Option>
                                <Select.Option value="USD">USD</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="countryOfOrigin" label="Origin Country">
                            <Input placeholder="MX" />
                        </Form.Item>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item name="hsCode" label="HS Code">
                            <Input placeholder="6110.20.20.41" />
                        </Form.Item>
                        <Form.Item name="itemDescription" label="Item Description">
                            <Input placeholder="Sweatshirt..." />
                        </Form.Item>
                    </div>
                    <Form.Item name="customsDescription" label="Customs Description">
                        <Input placeholder="Detailed description for customs..." />
                    </Form.Item>

                    <div className="grid grid-cols-4 gap-4">
                        <Form.Item name="itemWeight" label="Weight">
                            <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                        </Form.Item>
                        <Form.Item name="weightUnit" label="Unit">
                            <Select>
                                <Select.Option value="kg">kg</Select.Option>
                                <Select.Option value="lb">lb</Select.Option>
                                <Select.Option value="oz">oz</Select.Option>
                            </Select>
                        </Form.Item>
                        <Form.Item name="sizeUnit" label="Size Unit">
                            <Select>
                                <Select.Option value="cm">cm</Select.Option>
                                <Select.Option value="in">in</Select.Option>
                            </Select>
                        </Form.Item>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <Form.Item name="itemLength" label="Length">
                            <InputNumber style={{ width: '100%' }} min={0} />
                        </Form.Item>
                        <Form.Item name="itemWidth" label="Width">
                            <InputNumber style={{ width: '100%' }} min={0} />
                        </Form.Item>
                        <Form.Item name="itemHeight" label="Height">
                            <InputNumber style={{ width: '100%' }} min={0} />
                        </Form.Item>
                    </div>
                </div>

                <Form.Item label="Product Images">
                    <Upload customRequest={handleUpload} listType="picture-card" fileList={fileList} onChange={handleChange} multiple>
                        <div><PlusOutlined /><div style={{ marginTop: 8 }}>Add Photos</div></div>
                    </Upload>
                </Form.Item>

                <Divider>Variants</Divider>

                <div className="grid grid-cols-2 gap-4">
                    <Form.Item name="colors" label="Colors (Type and press Enter)">
                        <Select mode="tags" placeholder="Red, Blue, Black..." tokenSeparators={[',']} />
                    </Form.Item>
                    <Form.Item name="sizes" label="Sizes (Type and press Enter)">
                        <Select mode="tags" placeholder="S, M, L, XL..." tokenSeparators={[',']} />
                    </Form.Item>
                </div>

                {/* Color Appearance */}
                {currentColors.length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded border dark:border-zinc-700">
                        <span className="font-medium mb-2 block text-gray-700 dark:text-gray-300">Color Appearance</span>
                        <Table dataSource={colorData} columns={colorVisualColumns} pagination={false} size="small" />
                    </div>
                )}

                <Divider>Shipping Rates</Divider>
                <Form.List name="shippingRates">
                    {(fields, { add, remove }) => (
                        <>
                            <Table
                                dataSource={fields}
                                pagination={false}
                                size="small"
                                rowKey="key"
                                columns={[
                                    {
                                        title: 'Operator', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'operator']} initialValue="Equal" style={{ marginBottom: 0 }}>
                                                <Select style={{ width: 130 }}>
                                                    <Select.Option value="Equal">Equal</Select.Option>
                                                    <Select.Option value="Greater or Equal">Greater or Equal</Select.Option>
                                                </Select>
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Quantity', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'quantity']} initialValue={1} style={{ marginBottom: 0 }}>
                                                <InputNumber min={1} />
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Shipping Fees ($)', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'shippingFee']} initialValue={0} style={{ marginBottom: 0 }}>
                                                <InputNumber min={0} precision={2} prefix="$" />
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Action', dataIndex: 'name',
                                        render: (name: number) => <Button type="text" danger onClick={() => remove(name)}>Delete</Button>
                                    }
                                ]}
                                footer={() => <Button type="dashed" onClick={() => add()} block style={{ background: '#fff' }}>+ Add Shipping Rate</Button>}
                            />
                        </>
                    )}
                </Form.List>

                <Divider>Extra Fees</Divider>
                <Form.List name="extraFees">
                    {(fields, { add, remove }) => (
                        <>
                            <Table
                                dataSource={fields}
                                pagination={false}
                                size="small"
                                rowKey="key"
                                columns={[
                                    {
                                        title: 'Position', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'position']} initialValue="Front" style={{ marginBottom: 0 }}>
                                                <Input placeholder="e.g. Hat Front" />
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Type', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'type']} initialValue="EMBROIDERY" style={{ marginBottom: 0 }}>
                                                <Select style={{ width: 140 }}>
                                                    <Select.Option value="EMBROIDERY">EMBROIDERY</Select.Option>
                                                    <Select.Option value="PRINTING">PRINTING</Select.Option>
                                                    <Select.Option value="LEATHER_PATCH">LEATHER_PATCH</Select.Option>
                                                    <Select.Option value="OTHER">OTHER</Select.Option>
                                                </Select>
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Surcharge ($)', dataIndex: 'name',
                                        render: (name: number) => (
                                            <Form.Item name={[name, 'surcharge']} initialValue={0} style={{ marginBottom: 0 }}>
                                                <InputNumber min={0} precision={2} prefix="$" />
                                            </Form.Item>
                                        )
                                    },
                                    {
                                        title: 'Action', dataIndex: 'name',
                                        render: (name: number) => <Button type="text" danger onClick={() => remove(name)}>Delete</Button>
                                    }
                                ]}
                                footer={() => <Button type="dashed" onClick={() => add()} block style={{ background: '#fff' }}>+ Add Extra Fee</Button>}
                            />
                        </>
                    )}
                </Form.List>
            </Form>

            {/* Special Pricing */}
            {
                currentColors.length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded border dark:border-zinc-700">
                        <Checkbox checked={enableColorPricing} onChange={(e) => setEnableColorPricing(e.target.checked)}>
                            <span className="font-medium">Special Pricing by Color</span>
                        </Checkbox>
                        {enableColorPricing && <Table dataSource={colorData} columns={colorColumns} pagination={false} size="small" className="mt-2" />}
                    </div>
                )
            }

            {
                currentSizes.length > 0 && (
                    <div className="mt-4 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded border dark:border-zinc-700">
                        <Checkbox checked={enableSizePricing} onChange={(e) => setEnableSizePricing(e.target.checked)}>
                            <span className="font-medium">Special Pricing by Size</span>
                        </Checkbox>
                        {enableSizePricing && <Table dataSource={sizeData} columns={sizeColumns} pagination={false} size="small" className="mt-2" />}
                    </div>
                )
            }

            {/* Price Preview */}
            {
                (enableColorPricing || enableSizePricing) && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-sm border border-blue-100 dark:border-blue-800/50">
                        <strong>Price Preview:</strong>
                        <ul className="mt-1 list-disc list-inside">
                            {(currentColors.length > 0 ? currentColors : [null]).slice(0, 2).map((color) =>
                                (currentSizes.length > 0 ? currentSizes : [null]).slice(0, 2).map((size) => {
                                    const base = parseFloat(form.getFieldValue('basePrice')) || 0;
                                    const cAdj = (enableColorPricing && color) ? (colorAdjustments[color] || 0) : 0;
                                    const sAdj = (enableSizePricing && size) ? (sizeAdjustments[size] || 0) : 0;
                                    return <li key={`${color}-${size}`}>{color || 'Default'} / {size || 'Default'}: ${(base + cAdj + sAdj).toFixed(2)}</li>;
                                })
                            )}
                            {(currentColors.length > 2 || currentSizes.length > 2) && <li>...</li>}
                        </ul>
                    </div>
                )
            }
        </Modal >
    );
}
