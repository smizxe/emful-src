import { Spin } from 'antd';

export default function Loading() {
    return (
        <div className="w-full h-full min-h-[50vh] flex items-center justify-center">
            <Spin size="large" />
        </div>
    );
}
