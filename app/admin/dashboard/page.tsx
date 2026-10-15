import { prisma } from '@/lib/prisma';
import React from 'react';
import { Row, Col } from 'antd';
import { UserOutlined, ShoppingOutlined, DollarOutlined, TeamOutlined } from '@ant-design/icons';
import Link from 'next/link';
import MonthlyChart from './MonthlyChart';
import DashboardNotificationList from '../components/DashboardNotificationList'; // Keep for now or remove if unused, but remove usage
import DashboardClient from './DashboardClient';
import Trans from '@/components/Trans';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
    // Quick Stats
    const sellersCount = await prisma.seller.count();
    const productsCount = await prisma.product.count();
    const ordersCount = await prisma.job.count({
        where: {
            status: {
                in: ['RECEIVED', 'IN_PROCESS', 'PRINTING', 'SEWING', 'COMPLETED', 'READY_TO_SHIP', 'SHIPPED']
            }
        }
    });

    // Total Balance is now on Wallet model, not User
    const walletAgg = await prisma.wallet.aggregate({
        _sum: { balance: true }
    });
    const totalBalance = walletAgg._sum.balance || 0;

    const stats = [
        { title: <Trans id="adminDashboard.totalSellers" />, value: sellersCount, icon: <TeamOutlined />, color: '#10b981', link: '/admin/users' },
        { title: <Trans id="adminDashboard.totalProducts" />, value: productsCount, icon: <ShoppingOutlined />, color: '#3b82f6', link: '/admin/products' },
        { title: <Trans id="adminDashboard.totalOrders" />, value: ordersCount, icon: <UserOutlined />, color: '#8b5cf6', link: '/admin/production' },
        { title: <Trans id="adminDashboard.heldBalance" />, value: totalBalance, icon: <DollarOutlined />, color: '#f43f5e', prefix: '$', link: '/admin/wallet' },
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 dark:from-pink-300 dark:to-purple-400 bg-clip-text text-transparent">
                    <Trans id="adminDashboard.title" />
                </h2>
            </div>

            <Row gutter={[24, 24]}>
                {stats.map((stat, index) => (
                    <Col xs={24} sm={12} md={6} key={index}>
                        <Link href={stat.link} className="block h-full">
                            <div className="glass-card rounded-2xl p-6 h-full flex flex-col justify-between group hover:shadow-lg transition-all duration-300 cursor-pointer">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mb-1">
                                            {stat.title}
                                        </p>
                                        <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                            {stat.prefix}{stat.value.toLocaleString()}
                                        </h3>
                                    </div>
                                    <div
                                        className="p-3 rounded-xl bg-opacity-10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
                                        style={{ backgroundColor: `${stat.color}20`, color: stat.color }}
                                    >
                                        {stat.icon}
                                    </div>
                                </div>
                            </div>
                        </Link>
                    </Col>
                ))}
            </Row>

            <div className="lg:col-span-3 h-full">
                <DashboardClient />
            </div>
        </div>
    );
}
