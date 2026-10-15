'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Layout, Button, Input, Spin, Avatar, Space, Image, Upload, message, Select } from 'antd';
import { ArrowLeftOutlined, SendOutlined, UserOutlined, CustomerServiceOutlined, PaperClipOutlined, LoadingOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useVisiblePolling } from '@/hooks/useVisiblePolling';
import { shrinkImageForUpload } from '@/lib/shrinkImage';

const { Content } = Layout;
const { TextArea } = Input;
const { Option } = Select;

interface TicketMessage {
    id: string;
    senderId: string;
    senderRole: 'USER' | 'ADMIN';
    message: string;
    imageUrl?: string;
    attachments?: { id: string, url: string, type: string }[];
    createdAt: string;
}

interface Ticket {
    id: string;
    subject: string;
    status: string;
    user: { email: string };
    order?: { orderCode: string };
}

/**
 * Shared ticket chat/detail view used by both the admin (/admin/tickets/[id])
 * and staff (/staff/tickets/[id]) portals. `basePath` controls where the back
 * button returns to.
 */
export default function TicketDetailClient({ basePath = '/admin' }: { basePath?: string }) {
    const params = useParams();
    const router = useRouter();
    const ticketId = params.id as string;

    const [ticket, setTicket] = useState<Ticket | null>(null);
    const [messages, setMessages] = useState<TicketMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [newMessage, setNewMessage] = useState('');
    const [attachments, setAttachments] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const fetchData = async () => {
        try {
            const ticketRes = await fetch(`/api/admin/tickets/${ticketId}`);
            if (ticketRes.ok) {
                const ticketData = await ticketRes.json();
                setTicket(ticketData);
            }

            const msgRes = await fetch(`/api/tickets/${ticketId}/messages`);
            if (msgRes.ok) {
                const msgData = await msgRes.json();
                setMessages(msgData);
            }
        } catch (error) {
            console.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useVisiblePolling(fetchData, { intervalMs: 60000 });

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() && attachments.length === 0) return;
        setSending(true);
        try {
            const res = await fetch(`/api/tickets/${ticketId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: newMessage,
                    senderRole: 'ADMIN',
                    attachments: attachments
                })
            });

            if (res.ok) {
                setNewMessage('');
                setAttachments([]);
                fetchData();
            } else {
                message.error('Failed to send message');
            }
        } catch (error) {
            message.error('Error sending message');
        } finally {
            setSending(false);
        }
    };

    const handleImageUpload = async (options: any) => {
        const { file, onSuccess, onError } = options;
        const formData = new FormData();
        formData.append('file', await shrinkImageForUpload(file));
        setUploading(true);

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            if (res.ok) {
                const data = await res.json();
                setAttachments(prev => [...prev, data.url]);
                onSuccess("Ok");
            } else {
                onError("Upload failed");
            }
        } catch (err) {
            onError("Upload error");
        } finally {
            setUploading(false);
        }
    };

    if (loading && !ticket) return <div className="p-8"><Spin size="large" /></div>;

    return (
        <Content className="p-6 h-[calc(100vh-64px)] flex flex-col">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm">
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(`${basePath}/tickets`)} />
                    <div>
                        <h2 className="text-xl font-bold m-0">{ticket?.subject || 'Ticket Details'}</h2>
                        <div className="text-gray-500 text-sm flex gap-2">
                            <span>User: {ticket?.user?.email}</span>
                            {ticket?.order?.orderCode && <span>| Order: {ticket.order.orderCode}</span>}
                        </div>
                    </div>
                </Space>
                <Space>
                    {ticket?.status && (
                        <span className={ticket.status === 'RESOLVED' ? 'text-green-600 font-semibold' : ticket.status === 'REJECTED' ? 'text-red-500 font-semibold' : 'text-amber-500 font-semibold'}>
                            {ticket.status}
                        </span>
                    )}
                </Space>
            </div>

            {/* Chat Area */}
            <div className="flex-1 glass-panel rounded-2xl p-4 overflow-y-auto mb-4 bg-white/50 dark:bg-black/20 flex flex-col gap-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-400 mt-10">No messages yet.</div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderRole === 'ADMIN';
                        return (
                            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex max-w-[80%] ${isMe ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
                                    <Avatar
                                        icon={isMe ? <CustomerServiceOutlined /> : <UserOutlined />}
                                        className={isMe ? 'bg-purple-600' : 'bg-blue-500'}
                                    />
                                    <div className={`
                                        p-3 rounded-2xl
                                        ${isMe
                                            ? 'bg-purple-600 text-white rounded-tr-none'
                                            : 'bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-tl-none'}
                                    `}>
                                        <div className="whitespace-pre-wrap">{msg.message}</div>
                                        {msg.imageUrl && (
                                            <Image
                                                src={msg.imageUrl}
                                                alt="attachment"
                                                className="mt-2 rounded-lg max-h-48 object-cover"
                                                width={200}
                                            />
                                        )}
                                        {msg.attachments && msg.attachments.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {msg.attachments.map(att => (
                                                    <Image
                                                        key={att.id}
                                                        src={att.url}
                                                        alt="attachment"
                                                        className="rounded-lg object-cover"
                                                        width={150}
                                                        height={100}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <div className={`text-xs mt-1 ${isMe ? 'text-purple-200' : 'text-gray-400'}`}>
                                            {new Date(msg.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="glass-panel rounded-2xl p-4 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800">
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {attachments.map((url, idx) => (
                            <div key={idx} className="relative inline-block">
                                <Image src={url} height={60} width={60} className="rounded object-cover" />
                                <Button
                                    className="absolute -top-2 -right-2"
                                    size="small"
                                    shape="circle"
                                    danger
                                    icon={<CloseCircleOutlined />}
                                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                />
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex gap-2">
                    <Upload
                        customRequest={handleImageUpload}
                        showUploadList={false}
                        accept="image/*"
                        multiple
                    >
                        <Button icon={uploading ? <LoadingOutlined /> : <PaperClipOutlined />} />
                    </Upload>
                    <TextArea
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a reply..."
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                    />
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        loading={sending}
                        onClick={handleSendMessage}
                        className="bg-purple-600 hover:bg-purple-500"
                    >
                        Send
                    </Button>
                </div>
            </div>
        </Content>
    );
}
