'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { App } from 'antd';

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
    /** Every role the account holds, primary first. */
    roles?: string[];
    balance: number;
}

interface UserContextType {
    user: User | null;
    loading: boolean;
    refreshUser: () => Promise<void>;
    logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType>({
    user: null,
    loading: true,
    refreshUser: async () => { },
    logout: async () => { },
});

export const useUser = () => useContext(UserContext);

export function UserProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const { message } = App.useApp();

    const fetchUser = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                const data = await res.json().catch(() => null);
                if (
                    res.status === 403 &&
                    data?.error &&
                    typeof window !== 'undefined' &&
                    window.location.pathname !== '/login' &&
                    window.location.pathname !== '/register' &&
                    !window.location.pathname.startsWith('/verify')
                ) {
                    sessionStorage.setItem('auth_error', data.error);
                    await fetch('/api/auth/logout', { method: 'POST' });
                    router.replace('/login');
                }
                setUser(null);
            }
        } catch (error) {
            console.error('Failed to fetch user', error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            setUser(null);
            router.push('/login');
            message.success('Logged out successfully');
        } catch (error) {
            message.error('Logout failed');
        }
    };

    return (
        <UserContext.Provider value={{ user, loading, refreshUser: fetchUser, logout }}>
            {children}
        </UserContext.Provider>
    );
}
