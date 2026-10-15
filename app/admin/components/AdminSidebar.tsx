'use client';

import React from 'react';
import { Layout, Menu } from 'antd';
import {
    DashboardOutlined,
    UserOutlined,
    ShoppingOutlined,
    WalletOutlined,
    OrderedListOutlined,
    RocketOutlined,
    LogoutOutlined,
    CheckSquareOutlined,
    BankOutlined,
    ShoppingCartOutlined,
    ScanOutlined,
    HistoryOutlined
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { useLanguage } from '@/components/Providers/LanguageContext';

const { Sider } = Layout;

export default function AdminSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { t } = useLanguage();

    const menuItems = [
        {
            label: t.nav.general,
            type: 'group' as const,
            children: [
                {
                    key: '/admin/dashboard',
                    icon: <DashboardOutlined />,
                    label: t.nav.overview,
                },
                {
                    key: '/admin/scan',
                    icon: <ScanOutlined />,
                    label: t.nav.scanStation,
                },
            ]
        },
        {
            label: t.nav.ordersFulfillment,
            type: 'group' as const,
            children: [
                {
                    key: '/admin/orders/approval',
                    icon: <CheckSquareOutlined />,
                    label: t.nav.approvals,
                },
                {
                    key: '/admin/production',
                    icon: <OrderedListOutlined />,
                    label: t.nav.productionRelease,
                },
                {
                    key: '/admin/shipping',
                    icon: <RocketOutlined />,
                    label: t.nav.shipping,
                },
                {
                    key: '/admin/orders/history',
                    icon: <HistoryOutlined />,
                    label: t.nav.orderHistory,
                },
            ]
        },
        {
            label: t.nav.inventoryProducts,
            type: 'group' as const,
            children: [
                {
                    key: '/admin/products',
                    icon: <ShoppingOutlined />,
                    label: t.nav.products,
                },
                {
                    key: '/admin/inventory',
                    icon: <BankOutlined />,
                    label: t.nav.inventory,
                },
                {
                    key: '/admin/purchasing',
                    icon: <ShoppingCartOutlined />,
                    label: t.nav.purchasing,
                },
            ]
        },
        {
            label: t.nav.finance,
            type: 'group' as const,
            children: [
                {
                    key: '/admin/wallet',
                    icon: <WalletOutlined />,
                    label: t.nav.walletTransactions,
                },
            ]
        },
        {
            label: t.nav.system,
            type: 'group' as const,
            children: [
                {
                    key: '/admin/users',
                    icon: <UserOutlined />,
                    label: t.nav.userManagement,
                },
            ]
        },
    ];

    return (
        <Sider theme="light" width={260} style={{ minHeight: '100vh', borderRight: '1px solid #f0f0f0' }}>
            <div style={{ padding: '24px 16px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', background: '-webkit-linear-gradient(45deg, #096dd9, #1890ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    EmFulFill
                </h1>
                <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>{t.nav.adminWorkspace}</span>
            </div>

            <Menu
                mode="inline"
                selectedKeys={[pathname]}
                style={{ borderRight: 0, paddingBottom: 60 }}
                items={menuItems}
                onClick={({ key }) => router.push(key)}
            />

            <div style={{ position: 'absolute', bottom: 0, width: '100%', borderTop: '1px solid #f0f0f0', background: 'white', zIndex: 10 }}>
                <Menu
                    mode="inline"
                    selectable={false}
                    items={[
                        {
                            key: 'logout',
                            icon: <LogoutOutlined />,
                            label: t.nav.backToSite,
                            style: { color: '#666' }
                        }
                    ]}
                    onClick={() => router.push('/')}
                />
            </div>
        </Sider>
    );
}
