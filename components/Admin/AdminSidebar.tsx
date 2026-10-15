'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Tooltip, Badge } from 'antd';
import {
    DashboardOutlined,
    ShoppingOutlined,
    UserOutlined,
    TeamOutlined,
    WalletOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PrinterOutlined,
    TruckOutlined,
    ShopOutlined,
    FileTextOutlined,
    ScanOutlined,
    HistoryOutlined,
    CheckSquareOutlined,
    OrderedListOutlined,
    BankOutlined,
    ShoppingCartOutlined,
    LinkOutlined
} from '@ant-design/icons';
import { Package, Ticket, PenTool } from 'lucide-react';
import { useTheme } from '@/components/Providers/ThemeContext';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { usePrefetchedRoutes } from '@/hooks/usePrefetchedRoutes';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';

interface AdminSidebarProps {
    collapsed: boolean;
    onCollapse: (collapsed: boolean) => void;
    mobileOpen?: boolean;
    onMobileClose?: () => void;
}

export default function AdminSidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: AdminSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { theme } = useTheme();
    const { t } = useLanguage();
    const [lowStockCount, setLowStockCount] = useState(0);
    const [pendingOrderCount, setPendingOrderCount] = useState(0);
    const [pendingTicketCount, setPendingTicketCount] = useState(0);
    const [pendingDesignCount, setPendingDesignCount] = useState(0);

    const fetchBadgeCounts = async () => {
        try {
            const [invRes, notifRes, designRes] = await Promise.all([
                fetch('/api/admin/inventory?summary=true'),
                fetch('/api/admin/notifications?summary=true'),
                fetch('/api/design-requests?status=PENDING&count=true'),
            ]);

            if (invRes.ok) {
                const data = await invRes.json();
                setLowStockCount(data.lowStockCount || 0);
            }
            if (notifRes.ok) {
                const data = await notifRes.json();
                setPendingOrderCount(data.pendingOrders || 0);
                setPendingTicketCount(data.pendingTickets || 0);
            }
            if (designRes.ok) {
                const data = await designRes.json();
                setPendingDesignCount(data.count || 0);
            }
        } catch (e) {
            console.warn('Failed to fetch sidebar badge counts');
        }
    };

    // Orders/tickets need to surface quickly, so poll more often than stock.
    useVisiblePolling(fetchBadgeCounts, { intervalMs: 60000 });

    const withBadge = (label: React.ReactNode, count: number) => (
        <span className="flex items-center justify-between w-full pr-2">
            <span>{label}</span>
            <Badge count={count} showZero={false} size="small" color="#ef4444" />
        </span>
    );

    const menuGroups = [
        {
            title: t.groups.general,
            items: [
                { key: '/admin/dashboard', icon: <DashboardOutlined />, label: t.nav.dashboard },
                { key: '/admin/scan', icon: <ScanOutlined />, label: t.nav.scanStation },
                { key: '/admin/reports', icon: <FileTextOutlined />, label: t.nav.reports },
            ]
        },
        {
            title: t.groups.orders,
            items: [
                { key: '/admin/orders/approval', icon: <CheckSquareOutlined />, label: withBadge(t.nav.orderApproval, pendingOrderCount) },
                { key: '/admin/production', icon: <PrinterOutlined />, label: t.nav.productionRelease },
                { key: '/admin/design-requests', icon: <PenTool size={18} />, label: withBadge(t.nav.designRequests || 'Design Requests', pendingDesignCount) },
                { key: '/admin/shipping', icon: <TruckOutlined />, label: t.nav.shipping },
                { key: '/admin/orders/history', icon: <HistoryOutlined />, label: t.nav.orderHistory },
            ]
        },
        {
            title: t.groups.inventory,
            items: [
                { key: '/admin/products', icon: <ShoppingOutlined />, label: t.nav.products },
                {
                    key: '/admin/inventory',
                    icon: <ShopOutlined />, // Warehouse icon
                    label: withBadge(t.nav.inventory, lowStockCount)
                },
                { key: '/admin/purchasing', icon: <ShoppingCartOutlined />, label: t.nav.purchasing },
                { key: '/admin/etsy-styles', icon: <LinkOutlined />, label: t.nav.etsyStyles || 'Etsy Styles' },
            ]
        },
        {
            title: t.groups.support,
            items: [
                { key: '/admin/tickets', icon: <Ticket size={18} />, label: withBadge(t.nav.tickets, pendingTicketCount) },
            ]
        },
        {
            title: t.groups.finance,
            items: [
                { key: '/admin/wallet', icon: <WalletOutlined />, label: t.nav.wallet },
            ]
        },
        {
            title: t.groups.system,
            items: [
                { key: '/admin/users', icon: <UserOutlined />, label: t.nav.users },
                { key: '/admin/staff', icon: <TeamOutlined />, label: t.nav.staff },
            ]
        }
    ];
    const prefetchRoute = usePrefetchedRoutes(
        menuGroups.flatMap((group) => group.items.map((item) => item.key))
    );

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
            <div className="h-16 flex items-center justify-center relative overflow-hidden">
                <div className={`
          absolute inset-0 flex items-center justify-center
          font-bold text-2xl tracking-tight transition-all duration-300
          bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent
          ${collapsed ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}
        `}>
                    AdminPanel
                </div>
                <div className={`
          absolute inset-0 flex items-center justify-center
          transition-all duration-300 font-bold text-xl
          bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent
          ${collapsed ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}
        `}>
                    AP
                </div>
            </div>

            {/* MENU */}
            <nav className="mt-4 px-3 space-y-6 overflow-y-auto h-[calc(100vh-8rem)] scrollbar-hide pb-10">
                {menuGroups.map((group, gIndex) => (
                    <div key={gIndex}>
                        {!collapsed && (
                            <div className="px-4 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                {group.title}
                            </div>
                        )}
                        <div className="space-y-1">
                            {group.items.map((item) => {
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
                                                    ${collapsed ? 'justify-center px-0 py-3 rounded-xl' : 'px-4 py-2.5 rounded-xl'}
                                                    ${isActive
                                                        ? 'bg-pink-500/10 dark:bg-pink-400/20 text-pink-600 dark:text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)]'
                                                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-zinc-100'}
                                                `}
                                            >
                                                <span className={`text-lg transition-transform duration-200 flex items-center justify-center ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                                                    {item.icon}
                                                </span>

                                                <span className={`
                                                    ml-3 font-medium text-sm whitespace-nowrap overflow-hidden transition-all duration-300 flex items-center gap-2
                                                    ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}
                                                `}>
                                                    {item.label}
                                                    {/* Badge is now handled inside the label component for inventory */}
                                                </span>

                                                {/* Active Indicator Line for Collapsed Mode */}
                                                {collapsed && isActive && (
                                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-pink-500 rounded-r-full" />
                                                )}

                                                {/* Hover Glow Effect */}
                                                {!isActive && (
                                                    <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-pink-500/0 via-pink-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                                )}
                                            </button>
                                        </Tooltip>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* COLLAPSE TOGGLE (Bottom) */}
            <div className="absolute bottom-4 left-0 w-full px-3 flex justify-center bg-transparent backdrop-blur-sm pt-2 border-t border-white/10">
                <Button
                    type="text"
                    className="text-zinc-500 dark:text-zinc-400 hover:text-pink-500 dark:hover:text-pink-400"
                    icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                    onClick={() => onCollapse(!collapsed)}
                />
            </div>
        </aside>
    );
}
