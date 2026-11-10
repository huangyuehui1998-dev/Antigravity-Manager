import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types/account';

interface AccountStatusBadgeProps {
    account: Account;
    onViewError?: () => void;
    onReleaseJail?: () => void;
}

export const AccountStatusBadge: React.FC<AccountStatusBadgeProps> = ({
    account,
    onViewError,
    onReleaseJail,
}) => {
    const { t } = useTranslation();
    const [secondsLeft, setSecondsLeft] = useState<number | null>(account.qos_reset_seconds ?? null);

    useEffect(() => {
        const initial = account.qos_reset_seconds ?? null;
        setSecondsLeft(initial);
        if (initial === null || initial <= 0) return;

        const timer = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [account.qos_reset_seconds]);

    const isCoolingWithTimer = secondsLeft !== null && secondsLeft > 0;
    const isJailed = account.qos_status === 'jailed';
    const isRateLimited = account.qos_status === 'rate_limited';
    const isSuspicious = account.qos_status === 'suspicious';
    const isProbing = account.qos_status === 'probing' || account.qos_status === 'half_open';
    const isForbidden = Boolean(account.quota?.is_forbidden);
    const isValidation = Boolean(account.validation_blocked);
    const isDisabled = Boolean(account.disabled);

    if (isDisabled) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
                {t('accounts.status.disabled', '已禁用')}
            </span>
        );
    }

    if (isForbidden) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onViewError?.();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium"
                title={t('accounts.click_to_view_error', '点击查看封禁详情')}
            >
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                {t('accounts.status.forbidden', '已封禁')}
            </button>
        );
    }

    if (isValidation) {
        return (
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onViewError?.();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium"
                title={t('accounts.click_to_view_error', '点击查看人机验证/申诉要求')}
            >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                {t('accounts.status.validation_required', '需验证')}
            </button>
        );
    }

    // QoS Cooling / Jailed / Rate limited
    if (isCoolingWithTimer || isJailed || (isRateLimited && secondsLeft !== 0)) {
        const displaySeconds = secondsLeft ?? account.qos_reset_seconds;
        return (
            <div className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span>
                    {isCoolingWithTimer
                        ? `${t('accounts.status.cooling', '冷却中')} (${displaySeconds}s)`
                        : isJailed
                            ? t('accounts.qos.jailed', '已进小黑屋')
                            : t('accounts.status.cooling', '冷却中')}
                </span>
                {onReleaseJail && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReleaseJail();
                        }}
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-0.5 shrink-0"
                    >
                        {t('accounts.qos.release_btn', '解除')}
                    </button>
                )}
            </div>
        );
    }

    if (isSuspicious) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                {t('accounts.qos.suspicious', '异常监测')}
            </span>
        );
    }

    if (isProbing) {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                {t('accounts.qos.probing', '解限探测中')}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            {t('accounts.status.healthy', '正常')}
        </span>
    );
};

export default AccountStatusBadge;
