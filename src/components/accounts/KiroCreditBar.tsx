// src/components/accounts/KiroCreditBar.tsx
// 抄自 UsageBar/PaceBar Tracked Metrics · Credits
// Kiro IDE 本地权威 Credit 快照监控组件（对齐 ai_usagebar::kiro 语义）

import { useEffect, useState } from 'react';
import { Coins, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { request as invoke } from '../../utils/request';
import { useTranslation } from 'react-i18next';

export interface KiroCreditSnapshot {
    source: string;
    account_id: string;
    snapshot_kind: string;
    current_usage: number;
    usage_limit: number;
    reset_at?: string | null;
    free_trial_json?: string | null;
    raw_json?: string | null;
    updated_at: number;
}

interface KiroCreditBarProps {
    accountId?: string;
}

export default function KiroCreditBar({ accountId }: KiroCreditBarProps) {
    const { t } = useTranslation();
    const [snapshot, setSnapshot] = useState<KiroCreditSnapshot | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSnapshot = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await invoke<KiroCreditSnapshot | null>('get_kiro_credit_snapshot', {
                accountId: accountId || null,
            });
            setSnapshot(data);
        } catch (e: any) {
            console.warn('Failed to load kiro credit snapshot:', e);
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshot();
    }, [accountId]);

    if (loading) {
        return (
            <div className="p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 bg-purple-50/30 dark:bg-purple-950/20 flex items-center justify-between text-xs text-purple-700 dark:text-purple-300">
                <span className="flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-purple-500" />
                    {t('common.loading', '正在加载 Kiro Credit 权威快照...')}
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-950/20 flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle size={14} className="text-rose-500 shrink-0" />
                <span>{error}</span>
            </div>
        );
    }

    if (!snapshot) {
        return (
            <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-base-200 bg-gray-50/40 dark:bg-base-200/20 text-xs text-center text-gray-500 dark:text-gray-400 space-y-1">
                <p className="font-semibold">{t('accounts.kiro.no_snapshot', '未检测到 Kiro 本地 Credit 快照')}</p>
                <p className="text-[11px] opacity-75">{t('accounts.kiro.no_snapshot_hint', '请启动 Kiro IDE 并产生一次交互，数据将由本地 state.vscdb 权威同步')}</p>
            </div>
        );
    }

    const usage = snapshot.current_usage;
    const limit = snapshot.usage_limit;
    const pct = limit > 0 ? Math.min(100, Math.max(0, (usage / limit) * 100)) : 0;
    const progressColor = pct >= 85 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-500' : 'bg-purple-500';

    return (
        <div className="p-4 rounded-xl border border-purple-200/70 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 space-y-3">
            {/* 顶栏标题与百分比 */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300">
                        <Coins size={16} />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                            <span>Kiro Agent Credit 水位</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-200/60 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200 font-mono">
                                本地权威快照
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                            {`${usage.toLocaleString()} / ${limit.toLocaleString()} Credits`}
                        </p>
                    </div>
                </div>

                {/* B1 UIA 单文本节点百分比 */}
                <div className="text-right">
                    <span className="text-sm font-bold font-mono text-purple-700 dark:text-purple-300">
                        {`${Math.round(pct)}%`}
                    </span>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">已消耗</p>
                </div>
            </div>

            {/* 进度条 */}
            <div className="w-full h-2 rounded-full bg-purple-100 dark:bg-base-200 overflow-hidden">
                <div
                    className={`h-full ${progressColor} transition-all duration-300 rounded-full`}
                    style={{ width: `${pct}%` }}
                />
            </div>

            {/* 重置时间与更新状态 */}
            <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 pt-1 border-t border-purple-100/60 dark:border-purple-900/20">
                <div className="flex items-center gap-1">
                    <Clock size={12} className="text-purple-400" />
                    <span>重置周期：</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">
                        {snapshot.reset_at || '未提供'}
                    </span>
                </div>
                <div className="text-[10px] font-mono text-gray-400">
                    {`更新于: ${new Date(snapshot.updated_at).toLocaleTimeString()}`}
                </div>
            </div>
        </div>
    );
}
