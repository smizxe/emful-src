'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Card, Table, Button, Tag, notification, Modal, Input, Select, Spin, Descriptions, Space, Badge, Tooltip, Checkbox } from 'antd';
import dayjs from 'dayjs';
import {
    ReloadOutlined, RocketOutlined, PrinterOutlined, LinkOutlined, DollarCircleOutlined, EditOutlined, SaveOutlined, CalendarOutlined, SortAscendingOutlined, DownOutlined, UpOutlined, DownloadOutlined,
    InboxOutlined, CheckCircleOutlined, WalletOutlined, CalculatorOutlined, InfoCircleOutlined, ExpandOutlined, CompressOutlined, EyeOutlined, ImportOutlined, UploadOutlined, SearchOutlined, CopyOutlined
} from '@ant-design/icons';
import { reparseAddressIfNeeded } from '@/lib/addressParser';
import { stripDuplicateOrderSuffix } from '@/lib/orderCodes';
import { getShippingStatusLabel } from '@/lib/shippingStatus';

interface Job {
    id: string;
    status: string;
    recipientName: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    country: string | null;
    sku: string;
    qty: number;
    designs?: string;
    notes?: string;
}

interface Order {
    id: string;
    orderCode: string;
    status: string;
    shippingStatus: string;
    totalAmount: number;
    trackingNumber: string | null;
    carrier: string | null;
    priorityShipping?: boolean | null;
    createdAt: string;
    seller: { contactEmail: string | null; name: string | null };
    jobs: Job[];
}

// Grouped Order Interface
interface GroupedOrder extends Omit<Order, 'id' | 'jobs'> {
    id: string; // Use Base Order Code as ID for table key
    baseOrderCode: string;
    subOrderIds: string[]; // List of all Order IDs in this group
    subOrders: Order[];    // Full order objects
    jobs: Job[];           // Aggregated jobs
    itemCount: number;
    priorityShipping?: boolean | null;
}

const shippingStatusPriority: Record<string, number> = {
    PENDING: 0,
    LABEL_CREATED: 1,
    RECEIVED: 2,
    IN_TRANSIT: 3,
    DELIVERED: 4,
    EXCEPTION: 5,
};

const productionStatusFilterOptions = [
    { value: 'RECEIVED', label: 'Received' },
    { value: 'IN_PROCESS', label: 'In Process' },
    { value: 'COMPLETED', label: 'Completed' },
];

const shippingStatusFilterOptions = [
    { value: 'PENDING', label: getShippingStatusLabel('PENDING') },
    { value: 'LABEL_CREATED', label: getShippingStatusLabel('LABEL_CREATED') },
    { value: 'RECEIVED', label: getShippingStatusLabel('RECEIVED') },
    { value: 'IN_TRANSIT', label: getShippingStatusLabel('IN_TRANSIT') },
    { value: 'DELIVERED', label: getShippingStatusLabel('DELIVERED') },
    { value: 'EXCEPTION', label: getShippingStatusLabel('EXCEPTION') },
];

function parseDesignLocations(designs?: string) {
    try {
        const parsed = JSON.parse(designs || '[]');
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((design: any) => String(design?.location || design?.position || '').trim())
            .filter(Boolean)
            .slice(0, 4);
    } catch {
        return [];
    }
}

interface ShippingRate {
    postage_type: string;
    postage_description: string;
    price: number;
    currency: string;
    estimated_delivery_days?: number;
    postage_type_id?: number;
}

interface ShippingSyncState {
    isRunning: boolean;
    runId: string | null;
    lastSource: 'cron' | 'manual' | null;
    lastRequestedAt: string | null;
    lastStartedAt: string | null;
    lastSuccessfulAt: string | null;
    lastFinishedAt: string | null;
    nextEligibleAt: string | null;
    lastError: string | null;
    lastProcessedCount: number;
    lastUpdatedCount: number;
    hasMore: boolean;
}

export default function ShippingPage() {
    const [api, contextHolder] = notification.useNotification();
    const [orders, setOrders] = useState<Order[]>([]);
    const [isSandbox, setIsSandbox] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [syncState, setSyncState] = useState<ShippingSyncState | null>(null);
    const [syncLoading, setSyncLoading] = useState(false);
    const [syncTriggering, setSyncTriggering] = useState(false);
    const previousSyncRunningRef = useRef(false);

    // Selection now targets GroupedOrder
    const [selectedGroup, setSelectedGroup] = useState<GroupedOrder | null>(null);

    const [modalVisible, setModalVisible] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string[]>([]);
    const [dateRange, setDateRange] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('newest');
    const [searchText, setSearchText] = useState('');
    // Antd keeps the current page when the rows change, so a search made from
    // page 3 would land on page 3 of a one-row result and look empty.
    const [page, setPage] = useState(1);

    const [countryFilter, setCountryFilter] = useState('All');
    useEffect(() => { setPage(1); }, [searchText, countryFilter]);
    const [shippingStatusFilter, setShippingStatusFilter] = useState<string[]>([]);

    // Shipping form state
    const [weight, setWeight] = useState('0.5');
    const [length, setLength] = useState('20');
    const [width, setWidth] = useState('12');
    const [height, setHeight] = useState('6');
    const [contents, setContents] = useState('Sweatshirt, 50/50 poly/cotton');
    const [value, setValue] = useState('8');
    const [currency, setCurrency] = useState('CAD');
    const [hsCode, setHsCode] = useState('6110.20.20.41');
    const [countryOfOrigin, setCountryOfOrigin] = useState('CN');
    const [customsDescription, setCustomsDescription] = useState('Shirt 50/50 Cotton/Poly');
    // Recipient address overrides (admin can correct if data is wrong)
    const [recipientStreet1, setRecipientStreet1] = useState('');
    const [recipientCity, setRecipientCity] = useState('');
    const [recipientProvinceCode, setRecipientProvinceCode] = useState('');
    const [recipientCountryCode, setRecipientCountryCode] = useState('US');
    const [recipientPostalCode, setRecipientPostalCode] = useState('');
    const [rates, setRates] = useState<ShippingRate[]>([]);
    const [loadingRates, setLoadingRates] = useState(false);
    const [selectedRate, setSelectedRate] = useState<string>('');
    const [creating, setCreating] = useState(false);
    const [labelUrl, setLabelUrl] = useState<string | null>(null);

    // Edit Tracking State
    const [editTrackingModalVisible, setEditTrackingModalVisible] = useState(false);
    const [editingOrderForTracking, setEditingOrderForTracking] = useState<Order | null>(null);
    const [newTrackingNumber, setNewTrackingNumber] = useState('');
    const [newCarrier, setNewCarrier] = useState('');
    const [updatingTracking, setUpdatingTracking] = useState(false);
    const [importingTracking, setImportingTracking] = useState(false);
    const trackingInputRef = useRef<HTMLInputElement>(null);

    const openEditTracking = (order: Order) => {
        setEditingOrderForTracking(order);
        setNewTrackingNumber(order.trackingNumber || '');
        setNewCarrier(order.carrier || '');
        setEditTrackingModalVisible(true);
    };

    const handleUpdateTracking = async () => {
        if (!editingOrderForTracking) return;
        setUpdatingTracking(true);
        try {
            const res = await fetch(`/api/admin/orders/${editingOrderForTracking.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    trackingNumber: newTrackingNumber,
                    carrier: newCarrier
                })
            });

            if (res.ok) {
                api.success({ title: 'Tracking Updated' });
                setEditTrackingModalVisible(false);
                fetchOrders(); // Refresh table
            } else {
                api.error({ title: 'Failed to update tracking' });
            }
        } catch (e) {
            api.error({ title: 'Error updating tracking' });
        } finally {
            setUpdatingTracking(false);
        }
    };

    // Bulk Rates State
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [bulkRates, setBulkRates] = useState<Record<string, { price: number; currency: string; service: string; code: string }>>({});
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkCreating, setBulkCreating] = useState(false);

    const [bulkErrors, setBulkErrors] = useState<Record<string, string>>({});
    const [savingDetails, setSavingDetails] = useState(false);

    const saveOrderDetails = async () => {
        if (!selectedGroup) return;
        setSavingDetails(true);
        try {
            // Update ALL sub-orders with the new address
            for (const orderId of selectedGroup.subOrderIds) {
                const subOrder = selectedGroup.subOrders.find(o => o.id === orderId);
                if (!subOrder) continue;

                await fetch(`/api/admin/orders/${orderId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        recipientName: subOrder.jobs[0]?.recipientName,
                        phone: subOrder.jobs[0]?.phone,
                        street1: recipientStreet1,
                        city: recipientCity,
                        provinceCode: recipientProvinceCode,
                        postalCode: recipientPostalCode,
                        countryCode: recipientCountryCode,
                    }),
                });
            }

            api.success({ title: 'Group details updated' });
            setModalVisible(false);
            fetchOrders();
        } catch (e) {
            api.error({ title: 'Update failed' });
        } finally {
            setSavingDetails(false);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({
                dateRange,
                sortBy
            });
            const res = await fetch(`/api/admin/shipping?${query.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch orders');
            const data = await res.json();
            setOrders(data.orders || []);
            setIsSandbox(data.isSandbox);
        } catch (error) {
            api.error({ title: 'Error', description: 'Failed to load shipping orders' });
        } finally {
            setLoading(false);
        }
    };

    const fetchSyncState = async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!silent) {
            setSyncLoading(true);
        }

        try {
            const res = await fetch('/api/admin/shipping/sync-status', {
                cache: 'no-store',
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to load shipping sync status');
            }

            setSyncState(data.state || null);
        } catch (error: any) {
            if (!silent) {
                api.error({ title: 'Error', description: error.message || 'Failed to load shipping sync status' });
            }
        } finally {
            if (!silent) {
                setSyncLoading(false);
            }
        }
    };

    const triggerSync = async () => {
        setSyncTriggering(true);
        try {
            const res = await fetch('/api/admin/shipping/sync-status', {
                method: 'POST',
                cache: 'no-store',
            });
            const data = await res.json();

            if (res.status === 409) {
                setSyncState(data.state || null);
                api.warning({
                    title: 'Sync already running',
                    description: 'Shipping status sync is already in progress.',
                });
                return;
            }

            if (!res.ok) {
                throw new Error(data.error || 'Failed to start shipping status sync');
            }

            api.success({
                title: 'Sync started',
                description: 'Shipping status sync has been queued.',
            });

            await fetchSyncState({ silent: true });
        } catch (error: any) {
            api.error({
                title: 'Failed to start sync',
                description: error.message || 'Could not start shipping status sync',
            });
        } finally {
            setSyncTriggering(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [dateRange, sortBy]);

    useEffect(() => {
        fetchSyncState({ silent: true });
    }, []);

    useEffect(() => {
        if (!syncState?.isRunning) {
            if (previousSyncRunningRef.current) {
                fetchOrders();
                fetchSyncState({ silent: true });
            }
            previousSyncRunningRef.current = false;
            return;
        }

        previousSyncRunningRef.current = true;
        const interval = setInterval(() => {
            fetchSyncState({ silent: true });
        }, 5000);

        return () => clearInterval(interval);
    }, [syncState?.isRunning]);

    // --- GROUPING LOGIC ---
    const groupedOrders: GroupedOrder[] = useMemo(() => {
        const groups: Record<string, GroupedOrder> = {};

        orders.forEach(order => {
            // Strip suffix: ORDER123(1) -> ORDER123
            const baseCode = stripDuplicateOrderSuffix(order.orderCode);

            if (!groups[baseCode]) {
                groups[baseCode] = {
                    id: baseCode, // Use Base Code as Group ID
                    baseOrderCode: baseCode,
                    orderCode: baseCode,
                    status: order.status, // Setup initial status
                    shippingStatus: order.shippingStatus || 'PENDING',
                    totalAmount: 0,
                    trackingNumber: order.trackingNumber,
                    carrier: order.carrier,
                    priorityShipping: false,
                    createdAt: order.createdAt,
                    seller: order.seller,
                    subOrderIds: [],
                    subOrders: [],
                    jobs: [],
                    itemCount: 0
                };
            }

            const group = groups[baseCode];
            group.subOrderIds.push(order.id);
            group.subOrders.push(order);
            group.jobs.push(...order.jobs);
            group.totalAmount += order.totalAmount;
            group.itemCount += order.jobs.reduce((sum, j) => sum + j.qty, 0);
            group.priorityShipping = Boolean(group.priorityShipping || order.priorityShipping);
        });

        // Finalize Groups (sort jobs, fix status aggregation if needed)
        return Object.values(groups).map(g => {
            // Normalize legacy SHIPPED production states into COMPLETED.
            const allShipped = g.subOrders.every(o => o.status === 'SHIPPED');
            const anyReady = g.subOrders.some(o => ['READY_TO_SHIP', 'COMPLETED'].includes(o.status));

            if (allShipped) g.status = 'COMPLETED';
            else if (anyReady) g.status = 'READY_TO_SHIP';
            else g.status = g.subOrders[0].status; // Fallback

            // Aggregate tracking numbers if multiple
            const tracks = [...new Set(g.subOrders.map(o => o.trackingNumber).filter((t): t is string => !!t))];
            if (tracks.length > 0) g.trackingNumber = tracks.join(', ');

            g.shippingStatus = g.subOrders.reduce((current, order) => {
                const orderShippingStatus = order.shippingStatus || (order.trackingNumber ? 'LABEL_CREATED' : 'PENDING');
                const currentRank = shippingStatusPriority[current] ?? 0;
                const nextRank = shippingStatusPriority[orderShippingStatus] ?? 0;
                return nextRank >= currentRank ? orderShippingStatus : current;
            }, g.shippingStatus || 'PENDING');

            return g;
        }).sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            if (sortBy === 'oldest') return dateA - dateB;
            return dateB - dateA; // Default to newest
        });
    }, [orders, sortBy]);

    const filteredGroupedOrders = groupedOrders.filter(g => {
        // 1. Status Filter
        let matchesStatus = true;
        if (filterStatus.length > 0) {
            matchesStatus = filterStatus.some(status => {
                if (status === 'COMPLETED') return ['COMPLETED', 'READY_TO_SHIP'].includes(g.status);
                return g.status === status;
            });
        }

        // 2. Country Filter
        let matchesCountry = true;
        if (countryFilter !== 'All') {
            // Check first job country
            const country = (g.jobs[0]?.country || 'US').toUpperCase();
            matchesCountry = country === countryFilter;
        }

        // 3. Shipping Status Filter
        let matchesShippingStatus = true;
        if (shippingStatusFilter.length > 0) {
            const status = g.shippingStatus || 'PENDING';
            matchesShippingStatus = shippingStatusFilter.includes(status);
        }

        // 4. Search Filter (Order Code, Recipient, Seller Name, Seller Email)
        let matchesSearch = true;
        if (searchText) {
            const lowText = searchText.toLowerCase();
            const orderCode = g.baseOrderCode.toLowerCase();
            const recipient = (g.jobs[0]?.recipientName || '').toLowerCase();
            const sellerName = (g.seller?.name || '').toLowerCase();
            const sellerEmail = (g.seller?.contactEmail || '').toLowerCase();

            matchesSearch = orderCode.includes(lowText) ||
                recipient.includes(lowText) ||
                sellerName.includes(lowText) ||
                sellerEmail.includes(lowText);
        }

        return matchesStatus && matchesCountry && matchesShippingStatus && matchesSearch;
    });

    const openShippingModal = (group: GroupedOrder) => {
        setSelectedGroup(group);
        setModalVisible(true);
        setRates([]);
        setSelectedRate('');
        setLabelUrl(null);

        // Sum total Qty from all jobs
        const totalQty = group.itemCount;

        // Base values for Qty 1
        let baseWeight = 0.36;
        let baseL = 20;
        let baseW = 12;
        let baseH = 6;

        let finalWeight = baseWeight;
        let finalL = baseL;
        let finalW = baseW;
        let finalH = baseH;

        if (totalQty > 1) {
            finalWeight = baseWeight * totalQty;
            const extra = 3 * (totalQty - 1);
            finalL += extra;
            finalW += extra;
            finalH += extra;
        }

        setWeight(finalWeight.toFixed(2));
        setLength(finalL.toString());
        setWidth(finalW.toString());
        setHeight(finalH.toString());

        setContents('Sweatshirt, 50/50 poly/cotton');
        setValue('8');
        setCurrency('CAD');
        setHsCode('6110.20.20.41');
        setCountryOfOrigin('MX');
        setCustomsDescription('Shirt 50/50 Cotton/Poly');

        // Try to detect country code from FIRST job of FIRST order
        const firstOrder = group.subOrders[0];
        const job0 = firstOrder?.jobs[0];

        if (job0) {
            // Initialize address fields from job
            setRecipientStreet1(job0.address1 || '');
            setRecipientCity(job0.city || '');
            setRecipientProvinceCode(job0.state || '');

            const rawCountry = (job0.country || '').trim();
            const rawZip = (job0.zip || '').trim();
            const countryLower = rawCountry.toLowerCase();

            // Detect full country names
            if (countryLower === 'canada' || countryLower.includes('canada')) {
                setRecipientCountryCode('CA');
                setRecipientPostalCode(rawZip);
            } else if (countryLower === 'usa' || countryLower.includes('united states') || countryLower === 'us') {
                setRecipientCountryCode('US');
                setRecipientPostalCode(rawZip);
            } else if (countryLower === 'mexico' || countryLower === 'mx') {
                setRecipientCountryCode('MX');
                setRecipientPostalCode(rawZip);
            } else if (rawCountry && rawCountry.length === 2 && /^[A-Z]{2}$/i.test(rawCountry)) {
                // Country is likely a valid 2-letter code
                setRecipientCountryCode(rawCountry.toUpperCase());
                setRecipientPostalCode(rawZip);
            } else if (rawZip && rawZip.length === 2 && /^[A-Z]{2}$/i.test(rawZip)) {
                // Swapped: zip contains country code
                setRecipientCountryCode(rawZip.toUpperCase());
                setRecipientPostalCode(rawCountry);
            } else {
                // Default to US, let admin correct
                setRecipientCountryCode('US');
                setRecipientPostalCode(rawZip || rawCountry);
            }
        }
    };

    const fetchRates = async () => {
        if (!selectedGroup || selectedGroup.jobs.length === 0) return;

        const job = selectedGroup.jobs[0];
        setLoadingRates(true);

        try {
            const res = await fetch('/api/admin/shipping/rates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toAddress: {
                        // Use admin-entered values
                        name: job.recipientName,
                        street1: recipientStreet1 || job.address1,
                        city: recipientCity || job.city,
                        state: recipientProvinceCode || job.state,
                        postalCode: recipientPostalCode || job.zip,
                        countryCode: recipientCountryCode,
                        phone: job.phone,
                    },
                    weight: parseFloat(weight),
                    length: parseFloat(length),
                    width: parseFloat(width),
                    height: parseFloat(height),
                    packageContents: contents,
                    value: parseFloat(value),
                    currency: currency,
                    hsCode: hsCode,
                    countryOfOrigin: countryOfOrigin,
                    customsDescription: customsDescription
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to get rates');
            }

            const data = await res.json();
            setRates(data.rates || []);
            if (data.rates?.length > 0) {
                setSelectedRate(data.rates[0].postage_type);
            }
        } catch (error: any) {
            api.error({ title: 'Error', description: error.message || 'Failed to fetch shipping rates' });
        } finally {
            setLoadingRates(false);
        }
    };

    const createShipment = async () => {
        if (!selectedGroup || !selectedRate) return;

        const selectedRateObj = rates.find(r => r.postage_type === selectedRate);

        setCreating(true);
        try {
            const res = await fetch('/api/admin/shipping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderIds: selectedGroup.subOrderIds, // SEND ALL IDs
                    postageType: selectedRate,
                    postageTypeId: selectedRateObj?.postage_type_id,
                    weight: parseFloat(weight),
                    length: parseFloat(length),
                    width: parseFloat(width),
                    height: parseFloat(height),
                    packageContents: contents,
                    value: parseFloat(value),
                    currency: currency,
                    hsCode: hsCode,
                    countryOfOrigin: countryOfOrigin,
                    customsDescription: customsDescription,
                    productSku: selectedGroup.jobs[0]?.sku,
                    // Admin-corrected address fields
                    recipientStreet1: recipientStreet1,
                    recipientCity: recipientCity,
                    recipientProvinceCode: recipientProvinceCode,
                    recipientCountryCode: recipientCountryCode,
                    recipientPostalCode: recipientPostalCode
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create shipment');
            }

            const data = await res.json();
            api.success({
                title: 'Shipment Created!',
                description: `Tracking: ${data.trackingNumber} for ${data.orderIds ? data.orderIds.length : 1} orders`
            });

            setLabelUrl(data.labelUrl);
            fetchOrders(); // Refresh list
        } catch (error: any) {
            api.error({ title: 'Error', description: error.message || 'Failed to create shipment' });
        } finally {
            setCreating(false);
        }
    };

    const fetchBulkRates = async () => {
        // With grouping, selectedRowKeys are BASE CODES (Group IDs)
        if (selectedRowKeys.length === 0) {
            api.warning({ title: 'No orders selected' });
            return;
        }

        setBulkLoading(true);
        setBulkErrors({});
        const newBulkRates: Record<string, { price: number; currency: string; service: string; code: string }> = {};
        const newBulkErrors: Record<string, string> = {};

        for (const groupId of selectedRowKeys) {
            const group = groupedOrders.find(g => g.id === groupId);
            if (!group) continue;

            const job0 = group.jobs[0];
            if (!job0) continue;

            // Apply scaling logic for API call
            const totalQty = group.itemCount;
            let w = 0.36;
            let l = 20, wd = 12, h = 6;

            if (totalQty > 1) {
                w = 0.36 * totalQty;
                const extra = 3 * (totalQty - 1);
                l += extra;
                wd += extra;
                h += extra;
            }

            try {
                // Determine raw address/country logic
                let rCountry = job0.country || 'US';
                let rZip = job0.zip || '';
                const rawC = job0.country || '';

                // Handle Swapped Fields (common issue: Country in Zip field)
                if (rZip.length === 2 && /^[A-Z]{2}$/i.test(rZip) && (!rawC || rawC.length > 2)) {
                    rCountry = rZip.toUpperCase();
                    rZip = rawC;
                } else if (rawC.length === 2 && /^[A-Z]{2}$/i.test(rawC)) {
                    rCountry = rawC.toUpperCase();
                }

                const res = await fetch('/api/admin/shipping/rates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        toAddress: {
                            name: job0.recipientName,
                            street1: job0.address1,
                            city: job0.city,
                            state: job0.state,
                            postalCode: rZip,
                            countryCode: rCountry,
                            phone: job0.phone,
                        },
                        weight: w,
                        length: l,
                        width: wd,
                        height: h,
                        packageContents: 'Sweatshirt, 50/50 poly/cotton',
                        value: 8,
                        currency: 'CAD',
                        hsCode: '6110.20.20.41',
                        countryOfOrigin: 'MX',
                        customsDescription: 'Shirt 50/50 Cotton/Poly'
                    }),
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.rates && data.rates.length > 0) {
                        const best = data.rates[0];
                        // Save rate keyed by Group ID
                        newBulkRates[group.id] = {
                            price: best.price,
                            currency: best.currency,
                            service: best.postage_description || best.postage_type,
                            code: best.postage_type
                        };
                    } else {
                        newBulkErrors[group.id] = 'No rates found';
                    }
                } else {
                    newBulkErrors[group.id] = `Failed: ${res.status}`;
                }
            } catch (e: any) {
                newBulkErrors[group.id] = e.message || 'Error fetching rate';
            }

            // Update UI progressively
            setBulkRates({ ...newBulkRates });
            setBulkErrors({ ...newBulkErrors });
        }

        setBulkLoading(false);
        api.success({ title: 'Bulk rates fetching completed' });
    };

    const createBulkShipments = async () => {
        // Filter groups that have rates
        const groupsToShip = selectedRowKeys.filter(id => bulkRates[id as string]);
        if (groupsToShip.length === 0) {
            api.warning({ title: 'No orders with valid rates selected' });
            return;
        }

        setBulkCreating(true);
        let successCount = 0;
        let failCount = 0;

        for (const groupId of groupsToShip) {
            const group = groupedOrders.find(g => g.id === groupId);
            const rateInfo = bulkRates[groupId as string];
            if (!group || !rateInfo) continue;

            const job0 = group.jobs[0];
            if (!job0) continue;

            // Address/Country Logic
            let rCountry = job0.country || 'US';
            let rZip = job0.zip || '';
            const rawC = job0.country || '';

            if (rZip.length === 2 && /^[A-Z]{2}$/i.test(rZip) && (!rawC || rawC.length > 2)) {
                rCountry = rZip.toUpperCase();
                rZip = rawC;
            } else if (rawC.length === 2 && /^[A-Z]{2}$/i.test(rawC)) {
                rCountry = rawC.toUpperCase();
            }

            // Scaling logic
            const totalQty = group.itemCount;
            let w = 0.36;
            let l = 20, wd = 12, h = 6;
            if (totalQty > 1) {
                w = 0.36 * totalQty;
                const extra = 3 * (totalQty - 1);
                l += extra;
                wd += extra;
                h += extra;
            }

            try {
                const res = await fetch('/api/admin/shipping', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderIds: group.subOrderIds, // Send ALL IDs
                        postageType: rateInfo.code,
                        weight: w,
                        length: l,
                        width: wd,
                        height: h,
                        packageContents: 'Sweatshirt, 50/50 poly/cotton',
                        value: 8,
                        currency: 'CAD',
                        hsCode: '6110.20.20.41',
                        countryOfOrigin: 'MX',
                        customsDescription: 'Shirt 50/50 Cotton/Poly',
                        productSku: job0.sku,
                        recipientStreet1: job0.address1,
                        recipientCity: job0.city,
                        recipientProvinceCode: job0.state,
                        recipientCountryCode: rCountry,
                        recipientPostalCode: rZip,
                    }),
                });

                if (res.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                console.error(`Failed to create shipment for group ${group.id}`, err);
                failCount++;
            }
        }

        setBulkCreating(false);
        api.info({
            title: 'Bulk Creation Finished',
            description: `Success: ${successCount}, Failed: ${failCount}`
        });
        fetchOrders();
        setSelectedRowKeys([]);
        setBulkRates({});
    };

    const handleExportStallionCSV = async () => {
        if (selectedRowKeys.length === 0) {
            api.warning({ title: 'No orders selected' });
            return;
        }

        // Fetch product SKU → Product Map
        let skuProductMap: Record<string, any> = {};
        try {
            const res = await fetch('/api/admin/products');
            if (res.ok) {
                const products = await res.json();
                products.forEach((p: any) => {
                    if (p.sku) skuProductMap[p.sku] = p;
                });
            }
        } catch (e) {
            console.warn('Could not fetch products, using defaults');
        }

        const header = [
            'Order ID', 'Name', 'Address1', 'Address2', 'City', 'Province Code', 'Postal Code', 'Country Code',
            'Phone', 'Email', 'Package Type', 'Item Description', 'Item Sku', 'Item Quantity', 'Item Value',
            'Item Currency', 'Item HS Code', 'Item Country Of Origin', 'Item Customs Description',
            'Total Weight', 'Weight Unit', 'Length', 'Width', 'Height', 'Size Unit',
            'Need Postage?', 'Postage Type', 'Tracking Code', 'Additional Insurance', 'Signature',
            'Position 1', 'Position 2', 'Position 3', 'Position 4'
        ];

        const rows: string[] = [];

        // Helper to escape CSV fields
        const esc = (val: string | number | null | undefined) => {
            if (val === null || val === undefined) return '';
            const s = String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        selectedRowKeys.forEach(groupId => {
            const group = groupedOrders.find(g => g.id === groupId);
            if (!group) return;

            const job0 = group.jobs[0];
            if (!job0) return; // Should not happen
            const product = skuProductMap[job0.sku];
            const designLocations = Array.from(
                new Set(group.jobs.flatMap((job) => parseDesignLocations(job.designs)))
            ).slice(0, 4);

            // Use explicit address fields (populated by Import v2)
            // Fallback to legacy parser for old orders
            const hasExplicitStruct = job0.city && job0.state && job0.zip;

            let parsedAddr = {
                address1: job0.address1 || '',
                address2: job0.address2 || '',
                city: job0.city || '',
                state: job0.state || '',
                zip: job0.zip || '',
                country: job0.country || 'US'
            };

            if (!hasExplicitStruct) {
                parsedAddr = reparseAddressIfNeeded(
                    job0.address1 || '',
                    job0.city || '',
                    job0.state || '',
                    job0.zip || '',
                    job0.country || 'US'
                );
            }

            // Address Logic (copied/adapted from createBulkShipments logic)
            let rCountry = parsedAddr.country || 'US';
            let rZip = parsedAddr.zip || '';

            if (rZip.length === 2 && /^[A-Z]{2}$/i.test(rZip) && (!parsedAddr.country || parsedAddr.country.length > 2)) {
                rCountry = rZip.toUpperCase();
                rZip = parsedAddr.country;
            } else if (parsedAddr.country.length === 2 && /^[A-Z]{2}$/i.test(parsedAddr.country)) {
                rCountry = parsedAddr.country.toUpperCase();
            }

            // Normalize Country Code (Full Name -> ISO)
            const cLower = rCountry.toLowerCase();
            if (cLower === 'united states' || cLower === 'usa' || cLower.includes('united states')) rCountry = 'US';
            else if (cLower === 'canada' || cLower.includes('canada')) rCountry = 'CA';
            else if (cLower === 'mexico') rCountry = 'MX';

            // Scaling Logic (Same as openShippingModal)
            const totalQty = group.itemCount;
            // Base values for Qty 1
            let baseWeight = product?.itemWeight ?? 0.36;
            let baseL = product?.itemLength ?? 20;
            let baseW = product?.itemWidth ?? 12;
            let baseH = product?.itemHeight ?? 6;

            let finalWeight = baseWeight;
            let finalL = baseL;
            let finalW = baseW;
            let finalH = baseH;

            if (totalQty > 1) {
                finalWeight = baseWeight * totalQty;
                const extra = 3 * (totalQty - 1);
                finalL += extra;
                finalW += extra;
                finalH += extra;
            }

            // Construct Row with parsed address
            const row = [
                esc(group.baseOrderCode),               // Order ID
                esc(job0.recipientName),                // Name
                esc(parsedAddr.address1),               // Address1
                esc(parsedAddr.address2),               // Address2
                esc(parsedAddr.city),                   // City
                esc(parsedAddr.state),                  // Province Code
                esc(rZip),                              // Postal Code
                esc(rCountry),                          // Country Code
                esc(job0.phone),                        // Phone
                '',                                     // Email
                'Package',                              // Package Type
                esc(product?.itemDescription || 'Sweatshirt, 50/50 poly/cotton'), // Item Description
                esc(job0.sku),                          // Item Sku
                esc(totalQty),                          // Item Quantity
                esc(product?.itemValue ?? 8),           // Item Value
                esc(product?.itemCurrency || 'CAD'),    // Item Currency
                esc(product?.hsCode || '6110.20.20.41'),// Item HS Code
                esc(product?.countryOfOrigin || 'MX'),  // Item Country Of Origin
                esc(product?.customsDescription || 'Shirt 50/50 Cotton/Poly'), // Item Customs Description
                esc(finalWeight.toFixed(2)),            // Total Weight
                esc(product?.weightUnit || 'kg'),       // Weight Unit
                esc(finalL),                            // Length
                esc(finalW),                            // Width
                esc(finalH),                            // Height
                esc(product?.sizeUnit || 'cm'),         // Size Unit
                'yes',                                  // Need Postage?
                '',                                     // Postage Type
                '',                                     // Tracking Code
                '',                                     // Additional Insurance
                '',                                     // Signature
                esc(designLocations[0] || ''),          // Position 1
                esc(designLocations[1] || ''),          // Position 2
                esc(designLocations[2] || ''),          // Position 3
                esc(designLocations[3] || ''),          // Position 4
            ];

            rows.push(row.join(','));
        });

        const csvContent = [header.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'stallion_import.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleTrackingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportingTracking(true);
        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            if (workbook.SheetNames.length === 0) {
                api.error({ title: 'Invalid file', description: 'No sheets found' });
                return;
            }
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 }); // Array of arrays

            if (data.length === 0) {
                api.error({ title: 'Empty file' });
                return;
            }

            // Find header row. Look for "Order ID" and "Tracking Code"
            const headerRowIndex = data.findIndex((row: any[]) => row && row.includes('Order ID') && row.includes('Tracking Code'));

            if (headerRowIndex === -1) {
                api.error({
                    title: 'Invalid Format',
                    description: 'Could not find "Order ID" and "Tracking Code" columns. Please use the standard Stallion Export format.'
                });
                return;
            }

            const headers = data[headerRowIndex] as string[];
            const orderIdIdx = headers.indexOf('Order ID');
            const trackingIdx = headers.indexOf('Tracking Code');
            const carrierIdx = headers.indexOf('Carrier');
            const statusIdx = headers.findIndex((header: string) => ['Status', 'Shipment Status', 'Tracking Status', 'Delivery Status'].includes(header));

            const updates: any[] = [];
            // Stallion adds a leading ' to values - strip it
            const stripLeadingQuote = (val: any) => String(val ?? '').replace(/^'/, '').trim();

            for (let i = headerRowIndex + 1; i < data.length; i++) {
                const row = data[i] as any[];
                if (!row || row.length === 0) continue;

                const orderCode = stripLeadingQuote(row[orderIdIdx]);
                const tracking = stripLeadingQuote(row[trackingIdx]);
                const carrier = carrierIdx > -1 ? stripLeadingQuote(row[carrierIdx]) : 'Stallion Express';
                const shippingStatus = statusIdx > -1 ? stripLeadingQuote(row[statusIdx]) : '';

                if (orderCode && tracking) {
                    updates.push({ orderCode, trackingNumber: tracking, carrier, shippingStatus });
                }
            }

            if (updates.length > 0) {
                const res = await fetch('/api/admin/shipping/import-tracking', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                const json = await res.json();

                if (res.ok && json.success) {
                    api.success({
                        title: 'Import Successful',
                        description: `Updated ${json.updatedGroups || 0} base order group(s) / ${json.updatedOrderCount || json.importedCount || 0} order(s). Failed or not found: ${json.notFoundCount || 0}.`
                    });
                    if (json.failedOrders?.length > 0) {
                        console.warn('Failed Orders:', json.failedOrders);
                    }
                    fetchOrders(); // Refresh table
                } else {
                    api.error({ title: 'Import Failed', description: json.error || 'Unknown error' });
                }
            } else {
                api.warning({ title: 'No valid data found', description: 'No rows with both Order ID and Tracking Code found.' });
            }

        } catch (err: any) {
            console.error(err);
            api.error({ title: 'Error parsing file', description: err.message });
        } finally {
            setImportingTracking(false);
            if (trackingInputRef.current) trackingInputRef.current.value = '';
        }
    };



    const columns = [
        {
            title: 'Order ID',
            dataIndex: 'baseOrderCode',
            key: 'baseOrderCode',
            render: (code: string, record: GroupedOrder) => (
                <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">{code}</span>
                    {record.subOrders.length > 1 && (
                        <Badge count={record.subOrders.length} style={{ backgroundColor: '#52c41a' }} />
                    )}
                </div>
            )
        },
        {
            title: 'SELLER',
            dataIndex: ['seller', 'name'],
            key: 'seller',
            render: (name: string | null) => <span className="text-zinc-600 dark:text-zinc-400">{name || 'N/A'}</span>,
        },
        {
            title: 'RECIPIENT',
            key: 'recipient',
            render: (_: any, record: GroupedOrder) => <span className="text-zinc-700 dark:text-zinc-300 font-medium">{record.jobs[0]?.recipientName || 'N/A'}</span>,
        },
        {
            title: 'COUNTRY',
            key: 'country',
            render: (_: any, record: GroupedOrder) => {
                const c = record.jobs[0]?.country || 'US';
                return <Tag>{c}</Tag>;
            }
        },
        {
            title: 'STATUS',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => {
                const normalizedStatus = status === 'SHIPPED' ? 'COMPLETED' : status;
                return (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${normalizedStatus === 'COMPLETED'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                    }`}>
                    {normalizedStatus}
                </span>
            )},
        },
        {
            title: 'TRACKING',
            dataIndex: 'trackingNumber',
            key: 'trackingNumber',
            render: (tracking: string | null, record: GroupedOrder) => (
                <div className="flex items-center gap-2">
                    {tracking ? (
                        <>
                            <span className="font-mono text-xs px-2 py-1 rounded bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-400">{tracking}</span>
                            <Tooltip title="Copy Tracking">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(tracking);
                                        api.success({ title: 'Copied tracking number', description: tracking });
                                    }}
                                />
                            </Tooltip>
                        </>
                    ) : (
                        <span className="text-zinc-300">-</span>
                    )}
                    {/* Allow editing individual order tracking if group has 1 order, or... logic complex for group. 
                        For now, assuming editable if group has 1 order or just edit the first one?
                        Requirement: "Admin Shipping, phần Tracking, admin có thể edit (sửa) được."
                        Let's show edit button for each order in the expanded view OR if strictly 1 order in group.
                    */}
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                            e.stopPropagation();
                            // If group has multiple suborders, WHICH one to edit?
                            // Usually editable tracking is per package.
                            // If multiple orders in group -> they share tracking?
                            // Let's assume we edit the first order's tracking which propagates to group view.
                            if (record.subOrders.length > 0) openEditTracking(record.subOrders[0]);
                        }}
                    />
                </div>
            ),
        },
        {
            title: 'SHIPPING STATUS',
            dataIndex: 'shippingStatus',
            key: 'shippingStatus',
            render: (shippingStatus: string) => {
                const status = shippingStatus || 'PENDING';
                const statusClass = status === 'DELIVERED'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                    : status === 'IN_TRANSIT'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                        : status === 'RECEIVED'
                            ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20'
                            : status === 'EXCEPTION'
                                ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';

                return (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${statusClass}`}>
                        {getShippingStatusLabel(status)}
                    </span>
                );
            }
        },
        {
            title: 'Priority Shipping',
            key: 'priorityShipping',
            align: 'center' as const,
            render: (_: any, record: GroupedOrder) => (
                <Checkbox checked={Boolean(record.priorityShipping)} disabled />
            )
        },
        {
            title: 'EST. RATE',
            key: 'bulkRate',
            render: (_: any, record: GroupedOrder) => {
                const rate = bulkRates[record.id];
                const error = bulkErrors[record.id];
                if (rate) {
                    return (
                        <div className="text-xs">
                            <div className="font-bold text-green-600">${rate.price} {rate.currency}</div>
                            <div className="text-zinc-400 text-[10px] truncate max-w-[100px]" title={rate.service}>{rate.service}</div>
                        </div>
                    );
                }
                if (error) {
                    return <span className="text-xs text-red-500 font-medium">{error}</span>;
                }
                return <span className="text-zinc-300">-</span>;
            }
        },
        {
            title: 'ACTION',
            key: 'action',
            render: (_: any, record: GroupedOrder) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        size="small"
                        onClick={() => openShippingModal(record)}
                    />
                    <Button
                        type="primary"
                        icon={<RocketOutlined />}
                        disabled={!!record.trackingNumber || record.shippingStatus !== 'PENDING'}
                        onClick={() => openShippingModal(record)}
                        className={`${!!record.trackingNumber || record.shippingStatus !== 'PENDING'
                            ? 'bg-zinc-200 text-zinc-400 border-transparent dark:bg-white/5 dark:text-zinc-600'
                            : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 border-none shadow-md shadow-blue-500/20'
                            }`}
                        size="small"
                    >
                        {!!record.trackingNumber || record.shippingStatus !== 'PENDING'
                            ? getShippingStatusLabel(record.shippingStatus)
                            : 'Create Label'}
                    </Button>
                </Space>
            ),
        },
    ];

    const selectedRateInfo = rates.find(r => r.postage_type === selectedRate);
    const formatSyncTime = (value: string | null) => {
        if (!value) return 'Never';
        return dayjs(value).format('MMM D, YYYY HH:mm');
    };

    return (
        <div>
            {contextHolder}

            <Modal
                title="Edit Tracking Number"
                open={editTrackingModalVisible}
                onCancel={() => setEditTrackingModalVisible(false)}
                onOk={handleUpdateTracking}
                confirmLoading={updatingTracking}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Tracking Number</label>
                        <Input
                            value={newTrackingNumber}
                            onChange={(e) => setNewTrackingNumber(e.target.value)}
                            placeholder="Enter new tracking number"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Carrier</label>
                        <Select
                            className="w-full"
                            value={newCarrier}
                            onChange={setNewCarrier}
                            options={[
                                { value: 'UPS', label: 'UPS' },
                                { value: 'USPS', label: 'USPS' },
                                { value: 'DHL', label: 'DHL' },
                                { value: 'FedEx', label: 'FedEx' },
                                { value: 'Canada Post', label: 'Canada Post' },
                                { value: 'Stallion Express', label: 'Stallion Express' },
                                { value: 'Other', label: 'Other' }
                            ]}
                        />
                    </div>
                </div>
            </Modal>
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent m-0">Shipping Management</h1>
                    {isSandbox !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${isSandbox
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                            }`}>
                            {isSandbox ? 'Sandbox / Test Mode' : 'Production Mode'}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        onClick={triggerSync}
                        loading={syncTriggering}
                        disabled={!!syncState?.isRunning}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-none shadow-md shadow-emerald-500/20"
                    >
                        SYNC Shipping Status
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchOrders}
                        loading={loading}
                        className="bg-white/50 dark:bg-white/10 border-zinc-200 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20"
                    >
                        Refresh
                    </Button>

                    <Input
                        placeholder="Search Order / Seller / Email..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="w-full sm:w-64"
                        allowClear
                    />

                    <Select
                        value={countryFilter}
                        onChange={setCountryFilter}
                        style={{ width: 140 }}
                        className="bg-white/50 dark:bg-white/10 rounded-md"
                        options={[
                            { value: 'All', label: 'All Countries' },
                            { value: 'US', label: 'US Only' },
                            { value: 'CA', label: 'CA Only' }
                        ]}
                    />

                    <Select
                        mode="multiple"
                        allowClear
                        value={filterStatus}
                        onChange={setFilterStatus}
                        placeholder="All Production"
                        maxTagCount="responsive"
                        style={{ width: 190 }}
                        variant="borderless"
                        className="bg-white/50 dark:bg-white/10 rounded-md"
                        options={productionStatusFilterOptions}
                    />

                    <Select
                        mode="multiple"
                        allowClear
                        value={shippingStatusFilter}
                        onChange={setShippingStatusFilter}
                        placeholder="All Shipping"
                        maxTagCount="responsive"
                        style={{ width: 190 }}
                        variant="borderless"
                        className="bg-white/50 dark:bg-white/10 rounded-md"
                        options={shippingStatusFilterOptions}
                    />

                    <Select
                        value={dateRange}
                        onChange={setDateRange}
                        style={{ width: 120 }}
                        variant="borderless"
                        className="bg-white/50 dark:bg-white/10 rounded-md"
                        options={[
                            { value: 'all', label: 'All Time' },
                            { value: 'today', label: 'Today' },
                            { value: 'week', label: 'This Week' },
                            { value: 'month', label: 'This Month' }
                        ]}
                    />

                    <Select
                        value={sortBy}
                        onChange={setSortBy}
                        style={{ width: 140 }}
                        variant="borderless"
                        className="bg-white/50 dark:bg-white/10 rounded-md"
                        options={[
                            { value: 'newest', label: 'Newest First' },
                            { value: 'oldest', label: 'Oldest First' },
                            { value: 'value_high', label: 'Value: High-Low' },
                            { value: 'value_low', label: 'Value: Low-High' }
                        ]}
                    />

                    {selectedRowKeys.length > 0 && (
                        <Button
                            type="primary"
                            icon={<DollarCircleOutlined />}
                            onClick={fetchBulkRates}
                            loading={bulkLoading}
                            className="bg-green-600 hover:bg-green-500"
                        >
                            Get Bulk Rates ({selectedRowKeys.length})
                        </Button>
                    )}
                    {selectedRowKeys.length > 0 && Object.keys(bulkRates).length > 0 && (
                        <Button
                            type="primary"
                            icon={<RocketOutlined />}
                            onClick={createBulkShipments}
                            loading={bulkCreating}
                            className="bg-blue-600 hover:bg-blue-500"
                        >
                            Create Shipments ({Object.keys(bulkRates).length})
                        </Button>
                    )}
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={handleExportStallionCSV}
                        disabled={selectedRowKeys.length === 0}
                    >
                        Export Stallion CSV
                    </Button>
                    <input
                        type="file"
                        hidden
                        ref={trackingInputRef}
                        onChange={handleTrackingUpload}
                        accept=".csv,.xlsx,.xls"
                    />
                    <Button
                        icon={<ImportOutlined />}
                        onClick={() => trackingInputRef.current?.click()}
                        loading={importingTracking}
                    >
                        Import Stallion Tracking
                    </Button>
                </div>
            </div>

            <Card
                size="small"
                loading={syncLoading}
                className="mb-4 border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/5"
            >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-sm">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span><span className="font-medium">Last successful sync:</span> {formatSyncTime(syncState?.lastSuccessfulAt || null)}</span>
                        <span><span className="font-medium">Last source:</span> {(syncState?.lastSource || 'N/A').toUpperCase()}</span>
                        <span><span className="font-medium">Next eligible sync:</span> {formatSyncTime(syncState?.nextEligibleAt || null)}</span>
                        <span><span className="font-medium">Last processed / updated:</span> {syncState?.lastProcessedCount || 0} / {syncState?.lastUpdatedCount || 0}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Tag color={syncState?.isRunning ? 'processing' : 'default'}>
                            {syncState?.isRunning ? 'Sync in progress' : 'Idle'}
                        </Tag>
                        {syncState?.hasMore ? <Tag color="warning">More candidates pending</Tag> : null}
                    </div>
                </div>
                {syncState?.lastError ? (
                    <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                        <span className="font-medium">Last error:</span> {syncState.lastError}
                    </div>
                ) : null}
            </Card>

            <div className="glass-panel rounded-2xl overflow-hidden p-1 shadow-sm">
                <div className="px-5 py-4 border-b border-black/5 dark:border-white/5">
                    <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">Orders ({filteredGroupedOrders.length})</h3>
                </div>
                <Table
                    dataSource={filteredGroupedOrders}
                    columns={columns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 20, current: page, onChange: setPage }}
                    className="glass-table"
                    expandable={{
                        expandedRowRender: (group) => (
                            <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-lg">
                                {/* Iterate Sub-Orders */}
                                {group.subOrders.map(order => (
                                    <div key={order.id} className="mb-4 last:mb-0 border-b last:border-0 border-zinc-200 pb-2">
                                        <div className="text-xs font-bold text-zinc-500 mb-2">
                                            {order.orderCode} <span className="font-normal text-zinc-400">({order.status})</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {order.jobs.map((job: any) => (
                                                <div key={job.id} className="border border-gray-200 dark:border-zinc-700 rounded p-3 bg-white dark:bg-zinc-800">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <div className="font-bold text-zinc-700 dark:text-zinc-200">{job.sku}</div>
                                                            <div className="text-xs text-zinc-500">{job.recipientName}</div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono text-xs bg-gray-100 dark:bg-zinc-700 px-1 rounded">x{job.qty}</div>
                                                        </div>
                                                    </div>

                                                    {job.designs && (
                                                        <div className="mb-2">
                                                            <div className="text-[10px] uppercase font-bold text-zinc-400">Designs</div>
                                                            <div className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                                                                {(() => {
                                                                    try {
                                                                        const d = JSON.parse(job.designs || '[]');
                                                                        return d.map((x: any, i: number) => (
                                                                            <div key={i}><a href={x.url} target="_blank" className="text-blue-500 hover:underline">{x.location || 'Link'}</a> ({x.type})</div>
                                                                        ));
                                                                    } catch { return 'Invalid JSON'; }
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {job.notes && (
                                                        <div>
                                                            <div className="text-[10px] uppercase font-bold text-zinc-400">Notes</div>
                                                            <div className="text-xs text-amber-600 dark:text-amber-500 whitespace-pre-line font-medium bg-amber-50 dark:bg-amber-900/20 p-1 rounded">
                                                                {job.notes}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ),
                        rowExpandable: (record) => record.subOrders?.length > 0,
                    }}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys) => setSelectedRowKeys(keys)
                    }}
                />
            </div>

            <Modal
                title={`Create Shipment - ${selectedGroup?.baseOrderCode}`}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                width={700}
            >
                {selectedGroup && (
                    <div className="space-y-6">
                        {/* SECTION 1: Customer / Order Info */}
                        <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-lg p-4">
                            <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
                                📦 Order Group Information <Badge count={selectedGroup.subOrders.length} style={{ backgroundColor: '#1890ff' }} />
                            </h4>
                            <Descriptions bordered size="small" column={2}>
                                <Descriptions.Item label="Recipient">
                                    {selectedGroup.jobs[0]?.recipientName || 'N/A'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Phone">
                                    {selectedGroup.jobs[0]?.phone || 'N/A'}
                                </Descriptions.Item>
                                <Descriptions.Item label="Address" span={2}>
                                    {selectedGroup.jobs[0]?.address1}
                                    {selectedGroup.jobs[0]?.city && `, ${selectedGroup.jobs[0]?.city}`}
                                    {selectedGroup.jobs[0]?.state && `, ${selectedGroup.jobs[0]?.state}`}
                                    {selectedGroup.jobs[0]?.zip && ` ${selectedGroup.jobs[0]?.zip}`}
                                    {selectedGroup.jobs[0]?.country && `, ${selectedGroup.jobs[0]?.country}`}
                                </Descriptions.Item>
                                <Descriptions.Item label="Total Items" span={2}>
                                    {selectedGroup.itemCount} items from {selectedGroup.subOrders.length} orders
                                </Descriptions.Item>
                            </Descriptions>
                        </div>

                        {/* SECTION 2: Stallion Settings */}
                        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
                            <h4 className="font-semibold text-zinc-700 dark:text-zinc-300 mb-4 flex items-center gap-2">
                                🚚 Stallion Shipping Settings
                            </h4>

                            {/* Destination Address Override */}
                            <div className="mb-4">
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide block mb-2">Destination Address (Override if needed)</label>
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div className="col-span-2">
                                        <label className="text-xs text-zinc-500 block mb-1">Street Address</label>
                                        <Input value={recipientStreet1} onChange={e => setRecipientStreet1(e.target.value)} placeholder="2165 E 41 Ave" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">City</label>
                                        <Input value={recipientCity} onChange={e => setRecipientCity(e.target.value)} placeholder="Vancouver" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">State/Province (2-letter)</label>
                                        <Input value={recipientProvinceCode} onChange={e => setRecipientProvinceCode(e.target.value.toUpperCase())} placeholder="BC" maxLength={2} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Country Code (ISO 2-letter: US, CA, MX)</label>
                                        <Input value={recipientCountryCode} onChange={e => setRecipientCountryCode(e.target.value.toUpperCase())} placeholder="US" maxLength={2} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Postal Code</label>
                                        <Input value={recipientPostalCode} onChange={e => setRecipientPostalCode(e.target.value)} placeholder="V5P 1L3" />
                                    </div>
                                </div>
                            </div>

                            {/* Package Dimensions */}
                            <div className="mb-4">
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide block mb-2">Package</label>
                                <div className="grid grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Weight (kg)</label>
                                        <Input type="number" value={weight} onChange={e => setWeight(e.target.value)} min="0.1" step="0.1" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Length (cm)</label>
                                        <Input type="number" value={length} onChange={e => setLength(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Width (cm)</label>
                                        <Input type="number" value={width} onChange={e => setWidth(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Height (cm)</label>
                                        <Input type="number" value={height} onChange={e => setHeight(e.target.value)} />
                                    </div>
                                </div>
                            </div>

                            {/* Item / Customs Info */}
                            <div className="mb-4">
                                <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide block mb-2">Customs / Item Info</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Item Description</label>
                                        <Input value={contents} onChange={e => setContents(e.target.value)} placeholder="Sweatshirt, 50/50 poly/cotton" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Customs Description</label>
                                        <Input value={customsDescription} onChange={e => setCustomsDescription(e.target.value)} placeholder="Shirt 50/50 Cotton/Poly" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">HS Code</label>
                                        <Input value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="6110.20.20.41" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Country of Origin</label>
                                        <Input value={countryOfOrigin} onChange={e => setCountryOfOrigin(e.target.value)} placeholder="CN" maxLength={2} />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Declared Value</label>
                                        <Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="10" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-zinc-500 block mb-1">Currency</label>
                                        <Select value={currency} onChange={setCurrency} style={{ width: '100%' }}>
                                            <Select.Option value="CAD">CAD</Select.Option>
                                            <Select.Option value="USD">USD</Select.Option>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Button */}
                            <div className="flex justify-end gap-2">
                                <Button
                                    onClick={saveOrderDetails}
                                    loading={savingDetails}
                                    icon={<SaveOutlined />}
                                >
                                    Save Address Changes
                                </Button>
                                <Button onClick={fetchRates} loading={loadingRates} type="primary">
                                    Get Shipping Rates
                                </Button>
                            </div>
                        </div>

                        {/* Rates Selection */}
                        {loadingRates && (
                            <Spin tip="Fetching rates...">
                                <div className="p-8 text-center text-gray-400">Loading...</div>
                            </Spin>
                        )}

                        {rates.length > 0 && (
                            <div>
                                <label className="font-medium block mb-2">Select Shipping Service:</label>
                                <Select
                                    value={selectedRate}
                                    onChange={setSelectedRate}
                                    style={{ width: '100%' }}
                                >
                                    {rates.map(rate => (
                                        <Select.Option key={rate.postage_type} value={rate.postage_type}>
                                            {rate.postage_description} - ${rate.price?.toFixed(2) ?? 'N/A'} {rate.currency ?? ''}
                                            {rate.estimated_delivery_days && ` (${rate.estimated_delivery_days} days)`}
                                        </Select.Option>
                                    ))}
                                </Select>

                                {selectedRateInfo && selectedRateInfo.price != null && (
                                    <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/30 rounded text-center">
                                        <span className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                            Total: ${selectedRateInfo.price.toFixed(2)} {selectedRateInfo.currency}
                                        </span>
                                    </div>
                                )}

                                {selectedRateInfo && selectedRateInfo.price == null && (
                                    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/30 rounded text-center text-xs">
                                        <span className="text-amber-700 dark:text-amber-300">
                                            ℹ️ Price not available in Sandbox environment
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Label URL (after creation) */}
                        {labelUrl && (
                            <div className="p-4 bg-green-50 border border-green-200 rounded">
                                <p className="font-bold text-green-700 mb-2">✅ Shipment Created Successfully!</p>
                                <Button
                                    type="primary"
                                    icon={<PrinterOutlined />}
                                    onClick={() => window.open(labelUrl, '_blank')}
                                >
                                    Download / Print Label
                                </Button>
                            </div>
                        )}

                        {/* Action Buttons */}
                        {!labelUrl && (
                            <div className="flex justify-end gap-2 pt-4 border-t">
                                <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                                <Button
                                    type="primary"
                                    icon={<RocketOutlined />}
                                    onClick={createShipment}
                                    loading={creating}
                                    disabled={!selectedRate || rates.length === 0}
                                >
                                    Create Shipment & Get Label
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}
