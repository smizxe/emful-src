"use client";

import React from 'react';

export default function TrackingLogo() {
    return (
        <div className="w-full h-16 relative flex items-center justify-center mb-2">
            <img
                src="https://stallionexpress.ca/wp-content/themes/stallion-express/assets/images/logo.svg"
                alt="Stallion Express"
                className="h-10 w-auto"
                onError={(e) => {
                    // Fallback if image fails
                    e.currentTarget.style.display = 'none';
                    // Show the text div next to it
                    const textDiv = e.currentTarget.nextElementSibling;
                    if (textDiv) {
                        textDiv.classList.remove('hidden');
                    }
                }}
            />
            <div className="hidden text-xl font-bold italic text-red-600">Stallion Express</div>
        </div>
    );
}
