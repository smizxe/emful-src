'use client';

import React, { useState } from 'react';
import { Table, Tag, Space, Button, Popconfirm, message } from 'antd';
import { MessageOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import CreateTicketModal from './CreateTicketModal';

interface Ticket {
    id: string;
    subject: string | null;
    description: string | null;
    status: string;
    createdAt: string;
    adminReply?: string;
    imageUrl?: string | null;
    order?: { orderCode: string } | null;
    refundAmount?: number | null;
}

import { useLanguage } from '@/components/Providers/LanguageContext';

interface UserTicketsClientProps {
    initialTickets: Ticket[];
}

export default function UserTicketsClient({ initialTickets }: UserTicketsClientProps) {
    const { t } = useLanguage();
    const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
    const [loading, setLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const router = useRouter();

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/tickets');
            if (res.ok) {
                const data = await res.json();
                setTickets(data);
            }
        } catch (error) {
            console.error('Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/api/tickets/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                message.success(t.ticketsPage.deletedSuccess);
                fetchTickets();
            } else {
                const data = await res.json();
                message.error(data.error || t.ticketsPage.deleteFailed);
            }
        } catch (error) {
            message.error(t.ticketsPage.deleteFailed);
        }
    };

    const columns = [
        {
            title: t.ticketsPage.date,
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (d: string) => new Date(d).toLocaleDateString()
        },
        {
            title: t.ticketsPage.order,
            dataIndex: ['order', 'orderCode'],
            key: 'order',
            render: (text: string) => text || t.ticketsPage.na
        },
        {
            title: t.ticketsPage.subject,
            dataIndex: 'subject',
            key: 'subject',
            render: (text: string) => <span className="font-medium">{text}</span>
        },
        {
            title: t.ticketsPage.status,
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
            title: t.ticketsPage.amount,
            key: 'amount',
            render: (_: any, record: Ticket) => (
                typeof record.refundAmount === 'number'
                    ? <span className="font-semibold text-emerald-600">${record.refundAmount.toFixed(2)}</span>
                    : <span className="text-zinc-400">{t.ticketsPage.na}</span>
            )
        },
        {
            title: t.ticketsPage.action,
            key: 'action',
            render: (_: any, record: Ticket) => (
                <Space>
                    <Button
                        icon={<MessageOutlined />}
                        onClick={() => router.push(`/dashboard/tickets/${record.id}`)}
                    >
                        {t.ticketsPage.view}
                    </Button>
                    {record.status === 'PENDING' && (
                        <Popconfirm
                            title={t.ticketsPage.deleteConfirm}
                            description={t.ticketsPage.deleteDesc}
                            onConfirm={() => handleDelete(record.id)}
                            okText={t.ticketsPage.yes}
                            cancelText={t.ticketsPage.no}
                        >
                            <Button danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">{t.ticketsPage.title}</h1>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    className="bg-blue-600"
                    onClick={() => setShowCreateModal(true)}
                >
                    {t.ticketsPage.createTicket}
                </Button>
            </div>

            <div className="glass-panel rounded-2xl p-4">
                <Table
                    dataSource={tickets}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    className="glass-table"
                />
            </div>

            <CreateTicketModal
                visible={showCreateModal}
                onCancel={() => setShowCreateModal(false)}
                onSuccess={() => {
                    setShowCreateModal(false);
                    fetchTickets();
                }}
            />
        </div>
    );
}
