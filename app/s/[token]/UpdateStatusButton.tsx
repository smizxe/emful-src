'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UpdateStatusButton({ token, label }: { token: string, label: string }) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleUpdate = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/scan/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setSuccess(true);
                // Refresh after 2 seconds or redirect
                setTimeout(() => {
                    router.refresh();
                }, 1500);
            } else {
                setError(data.error || 'Update failed');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="p-4 bg-green-100 text-green-800 rounded font-bold text-xl animate-bounce">
                SUCCESS!
            </div>
        );
    }

    return (
        <div>
            {error && <div className="mb-4 text-red-600 font-bold">{error}</div>}
            <button
                onClick={handleUpdate}
                disabled={loading}
                className={`w-full py-4 rounded-lg font-bold text-white text-xl shadow-lg transition-transform active:scale-95 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
            >
                {loading ? 'Processing...' : label}
            </button>
        </div>
    );
}
