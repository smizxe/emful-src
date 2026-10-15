// Currency formatting utilities

export function formatCurrency(amount: number, currency: string = 'USD'): string {
    if (currency.toUpperCase() === 'VND') {
        // VND: No decimals, with thousand separators
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    } else {
        // USD and others: 2 decimal places
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }
}

export function formatAmount(amount: number, currency: string = 'USD'): string {
    // Format without currency symbol, just the number
    if (currency.toUpperCase() === 'VND') {
        return new Intl.NumberFormat('vi-VN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    } else {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }
}

// Simple helper for USD display with $ prefix
export function usd(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

// Simple helper for VND display
export function vnd(amount: number): string {
    return `${Math.round(amount).toLocaleString('vi-VN')} ₫`;
}
