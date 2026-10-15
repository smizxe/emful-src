'use client';

import React, { useState } from 'react';
import { Table, Card, Button, InputNumber, message, Space, Tag } from 'antd';
import { DollarOutlined, UserOutlined } from '@ant-design/icons';
import { useLanguage } from '@/components/Providers/LanguageContext';

interface User {
    id: string;
    email: string;
    name: string | null;
    balance: number;
    role: string;
    createdAt: string;
}

interface AdminDashboardClientProps {
    users: User[];
}

export default function AdminDashboardClient({ users: initialUsers }: AdminDashboardClientProps) {
    const [users, setUsers] = useState(initialUsers);
    const [addingBalance, setAddingBalance] = useState<{ [key: string]: number }>({});
    const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
    const { t } = useLanguage();

    const handleAddBalance = async (userId: string) => {
        const amount = addingBalance[userId];

        if (!amount || amount <= 0) {
            message.error('Please enter a valid amount');
            return;
        }

        setLoading({ ...loading, [userId]: true });

        try {
            const response = await fetch('/api/admin/add-balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, amount })
            });

            if (response.ok) {
                const data = await response.json();
                message.success(`Added $${amount} to user balance`);

                // Update local state
                setUsers(users.map(u =>
                    u.id === userId ? { ...u, balance: data.newBalance } : u
                ));

                // Clear input
                setAddingBalance({ ...addingBalance, [userId]: 0 });
            } else {
                const error = await response.json();
                message.error(error.error || 'Failed to add balance');
            }
        } catch (error) {
            message.error('Network error');
        } finally {
            setLoading({ ...loading, [userId]: false });
        }
    };

    const columns = [
        {
            title: 'User',
            dataIndex: 'email',
            key: 'email',
            render: (text: string, record: User) => (
                <div>
                    <div><UserOutlined /> {text}</div>
                    {record.name && <div className="text-sm text-gray-500">{record.name}</div>}
                </div>
            ),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <Tag color={role === 'ADMIN' ? 'red' : 'blue'}>{role}</Tag>
            ),
        },
        {
            title: 'Current Balance',
            dataIndex: 'balance',
            key: 'balance',
            render: (balance: number) => <span>${balance.toFixed(2)}</span>,
        },
        {
            title: 'Add Balance',
            key: 'action',
            render: (_: any, record: User) => (
                <Space>
                    <InputNumber
                        min={0}
                        step={10}
                        prefix={<DollarOutlined />}
                        placeholder="Amount"
                        value={addingBalance[record.id] || 0}
                        onChange={(value) => setAddingBalance({ ...addingBalance, [record.id]: value || 0 })}
                        style={{ width: 150 }}
                    />
                    <Button
                        type="primary"
                        onClick={() => handleAddBalance(record.id)}
                        loading={loading[record.id]}
                    >
                        Add
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">{t.nav.overview}</h2>

            <Card title={t.common.userManagement} variant="borderless" className="shadow-sm">
                <Table
                    dataSource={users}
                    columns={columns}
                    rowKey="id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
}
