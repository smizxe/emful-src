type OrderLike = {
    status: string;
    jobs: Array<{ status: string }>;
};

export function getDerivedOrderStatus(order: OrderLike) {
    const hasInProcess = order.jobs.some((job) => job.status === 'IN_PROCESS');
    const completedCount = order.jobs.filter((job) => job.status === 'COMPLETED').length;
    const allCompleted = order.jobs.length > 0 && completedCount === order.jobs.length;

    if (order.status === 'RECEIVED' && (hasInProcess || completedCount > 0)) {
        return allCompleted ? 'COMPLETED' : 'IN_PROCESS';
    }

    if (order.status === 'IN_PROCESS' && allCompleted) {
        return 'COMPLETED';
    }

    return order.status;
}

/**
 * How an order status reads on screen.
 *
 * DESIGN_REQUEST is stored as-is for compatibility, but "Design Request" now
 * means the designer queue, so an order missing its artwork reads "Design
 * Missed" instead.
 */
const ORDER_STATUS_LABELS: Record<string, string> = {
    DESIGN_REQUEST: 'Design Missed',
    AWAITING_FUNDS: 'Awaiting Funds',
    PENDING_APPROVAL: 'Pending Approval',
    RECEIVED: 'Received',
    IN_PROCESS: 'In Process',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
    READY_TO_SHIP: 'Ready To Ship',
    SHIPPED: 'Shipped',
    ARCHIVED: 'Archived',
};

export function getOrderStatusLabel(status: string | null | undefined): string {
    if (!status) return '-';
    const key = String(status).toUpperCase();
    return ORDER_STATUS_LABELS[key] || key.replace(/_/g, ' ');
}
