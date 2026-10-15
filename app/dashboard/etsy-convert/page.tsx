'use client';

import React, { useState } from 'react';
import { Card, Upload, Button, message, Typography, Steps } from 'antd';
import { InboxOutlined, FileExcelOutlined, LinkOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useLanguage } from '@/components/Providers/LanguageContext';

const { Paragraph } = Typography;
const { Dragger } = Upload;

// Dedicated "Etsy Convert" page (separate from Import Orders): a seller uploads a
// raw Etsy "Sold Order Items" export and downloads a ready-to-fill emfulfill
// template with order/address/SKU/color/size/personalization pre-filled. They then
// fill the design + position columns and import it under Import Orders.
export default function EtsyConvertPage() {
    const { t } = useLanguage();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [converting, setConverting] = useState(false);

    const handleConvert = async (format: 'xlsx' | 'csv') => {
        if (fileList.length === 0) { message.warning('Select an Etsy file first'); return; }
        setConverting(true);
        try {
            const fd = new FormData();
            fd.append('file', (fileList[0].originFileObj || fileList[0]) as any);
            fd.append('format', format);
            const res = await fetch('/api/import/etsy-template', { method: 'POST', body: fd });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                message.error(d.error || 'Convert failed');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = format === 'csv' ? 'emfulfill_from_etsy.csv' : 'emfulfill_from_etsy.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            message.success(format === 'csv'
                ? 'CSV downloaded. Open your Google Sheet template and paste the rows in — its dropdowns keep working. Then fill the design / position columns and import it.'
                : 'Excel template downloaded (with dropdowns). Fill in the design / position columns, then import it under Import Orders → emfulfill Template.');
        } catch (e) {
            message.error('Convert error');
        } finally {
            setConverting(false);
        }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">{t.nav.etsyConvert || 'Etsy Convert'}</h1>
            <Paragraph type="secondary">
                Turn a raw Etsy “Sold Order Items” export into a ready-to-fill emfulfill template.
                Order, address, garment SKU, color, size and the buyer’s personalization are filled
                in automatically — you only add the design links and print positions.
            </Paragraph>

            <Steps
                size="small"
                className="mb-6"
                items={[
                    { title: 'Upload Etsy file' },
                    { title: 'Convert Emfulfill Excel file' },
                    { title: 'Fill designs & positions' },
                    { title: 'Import Orders' },
                ]}
            />

            <Card>
                <Dragger
                    accept=".csv,.xlsx,.xls,.xlsm"
                    maxCount={1}
                    fileList={fileList}
                    beforeUpload={(file) => { setFileList([file]); return false; }}
                    onRemove={() => setFileList([])}
                >
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">Click or drag your Etsy “Sold Order Items” file here</p>
                    <p className="ant-upload-hint">Accepts .csv / .xlsx exported from Etsy.</p>
                </Dragger>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                        type="primary"
                        icon={<FileExcelOutlined />}
                        onClick={() => handleConvert('xlsx')}
                        disabled={fileList.length === 0}
                        loading={converting}
                        size="large"
                    >
                        Convert → Excel (.xlsx)
                    </Button>
                    <Button
                        icon={<LinkOutlined />}
                        onClick={() => handleConvert('csv')}
                        disabled={fileList.length === 0}
                        loading={converting}
                        size="large"
                    >
                        Convert → Google Sheet (.csv)
                    </Button>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                    Excel keeps the template dropdowns. For Google Sheets, download the CSV and paste
                    it into the Google Sheet template (its own dropdowns keep working).
                </p>
            </Card>
        </div>
    );
}
