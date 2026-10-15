'use client';

import React from 'react';
import ScanComponent from '@/app/components/ScanComponent';

export default function ScanPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <ScanComponent />
        </div>
    );
}
