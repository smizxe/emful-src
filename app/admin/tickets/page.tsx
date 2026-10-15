import React from 'react';
import TicketManagement from './TicketManagement';

export default function TicketsPage() {
    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 dark:from-pink-300 dark:to-purple-400 bg-clip-text text-transparent">
                    Support Tickets
                </h2>
            </div>
            <div className="glass-panel rounded-2xl p-4">
                <TicketManagement />
            </div>
        </div>
    );
}
