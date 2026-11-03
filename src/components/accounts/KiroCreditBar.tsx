// src/components/accounts/KiroCreditBar.tsx
// 抄自 UsageBar/PaceBar Tracked Metrics · Credits & 本仓 FinancialDashboard.handleManualSync
// Kiro IDE 本地权威 Credit 快照监控组件（对齐 ai_usagebar::kiro 语义）

import { useEffect, useState } from 'react';
import { Coins, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { request as invoke } from '../../utils/request';
import { useTranslation } from 'react-i18next';
import { showToast } from '../common/ToastContainer';

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
    const [syncing, setSyncing] = useState<boolean>(false);
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

    // P0-4: 显式同步按钮处理函数（复用既有 refresh_financial_analytics，禁造新 API）
    const handleManualSync = async () => {
        if (syncing) return;
        setSyncing(true);
        try {
            const report: any = await invoke('refresh_financial_analytics');
            const kiroSource = report?.sources?.find((s: any) => s.source === 'kiro');
            let toastMsg = report?.message || '增量同步完成';
            if (kiroSource) {
                const skipText = kiroSource.skip_reason ? ` (${kiroSource.skip_reason})` : '';
                const errText = kiroSource.error ? `, 错误: ${kiroSource.error}` : '';
                const kiroSummary = `Kiro: 扫描 ${kiroSource.scanned}, 写入 ${kiroSource.inserted}, 跳过 ${kiroSource.skipped}${skipText}${errText}`;
                toastMsg = `${toastMsg} | ${kiroSummary}`;
            }
            showToast(toastMsg, report?.ok ? 'success' : 'info');
            await fetchSnapshot();
        } catch (e: any) {
            console.warn('Manual sync error from KiroCreditBar:', e);
            showToast(e?.message || '同步失败', 'error');
        } finally {
            setSyncing(false);
        }
    };

    // P1-5: 抄自 UsageBar/PaceBar Tracked Metrics · reset / pace (本地计算距重置倒计时)
    const formatResetCountdown = (resetAtStr?: string | null) => {
        if (!resetAtStr) return null;
        try {
            const resetTime = new Date(resetAtStr).getTime();
            if (isNaN(resetTime)) return null;
            const diffMs = resetTime - Date.now();
            if (diffMs <= 0) return '即将重置';
            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            if (days > 0) {
                return `(距重置 ≈ ${days}d ${hours}h)`;
            }
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return `(距重置 ≈ ${hours}h ${mins}m)`;
        } catch {
            return null;
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
            <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-base-200 bg-gray-50/40 dark:bg-base-200/20 text-xs text-center text-gray-500 dark:text-gray-400 space-y-2">
                <p className="font-semibold">{t('accounts.kiro.no_snapshot', '未检测到 Kiro 本地 Credit 快照')}</p>
                <p className="text-[11px] opacity-75">{t('accounts.kiro.no_snapshot_hint', '请启动 Kiro IDE 并产生一次交互，数据将由本地 state.vscdb 权威同步')}</p>
                <div className="pt-1">
                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className="btn btn-outline btn-xs gap-1.5 text-purple-600 dark:text-purple-300"
                    >
                        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                        <span>{syncing ? t('common.syncing', '正在同步...') : t('common.sync_now', '立即同步检测')}</span>
                    </button>
                </div>
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

                {/* B1 UIA 单文本节点百分比与手动同步按钮 */}
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={handleManualSync}
                        disabled={syncing}
                        className="btn btn-ghost btn-xs text-purple-600 dark:text-purple-300 hover:bg-purple-100/60 dark:hover:bg-purple-900/40 gap-1 px-2"
                        title="增量同步最新用量数据"
                    >
                        <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                        <span>{syncing ? t('common.syncing', '同步中...') : t('common.sync', '同步')}</span>
                    </button>
                    <div className="text-right">
                        <span className="text-sm font-bold font-mono text-purple-700 dark:text-purple-300">
                            {`${Math.round(pct)}%`}
                        </span>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">已消耗</p>
                    </div>
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
                <div className="flex items-center gap-1 flex-wrap">
                    <Clock size={12} className="text-purple-400" />
                    <span>重置周期：</span>
                    <span className="font-mono text-gray-700 dark:text-gray-300">
                        {snapshot.reset_at || '未提供'}
                    </span>
                    {formatResetCountdown(snapshot.reset_at) && (
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono">
                            {formatResetCountdown(snapshot.reset_at)}
                        </span>
                    )}
                </div>
                <div className="text-[10px] font-mono text-gray-400">
                    {`更新于: ${new Date(snapshot.updated_at).toLocaleTimeString()}`}
                </div>
            </div>
        </div>
    );
}
