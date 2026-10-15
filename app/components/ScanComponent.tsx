'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, message, Result, Typography } from 'antd';
import { ScanOutlined, BarcodeOutlined } from '@ant-design/icons';

export default function ScanComponent() {
    const [scanValue, setScanValue] = useState('');
    const [processing, setProcessing] = useState(false);
    const [lastResult, setLastResult] = useState<any>(null);
    const inputRef = useRef<any>(null);

    // Buffer to store keystrokes from scanner when input is not focused
    const scanBuffer = useRef('');
    const lastKeyTime = useRef(Date.now());

    useEffect(() => {
        // Global key listener for scanner
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            const now = Date.now();
            if (now - lastKeyTime.current > 200) {
                if (scanBuffer.current.length > 0) {
                    scanBuffer.current = '';
                }
            }
            lastKeyTime.current = now;

            if (e.key === 'Enter') {
                if (scanBuffer.current) {
                    processScan(scanBuffer.current);
                    scanBuffer.current = '';
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                scanBuffer.current += e.key;
                setScanValue(scanBuffer.current);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        inputRef.current?.focus();
    }, [lastResult]);

    const processScan = async (code: string) => {
        if (!code) return;
        const cleanCode = code.trim();
        setScanValue(cleanCode);
        setProcessing(true);
        setLastResult(null);

        try {
            const res = await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: cleanCode })
            });
            if (res.status === 401) {
                message.error('Authentication required. Redirecting to login...');
                setTimeout(() => {
                    window.location.href = '/login?redirect=/scan';
                }, 1500);
                return;
            }

            const data = await res.json();

            if (res.ok) {
                setLastResult({ success: true, message: data.message, type: data.type, link: data.link });

                // Attempt to auto-open if it's a file
                if (data.type === 'FILE' && data.link) {
                    const win = window.open(data.link, '_blank');
                    if (!win) {
                        message.warning('Popup blocked. Please click the button below to open the file.');
                    }
                }

                if (data.type === 'STATUS') {
                    message.success('Status updated successfully');
                } else if (data.type === 'FILE') {
                    message.success('File found');
                } else {
                    message.success('Scan processed');
                }

                setScanValue('');
                scanBuffer.current = '';
            } else {
                setLastResult({ success: false, message: data.error });
                message.error(data.error || 'Scan failed');
                setScanValue('');
                scanBuffer.current = '';
            }
        } catch (error) {
            setLastResult({ success: false, message: 'Network error' });
            message.error('Network error');
        } finally {
            setProcessing(false);
            inputRef.current?.focus();
        }
    };

    const handleManualScan = () => {
        processScan(scanValue);
    };

    return (
        <Card className="w-full max-w-md text-center shadow-xl">
            <Typography.Title level={2} className="mb-6 flex items-center justify-center gap-2">
                <ScanOutlined /> Production Scanner
            </Typography.Title>

            <div className="mb-8">
                <Input
                    ref={inputRef}
                    prefix={<BarcodeOutlined className="text-gray-400" />}
                    placeholder="Scan Barcode (input not required to focus)"
                    value={scanValue}
                    onChange={e => {
                        setScanValue(e.target.value);
                        scanBuffer.current = e.target.value;
                    }}
                    onPressEnter={handleManualScan}
                    disabled={processing}
                    size="large"
                    className="text-lg py-2"
                    autoFocus
                />
                <Button
                    type="primary"
                    onClick={handleManualScan}
                    loading={processing}
                    className="mt-4 w-full h-12 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 border-none hover:shadow-lg transition-all"
                    size="large"
                >
                    Process Scan
                </Button>
            </div>

            {lastResult && (
                <div className={`p-4 rounded-lg mb-4 ${lastResult.success ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                    <Result
                        status={lastResult.success ? 'success' : 'error'}
                        title={<span className={lastResult.success ? 'text-green-700' : 'text-red-700'}>{lastResult.success ? 'Success' : 'Error'}</span>}
                        subTitle={lastResult.message}
                        className="py-2"
                        extra={lastResult.link ? (
                            <Button type="primary" href={lastResult.link} target="_blank" size="large">
                                Open Design File
                            </Button>
                        ) : null}
                    />
                </div>
            )}

            <div className="mt-6 pt-4 border-t text-gray-400 text-xs">
                <p>Supported: F-JOB... (File), S-JOB... (Status), QR URLs</p>
                <p className="mt-1 italic">Tip: You can scan directly without clicking the input box.</p>
            </div>
        </Card>
    );
}
