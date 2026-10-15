"use client"
import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Row, Col, Input, Pagination } from 'antd';
import Link from 'next/link';
import { useLanguage } from '@/components/Providers/LanguageContext';
import { SearchOutlined } from '@ant-design/icons';

interface ProductListProps {
    products: any[];
}

export default function ProductList({ products }: ProductListProps) {
    const { t } = useLanguage();
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const pageSize = 12;
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const filteredProducts = useMemo(() => {
        const normalizedKeyword = deferredSearchTerm.trim().toLowerCase();
        if (!normalizedKeyword) return products;

        return products.filter((product) => {
            const productName = String(product.name || '').toLowerCase();
            const productSku = String(product.sku || '').toLowerCase();
            return productName.includes(normalizedKeyword) || productSku.includes(normalizedKeyword);
        });
    }, [deferredSearchTerm, products]);

    const paginatedProducts = useMemo(
        () => filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [currentPage, filteredProducts]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [deferredSearchTerm]);

    // Helper to get price display
    const getPriceDisplay = (product: any) => {
        if (!product.variants || product.variants.length === 0) {
            return <div className="text-zinc-400 text-sm">{t.catalogPage?.contactPrice || 'Contact for Price'}</div>;
        }

        const prices = product.variants.map((v: any) => v.basePrice).filter((p: any) => typeof p === 'number');

        if (prices.length === 0) return <div className="text-zinc-400 text-sm">{t.catalogPage?.na || 'N/A'}</div>;

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        if (minPrice === maxPrice) {
            return `$${minPrice.toFixed(2)}`;
        }
        return `$${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
                    {t.catalogPage?.title || 'Catalog'}
                </h2>
                <div className="w-full max-w-sm">
                    <Input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t.catalogPage?.searchProducts || 'Search products...'}
                        prefix={<SearchOutlined className="text-zinc-400" />}
                        allowClear
                        className="rounded-xl"
                    />
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="glass-panel text-center py-20 text-zinc-500 dark:text-zinc-400 rounded-2xl">
                    <p>{t.catalogPage?.noProducts || 'No products found in local database.'}</p>
                </div>
            ) : (
                <>
                    <Row gutter={[20, 20]}>
                        {paginatedProducts.map((product) => {
                            let images: string[] = [];
                            const rawImages = product.images;

                            if (Array.isArray(rawImages)) {
                                images = rawImages;
                            } else if (typeof rawImages === 'string') {
                                const trimmed = rawImages.trim();
                                if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                                    try {
                                        images = JSON.parse(trimmed);
                                    } catch (e) { }
                                } else if (trimmed.startsWith('http') || trimmed.startsWith('/')) {
                                    images = [trimmed];
                                }
                            }

                            // Fallback to old 'image' field if 'images' is empty
                            if (images.length === 0 && (product as any).image) {
                                images = [(product as any).image];
                            }

                            const coverImage = (images && images.length > 0) ? images[0] : '/placeholder.png';

                            return (
                                <Col xs={24} sm={12} md={8} lg={6} xl={4} key={product.id}>
                                    <Link href={`/dashboard/products/${product.id}`} className="block h-full">
                                        <div className="glass-card h-full rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                                            <div className="h-48 overflow-hidden relative bg-white flex items-center justify-center">
                                                <img
                                                    alt={product.name}
                                                    src={coverImage}
                                                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                                                />
                                                {!product.isActive && (
                                                    <span className="absolute top-2 right-2 px-2 py-1 bg-red-500/90 text-white text-xs font-bold rounded-lg backdrop-blur-sm">
                                                        {t.catalogPage?.inactive || 'Inactive'}
                                                    </span>
                                                )}
                                                {/* Out of Stock Badge Removed */}
                                            </div>
                                            <div className="p-4">
                                                <div className="mb-2">
                                                    <h3 className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={product.name}>
                                                        {product.name}
                                                    </h3>
                                                </div>
                                                <div>
                                                    <div className="font-bold text-lg text-emerald-600 dark:text-emerald-400">
                                                        {getPriceDisplay(product)}
                                                    </div>
                                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 flex justify-between items-center">
                                                        <span>{product.sku || (t.catalogPage?.noSku || 'No SKU')}</span>
                                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t.catalogPage?.inStock || 'In Stock'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                </Col>
                            );
                        })}
                    </Row>
                    <div className="mt-8 flex justify-center">
                        <Pagination
                            current={currentPage}
                            pageSize={pageSize}
                            total={filteredProducts.length}
                            onChange={(page) => setCurrentPage(page)}
                            showSizeChanger={false}
                            className="glass-pagination"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
