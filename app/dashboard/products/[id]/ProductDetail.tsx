"use client"
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Typography, Button, Tag, Divider, Breadcrumb, Radio, message, Tooltip } from 'antd';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { getProductColorHex, isLightColor } from '@/lib/productColors';

const { Title, Text, Paragraph } = Typography;

interface ProductDetailProps {
    product: any;
}

export default function ProductDetail({ product }: ProductDetailProps) {
    const { t } = useLanguage();
    const [selectedColor, setSelectedColor] = useState<string | null>(null);
    const [selectedSize, setSelectedSize] = useState<string | null>(null);
    const [activeImage, setActiveImage] = useState<string>('');

    // Safety fix for images
    const images: string[] = useMemo(() => {
        try {
            if (typeof product.images === 'string') return JSON.parse(product.images);
            if (Array.isArray(product.images)) return product.images;
            if (product.image) return [product.image]; // Fallback
            return [];
        } catch (e) { return []; }
    }, [product]);

    useEffect(() => {
        if (images.length > 0 && !activeImage) setActiveImage(images[0]);
    }, [images, activeImage]);

    // Data Processing
    const uniqueColors = useMemo(() => {
        const colors = new Set<string>();
        product.variants?.forEach((v: any) => { if (v.color) colors.add(v.color) });
        return Array.from(colors);
    }, [product]);

    const uniqueSizes = useMemo(() => {
        const sizes = new Set<string>();
        product.variants?.forEach((v: any) => { if (v.size) sizes.add(v.size) });
        return Array.from(sizes);
    }, [product]);

    const colorMapping = useMemo(() => {
        try {
            if (typeof product.colorMapping === 'string') {
                return JSON.parse(product.colorMapping || '{}');
            }
            return product.colorMapping || {};
        } catch {
            return {};
        }
    }, [product.colorMapping]);

    // Derived State
    const currentVariant = useMemo(() => {
        if (!product.variants) return null;
        return product.variants.find((v: any) =>
            (selectedColor ? v.color === selectedColor : true) &&
            (selectedSize ? v.size === selectedSize : true)
        );
    }, [product, selectedColor, selectedSize]);

    // Price Display
    const displayPrice = currentVariant ? currentVariant.basePrice : product.basePrice || product.price || 0;

    // Auto-select first options if available and not selected
    useEffect(() => {
        if (!selectedColor && uniqueColors.length > 0) setSelectedColor(uniqueColors[0]);
        if (!selectedSize && uniqueSizes.length > 0) setSelectedSize(uniqueSizes[0]);
    }, [uniqueColors, uniqueSizes]);

    return (
        <div className="p-6 max-w-[1400px] mx-auto min-h-screen">
            <div className="mb-6">
                <Link href="/dashboard/catalog" className="text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-2 transition-colors">
                    <ArrowLeftOutlined /> {t.productDetails.backToCatalogs}
                </Link>
            </div>

            <div className="glass-panel p-8 rounded-2xl">
                <Row gutter={[48, 40]}>
                    {/* Left Column: Images */}
                    <Col xs={24} md={12} lg={10}>
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white flex items-center justify-center p-8 mb-4 relative aspect-square group">
                            <img
                                src={activeImage || '/placeholder.png'}
                                alt={product.name}
                                className="object-contain max-h-full max-w-full transition-transform duration-300 group-hover:scale-105"
                            />
                        </div>
                        {images.length > 1 && (
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                {images.map((img, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setActiveImage(img)}
                                        className={`
                                            w-20 h-20 border-2 rounded-lg p-1 cursor-pointer transition-all flex-shrink-0 bg-white
                                            ${activeImage === img ? 'border-blue-500 shadow-md transform -translate-y-1' : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-300'}
                                        `}
                                    >
                                        <img src={img} className="w-full h-full object-contain rounded-md" alt={`Thumbnail ${idx}`} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </Col>

                    {/* Right Column: Details */}
                    <Col xs={24} md={12} lg={14}>
                        <div className="flex flex-col h-full">
                            <div>
                                <Tag className="mb-2 uppercase tracking-wide text-xs font-bold border-none bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full">
                                    {product.category || t.productDetails.apparel}
                                </Tag>
                                <h1 className="text-4xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent mb-2 mt-0 tracking-tight">
                                    {product.name}
                                </h1>
                                <div className="flex items-center gap-4 mb-6">
                                    <span className="text-zinc-400 font-mono text-sm uppercase">{t.productDetails.sku}: {product.sku}</span>
                                    <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700"></div>
                                    <RateDisplay />
                                </div>

                                <div className="mb-8">
                                    <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100 font-sans">
                                        ${typeof displayPrice === 'number' ? displayPrice.toFixed(2) : displayPrice}
                                    </span>
                                </div>
                            </div>

                            <Divider className="my-6 border-zinc-200 dark:border-zinc-700" />

                            {/* Variants Selection */}
                            <div className="space-y-8">
                                {/* Color Selector */}
                                {uniqueColors.length > 0 && (
                                    <div>
                                        <Text className="block text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">
                                            {t.productDetails.selectedColor}: <span className="text-zinc-900 dark:text-zinc-100">{selectedColor}</span>
                                        </Text>
                                        <div className="flex flex-wrap gap-3">
                                            {uniqueColors.map((color) => {
                                                const isActive = selectedColor === color;
                                                const colorHex = getProductColorHex(color, colorMapping);
                                                const isLightSwatch = isLightColor(colorHex);
                                                return (
                                                    <Tooltip title={color} key={color}>
                                                        <div
                                                            onClick={() => setSelectedColor(color)}
                                                            className={`
                                                                w-10 h-10 rounded-full cursor-pointer shadow-sm transition-all duration-200 relative
                                                                ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105 hover:shadow-md'}
                                                            `}
                                                            style={{
                                                                backgroundColor: colorHex,
                                                                border: isLightSwatch ? '1px solid #d4d4d8' : '1px solid rgba(17, 24, 39, 0.08)'
                                                            }}
                                                        >
                                                            {isActive && (
                                                                <div className={`absolute inset-0 flex items-center justify-center drop-shadow-md ${isLightSwatch ? 'text-zinc-900' : 'text-white'}`}>
                                                                    <CheckOutlined />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Tooltip>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Size Selector */}
                                {uniqueSizes.length > 0 && (
                                    <div>
                                        <Text className="block text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest mb-3">
                                            {t.productDetails.selectedSize}: <span className="text-zinc-900 dark:text-zinc-100">{selectedSize}</span>
                                        </Text>
                                        <div className="flex flex-wrap gap-3">
                                            {uniqueSizes.sort(sortSizes).map((size) => {
                                                const isActive = selectedSize === size;
                                                return (
                                                    <button
                                                        key={size}
                                                        onClick={() => setSelectedSize(size)}
                                                        className={`
                                                            min-w-[50px] px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border
                                                            ${isActive
                                                                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-lg'
                                                                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                                            }
                                                        `}
                                                    >
                                                        {size}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Description moved to bottom */}

                            {/* Shipping Rates & Fees */}
                            {(product.shippingRates || product.extraFees) && (
                                <div className="mt-8 space-y-6">
                                    {/* Shipping Rates Table */}
                                    {(() => {
                                        let rates = [];
                                        try { rates = JSON.parse(product.shippingRates || '[]'); } catch (e) { }
                                        if (rates.length > 0) {
                                            return (
                                                <div>
                                                    <h4 className="mb-3 text-zinc-800 dark:text-zinc-200 font-bold">{t.productDetails.shippingRates}</h4>
                                                    <div className="overflow-hidden border border-zinc-200 dark:border-zinc-700 rounded-lg">
                                                        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                                                            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                                                <tr>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.operator}</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.quantity}</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.shippingFees}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                                                                {rates.map((rate: any, idx: number) => (
                                                                    <tr key={idx}>
                                                                        <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">{rate.operator}</td>
                                                                        <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">{rate.quantity}</td>
                                                                        <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">${rate.shippingFee}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    {/* Extra Fees Table */}
                                    {(() => {
                                        let fees = [];
                                        try { fees = JSON.parse(product.extraFees || '[]'); } catch (e) { }
                                        if (fees.length > 0) {
                                            return (
                                                <div>
                                                    <h4 className="mb-3 text-zinc-800 dark:text-zinc-200 font-bold">{t.productDetails.extraFees}</h4>
                                                    <div className="overflow-hidden border border-zinc-200 dark:border-zinc-700 rounded-lg">
                                                        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
                                                            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                                                                <tr>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.position}</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.type}</th>
                                                                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.productDetails.surcharge}</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
                                                                {fees.map((fee: any, idx: number) => (
                                                                    <tr key={idx}>
                                                                        <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">{fee.position}</td>
                                                                        <td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                                                                {fee.type}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">${fee.surcharge}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            )}
                        </div>
                    </Col>
                </Row>

                {/* Full Width Description Section */}
                <Divider className="my-8 border-zinc-200 dark:border-zinc-700" />
                <div className="mt-8">
                    <Title level={3} className="mb-6 text-zinc-900 dark:text-zinc-100">{t.productDetails.productDescription}</Title>
                    <div
                        className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-300"
                        dangerouslySetInnerHTML={{ __html: product.description || `<p>${t.productDetails.noDescription}</p>` }}
                    />
                </div>
            </div>
        </div>
    );
}

// Dummy Rate component for visuals
const RateDisplay = () => (
    <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="text-yellow-400 text-sm">★</div>)}
        <span className="text-xs text-gray-400 ml-1">(4.8)</span>
    </div>
);

// Size Sorter Helper
const sortSizes = (a: string, b: string) => {
    const order = ['xs', 's', 'm', 'l', 'xl', '2xl', '3xl', '4xl', '5xl'];
    const iA = order.indexOf(a.toLowerCase());
    const iB = order.indexOf(b.toLowerCase());
    if (iA !== -1 && iB !== -1) return iA - iB;
    return a.localeCompare(b);
};
