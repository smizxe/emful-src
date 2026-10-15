'use client';

import { useEffect, useRef } from 'react';

type PollingOptions = {
    enabled?: boolean;
    intervalMs: number;
    runImmediately?: boolean;
};

export function useVisiblePolling(
    callback: () => void | Promise<void>,
    { enabled = true, intervalMs, runImmediately = true }: PollingOptions
) {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        let intervalId: ReturnType<typeof setInterval> | null = null;

        const run = () => {
            if (document.visibilityState === 'visible') {
                void callbackRef.current();
            }
        };

        if (runImmediately) {
            run();
        }

        intervalId = setInterval(run, intervalMs);
        document.addEventListener('visibilitychange', run);

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
            document.removeEventListener('visibilitychange', run);
        };
    }, [enabled, intervalMs, runImmediately]);
}
