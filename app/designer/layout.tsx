import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePageRole } from '@/lib/auth-guard';
import LogoutButton from './LogoutButton';

export const dynamic = 'force-dynamic';

/**
 * The designer portal is deliberately a single page with its own slim shell:
 * a designer signs in to emfulfill but only ever sees the design queue, never
 * the admin sidebar or any seller/order screens.
 */
export default async function DesignerLayout({ children }: { children: React.ReactNode }) {
    const user = await requirePageRole(['DESIGNER', 'ADMIN']);

    // Switching the account off in admin has to close the portal too, not just
    // the API behind it.
    if (!user.isActive) {
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
            <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur">
                <div className="mx-auto max-w-none px-6 h-16 flex items-center justify-between">
                    <Link href="/designer" className="flex items-center gap-3">
                        <img src="/logo-text-transparent.png" alt="emfulfill" className="h-7 w-auto object-contain" />
                        <span className="text-sm font-semibold text-zinc-500">Design Portal</span>
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="text-right leading-tight">
                            <div className="text-sm font-medium">{user?.name || user?.email}</div>
                            <div className="text-[11px] text-zinc-400">Designer</div>
                        </div>
                        <LogoutButton />
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-none p-4">{children}</main>
        </div>
    );
}
