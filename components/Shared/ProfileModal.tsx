'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, message } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, LoadingOutlined } from '@ant-design/icons';
import { useLanguage } from '@/components/Providers/LanguageContext';

interface User {
    name?: string | null;
    email?: string | null;
}

interface ProfileModalProps {
    open: boolean;
    onCancel: () => void;
    onSuccess: (updatedUser: any) => void;
    user: User | null;
}

export default function ProfileModal({ open, onCancel, onSuccess, user }: ProfileModalProps) {
    const { t } = useLanguage();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && user) {
            form.setFieldsValue({
                name: user.name,
                email: user.email,
                newPassword: '',
                confirmPassword: '',
            });
        }
    }, [open, user, form]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: values.name,
                    email: values.email,
                    password: values.newPassword
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || t.profile.fail);
            }

            message.success(t.profile.success);
            onSuccess(data.user);
            onCancel();
        } catch (error: any) {
            message.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={t.profile.title}
            open={open}
            onCancel={onCancel}
            onOk={handleSubmit}
            confirmLoading={loading}
            okText={t.profile.saveChanges}
            width={500}
        >
            <Form
                form={form}
                layout="vertical"
            >
                <div className="text-sm text-gray-500 mb-4 bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-100 dark:border-blue-800/30">
                    {t.profile.info}
                </div>

                <Form.Item
                    name="name"
                    label={t.profile.fullName}
                    rules={[{ required: true, message: t.profile.nameRequired }]}
                >
                    <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="Your Name" />
                </Form.Item>

                <Form.Item
                    name="email"
                    label={t.profile.email}
                    rules={[
                        { required: true, message: t.profile.emailRequired },
                        { type: 'email', message: t.profile.emailInvalid }
                    ]}
                >
                    <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="name@example.com" />
                </Form.Item>

                <div className="border-t border-gray-100 dark:border-gray-800 my-4 pt-4">
                    <h4 className="text-sm font-semibold mb-3">{t.profile.changePassword}</h4>
                    <Form.Item
                        name="newPassword"
                        label={t.profile.newPassword}
                        rules={[{ min: 6, message: t.profile.passwordMin }]}
                    >
                        <Input.Password prefix={<LockOutlined className="text-gray-400" />} placeholder={t.profile.newPasswordPlaceholder} />
                    </Form.Item>

                    <Form.Item
                        name="confirmPassword"
                        label={t.profile.confirmPassword}
                        dependencies={['newPassword']}
                        rules={[
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue('newPassword') === value) {
                                        return Promise.resolve();
                                    }
                                    if (!getFieldValue('newPassword') && !value) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error(t.profile.matchError));
                                },
                            }),
                        ]}
                    >
                        <Input.Password prefix={<LockOutlined className="text-gray-400" />} placeholder={t.profile.confirmPasswordPlaceholder} />
                    </Form.Item>
                </div>
            </Form>
        </Modal>
    );
}
