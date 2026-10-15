type AccessUser = {
    isBanned?: boolean | null;
    bannedReason?: string | null;
    suspendedUntil?: Date | string | null;
    suspensionReason?: string | null;
};

export type UserAccessStatus =
    | { blocked: false }
    | {
        blocked: true;
        code: 'BANNED' | 'SUSPENDED';
        message: string;
    };

export function getRemainingSuspendDays(suspendedUntil: Date | string) {
    const suspendDate = suspendedUntil instanceof Date ? suspendedUntil : new Date(suspendedUntil);
    const diffMs = suspendDate.getTime() - Date.now();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function getUserAccessStatus(user: AccessUser | null | undefined): UserAccessStatus {
    if (!user) {
        return { blocked: false };
    }

    if (user.isBanned) {
        return {
            blocked: true,
            code: 'BANNED',
            message: 'You Are Banned - bạn bị banned.'
        };
    }

    if (user.suspendedUntil) {
        const suspendDate = user.suspendedUntil instanceof Date ? user.suspendedUntil : new Date(user.suspendedUntil);

        if (suspendDate.getTime() > Date.now()) {
            const remainingDays = getRemainingSuspendDays(suspendDate);
            return {
                blocked: true,
                code: 'SUSPENDED',
                message: `Bạn bị suspend, còn ${remainingDays} ngày nữa mới được đăng nhập.`
            };
        }
    }

    return { blocked: false };
}
