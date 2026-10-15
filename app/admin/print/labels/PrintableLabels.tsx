'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

interface ExpandedLabel {
    job: any;
    unitIndex: number; // 0-based
    totalUnits: number;
    labelId: string; // Unique ID for this specific label
}

interface PrintableLabelsProps {
    jobs: any[];
    orderGroupInfo?: Record<string, { position: number; total: number }>;
}

function getDesignLocations(designs?: string) {
    try {
        const parsed = JSON.parse(designs || '[]');
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((design: any) => String(design?.location || design?.position || '').trim())
            .filter(Boolean)
            .slice(0, 4);
    } catch {
        return [];
    }
}

export default function PrintableLabels({ jobs, orderGroupInfo = {} }: PrintableLabelsProps) {
    const [origin, setOrigin] = useState('');
    const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        let configuredUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

        // Ensure URL has protocol (https://) for QR codes to work correctly
        if (configuredUrl && !configuredUrl.startsWith('http://') && !configuredUrl.startsWith('https://')) {
            configuredUrl = `https://${configuredUrl}`;
        }

        // Remove trailing slash if present
        setOrigin(configuredUrl.replace(/\/$/, ''));
    }, []);

    // Expand jobs into individual labels based on quantity
    const expandedLabels: ExpandedLabel[] = useMemo(() => {
        return jobs.flatMap(job => {
            const qty = job.qty || 1;
            return Array.from({ length: qty }, (_, i) => ({
                job,
                unitIndex: i,
                totalUnits: qty,
                labelId: `${job.id}-unit-${i}`
            }));
        });
    }, [jobs]);

    // Calculate group info for duplicate Order IDs
    // Use orderGroupInfo from props (DB-sourced) as primary, fallback to local calculation
    const groupedOrderMeta: Record<string, { position: number; total: number }> = useMemo(() => {
        // If orderGroupInfo is provided from server (accurate DB data), use it
        if (Object.keys(orderGroupInfo).length > 0) {
            return orderGroupInfo;
        }

        // Fallback: Calculate locally from jobs array (less accurate if not all jobs in group are selected)
        const baseCodeMap: Record<string, string[]> = {};

        jobs.forEach(job => {
            const orderCode = job.order?.orderCode || '';
            const baseCode = orderCode.replace(/\(\d+\)$/, '').trim();

            if (!baseCodeMap[baseCode]) {
                baseCodeMap[baseCode] = [];
            }
            if (!baseCodeMap[baseCode].includes(orderCode)) {
                baseCodeMap[baseCode].push(orderCode);
            }
        });

        const meta: Record<string, { position: number; total: number }> = {};

        Object.values(baseCodeMap).forEach(orderCodes => {
            orderCodes.sort();
            orderCodes.forEach((code, idx) => {
                meta[code] = {
                    position: idx + 1,
                    total: orderCodes.length
                };
            });
        });

        return meta;
    }, [jobs, orderGroupInfo]);

    const toggleSelectAll = () => {
        if (selectedLabelIds.size === expandedLabels.length) {
            setSelectedLabelIds(new Set());
        } else {
            setSelectedLabelIds(new Set(expandedLabels.map(l => l.labelId)));
        }
    };

    const toggleSelect = (labelId: string) => {
        const newSet = new Set(selectedLabelIds);
        if (newSet.has(labelId)) {
            newSet.delete(labelId);
        } else {
            newSet.add(labelId);
        }
        setSelectedLabelIds(newSet);
    };

    const getPrintStyles = () => `
        @page {
            size: 59mm 101mm;
            margin: 0;
        }
        body {
            margin: 0;
            padding: 0;
        }
        .label-card-screen {
            width: 59mm;
            height: 101mm;
            border: none;
            padding-top: 6mm; 
            padding-left: 3mm;
            padding-right: 3mm;
            padding-bottom: 3mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
            font-family: sans-serif;
            page-break-inside: avoid;
        }
        .text-center { text-align: center; }
        .text-left { text-align: left; }
        .font-bold { font-weight: bold; }
        .font-mono { font-family: monospace; }
        .text-tiny { font-size: 8px; }
        .text-xs { font-size: 10px; }
        .text-sm { font-size: 12px; }
        .text-md { font-size: 13px; }
        .text-lg { font-size: 16px; }
        .text-xl { font-size: 18px; }
        .uppercase { text-transform: uppercase; }
        .lowercase { text-transform: lowercase; }
        .truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* Printing copies the markup into a bare iframe with only this stylesheet --
           Tailwind is not there. Any layout class used on a label has to be
           spelled out here or it silently does nothing on paper. */
        .whitespace-nowrap { white-space: nowrap; }
        .shrink-0 { flex-shrink: 0; }
        .min-w-0 { min-width: 0; }
        .mr-2 { margin-right: 6px; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .justify-between { justify-content: space-between; }
        .items-center { align-items: center; }
        .items-end { align-items: flex-end; }
        .items-start { align-items: flex-start; }
        .mb-1 { margin-bottom: 3px; }
        .mb-2 { margin-bottom: 6px; }
        .border-b { border-bottom: 1px solid #000; }
        .border-t { border-top: 1px solid #000; }
        .w-full { width: 100%; }
        .bg-gray-100 { background-color: #f3f4f6; }
        .leading-tight { line-height: 1.1; }
        .leading-none { line-height: 1; }
        .whitespace-pre-line { white-space: pre-line; }
        .flex-grow { flex-grow: 1; }
        .unit-badge {
            background: transparent;
            color: #000 !important;
            padding: 0;
            border-radius: 4px;
            font-weight: 900 !important;
            font-size: 22px;
        }
        .position-text {
            margin-top: 2px;
            padding-top: 2px;
            border-top: 1px solid #000;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.02em;
            line-height: 1.1;
        }
    `;

    const handlePrintSelected = () => {
        if (selectedLabelIds.size === 0) return;
        const labelsHTML = Array.from(selectedLabelIds).map(labelId => {
            const el = document.getElementById(`label-${labelId}`);
            return el ? el.outerHTML : '';
        }).join('<div style="page-break-after: always; break-after: page;"></div>');

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        doc.open();
        doc.write(`
            <html>
            <head>
                <title>Print Labels</title>
                <style>${getPrintStyles()}</style>
            </head>
            <body>
                ${labelsHTML}
                <script>
                    window.onload = function() {
                        setTimeout(() => { window.print(); }, 500);
                    }
                </script>
            </body>
            </html>
        `);
        doc.close();
        setTimeout(() => { document.body.removeChild(iframe); }, 10000);
    };

    const handlePrintSingle = (labelId: string) => {
        const labelElement = document.getElementById(`label-${labelId}`);
        if (!labelElement) return;

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        doc.open();
        doc.write(`
            <html>
            <head>
                <title>Print Label</title>
                <style>
                    ${getPrintStyles()}
                    body { height: 100vh; display: flex; justify-content: center; align-items: center; }
                </style>
            </head>
            <body>
                ${labelElement.outerHTML}
                <script>
                    window.onload = function() {
                        setTimeout(() => { window.print(); }, 100);
                    }
                </script>
            </body>
            </html>
        `);
        doc.close();
        setTimeout(() => document.body.removeChild(iframe), 10000);
    };

    if (!origin) return <div>Loading...</div>;

    const allSelected = expandedLabels.length > 0 && selectedLabelIds.size === expandedLabels.length;

    return (
        <div className="print-container p-4">
            <style jsx global>{`
                .label-card-screen {
                    width: 59mm;
                    height: 101mm;
                    border: 1px dashed #ccc;
                    background: white;
                    padding-top: 6mm;
                    padding-left: 3mm;
                    padding-right: 3mm;
                    padding-bottom: 3mm;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                    position: relative;
                }
                .unit-badge {
                    background: transparent;
                    color: #000 !important;
                    padding: 0;
                    border-radius: 4px;
                    font-weight: 900 !important;
                    font-size: 22px;
                }
                .position-text {
                    margin-top: 2px;
                    padding-top: 2px;
                    border-top: 1px solid #000;
                    font-size: 8px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                    line-height: 1.1;
                }
            `}</style>

            <div className="no-print mb-4 p-4 bg-white border rounded shadow-sm sticky top-0 z-10 flex justify-between items-center">
                <div>
                    <h3 className="font-bold text-lg">Label Printer (59mm x 101mm)</h3>
                    <p className="text-sm text-gray-600">Multi-Unit Labels: {expandedLabels.length} labels from {jobs.length} jobs</p>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="selectAll" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4" />
                        <label htmlFor="selectAll" className="font-medium cursor-pointer">Select All</label>
                    </div>
                    {selectedLabelIds.size > 0 && (
                        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrintSelected}>
                            Print Selected ({selectedLabelIds.size})
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-8 justify-center">
                {expandedLabels.map(({ job, unitIndex, totalUnits, labelId }) => {
                    const fileToken = job.tokens.find((t: any) => t.type === 'FILE')?.token;
                    const statusToken = job.tokens.find((t: any) => t.type === 'STATUS')?.token;
                    const fileUrl = `${origin}/f/${fileToken}`;
                    const statusUrl = `${origin}/s/${statusToken}`;
                    const isSelected = selectedLabelIds.has(labelId);
                    const variantStr = `${job.color || ''} ${job.size || ''}`.trim().toLowerCase();
                    const unitDisplay = `${unitIndex + 1}/${totalUnits}`;
                    const positionText = getDesignLocations(job.designs).join(' | ');

                    return (
                        <div key={labelId} className="relative group">
                            {/* Checkbox Overlay */}
                            <div className="absolute -top-3 -left-3 z-20">
                                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(labelId)} className="w-6 h-6 cursor-pointer" />
                            </div>

                            <div className={`flex flex-col items-center space-y-2 ${isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}>
                                <div id={`label-${labelId}`} className={`label-card-screen cursor-pointer ${isSelected ? 'ring-2 ring-blue-500' : ''}`} onClick={() => toggleSelect(labelId)}>

                                    {/* 1. Compact Header: Order ID & Date */}
                                    {(() => {
                                        const orderCode = job.order?.orderCode || '';
                                        const meta = groupedOrderMeta[orderCode];
                                        const groupDisplay = meta && meta.total > 1 ? ` (${meta.position}/${meta.total})` : '';
                                        return (
                                            <div className="text-center border-b pb-1 mb-1 pointer-events-none">
                                                <div className="flex justify-between items-end">
                                                    <span className="font-bold text-sm leading-none">{orderCode}{groupDisplay}</span>
                                                    <span className="text-xs text-gray-500 leading-none">{new Date(job.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* 2 & 3. Recipient & Product Info */}
                                    <div className="pointer-events-none w-full">
                                        {/* Recipient */}
                                        <div className="mb-2">
                                            <div className="text-md font-bold uppercase leading-tight truncate">
                                                {job.recipientName || 'N/A'}
                                            </div>
                                            <div className="text-xs leading-tight text-gray-600">
                                                {[
                                                    job.address1,
                                                    job.address2,
                                                    [job.city, job.state].filter(Boolean).join(', '),
                                                    job.zip,
                                                    job.country
                                                ].flat().filter(Boolean).join(', ')}
                                            </div>
                                        </div>

                                        {/* Product Info with Unit Badge & Shipping Label */}
                                        <div className="border-t border-b py-2 mb-1">
                                            <div className="flex justify-between items-center mb-1">
                                                {/* The garment SKU is what the floor works from, so it never
                                                    shrinks; a long seller SKU is the one that gets cut short. */}
                                                <span className="font-bold text-lg font-mono shrink-0 whitespace-nowrap mr-2">{job.sku}</span>
                                                {/* Shipping Label Top Right */}
                                                {job.shippingLabel && (
                                                    <span
                                                        className="font-bold text-xs bg-black text-white px-1 rounded truncate min-w-0"
                                                        title={job.shippingLabel}
                                                    >
                                                        {job.shippingLabel}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Variant & Unit Badge */}
                                            <div className="flex justify-between items-end">
                                                <div className="font-bold text-lg lowercase leading-none">
                                                    {variantStr || 'std'}
                                                </div>
                                                <span className="unit-badge">{unitDisplay}</span>
                                            </div>
                                            {positionText && (
                                                <div className="position-text">
                                                    {positionText}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 4. Notes */}
                                    <div className="flex-grow w-full bg-white p-1 rounded mb-1 pointer-events-none overflow-hidden border-0">
                                        <p className="text-sm font-bold leading-tight break-words whitespace-pre-line">
                                            {job.notes || ''}
                                        </p>
                                    </div>

                                    {/* Footer: QR Codes */}
                                    <div className="mt-auto flex flex-row justify-between items-end pt-1 border-t w-full pointer-events-none">
                                        <div className="text-center">
                                            <QRCodeSVG value={fileUrl} size={85} level="L" includeMargin={true} />
                                        </div>
                                        <div className="text-center">
                                            <QRCodeSVG value={statusUrl} size={85} level="L" includeMargin={true} />
                                        </div>
                                    </div>
                                </div>

                                <Button size="small" icon={<PrinterOutlined />} onClick={(e) => { e.stopPropagation(); handlePrintSingle(labelId); }}>
                                    Print This Label
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

