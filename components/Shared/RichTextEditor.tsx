'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import 'react-quill-new/dist/quill.snow.css';

// Dynamic import to prevent SSR issues
const ReactQuill = dynamic(() => import('react-quill-new'), {
    ssr: false,
    loading: () => <div className="h-32 bg-gray-100 animate-pulse rounded" />,
});

interface RichTextEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

const modules = {
    toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ color: [] }, { background: [] }],
        ['link'],
        ['clean'],
    ],
};

const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'list',
    'color',
    'background',
    'link',
];

export default function RichTextEditor({
    value,
    onChange,
    placeholder,
    className,
}: RichTextEditorProps) {
    const quillModules = useMemo(() => modules, []);

    return (
        <div className={`rich-text-editor ${className || ''}`}>
            <ReactQuill
                theme="snow"
                value={value || ''}
                onChange={onChange}
                modules={quillModules}
                formats={formats}
                placeholder={placeholder}
            />
            <style jsx global>{`
        .rich-text-editor .ql-container {
          min-height: 120px;
          font-size: 14px;
        }
        .rich-text-editor .ql-editor {
          min-height: 100px;
        }
        .rich-text-editor .ql-toolbar {
          border-radius: 6px 6px 0 0;
          background: #fafafa;
        }
        .rich-text-editor .ql-container {
          border-radius: 0 0 6px 6px;
        }
      `}</style>
        </div>
    );
}

// Component to render HTML content from Quill
export function RichTextContent({ html, className }: { html: string; className?: string }) {
    if (!html) return null;

    return (
        <div
            className={`rich-text-content ${className || ''}`}
            dangerouslySetInnerHTML={{ __html: html }}
            style={{
                lineHeight: 1.6,
            }}
        />
    );
}
