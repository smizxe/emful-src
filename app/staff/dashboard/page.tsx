'use client';

import React from 'react';
import { Card, Row, Col, Typography } from 'antd';
import { CheckSquareOutlined, DropboxOutlined, ScanOutlined, TruckOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

export default function StaffDashboard() {
    const router = useRouter();

    return (
        <div>
            <Typography.Title level={2} className="mb-6 dark:!text-zinc-100">Staff Dashboard</Typography.Title>

            <Row gutter={[24, 24]}>
                <Col xs={24} sm={12} lg={8}>
                    <Card
                        hoverable
                        className="text-center cursor-pointer transition-transform hover:scale-105"
                        onClick={() => router.push('/staff/orders/approval')}
                    >
                        <CheckSquareOutlined className="text-6xl text-emerald-500 mb-4" />
                        <Typography.Title level={4} className="dark:!text-zinc-100">Order Approval</Typography.Title>
                        <p className="text-gray-500 dark:text-zinc-400">Approve or reject seller orders before production.</p>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
                    <Card
                        hoverable
                        className="text-center cursor-pointer transition-transform hover:scale-105"
                        onClick={() => router.push('/staff/production')}
                    >
                        <DropboxOutlined className="text-6xl text-blue-500 mb-4" />
                        <Typography.Title level={4} className="dark:!text-zinc-100">Production Release</Typography.Title>
                        <p className="text-gray-500 dark:text-zinc-400">View and print labels for new jobs.</p>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
                    <Card
                        hoverable
                        className="text-center cursor-pointer transition-transform hover:scale-105"
                        onClick={() => router.push('/staff/shipping')}
                    >
                        <TruckOutlined className="text-6xl text-cyan-500 mb-4" />
                        <Typography.Title level={4} className="dark:!text-zinc-100">Shipping Management</Typography.Title>
                        <p className="text-gray-500 dark:text-zinc-400">Manage tracking, labels, rates, and shipping status.</p>
                    </Card>
                </Col>

                <Col xs={24} sm={12} lg={8}>
                    <Card
                        hoverable
                        className="text-center cursor-pointer transition-transform hover:scale-105"
                        onClick={() => router.push('/staff/scan')}
                    >
                        <ScanOutlined className="text-6xl text-green-500 mb-4" />
                        <Typography.Title level={4} className="dark:!text-zinc-100">Scan Station</Typography.Title>
                        <p className="text-gray-500 dark:text-zinc-400">Global scanner for job updates.</p>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
