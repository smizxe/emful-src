'use client';

import React, { useEffect, useState } from 'react';
import { Card, List, Typography, Avatar, Skeleton, Badge, Button } from 'antd';
import { WarningOutlined, FileTextOutlined, BellOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';

const { Text, Title } = Typography;

interface NotificationItem {
    key: string;
    type: string;
    title: string;
    description: string;
    link: string;
    icon: React.ReactNode;
    timestamp?: Date; // Optional: could add timestamp if available
}

export default function DashboardNotificationList() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const notifs: NotificationItem[] = [];

            // 1. Check Low Stock from Inventory API
            try {
                const params = new URLSearchParams({ limit: '100' });
                const invRes = await fetch(`/api/admin/inventory?${params}`);

                if (invRes.ok) {
                    const data = await invRes.json();
                    const products = data.data || [];

                    products.forEach((p: any) => {
                        if (p.variants && p.variants.length > 0) {
                            p.variants.forEach((v: any) => {
                                if (v.stock < 1) {
                                    notifs.push({
                                        key: `stock-${v.id}`,
                                        type: 'stock',
                                        title: 'Low Stock Alert',
                                        description: `${p.name} (${v.color}-${v.size}) has only ${v.stock} unit(s) left.`,
                                        link: '/admin/inventory',
                                        icon: <WarningOutlined style={{ color: '#f5222d', fontSize: '18px' }} />
                                    });
                                }
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn('Failed to fetch inventory for notifications');
            }

            // 2. Check Pending Orders
            try {
                const ordersRes = await fetch('/api/admin/orders?status=PENDING_APPROVAL&limit=1&includeTotal=true');
                if (ordersRes.ok) {
                    const data = await ordersRes.json();
                    const pendingCount = data?.meta?.total ?? 0;

                    if (pendingCount > 0) {
                        notifs.push({
                            key: 'pending-orders',
                            type: 'order',
                            title: 'Orders Pending Approval',
                            description: `${pendingCount} orders are waiting for your approval to proceed to production.`,
                            link: '/admin/orders/approval',
                            icon: <FileTextOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
                        });
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch orders for notifications');
            }

            setNotifications(notifs);
        } catch (error) {
            console.error("Notification fetch error", error);
        } finally {
            setLoading(false);
        }
    };

    useVisiblePolling(fetchNotifications, { intervalMs: 180000 });

    return (
        <Card
            className="glass-card border-0 shadow-sm h-[480px] flex flex-col"
            styles={{
                body: {
                    padding: '0px',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            <div className="p-6 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center bg-white/50 dark:bg-zinc-900/50 rounded-t-2xl backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <BellOutlined />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 m-0 leading-tight">
                            Notifications
                        </h3>
                        {notifications.length > 0 && (
                            <span className="text-xs text-zinc-500">
                                You have {notifications.length} alerts
                            </span>
                        )}
                    </div>
                </div>
                {notifications.length > 0 && (
                    <Badge count={notifications.length} overflowCount={99} color="#ef4444" />
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar h-0 min-h-0">
                {loading ? (
                    <Skeleton active paragraph={{ rows: 3 }} />
                ) : (
                    <List
                        itemLayout="horizontal"
                        dataSource={notifications}
                        locale={{ emptyText: 'No new notifications' }}
                        renderItem={(item) => (
                            <Link href={item.link} className="block mb-3 last:mb-0 group">
                                <div className="p-4 rounded-xl bg-gray-50/80 dark:bg-zinc-800/50 hover:bg-white hover:shadow-md dark:hover:bg-zinc-800 transition-all duration-300 border border-transparent hover:border-indigo-100 dark:hover:border-zinc-700">
                                    <div className="flex gap-4 items-start">
                                        <div className={`
                                            w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
                                            ${item.type === 'stock' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-blue-50 dark:bg-blue-900/20'}
                                        `}>
                                            {item.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <Text strong className="text-zinc-700 dark:text-zinc-200 group-hover:text-indigo-600 transition-colors w-full truncate">
                                                    {item.title}
                                                </Text>
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 m-0 line-clamp-2 leading-relaxed">
                                                {item.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        )}
                    />
                )}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: rgba(156, 163, 175, 0.3);
                    border-radius: 20px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(156, 163, 175, 0.5);
                }
            `}</style>
        </Card>
    );
}
