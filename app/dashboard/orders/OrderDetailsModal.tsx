'use client';

import React, { useState } from 'react';
import { Modal, Descriptions, Table, Tag, Button, Alert } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import ReportTicketModal from './ReportTicketModal';
import { useLanguage } from '@/components/Providers/LanguageContext';

interface OrderDetailsModalProps {
    visible: boolean;
    onCancel: () => void;
    order: any;
    showReportButton?: boolean;
}

export default function OrderDetailsModal({ visible, onCancel, order, showReportButton = true }: OrderDetailsModalProps) {
    const { t } = useLanguage();
    const [reportModalVisible, setReportModalVisible] = useState(false);

    if (!order) return null;

    const baseItemsTotal = order.jobs?.reduce((acc: number, j: any) => acc + ((j.priceToCharge || 0) * (j.qty || 0)), 0) || 0;
    const shippingTotal = order.jobs?.reduce((acc: number, j: any) => acc + (j.shippingCost || 0), 0) || 0;
    const extraFeesTotal = order.jobs?.reduce((acc: number, j: any) => acc + (j.extraFees || 0), 0) || 0;
    const priorityFeeTotal = (order.priorityProduction ? Number(order.priorityProductionFee || 0) : 0)
        + (order.priorityShipping ? Number(order.priorityShippingFee || 0) : 0);
    const orderGrandTotal = baseItemsTotal + shippingTotal + extraFeesTotal + priorityFeeTotal;

    const columns = [
        {
            title: t.orderModals.item,
            key: 'item',
            render: (_: any, record: any) => (
                <div>
                    <div className="font-medium">{record.sku}</div>
                    <div className="text-xs text-gray-500">{record.color} / {record.size}</div>
                    {record.notes && (
                        <div className="mt-2 text-xs whitespace-pre-line text-gray-600">
                            <span className="font-semibold">Notes:</span> {record.notes}
                        </div>
                    )}
                </div>
            )
        },
        {
            title: t.orderModals.design,
            key: 'design',
            render: (_: any, record: any) => {
                try {
                    const designs = JSON.parse(record.designs || '[]');
                    if (Array.isArray(designs) && designs.length > 0) {
                        return (
                            <div className="flex flex-col gap-2">
                                {designs.map((d: any, index: number) => (
                                    <div key={index} className="text-xs border-b pb-1 last:border-0">
                                        <div className="font-semibold text-gray-700">Position {index + 1}</div>
                                        <div><span className="text-gray-500">{t.orderModals.position?.slice(0, 3) || 'Pos'}:</span> {d.location || d.position || t.orderModals.na}</div>
                                        <div><span className="text-gray-500">Type:</span> {d.type || 'Embroidery'}</div>
                                    </div>
                                ))}
                            </div>
                        );
                    }
                    return <span className="text-gray-400">N/A</span>;
                } catch {
                    return <span className="text-gray-400">N/A</span>;
                }
            }
        },
        {
            title: t.orderModals.link,
            key: 'link',
            render: (_: any, record: any) => {
                try {
                    const designs = JSON.parse(record.designs || '[]');
                    if (Array.isArray(designs) && designs.length > 0) {
                        return (
                            <div className="flex flex-col gap-2">
                                {designs.map((d: any, index: number) => (
                                    <div key={index} className="pb-1 border-b last:border-0 min-h-[3em] flex items-center">
                                        <div className="flex gap-1">
                                            {d.url ? (
                                                <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs">
                                                    {t.orderModals.designFile}
                                                </a>
                                            ) : <span className="text-gray-300 text-xs">-</span>}
                                            {d.mockup ? (
                                                <a href={d.mockup} target="_blank" rel="noreferrer" className="text-green-500 hover:underline text-xs">
                                                    {t.orderModals.designMockup}
                                                </a>
                                            ) : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    }
                } catch { }
                return <span className="text-gray-400">-</span>;
            }
        },
        {
            title: t.orderModals.qty,
            dataIndex: 'qty',
            key: 'qty',
        },
        {
            title: t.orderModals.status,
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => <Tag>{status}</Tag>
        }
    ];

    const footerButtons = [
        <Button key="close" onClick={onCancel}>{t.orderModals.close}</Button>
    ];

    if (showReportButton && order.status === 'SHIPPED') {
        footerButtons.push(
            <Button
                key="report"
                danger
                icon={<WarningOutlined />}
                onClick={() => setReportModalVisible(true)}
            >
                {t.orderModals.reportIssue}
            </Button>
        );
    }

    const firstJob = order.jobs?.[0] || {};
    const fullAddress = [
        firstJob.address1,
        firstJob.address2,
        firstJob.city,
        firstJob.state,
        firstJob.zip,
        firstJob.country || order.shippingCountry
    ].filter(Boolean).join(', ');

    return (
        <>
            <Modal
                title={`${t.orderModals.orderDetails}: ${order.orderCode}`}
                open={visible}
                onCancel={onCancel}
                width={800}
                footer={footerButtons}
            >
                <Descriptions bordered column={2} size="small" className="mb-6">
                    <Descriptions.Item label={t.orderModals.orderId}>{order.orderCode}</Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.status}>
                        <Tag color={order.status === 'COMPLETED' ? 'green' : 'blue'}>{order.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.total}>${orderGrandTotal.toFixed(2)}</Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.date}>{new Date(order.createdAt).toLocaleDateString()}</Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.tracking}>
                        {order.trackingNumber ? (
                            <a href="https://stallionexpress.ca/tracking/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                {order.trackingNumber}
                            </a>
                        ) : t.orderModals.na}
                    </Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.carrier}>{order.carrier || t.orderModals.na}</Descriptions.Item>

                    <Descriptions.Item label={t.orderModals.recipient}>{firstJob.recipientName || t.orderModals.na}</Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.phone}>{firstJob.phone || t.orderModals.na}</Descriptions.Item>
                    <Descriptions.Item label={t.orderModals.address} span={2}>
                        {fullAddress || t.orderModals.na}
                    </Descriptions.Item>
                </Descriptions>

                {order.status === 'REJECTED' && order.rejectionReason && (
                    <Alert
                        message={t.orderModals.orderRejected}
                        description={order.rejectionReason}
                        type="error"
                        showIcon
                        className="mb-6"
                    />
                )}

                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl mb-6 border border-zinc-100 dark:border-zinc-700">
                    <h4 className="text-sm font-bold text-zinc-500 uppercase mb-3">{t.orderModals.costBreakdown}</h4>
                    <div className="flex flex-wrap gap-6">
                        <div>
                            <span className="block text-xs text-zinc-400">{t.orderModals.baseItems}</span>
                            <span className="font-mono font-medium text-lg">
                                ${baseItemsTotal.toFixed(2)}
                            </span>
                        </div>
                        <div>
                            <span className="block text-xs text-zinc-400">{t.orderModals.shipping}</span>
                            <span className="font-mono font-medium text-lg">
                                ${shippingTotal.toFixed(2)}
                            </span>
                        </div>
                        <div>
                            <span className="block text-xs text-zinc-400">{t.orderModals.extraFees}</span>
                            <span className="font-mono font-medium text-lg">
                                ${extraFeesTotal.toFixed(2)}
                            </span>
                        </div>
                        <div>
                            <span className="block text-xs text-zinc-400">Priority Fees</span>
                            <span className="font-mono font-medium text-lg">
                                ${priorityFeeTotal.toFixed(2)}
                            </span>
                            {(order.priorityProduction || order.priorityShipping) && (
                                <span className="block text-[11px] text-zinc-400">
                                    {[order.priorityProduction ? 'Production' : '', order.priorityShipping ? 'Shipping' : ''].filter(Boolean).join(' + ')}
                                </span>
                            )}
                        </div>
                        <div className="border-l pl-6 border-zinc-200 dark:border-zinc-600">
                            <span className="block text-xs text-zinc-400">{t.orderModals.total}</span>
                            <span className="font-mono font-bold text-xl text-emerald-600">
                                ${orderGrandTotal.toFixed(2)}
                            </span>
                        </div>
                    </div>
                </div>

                <h3 className="font-bold mb-2">{t.orderModals.orderItems}</h3>
                <Table
                    dataSource={order.jobs || []}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                />
            </Modal>

            {reportModalVisible && (
                <ReportTicketModal
                    visible={reportModalVisible}
                    onCancel={() => setReportModalVisible(false)}
                    orderId={order.id}
                    onSuccess={() => {
                        setReportModalVisible(false);
                    }}
                />
            )}
        </>
    );
}
