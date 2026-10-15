import React from 'react';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';

export default async function FileViewerPage({ params }: { params: { token: string } }) {
    const { token } = await params;

    // Robust cleanup similar to scan API
    // decodeURIComponent in case it was somehow encoded in URL path
    const cleanToken = decodeURIComponent(token).trim();

    const qrToken = await prisma.qrToken.findUnique({
        where: { token: cleanToken },
        include: {
            job: true
        }
    });

    if (!qrToken || qrToken.type !== 'FILE') {
        return (
            <div className="p-8 text-center flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
                <h1 className="text-3xl font-bold text-red-500 mb-4">Invalid File Token</h1>
                <p className="text-slate-400 mb-8">The link you accessed is invalid or has expired.</p>
                <div className="bg-slate-800 p-4 rounded font-mono text-sm text-yellow-500 border border-slate-700">
                    Token Received: {cleanToken}
                </div>
            </div>
        );
    }

    const job = qrToken.job;

    let parsedDesigns: any[] = [];
    try {
        if (job.designs) parsedDesigns = JSON.parse(job.designs);
    } catch (e) { }

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
            <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-lg border border-slate-700">
                <div className="flex justify-between items-center mb-6">
                    <span className="text-slate-400 text-sm">FILE VIEWER</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${job.status === 'COMPLETED' ? 'bg-green-500' : 'bg-yellow-500 text-black'}`}>
                        {job.status}
                    </span>
                </div>

                <h1 className="text-4xl font-bold mb-2 tracking-tight">{job.jobCode}</h1>
                <p className="text-xl text-cyan-400 mb-8 font-mono">{job.sku}</p>

                <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                    <div className="bg-slate-700 p-3 rounded">
                        <span className="block text-slate-400 mb-1">Color</span>
                        <span className="font-bold text-lg">{job.color || '-'}</span>
                    </div>
                    <div className="bg-slate-700 p-3 rounded">
                        <span className="block text-slate-400 mb-1">Size</span>
                        <span className="font-bold text-lg">{job.size || '-'}</span>
                    </div>
                    <div className="bg-slate-700 p-3 rounded col-span-2">
                        <span className="block text-slate-400 mb-1">Quantity/Qty</span>
                        <span className="font-bold text-3xl">{job.qty}</span>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Note */}
                    {job.notes && (
                        <div className="bg-slate-700 p-4 rounded-lg border border-slate-600">
                            <h3 className="text-slate-400 text-xs font-bold uppercase mb-2">Note</h3>
                            <p className="text-white whitespace-pre-line text-sm">{job.notes}</p>
                        </div>
                    )}
                    {/* Design Links */}
                    {parsedDesigns.length > 0 ? (
                        <div className="space-y-4">
                            {parsedDesigns.map((d: any, idx: number) => (
                                <div key={idx} className="bg-slate-700 p-4 rounded-lg">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-slate-400 text-sm font-bold uppercase">
                                            {`POS ${idx + 1}${d.location ? ` - ${d.location}` : ''}`}
                                        </h3>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <a href={d.url} target="_blank" className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-center rounded-lg font-bold text-white transition-colors">
                                            OPEN DESIGN
                                        </a>
                                        {d.mockup && (
                                            <a href={d.mockup} target="_blank" className="block w-full py-3 bg-purple-600 hover:bg-purple-500 text-center rounded-lg font-bold text-white transition-colors">
                                                OPEN MOCKUP
                                            </a>
                                        )}
                                        {d.type && (
                                            <div className="w-full py-2 text-center rounded-lg font-bold text-orange-400 bg-slate-800 border border-slate-600">
                                                TYPE: {d.type}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : job.embroideryDriveLink ? (
                        <a
                            href={job.embroideryDriveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full py-4 bg-blue-600 hover:bg-blue-500 text-center rounded-lg font-bold text-lg transition-colors"
                        >
                            OPEN IN GOOGLE DRIVE
                        </a>
                    ) : (
                        <div className="text-center text-gray-500 italic py-4">No Design Files Attached</div>
                    )}

                    {/* Local File Fallback (Placeholder) */}
                    {job.fileLocalPath && (
                        <a
                            href={`/api/files/${job.id}`} // Hypothetical endpoint
                            className="block w-full py-3 bg-gray-700 hover:bg-gray-600 text-center rounded-lg font-bold transition-colors"
                        >
                            DOWNLOAD LOCAL COPY
                        </a>
                    )}


                </div>

                <div className="mt-8 pt-4 border-t border-slate-700 text-center text-slate-500 text-xs">
                    <p>EmFulFill Production System</p>
                    <p>{new Date().toLocaleDateString()}</p>
                </div>
            </div>
        </div>
    );
}
