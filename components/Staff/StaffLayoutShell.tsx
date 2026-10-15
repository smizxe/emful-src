'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, Menu, Drawer, Badge } from 'antd';
import {
    CheckSquareOutlined,
    DashboardOutlined,
    DropboxOutlined,
    ScanOutlined,
    TruckOutlined,
    CustomerServiceOutlined,
} from '@ant-design/icons';
import { PenTool } from 'lucide-react';

import StaffTopBar from '@/components/Staff/StaffTopBar';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { useTheme } from '@/components/Providers/ThemeContext';

const { Sider, Content } = Layout;

export default function StaffLayoutShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { t } = useLanguage();
    const [pendingDesignCount, setPendingDesignCount] = useState(0);

    // Staff follow the design queue from their own area, same view as admin.
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/api/design-requests?status=PENDING&count=true');
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setPendingDesignCount(data.count || 0);
            } catch {
                // A missing badge is not worth bothering anyone about.
            }
        };
        load();
        const timer = setInterval(load, 60000);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);
    const { theme } = useTheme();
    const menuTheme = theme === 'dark' ? 'dark' : 'light';

    const menuItems = [
        {
            key: '/staff/dashboard',
            icon: <DashboardOutlined />,
            label: <Link href="/staff/dashboard">{t.nav.dashboard}</Link>,
        },
        {
            key: '/staff/orders/approval',
            icon: <CheckSquareOutlined />,
            label: <Link href="/staff/orders/approval">{t.nav.orderApproval}</Link>,
        },
        {
            key: '/staff/production',
            icon: <DropboxOutlined />,
            label: <Link href="/staff/production">{t.nav.production}</Link>,
        },
        {
            key: '/staff/design-requests',
            icon: <PenTool size={16} />,
            label: (
                <Link href="/staff/design-requests" className="flex items-center justify-between gap-2">
                    <span>{t.nav.designRequests || 'Design Requests'}</span>
                    <Badge count={pendingDesignCount} showZero={false} size="small" color="#ef4444" />
                </Link>
            ),
        },
        {
            key: '/staff/shipping',
            icon: <TruckOutlined />,
            label: <Link href="/staff/shipping">{t.nav.shipping}</Link>,
        },
        {
            key: '/staff/tickets',
            icon: <CustomerServiceOutlined />,
            label: <Link href="/staff/tickets">{t.nav.tickets}</Link>,
        },
        {
            key: '/staff/scan',
            icon: <ScanOutlined />,
            label: <Link href="/staff/scan">{t.nav.scanStation}</Link>,
        },
    ];

    return (
        <Layout className="h-screen w-full overflow-hidden bg-slate-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
            <style jsx global>{`
                .ant-layout-sider {
                    border-right: none !important;
                }
                .ant-layout-sider-children {
                    border-right: none !important;
                }
                .ant-menu-inline {
                    border-right: none !important;
                }
            `}</style>

            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                theme={menuTheme}
                className="shadow-sm z-50 h-full border-none hidden md:block bg-white dark:bg-zinc-950"
                width={250}
                breakpoint="md"
                collapsedWidth={80}
            >
                <div className="h-16 flex items-center justify-center relative overflow-hidden">
                    <h1
                        className={`
                            absolute inset-0 flex items-center justify-center
                            font-bold text-xl bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent
                            transition-all duration-300
                            ${collapsed ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}
                        `}
                    >
                        Staff Portal
                    </h1>
                    <h1
                        className={`
                            absolute inset-0 flex items-center justify-center
                            font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent
                            transition-all duration-300
                            ${collapsed ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}
                        `}
                    >
                        SP
                    </h1>
                </div>
                <Menu
                    theme={menuTheme}
                    mode="inline"
                    selectedKeys={[pathname]}
                    className="border-none bg-transparent"
                    items={menuItems}
                />
            </Sider>

            <Drawer
                open={mobileMenuOpen}
                onClose={() => setMobileMenuOpen(false)}
                placement="left"
                width={250}
                className="md:hidden"
                title={
                    <h1 className="font-bold text-xl bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">
                        Staff Portal
                    </h1>
                }
            >
                <Menu
                    theme={menuTheme}
                    mode="inline"
                    selectedKeys={[pathname]}
                    className="border-none bg-transparent"
                    items={menuItems}
                    onClick={() => setMobileMenuOpen(false)}
                />
            </Drawer>

            <Layout className="h-full bg-slate-50 dark:bg-zinc-950 flex flex-col flex-1 overflow-hidden relative">
                <StaffTopBar collapsed={collapsed} onMobileMenuClick={() => setMobileMenuOpen(true)} />

                <Content className="flex-1 p-4 md:p-6 overflow-auto">
                    <div className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 rounded-xl shadow-sm p-4 md:p-6 min-h-full">
                        {children}
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
}
