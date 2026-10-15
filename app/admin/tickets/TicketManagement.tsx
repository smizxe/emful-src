'use client';

import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, message, Image, Radio } from 'antd';
import { EyeOutlined, WarningOutlined, ToolOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import ResolveTicketModal from './ResolveTicketModal';
import { useLanguage } from '@/components/Providers/LanguageContext';

interface Ticket {
    id: string;
    subject: string;
    description: string;
    imageUrl?: string;
    status: string;
    createdAt: string;
    user: { email: string };
    order?: { orderCode: string; totalAmount?: number; currency?: string; status?: string };
    orderId?: string;
    refundAmount?: number | null;
}

type Decision = 'REPRODUCE' | 'REFUND' | 'REJECT';

export default function TicketManagement({ basePath = '/admin' }: { basePath?: string }) {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
    // Default to ALL so nothing is hidden when the page is opened.
    const [filterStatus, setFilterStatus] = useState<string>('ALL');

    // Resolve modal state (admin/staff chooses Reproduce / Refund / Reject)
    const [resolveModalVisible, setResolveModalVisible] = useState(false);

    const router = useRouter();
    const { t } = useLanguage();

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/tickets?status=${filterStatus}`);
            const data = await res.json();
            if (res.ok && Array.isArray(data)) {
                setTickets(data);
            } else {
                setTickets([]);
            }
        } catch (error) {
            message.error('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTickets();
    }, [filterStatus]);

    const handleView = (ticket: Ticket) => {
        router.push(`${basePath}/tickets/${ticket.id}`);
    };

    // General "resolve"/"reject" for support tickets (no amount / order handling).
    const handleSimpleResolve = async (ticketId: string, decision: 'APPROVE' | 'REJECT') => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/tickets/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, decision })
            });
            const data = await res.json();

            if (res.ok) {
                message.success(`Ticket ${decision.toLowerCase()} successful`);
                setTickets(prev => prev.filter(t => t.id !== ticketId));
            } else {
                message.error(data.error || 'Failed to resolve ticket');
            }
        } catch (error) {
            console.error(error);
            message.error('Error resolving ticket');
        } finally {
            setLoading(false);
        }
    };

    const openResolveModal = (ticket: Ticket) => {
        setSelectedTicket(ticket);
        setResolveModalVisible(true);
    };

    // Admin picks the outcome for an order-issue ticket in the modal.
    const handleResolveDecision = async (decision: Decision, amount?: number) => {
        if (!selectedTicket) return;
        const ticketId = selectedTicket.id;
        try {
            setLoading(true);
            const res = await fetch('/api/admin/tickets/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketId, decision, amount })
            });
            const data = await res.json();

            if (res.ok) {
                if (decision === 'REPRODUCE' && data.reproducedOrderCode) {
                    message.success(`Reproduce order ${data.reproducedOrderCode} created and sent to production`);
                } else if (decision === 'REFUND') {
                    message.success(`Refunded $${Number(data.refundAmount || amount || 0).toFixed(2)} to seller wallet`);
                } else {
                    message.success('Ticket rejected');
                }
                setResolveModalVisible(false);
                setSelectedTicket(null);
                setTickets(prev => prev.filter(t => t.id !== ticketId));
            } else {
                message.error(data.error || 'Failed to resolve ticket');
            }
        } catch (error) {
            console.error(error);
            message.error('Error resolving ticket');
        } finally {
            setLoading(false);
        }
    };

    // Helper to render Actions
    const renderActions = (record: Ticket) => {
        // Order-issue tickets: admin decides the outcome (reproduce / refund / reject).
        if (record.orderId) {
            return (
                <div className="flex gap-2">
                    <Button size="small" onClick={() => handleView(record)} icon={<EyeOutlined />}>
                        View
                    </Button>
                    {record.status === 'PENDING' && (
                        <Button
                            type="primary"
                            size="small"
                            icon={<ToolOutlined />}
                            className="bg-blue-600 hover:bg-blue-500"
                            onClick={() => openResolveModal(record)}
                        >
                            Resolve
                        </Button>
                    )}
                </div>
            );
        }

        // Generic / Support Ticket Actions
        return (
            <div className="flex gap-2">
                <Button size="small" onClick={() => handleView(record)} icon={<EyeOutlined />}>
                    View
                </Button>
                {record.status === 'PENDING' && (
                    <Button type="primary" size="small" onClick={() => handleSimpleResolve(record.id, 'APPROVE')}>
                        Resolve
                    </Button>
                )}
            </div>
        );
    };

    const columns = [
        {
            title: 'Subject',
            dataIndex: 'subject',
            key: 'subject',
            render: (text: string) => <span className="font-medium">{text}</span>
        },
        {
            title: 'User',
            dataIndex: ['user', 'email'],
            key: 'user',
        },
        {
            title: 'Order Code',
            key: 'order',
            render: (_: any, record: Ticket) => record.order?.orderCode ? <Tag color="blue">{record.order.orderCode}</Tag> : '-'
        },
        {
            title: 'Evidence',
            dataIndex: 'imageUrl',
            key: 'imageUrl',
            render: (url: string) => (
                url ? <Image src={url} width={50} height={50} className="object-cover rounded" /> : 'No Image'
            )
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                let color = 'gold';
                if (status === 'RESOLVED') color = 'green';
                if (status === 'REJECTED') color = 'red';
                return <Tag color={color}>{status}</Tag>;
            }
        },
        {
            title: 'Amount',
            key: 'amount',
            render: (_: any, record: Ticket) => (
                typeof record.refundAmount === 'number'
                    ? <span className="font-semibold text-emerald-600">${record.refundAmount.toFixed(2)}</span>
                    : <span className="text-zinc-400">N/A</span>
            )
        },
        {
            title: 'Actions',
            key: 'action',
            render: (_: any, record: Ticket) => renderActions(record)
        }
    ];

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">{t.ticketsPage.title}</h1>

            <div className="mb-4 flex flex-col md:flex-row justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm">
                <span className="font-semibold text-gray-600 dark:text-gray-300 mb-2 md:mb-0">{t.ticketsPage.filterBy}:</span>
                <Radio.Group
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    buttonStyle="solid"
                >
                    <Radio.Button value="PENDING">{t.status.pending}</Radio.Button>
                    <Radio.Button value="RESOLVED">{t.status.resolved}</Radio.Button>
                    <Radio.Button value="REJECTED">{t.status.rejected}</Radio.Button>
                    <Radio.Button value="ALL">{t.common.all}</Radio.Button>
                </Radio.Group>
            </div>

            {/* Order Issues / Reports */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden p-4">
                <div className="flex items-center gap-2 mb-4 font-semibold text-gray-700 dark:text-gray-200">
                    <WarningOutlined className="text-amber-500" />
                    <span>Order Issues / Reports</span>
                </div>
                <Table
                    dataSource={tickets.filter(t => t.orderId)}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                />
            </div>

            {/* Order-issue resolution modal (Reproduce / Refund / Reject) */}
            <ResolveTicketModal
                visible={resolveModalVisible}
                ticket={selectedTicket}
                loading={loading}
                onCancel={() => { setResolveModalVisible(false); setSelectedTicket(null); }}
                onConfirm={handleResolveDecision}
            />
        </div>
    );
}

