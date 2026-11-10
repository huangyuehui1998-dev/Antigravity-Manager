import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X, Activity, Cpu, RefreshCw,
  Copy, Check, AlertCircle, ArrowRightLeft,
  Layers, CheckCircle2, Gauge
} from 'lucide-react';
import { Account, getAccountTier } from '../../types/account';
import { showToast } from '../common/ToastContainer';
import { releaseAccountQoSJail } from '../../services/accountService';
import { cn } from '../../utils/cn';
import { getGroupQuotaSummaries, formatResetTime } from '../../utils/quotaDisplay';

interface AccountDetailDrawerProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: (accountId: string) => void;
  onSwitch: (accountId: string) => void;
  isCurrent: boolean;
  isRefreshing: boolean;
  isSwitching: boolean;
}

export const AccountDetailDrawer: React.FC<AccountDetailDrawerProps> = ({
  account,
  isOpen,
  onClose,
  onRefresh,
  onSwitch,
  isCurrent,
  isRefreshing,
  isSwitching,
}) => {
  const { t } = useTranslation();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [releasingJail, setReleasingJail] = useState(false);
  const [localReleased, setLocalReleased] = useState(false);

  useEffect(() => {
    setLocalReleased(false);
  }, [account?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !account) return null;

  const tier = getAccountTier(account);
  const isRateLimited = !localReleased && (account.qos_status === 'jailed' || account.qos_status === 'rate_limited' || (account.qos_reset_seconds ?? 0) > 0);
  const isForbidden = !localReleased && Boolean(account.quota?.is_forbidden || account.validation_blocked);
  const quotaGroups = getGroupQuotaSummaries(account.quota?.quota_groups, account.quota?.models, tier);

  const formatTime = (ts?: number | string | null) => {
    if (!ts) return '-';
    const num = typeof ts === 'string' ? Date.parse(ts) : (ts > 1e11 ? ts : ts * 1000);
    if (isNaN(num)) return String(ts);
    return new Date(num).toLocaleString([], {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(t('common.copied', 'Copied to clipboard'), 'success');
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleReleaseJail = async () => {
    setReleasingJail(true);
    try {
      await releaseAccountQoSJail(account.id);
      setLocalReleased(true);
      account.validation_blocked = false;
      account.qos_status = null;
      account.qos_reset_seconds = null;
      if (account.quota) {
        account.quota.is_forbidden = false;
        account.quota.forbidden_reason = undefined;
      }
      showToast(t('accounts.qos.release_success', '已解除该账号的小黑屋限制'), 'success');
      onRefresh(account.id);
    } catch (e) {
      showToast(`${t('common.error')}: ${e}`, 'error');
    } finally {
      setReleasingJail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white dark:bg-zinc-900 shadow-2xl flex flex-col border-l border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/70">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                account.disabled ? "bg-zinc-400" :
                isForbidden ? "bg-red-500" :
                isRateLimited ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
              )} />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {account.email}
                </h2>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="uppercase font-medium tracking-wider text-[10px] px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800">
                    {tier}
                  </span>
                  {account.name && <span className="truncate">{account.name}</span>}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs text-zinc-600 dark:text-zinc-400">
            {/* Quick Actions Bar */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSwitch(account.id)}
                disabled={isCurrent || isSwitching}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-medium transition-all shadow-xs",
                  isCurrent
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                {isCurrent ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                {isCurrent ? t('accounts.current_active', 'Active') : t('accounts.switch', 'Switch IDE')}
              </button>

              <button
                onClick={() => onRefresh(account.id)}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 py-2 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-medium transition-all text-zinc-700 dark:text-zinc-300"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                {t('common.refresh', 'Refresh')}
              </button>
            </div>

            {/* Health & Status Card */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2.5">
              <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-200 text-xs">
                <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-blue-500" /> {t('accounts.status.title', 'Health & Cooldown')}</span>
                {isRateLimited && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded font-mono">
                      {account.qos_status === 'jailed' ? t('accounts.qos.jailed', '已进小黑屋') : '429 Cooldown'} {account.qos_reset_seconds ? `${account.qos_reset_seconds}s` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={handleReleaseJail}
                      disabled={releasingJail}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium transition-colors cursor-pointer"
                    >
                      {releasingJail ? '...' : t('accounts.qos.release_btn', '解除')}
                    </button>
                  </div>
                )}
              </div>
              {isForbidden && (
                <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 space-y-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold">
                    <AlertCircle className="w-3 h-3" />
                    {account.validation_blocked_reason || 'Forbidden / Validation Blocked'}
                  </div>
                  {account.validation_url && (
                    <a
                      href={account.validation_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] underline hover:text-red-700 block truncate"
                    >
                      {account.validation_url}
                    </a>
                  )}
                  <button
                    onClick={handleReleaseJail}
                    disabled={releasingJail}
                    className="mt-1 text-[10px] py-1 px-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 cursor-pointer"
                  >
                    {releasingJail ? t('accounts.releasing', '正在解除...') : t('accounts.unlock_account', '解锁账号')}
                  </button>
                </div>
              )}
            </div>

            {/* Model Quota Breakdown (Restored Industrial Quota Groups) */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-3">
              <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-200 text-xs">
                <span className="flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5 text-blue-500" /> {t('accounts.quota_groups.title', 'Model Quota Breakdown')}</span>
                {account.quota?.last_updated ? (
                  <span className="text-[10px] text-zinc-400 font-mono" title={formatTime(account.quota.last_updated)}>
                    {formatTime(account.quota.last_updated)}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2.5">
                {quotaGroups.map((g) => {
                  const fiveHourPct = g.fiveHour?.percentage ?? 100;
                  const weeklyPct = g.weekly?.percentage ?? 100;
                  return (
                    <div key={g.key} className="p-2.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-zinc-800 dark:text-zinc-200">{g.dynamicLabel || g.defaultLabel}</span>
                        {g.isWeeklyExhausted ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 font-medium">Exhausted</span>
                        ) : g.isWeeklyConstrained ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 font-medium">Constrained</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400 font-mono">{fiveHourPct.toFixed(0)}%</span>
                        )}
                      </div>
                      {/* 5H Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-zinc-500">
                          <span>5H Window</span>
                          <span>{fiveHourPct.toFixed(0)}%{g.fiveHour?.resetTime ? ` · Reset ${formatResetTime(g.fiveHour.resetTime)}` : ''}</span>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              fiveHourPct > 50 ? "bg-emerald-500" : fiveHourPct > 20 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${Math.max(0, Math.min(100, fiveHourPct))}%` }}
                          />
                        </div>
                      </div>
                      {/* Weekly Bar */}
                      {g.weekly && (
                        <div className="space-y-1 pt-0.5">
                          <div className="flex justify-between text-[10px] text-zinc-500">
                            <span>Weekly Rolling</span>
                            <span>{weeklyPct.toFixed(0)}%{g.weekly.resetTime ? ` · Reset ${formatResetTime(g.weekly.resetTime)}` : ''}</span>
                          </div>
                          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                weeklyPct > 50 ? "bg-blue-500" : weeklyPct > 20 ? "bg-amber-500" : "bg-rose-500"
                              )}
                              style={{ width: `${Math.max(0, Math.min(100, weeklyPct))}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {/* Models Badge Tags */}
                      {g.supportedModels && g.supportedModels.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {g.supportedModels.map((m) => (
                            <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 font-mono">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Consumption & 4D Ledger Metrics */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2.5">
              <div className="flex items-center justify-between font-medium text-zinc-900 dark:text-zinc-200 text-xs">
                <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-500" /> {t('accounts.consumption.title', '4D Consumption Ledger')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-400">5-Hour</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">{account.consumption?.tokens_5h ? `${(account.consumption.tokens_5h / 1000).toFixed(0)}k` : '0'}</div>
                  <div className="text-[10px] text-zinc-400">${account.consumption?.cost_usd_5h?.toFixed(3) || '0.000'}</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-400">7-Day</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">{account.consumption?.tokens_7d ? `${(account.consumption.tokens_7d / 1000000).toFixed(2)}M` : '0'}</div>
                  <div className="text-[10px] text-zinc-400">${account.consumption?.cost_usd_7d?.toFixed(2) || '0.00'}</div>
                </div>
                <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                  <div className="text-[10px] text-zinc-400">30-Day</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200">{account.consumption?.tokens_30d ? `${(account.consumption.tokens_30d / 1000000).toFixed(2)}M` : '0'}</div>
                  <div className="text-[10px] text-zinc-400">${account.consumption?.cost_usd_30d?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
            </div>

            {/* Security & Fingerprint Metadata */}
            <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 space-y-2">
              <div className="font-medium text-zinc-900 dark:text-zinc-200 text-xs flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" />
                {t('accounts.details.metadata', 'Account Identity & Fingerprint')}
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">ID:</span>
                  <div className="flex items-center gap-1">
                    <span className="truncate max-w-[160px]">{account.id}</span>
                    <button onClick={() => copyToClipboard(account.id, 'id')} className="p-0.5 hover:text-zinc-800">
                      {copiedKey === 'id' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
                {account.token?.project_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Project:</span>
                    <span className="truncate max-w-[180px]">{account.token.project_id}</span>
                  </div>
                )}
                {account.device_profile?.machine_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Machine ID:</span>
                    <span className="truncate max-w-[180px]">{account.device_profile.machine_id}</span>
                  </div>
                )}
                {Boolean(account.last_used && account.last_used > 0) && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">{t('accounts.details.last_used', '最后使用')}:</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{formatTime(account.last_used)}</span>
                  </div>
                )}
                {Boolean(account.created_at && account.created_at > 0) && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">{t('accounts.details.created_at', '添加时间')}:</span>
                    <span className="text-zinc-600 dark:text-zinc-300">{formatTime(account.created_at)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountDetailDrawer;
