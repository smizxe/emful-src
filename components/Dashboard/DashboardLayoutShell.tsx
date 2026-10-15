'use client';

import React, { useState } from 'react';

import Sidebar from '@/components/Dashboard/Sidebar';
import TopBar from '@/components/Dashboard/TopBar';

export default function DashboardLayoutShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    return (
        <div className="min-h-screen transition-colors duration-500 ease-in-out">
            <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-500/5 blur-3xl" />
                <div className="absolute top-[20%] -right-[10%] w-[40%] h-[40%] rounded-full bg-sky-500/5 blur-3xl" />
                <div className="absolute bottom-0 left-[20%] w-[30%] h-[30%] rounded-full bg-purple-500/5 blur-3xl" />
            </div>

            {mobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            <Sidebar
                collapsed={collapsed}
                onCollapse={setCollapsed}
                mobileOpen={mobileMenuOpen}
                onMobileClose={() => setMobileMenuOpen(false)}
            />

            <TopBar
                collapsed={collapsed}
                onMobileMenuClick={() => setMobileMenuOpen(true)}
            />

            <main
                className={`
                    relative z-10 pt-20 pb-8 px-4 md:px-6 transition-[margin] duration-300
                    ${collapsed ? 'md:ml-20' : 'md:ml-64'}
                `}
            >
                <div className="animate-fade-in">
                    {children}
                </div>
            </main>
        </div>
    );
}
