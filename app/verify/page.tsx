
'use client';

import React, { useState, Suspense, useEffect } from 'react';
import { Form, Input, Button, message, Typography } from 'antd';
import { SafetyCertificateOutlined, MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

const { Title, Text } = Typography;

function VerifyContent() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const emailFromQuery = searchParams.get('email') || '';

    // Auto-fill code if present in URL (e.g. from email link)
    const codeFromQuery = searchParams.get('code') || '';

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...values, email: values.email || emailFromQuery }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                message.success({ content: 'Verification successful! Redirecting...', duration: 2 });
                setTimeout(() => router.push('/login'), 1500);
            } else {
                message.error(data.error || 'Verification failed. Please check your code.');
            }
        } catch (error) {
            message.error('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md"
        >
            <div className="backdrop-blur-xl bg-white/70 dark:bg-black/40 p-8 rounded-3xl shadow-2xl border border-white/20 dark:border-zinc-700/50 relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-blue-500/30 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl pointer-events-none"></div>

                <div className="text-center mb-8 relative z-10">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg transform rotate-3 hover:rotate-6 transition-all duration-300">
                        <SafetyCertificateOutlined className="text-3xl text-white" />
                    </div>
                    <Title level={2} className="!mb-2 dark:!text-white !text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                        Verify Account
                    </Title>
                    <Text className="text-gray-500 dark:text-gray-400">
                        Please enter the verification code sent to <br />
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{emailFromQuery || 'your email'}</span>
                    </Text>
                </div>

                <Form
                    name="verify"
                    className="verify-form relative z-10"
                    onFinish={onFinish}
                    size="large"
                    layout="vertical"
                    initialValues={{ email: emailFromQuery, code: codeFromQuery }}
                >
                    <Form.Item
                        name="email"
                        rules={[
                            { required: true, message: 'Please input your Email!' },
                            { type: 'email', message: 'Invalid email format' }
                        ]}
                    >
                        <Input
                            prefix={<MailOutlined className="text-gray-400" />}
                            placeholder="Email Address"
                            disabled={!!emailFromQuery}
                            className="!rounded-xl !bg-white/50 dark:!bg-black/20 !border-gray-200 dark:!border-zinc-700 hover:!border-blue-400 focus:!border-blue-500 !h-12 dark:!text-white"
                        />
                    </Form.Item>

                    <Form.Item
                        name="code"
                        rules={[
                            { required: true, message: 'Enter the 6-digit code' },
                            { len: 6, message: 'Code must be exactly 6 digits' }
                        ]}
                    >
                        <Input
                            prefix={<SafetyCertificateOutlined className="text-gray-400" />}
                            placeholder="6-digit Code"
                            maxLength={6}
                            className="!rounded-xl !bg-white/50 dark:!bg-black/20 !border-gray-200 dark:!border-zinc-700 hover:!border-blue-400 focus:!border-blue-500 !h-12 tracking-widest font-mono text-center text-lg dark:!text-white"
                        />
                    </Form.Item>

                    <Form.Item className="mb-4">
                        <Button
                            type="primary"
                            htmlType="submit"
                            className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 border-0 hover:!opacity-90 shadow-lg shadow-blue-500/30 text-base font-semibold transition-all hover:scale-[1.02] active:scale-95"
                            loading={loading}
                        >
                            {loading ? 'Verifying...' : 'Verify Now'}
                        </Button>
                    </Form.Item>

                    <div className="text-center">
                        <Link href="/login" className="text-sm text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-1">
                            <ArrowLeftOutlined /> Back to Login
                        </Link>
                    </div>
                </Form>
            </div>

            <div className="mt-8 text-center text-gray-400 text-xs">
                &copy; {new Date().getFullYear()} Egfulfill. All rights reserved.
            </div>
        </motion.div>
    );
}

export default function VerifyPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-[#f3f4f6] dark:bg-[#0a0a0a] relative overflow-hidden p-4">
            {/* Ambient Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-50/50 via-gray-50/50 to-indigo-50/50 dark:from-black dark:via-zinc-900 dark:to-black"></div>
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="relative z-10 w-full flex justify-center">
                <Suspense fallback={<div className="text-blue-500">Loading...</div>}>
                    <VerifyContent />
                </Suspense>
            </div>
        </div>
    );
}
