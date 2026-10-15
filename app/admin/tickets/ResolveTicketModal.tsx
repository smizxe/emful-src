'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Radio, InputNumber, Alert, Space, Tag, Divider } from 'antd';
import { ReloadOutlined, DollarCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

export interface ResolveTicket {
    id: string;
    subject: string;
    order?: { orderCode: string; totalAmount?: number; currency?: string; status?: string };
}

type Decision = 'REPRODUCE' | 'REFUND' | 'REJECT';

interface ResolveTicketModalProps {
    visible: boolean;
    ticket: ResolveTicket | null;
    loading: boolean;
    onCancel: () => void;
    onConfirm: (decision: Decision, amount?: number) => void;
}

export default function ResolveTicketModal({ visible, ticket, loading, onCancel, onConfirm }: ResolveTicketModalProps) {
    const [decision, setDecision] = useState<Decision>('REPRODUCE');
    const [refundMode, setRefundMode] = useState<'FULL' | 'PARTIAL'>('FULL');
    const [amount, setAmount] = useState<number | null>(null);

    const orderTotal = ticket?.order?.totalAmount ?? 0;
    const currency = ticket?.order?.currency || 'USD';

    // Reset the form whenever a new ticket is opened.
    useEffect(() => {
        if (visible) {
            setDecision('REPRODUCE');
            setRefundMode('FULL');
            setAmount(orderTotal);
        }
    }, [visible, orderTotal]);

    const effectiveRefund = refundMode === 'FULL' ? orderTotal : (amount ?? 0);
    const refundInvalid = decision === 'REFUND'
        && (effectiveRefund <= 0 || effectiveRefund > orderTotal + 0.001);

    const handleOk = () => {
        if (decision === 'REFUND') {
            onConfirm('REFUND', refundMode === 'FULL' ? orderTotal : (amount ?? 0));
        } else {
            onConfirm(decision);
        }
    };

    return (
        <Modal
            title="Resolve Order Issue"
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            confirmLoading={loading}
            okText="Confirm"
            okButtonProps={{ disabled: refundInvalid }}
            destroyOnClose
        >
            {ticket && (
                <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    <div>Order: <Tag color="blue">{ticket.order?.orderCode || '-'}</Tag></div>
                    <div className="mt-1">
                        Order total: <span className="font-semibold">{currency} ${orderTotal.toFixed(2)}</span>
                    </div>
                </div>
            )}

            <Divider className="!my-3" />

            <Radio.Group
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                className="w-full"
            >
                <Space direction="vertical" className="w-full">
                    <Radio value="REPRODUCE">
                        <ReloadOutlined className="text-blue-500" /> <strong>Reproduce</strong> — remake for the customer (creates a new order with an <code>R</code> suffix, sent to production)
                    </Radio>
                    <Radio value="REFUND">
                        <DollarCircleOutlined className="text-green-600" /> <strong>Refund</strong> — credit the seller&apos;s wallet (full or partial)
                    </Radio>
                    <Radio value="REJECT">
                        <CloseCircleOutlined className="text-red-500" /> <strong>Reject</strong> — decline the request
                    </Radio>
                </Space>
            </Radio.Group>

            {decision === 'REFUND' && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800">
                    <Radio.Group
                        value={refundMode}
                        onChange={(e) => {
                            setRefundMode(e.target.value);
                            if (e.target.value === 'FULL') setAmount(orderTotal);
                        }}
                        optionType="button"
                        buttonStyle="solid"
                        size="small"
                        className="mb-3"
                    >
                        <Radio.Button value="FULL">Full refund</Radio.Button>
                        <Radio.Button value="PARTIAL">Partial refund</Radio.Button>
                    </Radio.Group>

                    {refundMode === 'PARTIAL' && (
                        <div>
                            <InputNumber
                                value={amount ?? undefined}
                                onChange={(v) => setAmount(v)}
                                min={0.01}
                                max={orderTotal}
                                step={0.5}
                                prefix="$"
                                className="w-full"
                                placeholder="Refund amount"
                            />
                            <div className="text-xs text-gray-400 mt-1">Max ${orderTotal.toFixed(2)}</div>
                        </div>
                    )}

                    {refundInvalid && (
                        <Alert
                            className="mt-2"
                            type="error"
                            showIcon
                            message={`Amount must be between $0.01 and $${orderTotal.toFixed(2)}`}
                        />
                    )}
                </div>
            )}

            {decision === 'REPRODUCE' && (
                <Alert
                    className="mt-4"
                    type="info"
                    showIcon
                    message="A new order will be created and pushed straight to production, free of charge."
                />
            )}
        </Modal>
    );
}
