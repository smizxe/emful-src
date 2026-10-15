'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

/** The logout endpoint is POST-only, so the portal header needs a real request. */
export default function LogoutButton() {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const logout = async () => {
        setBusy(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            router.replace('/login');
        }
    };

    return (
        <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="text-sm text-zinc-500 hover:text-red-500 transition-colors disabled:opacity-50"
        >
            {busy ? 'Logging out...' : 'Log out'}
        </button>
    );
}
