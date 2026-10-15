'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Tooltip } from 'antd';
import {
    DashboardOutlined,
    ShoppingOutlined,
    CreditCardOutlined,
    CustomerServiceOutlined,
    CloudUploadOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    RightOutlined,
    WalletOutlined,
    LinkOutlined,
    ApiOutlined,
    FileExcelOutlined
} from '@ant-design/icons';
import { Package, Ticket, PenTool } from 'lucide-react';
import { useTheme } from '@/components/Providers/ThemeContext';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { usePrefetchedRoutes } from '@/hooks/usePrefetchedRoutes';

interface SidebarProps {
    collapsed: boolean;
    onCollapse: (collapsed: boolean) => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

export default function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { theme } = useTheme();
    const { t } = useLanguage();

    const menuItems = [
        { key: '/dashboard', icon: <DashboardOutlined />, label: t.nav.dashboard },
        { key: '/dashboard/catalog', icon: <ShoppingOutlined />, label: t.nav.catalog },
        { key: '/dashboard/orders', icon: <Package size={18} />, label: t.nav.orders },
        { key: '/dashboard/wallet', icon: <WalletOutlined />, label: t.nav.wallet },
        { key: '/dashboard/orders/import', icon: <CloudUploadOutlined />, label: t.nav.importOrders },
        { key: '/dashboard/etsy-convert', icon: <FileExcelOutlined />, label: t.nav.etsyConvert || 'Etsy Convert' },
        { key: '/dashboard/etsy-mapping', icon: <LinkOutlined />, label: t.nav.etsyMapping || 'Etsy Mapping' },
        { key: '/dashboard/design-fixes', icon: <PenTool size={18} />, label: t.nav.designFixes || 'New/Fixed Designs' },
        { key: '/dashboard/api-keys', icon: <ApiOutlined />, label: t.nav.apiKeys || 'API' },
        { key: '/dashboard/tickets', icon: <Ticket size={18} />, label: t.nav.tickets },
    ];
    const prefetchRoute = usePrefetchedRoutes(menuItems.map((item) => item.key));

    // Handle navigation click - close mobile menu after navigating
    const handleNavClick = (key: string) => {
        if (pathname === key) {
            if (onMobileClose) onMobileClose();
            return;
        }

        router.push(key);
        if (onMobileClose) onMobileClose();
    };

    return (
        <aside
            className={`
                fixed left-0 top-0 h-full z-[100] transition-all duration-300 ease-in-out
                ${collapsed ? 'w-20' : 'w-64'}
                glass-panel border-r border-white/20
                ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
            `}
        >
            {/* LOGO */}
            <div className={`flex items-center justify-center relative overflow-hidden transition-all duration-300 ${collapsed ? 'h-16' : 'h-20 mt-2 mb-2'}`}>
                <div className={`
          absolute inset-0 flex items-center justify-center w-full h-full p-4
          transition-all duration-300
          ${collapsed ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}
        `}>
                    <img src="/logo-text-transparent.png" alt="emfulfill" className="w-[180px] h-auto object-contain" />
                </div>
                <div className={`
          absolute inset-0 flex items-center justify-center w-full h-full p-3
          transition-all duration-300
          ${collapsed ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}
        `}>
                    <img src="/logo-no-text-transparent.png" alt="em" className="w-10 h-10 object-contain" />
                </div>
            </div>

            {/* MENU */}
            <nav className="mt-4 px-3 space-y-2">
                {menuItems.map((item) => {
                    const isActive = pathname === item.key;
                    return (
                        <div key={item.key}>
                            <Tooltip title={collapsed ? item.label : ''} placement="right">
                                <button
                                    onMouseEnter={() => prefetchRoute(item.key)}
                                    onFocus={() => prefetchRoute(item.key)}
                                    onClick={() => handleNavClick(item.key)}
                                    className={`
                    w-full flex items-center transition-all duration-200 group relative
                    ${collapsed ? 'justify-center px-0 py-3 rounded-xl' : 'px-4 py-3 rounded-xl'}
                    ${isActive
                                            ? 'bg-sky-500/10 dark:bg-sky-400/20 text-sky-600 dark:text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.3)]'
                                            : 'text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100'}
                  `}
                                >
                                    <span className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                                        {item.icon}
                                    </span>

                                    <span className={`
                    ml-3 font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300
                    ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
                  `}>
                                        {item.label}
                                    </span>

                                    {/* Active Indicator Line for Collapsed Mode (optional, nice touch) */}
                                    {collapsed && isActive && (
                                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sky-500 rounded-r-full" />
                                    )}

                                    {/* Hover Glow Effect */}
                                    {!isActive && (
                                        <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-sky-500/0 via-sky-500/5 to-sky-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                    )}
                                </button>
                            </Tooltip>
                        </div>
                    );
                })}
            </nav>

            {/* COLLAPSE TOGGLE (Bottom) */}
            <div className="absolute bottom-4 left-0 w-full px-3 flex justify-center">
                <Button
                    type="text"
                    className="text-zinc-500 dark:text-zinc-400 hover:text-sky-500 dark:hover:text-sky-400"
                    icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => onCollapse(!collapsed)}
                />
            </div>
        </aside>
    );
}
