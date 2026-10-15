'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Table, Space, Button, App } from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined, SettingOutlined, VerticalAlignBottomOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import ProductModal from './ProductModal';
import TemplateModal from './TemplateModal';

interface Product {
    id: string;
    sku: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
    images: string;
    variantCount: number;
    priceRange: string;
}

const PAGE_SIZE = 10;

export default function ProductsClient({ products }: { products: Product[] }) {
    const { modal, message } = App.useApp();
    const [modalOpen, setModalOpen] = useState(false);
    const [templateModalOpen, setTemplateModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [orderedProducts, setOrderedProducts] = useState<Product[]>(products);
    const [currentPage, setCurrentPage] = useState(1);
    const [pendingActionId, setPendingActionId] = useState<string | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);

    useEffect(() => {
        setOrderedProducts(products);
    }, [products]);

    const pageProducts = useMemo(
        () => orderedProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [currentPage, orderedProducts]
    );

    const persistOrder = async (nextProducts: Product[], previousProducts: Product[], successMessage?: string) => {
        try {
            setOrderedProducts(nextProducts);
            setPendingActionId('saving');

            const res = await fetch('/api/admin/products/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds: nextProducts.map((product) => product.id) })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to reorder products');
            }

            if (successMessage) {
                message.success(successMessage);
            }
        } catch (error: any) {
            setOrderedProducts(previousProducts);
            message.error(error.message);
        } finally {
            setPendingActionId(null);
            setDraggedId(null);
            setDragOverId(null);
        }
    };

    const handleCreate = () => {
        setEditingProduct(null);
        setModalOpen(true);
    };

    const handleEdit = (product: Product) => {
        setEditingProduct(product);
        setModalOpen(true);
    };

    const handleDelete = (id: string) => {
        modal.confirm({
            title: 'Are you sure you want to delete this product?',
            content: 'This action cannot be undone.',
            onOk: async () => {
                try {
                    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete');
                    message.success('Product deleted');
                    window.location.reload();
                } catch (error: any) {
                    message.error(error.message);
                }
            }
        });
    };

    const moveProductToBoundary = (productId: string, placement: 'top' | 'bottom') => {
        const previousProducts = orderedProducts;
        const currentIndex = orderedProducts.findIndex((product) => product.id === productId);
        if (currentIndex === -1) return;

        const nextProducts = [...orderedProducts];
        const [movedProduct] = nextProducts.splice(currentIndex, 1);
        nextProducts.splice(placement === 'top' ? 0 : nextProducts.length, 0, movedProduct);

        setPendingActionId(productId);
        persistOrder(
            nextProducts.map((product, index) => ({ ...product, sortOrder: index + 1 })),
            previousProducts,
            placement === 'top' ? 'Product moved to top' : 'Product moved to bottom'
        );
    };

    const handleDragStart = (productId: string) => {
        setDraggedId(productId);
        setDragOverId(productId);
    };

    const handleDrop = (targetId: string) => {
        if (!draggedId || draggedId === targetId) {
            setDraggedId(null);
            setDragOverId(null);
            return;
        }

        const previousProducts = orderedProducts;
        const visibleIds = new Set(pageProducts.map((product) => product.id));
        const draggedIndex = orderedProducts.findIndex((product) => product.id === draggedId);
        const targetIndex = orderedProducts.findIndex((product) => product.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedId(null);
            setDragOverId(null);
            return;
        }

        if (!visibleIds.has(draggedId) || !visibleIds.has(targetId)) {
            setDraggedId(null);
            setDragOverId(null);
            return;
        }

        const nextProducts = [...orderedProducts];
        const [movedProduct] = nextProducts.splice(draggedIndex, 1);
        nextProducts.splice(targetIndex, 0, movedProduct);

        persistOrder(
            nextProducts.map((product, index) => ({ ...product, sortOrder: index + 1 })),
            previousProducts
        );
    };

    const DraggableBodyRow = (props: any) => {
        const rowKey = String(props['data-row-key']);
        const isDragged = draggedId === rowKey;
        const isDragTarget = dragOverId === rowKey && draggedId !== rowKey;

        return (
            <tr
                {...props}
                draggable
                onDragStart={() => handleDragStart(rowKey)}
                onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverId !== rowKey) {
                        setDragOverId(rowKey);
                    }
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    handleDrop(rowKey);
                }}
                onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                }}
                className={`${props.className || ''} ${isDragged ? 'opacity-60' : ''} ${isDragTarget ? 'border-t-2 border-blue-500' : ''}`}
            />
        );
    };

    const columns = [
        {
            title: '',
            key: 'drag',
            width: 54,
            render: () => (
                <div className="flex justify-center text-zinc-400 cursor-grab active:cursor-grabbing">
                    <HolderOutlined />
                </div>
            )
        },
        {
            title: 'IMAGE',
            key: 'images',
            width: 80,
            render: (_: any, record: Product) => {
                let img = '';
                try {
                    const arr = JSON.parse(record.images || '[]');
                    img = arr[0] || '';
                } catch (e) { }

                return (
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 border border-black/5 dark:border-white/5 flex items-center justify-center">
                        {img ? (
                            <img src={img} alt={record.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400">
                                <span className="text-[10px]">No Img</span>
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            render: (sku: string) => <span className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 text-xs font-semibold text-zinc-700 dark:text-zinc-300 border border-black/5 dark:border-white/5">{sku}</span>
        },
        {
            title: 'NAME',
            dataIndex: 'name',
            key: 'name',
            width: '38%',
            render: (text: string) => <span className="text-zinc-800 dark:text-zinc-200 font-medium">{text}</span>
        },
        {
            title: 'VARIANTS',
            dataIndex: 'variantCount',
            key: 'variantCount',
            render: (count: number) => (
                <div className="flex items-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${count > 0
                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-500'
                        }`}>
                        {count} variants
                    </span>
                </div>
            )
        },
        {
            title: 'PRICE RANGE',
            dataIndex: 'priceRange',
            key: 'priceRange',
            render: (range: string) => <span className="font-semibold text-zinc-700 dark:text-zinc-300">{range}</span>,
        },
        {
            title: 'STATUS',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) => (
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${isActive
                    ? 'bg-emerald-100/50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                    : 'bg-red-100/50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20'
                    }`}>
                    {isActive ? 'Active' : 'Inactive'}
                </span>
            )
        },
        {
            title: 'POSITION',
            key: 'positionActions',
            width: 220,
            render: (_: any, record: Product, index: number) => {
                const absolutePosition = (currentPage - 1) * PAGE_SIZE + index + 1;
                const isFirst = absolutePosition === 1;
                const isLast = absolutePosition === orderedProducts.length;
                const isLoading = pendingActionId === record.id || pendingActionId === 'saving';

                return (
                    <Space>
                        <Button
                            size="small"
                            icon={<VerticalAlignTopOutlined />}
                            onClick={() => moveProductToBoundary(record.id, 'top')}
                            disabled={isFirst || isLoading}
                        >
                            Move to top
                        </Button>
                        <Button
                            size="small"
                            icon={<VerticalAlignBottomOutlined />}
                            onClick={() => moveProductToBoundary(record.id, 'bottom')}
                            disabled={isLast || isLoading}
                        >
                            Move to bottom
                        </Button>
                    </Space>
                );
            }
        },
        {
            title: 'ACTIONS',
            key: 'action',
            render: (_: any, record: Product) => (
                <Space size="small">
                    <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                        className="text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                    />
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                        className="hover:bg-red-50 dark:hover:bg-red-900/20"
                    />
                </Space>
            )
        }
    ];

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">Total: {orderedProducts.length} products</span>
                <Space>
                    <Button
                        icon={<SettingOutlined />}
                        onClick={() => setTemplateModalOpen(true)}
                        className="h-10 px-4 rounded-xl"
                    >
                        Manage Templates
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleCreate}
                        className="bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 border-none h-10 px-6 rounded-xl font-semibold"
                    >
                        Create Product
                    </Button>
                </Space>
            </div>

            <div className="glass-panel rounded-2xl overflow-hidden p-1">
                <Table
                    dataSource={orderedProducts}
                    columns={columns}
                    rowKey="id"
                    pagination={{
                        pageSize: PAGE_SIZE,
                        current: currentPage,
                        onChange: (page) => setCurrentPage(page)
                    }}
                    className="glass-table"
                    components={{ body: { row: DraggableBodyRow } }}
                />
            </div>

            <ProductModal
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                product={editingProduct}
                onSuccess={() => {
                    setModalOpen(false);
                    window.location.reload();
                }}
            />

            <TemplateModal
                open={templateModalOpen}
                onCancel={() => setTemplateModalOpen(false)}
                onSuccess={() => setTemplateModalOpen(false)}
            />
        </div>
    );
}
