
'use client';

import React, { useState } from 'react';
import { Table, Button, Modal, Form, Input, message, Tag, Space, Card, Select, Switch } from 'antd';
import { UserAddOutlined, HistoryOutlined, EditOutlined } from '@ant-design/icons';

interface StaffUser {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    roles?: string[];
    isActive: boolean;
    createdAt: string;
    _count: {
        assignedJobs: number;
    };
}

interface JobHistory {
    id: string;
    jobCode: string;
    sku: string;
    status: string;
    updatedAt: string;
}

interface StaffManagementClientProps {
    initialStaff: StaffUser[];
}

const ROLE_OPTIONS = [
    { label: 'Staff', value: 'STAFF' },
    { label: 'Designer', value: 'DESIGNER' },
];

/** Every role the account holds, primary first. Older rows only have `role`. */
function rolesOf(user: { role: string; roles?: string[] }): string[] {
    const all = [user.role, ...(user.roles || [])].filter(Boolean);
    return Array.from(new Set(all));
}

export default function StaffManagementClient({ initialStaff }: StaffManagementClientProps) {
    const [staff, setStaff] = useState<StaffUser[]>(initialStaff);
    const [loading, setLoading] = useState(false);

    // Create Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form] = Form.useForm();

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editForm] = Form.useForm();
    const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);

    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
    const [jobHistory, setJobHistory] = useState<JobHistory[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/staff');
            const data = await res.json();
            if (Array.isArray(data)) {
                setStaff(data);
            } else {
                message.error('Failed to load staff list');
            }
        } catch (error) {
            message.error('Error fetching staff');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (values: any) => {
        try {
            const res = await fetch('/api/admin/staff', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, roles: values.roles?.length ? values.roles : ['STAFF'] }),
            });
            const data = await res.json();
            if (res.ok) {
                message.success('Account created');
                setIsModalOpen(false);
                form.resetFields();
                fetchStaff();
            } else {
                message.error(data.error || 'Failed to create staff');
            }
        } catch (error) {
            message.error('Error creating staff');
        }
    };

    /** Switching an account off locks it out of its portal straight away. */
    const toggleActive = async (record: StaffUser, next: boolean) => {
        try {
            const res = await fetch('/api/admin/staff/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: record.id, isActive: next }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update account');
            message.success(next ? 'Account enabled' : 'Account disabled');
            fetchStaff();
        } catch (error: any) {
            message.error(error.message || 'Failed to update account');
        }
    };

    const handleEdit = (record: StaffUser) => {
        setEditingStaff(record);
        editForm.setFieldsValue({
            name: record.name,
            email: record.email,
            roles: rolesOf(record),
        });
        setEditModalOpen(true);
    };

    const handleUpdate = async (values: any) => {
        if (!editingStaff) return;
        try {
            const res = await fetch('/api/admin/staff/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, id: editingStaff.id }),
            });
            const data = await res.json();
            if (res.ok) {
                message.success('Account updated');
                setEditModalOpen(false);
                editForm.resetFields();
                setEditingStaff(null);
                fetchStaff();
            } else {
                message.error(data.error || 'Failed to update staff');
            }
        } catch (error) {
            message.error('Error updating staff');
        }
    };

    const viewHistory = async (record: StaffUser) => {
        setSelectedStaff(record);
        setHistoryModalOpen(true);
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/admin/staff/${record.id}/jobs`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setJobHistory(data);
            }
        } catch (error) {
            message.error('Error fetching history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => text || <span className="text-gray-400">N/A</span>
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Created At',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (text: string) => new Date(text).toLocaleDateString(),
        },
        {
            title: 'Role',
            key: 'role',
            render: (_: any, record: StaffUser) => (
                <Space size={4} wrap>
                    {rolesOf(record).map((role) => (
                        <Tag key={role} color={role === 'DESIGNER' ? 'purple' : 'geekblue'}>
                            {role === 'DESIGNER' ? 'Designer' : 'Staff'}
                        </Tag>
                    ))}
                </Space>
            ),
        },
        {
            title: 'Jobs Processed',
            dataIndex: ['_count', 'assignedJobs'],
            key: 'jobs',
            // Designers never get production jobs assigned, so the count is noise.
            render: (count: number, record: StaffUser) =>
                rolesOf(record).includes('STAFF')
                    ? <Tag color="blue">{count} Jobs</Tag>
                    : <span className="text-gray-400">-</span>,
        },
        {
            title: 'Active',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (value: boolean, record: StaffUser) => (
                <Switch size="small" checked={value} onChange={(next) => toggleActive(record, next)} />
            ),
        },
        {
            title: 'Action',
            key: 'action',
            render: (_: any, record: StaffUser) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Edit
                    </Button>
                    {rolesOf(record).includes('STAFF') && (
                        <Button
                            icon={<HistoryOutlined />}
                            onClick={() => viewHistory(record)}
                        >
                            History
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    const historyColumns = [
        { title: 'Job Code', dataIndex: 'jobCode', key: 'jobCode' },
        { title: 'SKU', dataIndex: 'sku', key: 'sku' },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <Tag color={status === 'COMPLETED' ? 'green' : 'orange'}>{status}</Tag>
            )
        },
        {
            title: 'Last Updated',
            dataIndex: 'updatedAt',
            key: 'updatedAt',
            render: (text: string) => new Date(text).toLocaleString()
        }
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Staff &amp; Designers</h1>
                <Button
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={() => setIsModalOpen(true)}
                >
                    Add Account
                </Button>
            </div>

            <Card className="shadow-sm">
                <Table
                    dataSource={staff}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                />
            </Card>

            {/* Create Modal */}
            <Modal
                title="Create Account"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Form form={form} onFinish={handleCreate} layout="vertical" initialValues={{ roles: ['STAFF'] }}>
                    <Form.Item
                        name="roles"
                        label="Role"
                        rules={[{ required: true, message: 'Pick at least one role' }]}
                        help="Pick both if the same person works production and designs. The first one picked is where they land after login."
                    >
                        <Select mode="multiple" allowClear options={ROLE_OPTIONS} placeholder="Staff, Designer..." />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Please enter a name' }]}
                        className="mt-6"
                    >
                        <Input placeholder="Enter full name" />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ required: true, type: 'email' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, min: 6 }]}
                    >
                        <Input.Password />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>
                        Create Account
                    </Button>
                </Form>
            </Modal>

            {/* Edit Modal */}
            <Modal
                title={editingStaff?.role === 'DESIGNER' ? 'Edit Designer' : 'Edit Staff'}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                footer={null}
            >
                <Form form={editForm} onFinish={handleUpdate} layout="vertical">
                    <Form.Item
                        name="roles"
                        label="Role"
                        rules={[{ required: true, message: 'Pick at least one role' }]}
                        help="Role changes reach them within a minute, without signing out."
                    >
                        <Select mode="multiple" allowClear options={ROLE_OPTIONS} />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Please enter a name' }]}
                        className="mt-6"
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ required: true, type: 'email' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="New Password"
                        help="Leave blank to keep current password"
                    >
                        <Input.Password placeholder="Enter new password to change" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block>
                        Save Changes
                    </Button>
                </Form>
            </Modal>

            <Modal
                title={`Job History: ${selectedStaff?.email}`}
                open={historyModalOpen}
                onCancel={() => setHistoryModalOpen(false)}
                footer={null}
                width={800}
            >
                <Table
                    dataSource={jobHistory}
                    columns={historyColumns}
                    rowKey="id"
                    loading={historyLoading}
                    pagination={{ pageSize: 5 }}
                />
            </Modal>
        </div>
    );
}
