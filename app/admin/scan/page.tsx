'use client';

import React from 'react';
import ScanComponent from '@/app/components/ScanComponent';
import { Card, Typography } from 'antd';

export default function AdminScanPage() {
    return (
        <div className="flex flex-col items-center justify-center p-8 bg-gray-50 min-h-screen">
            <ScanComponent />
        </div>
    );
}
