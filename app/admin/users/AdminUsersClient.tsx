'use client';

import React, { useState } from 'react';
import { Table, Button, Space, Modal, notification, DatePicker, Form, Input, App } from 'antd';
import { SearchOutlined, StopOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';

interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
    balance: number;
    createdAt: string;
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BANNED';
    isBanned: boolean;
    suspendedUntil: string | null;
}

interface AdminUsersClientProps {
    initialUsers: User[];
}

export default function AdminUsersClient({ initialUsers }: AdminUsersClientProps) {
    const { message } = App.useApp();
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [suspendModalOpen, setSuspendModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const [suspendForm] = Form.useForm();

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setUsers(data);
        } catch (error) {
            notification.error({ message: 'Error loading users' });
        } finally {
            setLoading(false);
        }
    };

    const openSuspendModal = (user: User) => {
        setSelectedUser(user);
        suspendForm.setFieldsValue({
            suspendedUntil: dayjs().add(1, 'day'),
            reason: ''
        });
        setSuspendModalOpen(true);
    };

    const handleSuspend = async () => {
        if (!selectedUser) return;

        try {
            const values = await suspendForm.validateFields();
            setActionLoading(true);

            const res = await fetch('/api/admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedUser.id,
                    action: 'SUSPEND',
                    suspendedUntil: (values.suspendedUntil as Dayjs).toISOString(),
                    reason: values.reason || null
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to suspend user');
            }

            message.success(data.message || 'User suspended successfully');
            setSuspendModalOpen(false);
            setSelectedUser(null);
            suspendForm.resetFields();
            await fetchUsers();
        } catch (error: any) {
            if (error?.errorFields) return;
            message.error(error.message || 'Failed to suspend user');
        } finally {
            setActionLoading(false);
        }
    };

    const handleBan = (user: User) => {
        Modal.confirm({
            title: 'Ban User?',
            content: `This will permanently ban ${user.email}.`,
            okText: 'Ban',
            okType: 'danger',
            onOk: async () => {
                try {
                    setActionLoading(true);
                    const res = await fetch('/api/admin/users', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: user.id,
                            action: 'BAN'
                        })
                    });

                    const data = await res.json();
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to ban user');
                    }

                    message.success(data.message || 'User banned successfully');
                    await fetchUsers();
                } catch (error: any) {
                    message.error(error.message || 'Failed to ban user');
                } finally {
                    setActionLoading(false);
                }
            }
        });
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchText.toLowerCase()) ||
        (user.name && user.name.toLowerCase().includes(searchText.toLowerCase()))
    );

    const columns = [
        {
            title: 'EMAIL',
            dataIndex: 'email',
            key: 'email',
            render: (email: string) => <span className="font-medium text-zinc-700 dark:text-zinc-300">{email}</span>
        },
        {
            title: 'NAME',
            dataIndex: 'name',
            key: 'name',
            render: (name: string | null) => <span className="text-zinc-600 dark:text-zinc-400">{name || '-'}</span>,
        },
        {
            title: 'BALANCE',
            dataIndex: 'balance',
            key: 'balance',
            render: (balance: number) => <span className="font-bold text-emerald-600 dark:text-emerald-400">${balance.toFixed(2)}</span>,
        },
        {
            title: 'ROLE',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${role === 'ADMIN'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                    }`}>
                    {role}
                </span>
            ),
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            render: (status: User['status'], record: User) => {
                if (status === 'BANNED') {
                    return <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-red-100 text-red-700 border-red-200">BANNED</span>;
                }

                if (status === 'SUSPENDED') {
                    return (
                        <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200 w-fit">
                                SUSPENDED
                            </span>
                            {record.suspendedUntil && (
                                <span className="text-[11px] text-zinc-500 mt-1">
                                    Until {dayjs(record.suspendedUntil).format('DD/MM/YYYY HH:mm')}
                                </span>
                            )}
                        </div>
                    );
                }

                return <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-emerald-100 text-emerald-700 border-emerald-200">ACTIVE</span>;
            }
        },
        {
            title: 'ACTIONS',
            key: 'actions',
            render: (_: any, record: User) => (
                <Space>
                    <Button
                        size="small"
                        icon={<StopOutlined />}
                        onClick={() => openSuspendModal(record)}
                        disabled={record.isBanned}
                        className="text-amber-600 border-amber-200 hover:text-amber-700 hover:border-amber-300 dark:text-amber-400 dark:border-amber-500/30 dark:hover:bg-amber-900/20 bg-transparent"
                    >
                        {record.status === 'SUSPENDED' ? 'Resuspend' : 'Suspend'}
                    </Button>
                    <Button
                        size="small"
                        danger
                        onClick={() => handleBan(record)}
                        disabled={record.isBanned}
                        className="bg-transparent"
                    >
                        {record.isBanned ? 'Banned' : 'Ban'}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-pink-500 to-rose-500 dark:from-pink-400 dark:to-rose-400 bg-clip-text text-transparent">User Management</h2>

            <div className="mb-6 flex justify-between items-center">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/50 dark:bg-black/20 border border-zinc-200 dark:border-zinc-700 w-[300px] focus-within:ring-2 focus-within:ring-pink-500/20 transition-all">
                    <SearchOutlined className="text-zinc-400" />
                    <input
                        className="bg-transparent border-none outline-none text-sm text-zinc-700 dark:text-zinc-200 w-full placeholder:text-zinc-400"
                        placeholder="Search by email or name..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                    />
                </div>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden p-1">
                <Table
                    dataSource={filteredUsers}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    className="glass-table"
                />
            </div>

            <Modal
                title={selectedUser ? `Suspend ${selectedUser.email}` : 'Suspend User'}
                open={suspendModalOpen}
                onCancel={() => {
                    setSuspendModalOpen(false);
                    setSelectedUser(null);
                    suspendForm.resetFields();
                }}
                onOk={handleSuspend}
                confirmLoading={actionLoading}
                okText="Suspend"
            >
                <Form form={suspendForm} layout="vertical">
                    <Form.Item
                        name="suspendedUntil"
                        label="Suspend Until"
                        rules={[
                            { required: true, message: 'Please select a suspend end time.' },
                            {
                                validator: (_, value: Dayjs | undefined) => {
                                    if (!value || value.isAfter(dayjs())) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error('Suspend time must be in the future.'));
                                }
                            }
                        ]}
                    >
                        <DatePicker showTime format="DD/MM/YYYY HH:mm" className="w-full" />
                    </Form.Item>
                    <Form.Item name="reason" label="Reason (Optional)">
                        <Input.TextArea rows={3} placeholder="Internal note for this suspension" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
