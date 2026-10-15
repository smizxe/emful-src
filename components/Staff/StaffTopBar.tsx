'use client';

import React from 'react';
import { Avatar, Dropdown, MenuProps, Button } from 'antd';
import { UserOutlined, LogoutOutlined, MenuOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useUser } from '@/components/Providers/UserContext';
import LanguageToggle from '@/components/Shared/LanguageToggle';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { useTheme } from '@/components/Providers/ThemeContext';

interface StaffTopBarProps {
    collapsed: boolean;
    onMobileMenuClick?: () => void;
}

export default function StaffTopBar({ collapsed, onMobileMenuClick }: StaffTopBarProps) {
    const { user, logout } = useUser();
    const { t } = useLanguage();
    const { theme, toggleTheme } = useTheme();

    const userMenu: MenuProps['items'] = [
        {
            key: 'logout',
            label: t.auth.logout,
            icon: <LogoutOutlined />,
            danger: true,
            onClick: logout,
        },
    ];

    return (
        <header className="sticky top-0 z-40 h-16 w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-gray-200 dark:border-white/10 flex items-center justify-between px-4 md:px-6">
            {/* Left Area: Hamburger Menu */}
            <div className="flex items-center">
                <Button
                    type="text"
                    icon={<MenuOutlined />}
                    onClick={onMobileMenuClick}
                    className="md:hidden text-gray-600 dark:text-zinc-300"
                />
            </div>

            {/* Right Area: Actions */}
            <div className="flex items-center gap-4">
                <LanguageToggle />
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
                    title={t.theme.toggleTheme}
                >
                    {theme === 'dark' ? <SunOutlined className="text-amber-400" /> : <MoonOutlined className="text-indigo-600" />}
                </button>
                {/* User Profile */}
                <Dropdown menu={{ items: userMenu }} trigger={['click']}>
                    <div className="flex items-center gap-3 cursor-pointer pl-2 py-1 transition-opacity hover:opacity-80">
                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
                                {user?.name || 'Staff Member'}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 capitalize">
                                {user?.role?.toLowerCase() || 'Staff'}
                            </div>
                        </div>
                        <div className="relative">
                            <Avatar
                                size="large"
                                icon={<UserOutlined />}
                                className="bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md shadow-blue-500/20"
                            />
                        </div>
                    </div>
                </Dropdown>
            </div>
        </header>
    );
}

