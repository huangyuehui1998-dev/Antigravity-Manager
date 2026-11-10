import React from 'react';
import { useTranslation } from 'react-i18next';
import { Power, Save, Copy, CheckCircle } from 'lucide-react';
import { AppConfig } from '../../types/config';

interface ProxyStatus {
    running: boolean;
    admin_bound?: boolean;
    forwarding?: boolean;
    port: number;
    base_url: string;
    active_accounts: number;
}

interface GatewayStatusBannerProps {
    status: ProxyStatus;
    appConfig: AppConfig;
    loading: boolean;
    onToggle: () => void;
    onSave: () => void;
    onCopy: (text: string, id: string) => void;
    copiedId: string | null;
}

export const GatewayStatusBanner: React.FC<GatewayStatusBannerProps> = ({
    status,
    appConfig,
    loading,
    onToggle,
    onSave,
    onCopy,
    copiedId,
}) => {
    const { t } = useTranslation();
    const forwarding = status.forwarding ?? status.running;
    const adminBound = status.admin_bound ?? false;

    const dotClass = forwarding
        ? 'bg-emerald-500 shadow-xs shadow-emerald-500/50 animate-pulse'
        : adminBound
            ? 'bg-amber-500 shadow-xs shadow-amber-500/40'
            : 'bg-gray-400 dark:bg-gray-500';

    const textClass = forwarding
        ? 'text-emerald-600 dark:text-emerald-400'
        : adminBound
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-500 dark:text-gray-400';

    const label = forwarding
        ? `${t('proxy.status.running')} (${status.active_accounts} ${t('common.accounts')})`
        : adminBound
            ? t('proxy.status.admin_listening', '管理面已监听 · 转发未启用')
            : t('proxy.status.stopped');

    const displayUrl = status.base_url || `http://127.0.0.1:${appConfig.proxy.port || 8045}`;

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className={`w-3.5 h-3.5 rounded-full ${dotClass} shrink-0`} />
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${textClass}`}>
                            {label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 font-mono">
                            Port: {appConfig.proxy.port}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-zinc-400 font-mono mt-0.5">
                        <span className="truncate max-w-[280px]" title={displayUrl}>{displayUrl}</span>
                        <button
                            type="button"
                            onClick={() => onCopy(displayUrl, 'base-url')}
                            className="p-1 hover:text-blue-600 transition-colors"
                            title={t('common.copy')}
                        >
                            {copiedId === 'base-url' ? <CheckCircle size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-center">
                <button
                    type="button"
                    onClick={onSave}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs active:scale-95 transition-all"
                >
                    <Save size={14} />
                    <span>{t('settings.save')}</span>
                </button>
                <button
                    type="button"
                    onClick={onToggle}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all ${
                        status.running
                            ? 'bg-rose-600 hover:bg-rose-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Power size={14} />
                    <span>
                        {loading
                            ? t('proxy.status.processing')
                            : status.running
                                ? t('proxy.action.stop')
                                : t('proxy.action.start')}
                    </span>
                </button>
            </div>
        </div>
    );
};

export default GatewayStatusBanner;
