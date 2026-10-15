'use client';

import React, { useState } from 'react';
import { Row, Col } from 'antd';
import MonthlyChart from './MonthlyChart';
import DayDetailPanel from './DayDetailPanel';
import dayjs from 'dayjs';

interface DashboardClientProps {
    // Initial data or other props can be passed here
}

export default function DashboardClient({ }: DashboardClientProps) {
    const [selectedDate, setSelectedDate] = useState<string | null>(dayjs().format('YYYY-MM-DD'));
    const [activeMetric, setActiveMetric] = useState<'Orders' | 'Wallet' | 'Releases'>('Orders');

    // Debug: Log when component mounts
    React.useEffect(() => {
        console.log('🔵 DashboardClient MOUNTED - Component is running client-side!');
        console.log('Initial selectedDate:', dayjs().format('YYYY-MM-DD'));
    }, []);

    const handleDateSelect = (date: string) => {
        console.log('DashboardClient: Date selected:', date); // Debug log
        setSelectedDate(date);
    };

    return (
        <div className="mt-8">
            <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                    <MonthlyChart
                        onDateSelect={handleDateSelect}
                        selectedDate={selectedDate}
                        activeMetric={activeMetric}
                        setActiveMetric={setActiveMetric}
                    />
                </Col>
                <Col xs={24} lg={8}>
                    <DayDetailPanel
                        selectedDate={selectedDate}
                        activeMetric={activeMetric}
                    />
                </Col>
            </Row>
        </div>
    );
}
