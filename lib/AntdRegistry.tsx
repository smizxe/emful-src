'use client';

import React from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { ConfigProvider, theme as antTheme, App } from 'antd';
import { useTheme } from '@/components/Providers/ThemeContext';

const StyledComponentsRegistry = ({ children }: { children: React.ReactNode }) => {
    const { theme } = useTheme();

    return (
        <AntdRegistry>
            <ConfigProvider
                theme={{
                    algorithm: theme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
                    token: {
                        fontFamily: 'var(--font-sans)',
                        colorPrimary: '#0ea5e9', // Brand 500
                        borderRadius: 8,
                        // Glass effect overrides are handled in CSS, this sets the base
                        colorBgContainer: theme === 'dark' ? '#18181b' : '#ffffff',
                        colorBgElevated: theme === 'dark' ? '#27272a' : '#ffffff',
                        colorText: theme === 'dark' ? '#f4f4f5' : '#18181b',
                    },
                    components: {
                        Button: {
                            controlHeight: 40,
                            borderRadius: 10,
                            defaultShadow: '0 2px 0 rgba(0, 0, 0, 0.02)',
                            primaryShadow: '0 2px 10px rgba(14, 165, 233, 0.2)',
                        },
                        Table: {
                            borderRadiusLG: 12,
                            headerBg: 'transparent',
                            colorBgContainer: 'transparent',
                            rowHoverBg: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                        },
                        Card: {
                            colorBgContainer: 'transparent',
                        },
                        Input: {
                            controlHeight: 40,
                            borderRadius: 10,
                            colorBgContainer: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
                            activeBorderColor: '#0ea5e9',
                        },
                        Select: {
                            controlHeight: 40,
                            borderRadius: 10,
                            colorBgContainer: theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)',
                        }
                    }
                }}
            >
                <App>
                    {children}
                </App>
            </ConfigProvider>
        </AntdRegistry>
    );
};


export default StyledComponentsRegistry;
