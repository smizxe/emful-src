'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { Form, Input, Button, Checkbox, App } from 'antd';
import { UserOutlined, LockOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { useTheme } from '@/components/Providers/ThemeContext';
import { useUser } from '@/components/Providers/UserContext';
import LanguageToggle from '@/components/Shared/LanguageToggle';

const ROLE_HOME: Record<string, string> = {
    ADMIN: '/admin',
    STAFF: '/staff/dashboard',
    DESIGNER: '/designer',
};

const ROLE_PREFIX: Record<string, string> = {
    ADMIN: '/admin',
    STAFF: '/staff',
    DESIGNER: '/designer',
};

/**
 * The middleware appends `?next=<path>` when it bounces a guest off a protected page
 * (e.g. the catalog "Load more" link on the homepage). Only same-origin paths inside
 * the area the role is allowed to visit are honoured; anything else falls back home.
 */
function resolveDestination(role: string | undefined, next: string | null) {
    const home = ROLE_HOME[role || ''] || '/dashboard';
    const prefix = ROLE_PREFIX[role || ''] || '/dashboard';

    if (!next || !next.startsWith('/') || next.startsWith('//')) return home;
    return next.startsWith(prefix) ? next : home;
}

function LoginForm() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { message } = App.useApp();
    const { t } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const { refreshUser } = useUser();

    useEffect(() => {
        const authError = sessionStorage.getItem('auth_error');
        if (authError) {
            message.error(authError);
            sessionStorage.removeItem('auth_error');
        }
    }, [message]);

    const onFinish = async (values: any) => {
        setLoading(true);
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                message.success('Login successful!');

                // Refresh user context to update TopBar immediately
                await refreshUser();

                router.push(resolveDestination(data.user?.role, searchParams.get('next')));
            } else {
                message.error(data.error || 'Login failed');
            }
        } catch (error) {
            message.error('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50/50 to-sky-100/50 dark:from-slate-900 dark:to-slate-800 relative">
            {/* Toggles */}
            <div className="absolute top-4 right-4 flex items-center gap-4 z-50">
                <LanguageToggle />
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
                    title={t.theme.toggleTheme}
                >
                    {theme === 'dark' ? <SunOutlined className="text-amber-400 text-lg" /> : <MoonOutlined className="text-indigo-600 text-lg" />}
                </button>
            </div>

            {/* Background Orbs */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl animate-blob" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-500/20 rounded-full blur-3xl animate-blob animation-delay-2000" />
            </div>

            <div className="glass-panel w-full max-w-md shadow-2xl rounded-2xl p-8 relative z-10 mx-4">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent mb-2">
                        {t.auth.welcomeBack}
                    </h1>
                    <p className="text-zinc-500 dark:text-zinc-400">
                        {t.auth.signInToContinue}
                    </p>
                </div>

                <Form
                    name="normal_login"
                    className="login-form"
                    initialValues={{ remember: true }}
                    onFinish={onFinish}
                    size="large"
                    layout="vertical"
                >
                    <Form.Item
                        name="email"
                        rules={[{ required: true, message: 'Please input your Email!' }]}
                    >
                        <Input
                            prefix={<UserOutlined className="text-zinc-400" />}
                            placeholder={t.auth.email}
                            className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500 focus:border-indigo-500 hover:bg-white/80 dark:hover:bg-black/40 transition-all"
                        />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: 'Please input your Password!' }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined className="text-zinc-400" />}
                            placeholder={t.auth.password}
                            className="bg-white/50 dark:bg-black/20 border-zinc-200 dark:border-zinc-700 hover:border-indigo-500 focus:border-indigo-500 hover:bg-white/80 dark:hover:bg-black/40 transition-all"
                        />
                    </Form.Item>

                    <div className="flex justify-between items-center mb-6">
                        <Form.Item name="remember" valuePropName="checked" noStyle>
                            <Checkbox className="text-zinc-600 dark:text-zinc-400">{t.auth.rememberMe}</Checkbox>
                        </Form.Item>

                        <a className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium text-sm transition-colors" href="">
                            {t.auth.forgotPassword}
                        </a>
                    </div>

                    <Form.Item className="mb-4">
                        <Button
                            type="primary"
                            htmlType="submit"
                            className="w-full bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 border-none shadow-lg shadow-indigo-500/20 h-10 font-semibold rounded-xl"
                            loading={loading}
                        >
                            {t.auth.login}
                        </Button>
                    </Form.Item>

                    <div className="text-center text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">{t.auth.noAccount} </span>
                        <Link href="/register" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium transition-colors">
                            {t.auth.register}
                        </Link>
                    </div>
                </Form>
            </div >
        </div >
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-indigo-50/50 to-sky-100/50 dark:from-slate-900 dark:to-slate-800" />}>
            <LoginForm />
        </Suspense>
    );
}
