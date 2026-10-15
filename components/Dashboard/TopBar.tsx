'use client';

import React from 'react';
import { Avatar, Dropdown, MenuProps, Switch, Button, Spin } from 'antd';
import { UserOutlined, MoonOutlined, SunOutlined, BellOutlined, SearchOutlined, MenuOutlined, WalletOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/Providers/ThemeContext';
import { useUser } from '@/components/Providers/UserContext';
import ProfileModal from '@/components/Shared/ProfileModal';
import LanguageToggle from '@/components/Shared/LanguageToggle';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import TopUpModal from '@/app/dashboard/components/TopUpModal';

interface TopBarProps {
    collapsed: boolean;
    onMobileMenuClick?: () => void;
}

export default function TopBar({ collapsed, onMobileMenuClick }: TopBarProps) {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useUser();
    const { t } = useLanguage();
    const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);

    // Wallet balance shown in the top bar (replaces the old right-hand sidebar).
    const [balance, setBalance] = React.useState<number | null>(null);
    const [currency, setCurrency] = React.useState('USD');
    const [walletUserId, setWalletUserId] = React.useState<string | null>(null);
    const [topUpOpen, setTopUpOpen] = React.useState(false);

    const fetchWallet = React.useCallback(async () => {
        try {
            const res = await fetch('/api/wallet?summary=true');
            if (res.ok) {
                const data = await res.json();
                setBalance(data.balance);
                setCurrency(data.currency || 'USD');
                setWalletUserId(data.userId);
            }
        } catch (error) {
            console.error('Failed to fetch wallet', error);
        }
    }, []);

    useVisiblePolling(fetchWallet, { intervalMs: 120000 });

    const isSeller = (user?.role || '').toUpperCase() === 'SELLER';

    const userMenu: MenuProps['items'] = [
        {
            key: 'profile',
            label: t.auth.profile,
            icon: <UserOutlined />,
            onClick: () => setIsProfileModalOpen(true),
        },
        {
            key: 'settings',
            label: t.common.settings,
        },
        {
            type: 'divider',
        },
        {
            key: 'logout',
            label: t.auth.logout,
            danger: true,
            onClick: logout,
        },
    ];

    return (
        <>
            <header className={`
                fixed top-0 right-0 z-40 transition-all duration-300 ease-in-out h-16
                glass-panel border-b border-white/10 flex items-center justify-between px-4 md:px-6
                ${collapsed ? 'md:left-20' : 'md:left-64'}
            `}>
                {/* Left Area: Hamburger */}
                <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
                    {/* Mobile Hamburger Menu */}
                    <Button
                        type="text"
                        icon={<MenuOutlined />}
                        onClick={onMobileMenuClick}
                        className="md:hidden text-zinc-600 dark:text-zinc-300"
                    />
                </div>

                {/* Right Area: Actions */}
                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Wallet balance + Top Up (sellers). Kept at the top so it's
                        always visible without a right sidebar squeezing the page. */}
                    {isSeller && (
                        <div className="flex items-center gap-2">
                            <div
                                className="flex items-center gap-2 pl-3 pr-3 h-9 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-500/20"
                                title={t.sellerDashboard?.balance || 'Balance'}
                            >
                                <WalletOutlined className="text-emerald-600 dark:text-emerald-400" />
                                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                                    {balance === null
                                        ? <Spin size="small" />
                                        : `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                                <span className="hidden sm:inline text-[11px] font-medium text-emerald-500/80">{currency}</span>
                            </div>
                            <Button
                                type="primary"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => setTopUpOpen(true)}
                                className="bg-gradient-to-r from-blue-600 to-violet-600 border-none font-semibold h-9 rounded-full"
                            >
                                <span className="hidden sm:inline">{t.sellerDashboard?.topUpBalance || 'Top Up'}</span>
                            </Button>
                        </div>
                    )}

                    <LanguageToggle />
                    {/* Theme Toggle */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors"
                        title={t.theme.toggleTheme}
                    >
                        {theme === 'dark' ? <SunOutlined className="text-amber-400" /> : <MoonOutlined className="text-indigo-600" />}
                    </button>

                    {/* Notifications */}
                    <button className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-zinc-500 dark:text-zinc-400 transition-colors relative">
                        <BellOutlined />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900"></span>
                    </button>

                    {/* User Profile */}
                    <Dropdown menu={{ items: userMenu }} trigger={['click']}>
                        <div className="flex items-center gap-3 cursor-pointer pl-2 py-1 transition-opacity hover:opacity-80">
                            <div className="text-right hidden sm:block">
                                <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 leading-none">
                                    {user?.name || 'User'}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1 capitalize">
                                    {user?.role?.toLowerCase() || 'Member'}
                                </div>
                            </div>
                            <div className="relative">
                                <Avatar
                                    size="large"
                                    icon={<UserOutlined />}
                                    className="bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20"
                                />
                                <div className="absolute inset-0 rounded-full ring-2 ring-white/20 dark:ring-black/20" />
                            </div>
                        </div>
                    </Dropdown>
                </div>
            </header>

            <ProfileModal
                open={isProfileModalOpen}
                onCancel={() => setIsProfileModalOpen(false)}
                onSuccess={(updatedUser) => {
                    // Ideally update context, but simple reload or local update works
                    // If useUser has a setUser/updateUser, call it.
                    // For now, assuming context re-fetches or we force reload
                    window.location.reload();
                }}
                user={user}
            />

            {walletUserId && (
                <TopUpModal
                    visible={topUpOpen}
                    onClose={() => { setTopUpOpen(false); fetchWallet(); }}
                    userId={walletUserId}
                />
            )}
        </>
    );
}
