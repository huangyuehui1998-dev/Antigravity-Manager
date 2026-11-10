import React from 'react';
import { useTranslation } from 'react-i18next';
import { Account } from '../../types/account';
import { getModelConstrainedQuota, formatResetTime } from '../../utils/quotaDisplay';
import { cn } from '../../utils/cn';

interface DoubleQuotaCapsuleProps {
    account: Account;
}

export const DoubleQuotaCapsule: React.FC<DoubleQuotaCapsuleProps> = ({ account }) => {
    const { t } = useTranslation();
    const groups = account.quota?.quota_groups || [];
    const models = account.quota?.models || [];

    // Extract primary model across Claude, Gemini, and other models
    const primaryModel =
        models.find(m => m.name?.toLowerCase().includes('claude') && !m.name?.toLowerCase().includes('disabled'))
        || models.find(m => m.name?.toLowerCase().includes('gemini') && m.name?.toLowerCase().includes('pro') && !m.name?.toLowerCase().includes('disabled'))
        || models.find(m => m.name?.toLowerCase().includes('gemini') && !m.name?.toLowerCase().includes('disabled'))
        || models.find(m => !m.name?.toLowerCase().includes('disabled'))
        || models[0];

    const modelId = primaryModel?.name || (groups.some(g => /claude|gpt|3p/i.test(g?.display_name || '')) ? 'claude' : 'gemini');
    const constrained = getModelConstrainedQuota(modelId, primaryModel, groups);

    const isRefreshed = Boolean(account.quota && account.quota.last_updated && account.quota.last_updated > 0);
    const hasValidMetrics = constrained.raw5h !== null || constrained.rawWeekly !== null;

    // If account has no quota or has not been refreshed yet, show clean, elegant placeholder
    if (!isRefreshed || !hasValidMetrics) {
        return (
            <div className="flex flex-col gap-1 w-full max-w-[210px] py-0.5 select-none" title={t('accounts.unrefreshed_hint', '未刷新或暂无配额数据')}>
                <div className="flex items-center justify-between text-[11px] font-mono leading-none">
                    <span className="text-zinc-400 dark:text-zinc-500 font-sans text-[10px] font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        {t('accounts.quota_capsule.5h_quota', '5H 配额')}
                    </span>
                    <span className="font-semibold text-zinc-400 dark:text-zinc-500">
                        -- / --
                    </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-200 dark:bg-zinc-700 w-0" />
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono leading-none pt-0.5">
                    <span className="text-zinc-400 dark:text-zinc-500 font-sans text-[9px] font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                        {t('accounts.quota_capsule.weekly_quota', '周配额')}
                    </span>
                    <span className="font-medium text-zinc-400 dark:text-zinc-500">
                        --
                    </span>
                </div>
                <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-zinc-200 dark:bg-zinc-700 w-0" />
                </div>
            </div>
        );
    }

    const raw5h = constrained.raw5h;
    const rawWeekly = constrained.rawWeekly;

    const getBarColor = (pct: number) => {
        if (pct > 30) return 'bg-emerald-500';
        if (pct > 10) return 'bg-amber-500';
        return 'bg-rose-500';
    };

    const getTextColor = (pct: number) => {
        if (pct > 30) return 'text-emerald-600 dark:text-emerald-400';
        if (pct > 10) return 'text-amber-500';
        return 'text-rose-500';
    };

    const formattedReset = formatResetTime(constrained.resetTime);
    const tooltip = [
        primaryModel?.display_name || primaryModel?.name || modelId,
        formattedReset ? `${t('accounts.quota_capsule.reset_time', '重置时间')}: ${formattedReset}` : undefined,
    ].filter(Boolean).join(' | ');

    return (
        <div className="flex flex-col gap-1 w-full max-w-[210px] py-0.5 select-none" title={tooltip || undefined}>
            {/* 5H 滚动窗口 */}
            <div className="flex items-center justify-between text-[11px] font-mono leading-none">
                <span className="text-zinc-500 dark:text-zinc-400 font-sans text-[10px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {t('accounts.quota_capsule.5h_quota', '5H 配额')}
                </span>
                <span className={cn('font-bold', raw5h !== null ? getTextColor(raw5h) : 'text-zinc-400 dark:text-zinc-500')}>
                    {raw5h !== null ? `${raw5h}%` : '--'}
                </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-300', raw5h !== null ? getBarColor(raw5h) : 'bg-transparent')}
                    style={{ width: `${raw5h !== null ? Math.max(0, Math.min(100, raw5h)) : 0}%` }}
                />
            </div>

            {/* 周周期配额 */}
            <div className="flex items-center justify-between text-[10px] font-mono leading-none pt-0.5">
                <span className="text-zinc-400 dark:text-zinc-500 font-sans text-[9px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    {t('accounts.quota_capsule.weekly_quota', '周配额')}
                </span>
                <span className={cn('font-medium', rawWeekly !== null ? (rawWeekly <= 10 ? 'text-rose-500' : 'text-zinc-500 dark:text-zinc-400') : 'text-zinc-400 dark:text-zinc-500')}>
                    {rawWeekly !== null ? `${rawWeekly}%` : '--'}
                </span>
            </div>
            <div className="h-1 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-300', rawWeekly !== null ? (rawWeekly <= 10 ? 'bg-rose-500' : 'bg-indigo-500/80') : 'bg-transparent')}
                    style={{ width: `${rawWeekly !== null ? Math.max(0, Math.min(100, rawWeekly)) : 0}%` }}
                />
            </div>
        </div>
    );
};

export default DoubleQuotaCapsule;
