'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Dropdown, Avatar, Typography, Button } from 'antd';
import { BellOutlined, DollarCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';

const { Text } = Typography;

interface NotificationItem {
    key: string;
    type: string;
    title: string;
    description: string;
    link: string;
    icon: React.ReactNode;
}

export default function AdminNotifications() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [count, setCount] = useState(0);
    const { t } = useLanguage();

    const fetchNotifications = async () => {
        try {
            const response = await fetch('/api/admin/notifications?summary=true');
            if (!response.ok) {
                return;
            }

            const data = await response.json();
            const notifs: NotificationItem[] = [];
            let alertCount = 0;

            const pendingCount = data?.pendingOrders ?? 0;
            if (pendingCount > 0) {
                alertCount += pendingCount;
                notifs.push({
                    key: 'pending-orders',
                    type: 'order',
                    title: t.notifications.pendingOrders,
                    description: `${pendingCount} ${t.notifications.pendingOrdersDesc}`,
                    link: '/admin/orders/approval',
                    icon: <FileTextOutlined style={{ color: '#1890ff' }} />
                });
            }

            const pendingTopups = data?.pendingTopups ?? 0;
            if (pendingTopups > 0) {
                alertCount += pendingTopups;
                notifs.push({
                    key: 'pending-topups',
                    type: 'topup',
                    title: pendingTopups === 1 ? 'Topup Request' : 'Topup Requests',
                    description: `You have ${pendingTopups} Topup Request${pendingTopups > 1 ? 's' : ''}`,
                    link: '/admin/wallet',
                    icon: <DollarCircleOutlined style={{ color: '#16a34a' }} />
                });
            }

            setNotifications(notifs);
            setCount(alertCount);

        } catch (error) {
            console.error("Notification fetch error", error);
        }
    };

    useVisiblePolling(fetchNotifications, { intervalMs: 180000 });

    const menuItems = [
        {
            key: 'header',
            label: (
                <div className="py-2 px-4 font-bold border-b bg-gray-50">
                    {t.notifications.title} ({count})
                </div>
            ),
            disabled: true
        },
        ...(notifications.length > 0 ? notifications.map(notif => ({
            key: notif.key,
            label: (
                <Link href={notif.link}>
                    <div className="py-2 px-4 hover:bg-gray-50 flex items-start gap-3">
                        <Avatar icon={notif.icon} style={{ backgroundColor: 'transparent' }} />
                        <div>
                            <Text strong style={{ display: 'block' }}>{notif.title}</Text>
                            <Text type="secondary" style={{ fontSize: '12px' }}>{notif.description}</Text>
                        </div>
                    </div>
                </Link>
            )
        })) : [{
            key: 'empty',
            label: <div className="py-4 px-8 text-center text-gray-500">{t.notifications.noNotifications}</div>,
            disabled: true
        }])
    ];

    return (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Badge count={count} offset={[-2, 2]}>
                <Button
                    type="text"
                    icon={<BellOutlined style={{ fontSize: '18px' }} />}
                    className="flex items-center justify-center"
                />
            </Badge>
        </Dropdown>
    );
}
