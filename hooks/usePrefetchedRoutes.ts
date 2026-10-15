'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

export function usePrefetchedRoutes(routes: string[]) {
    const router = useRouter();
    const routeKey = routes.join('||');
    const uniqueRoutes = useMemo(
        () => Array.from(new Set(routes.filter(Boolean))),
        [routeKey]
    );

    useEffect(() => {
        uniqueRoutes.forEach((route) => router.prefetch(route));
    }, [router, uniqueRoutes]);

    return (route: string) => {
        if (!route) {
            return;
        }

        router.prefetch(route);
    };
}
