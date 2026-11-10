import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowRightLeft,
    RefreshCw,
    Info,
    MoreHorizontal,
    Trash2,
    Download,
    Fingerprint,
    ToggleLeft,
    ToggleRight,
    Tag,
    Repeat2,
    Terminal,
} from 'lucide-react';
import { Account, ActiveClientsStatus } from '../../types/account';
import { cn } from '../../utils/cn';

interface AccountActionMenuProps {
    account: Account;
    isCurrent: boolean;
    isRefreshing: boolean;
    isSwitching: boolean;
    activeClients?: ActiveClientsStatus;
    onSwitch: (targetIde?: string) => void;
    onRefresh: () => void;
    onViewDetails: () => void;
    onViewDevice: () => void;
    onExport: () => void;
    onDelete: () => void;
    onToggleProxy: () => void;
    onEditLabel?: () => void;
    isNearTop?: boolean;
}

export const AccountActionMenu: React.FC<AccountActionMenuProps> = ({
    account,
    isCurrent,
    isRefreshing,
    isSwitching,
    activeClients,
    onSwitch,
    onRefresh,
    onViewDetails,
    onViewDevice,
    onExport,
    onDelete,
    onToggleProxy,
    onEditLabel,
    isNearTop,
}) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const isDisabled = Boolean(account.disabled);
    const isClassic = activeClients?.classic_account_id === account.id;
    const isIde = activeClients?.ide_account_id === account.id;
    const isAgy = activeClients?.agy_account_id === account.id;
    const isRowActive = isCurrent || isClassic || isIde || isAgy;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuOpen]);

    return (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* 1. 快速切换按钮 */}
            <button
                type="button"
                onClick={() => onSwitch('classic')}
                disabled={isSwitching || isDisabled}
                className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs transition-all",
                    isRowActive
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300",
                    (isSwitching || isDisabled) && "opacity-50 cursor-not-allowed"
                )}
                title={isDisabled ? t('accounts.disabled_tooltip') : t('accounts.switch_to_account', '切换到此账号')}
            >
                <ArrowRightLeft className={cn("w-3 h-3", isSwitching && "animate-spin")} />
                <span>{t('accounts.switch', '切换')}</span>
            </button>

            {/* 2. 刷新按钮 */}
            <button
                type="button"
                className={cn(
                    "p-1.5 text-gray-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors",
                    (isRefreshing || isDisabled) && "opacity-50 cursor-not-allowed"
                )}
                onClick={onRefresh}
                title={isDisabled ? t('accounts.disabled_tooltip') : (isRefreshing ? t('common.refreshing') : t('common.refresh'))}
                disabled={isRefreshing || isDisabled}
            >
                <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </button>

            {/* 3. 详情抽屉触发按钮 */}
            <button
                type="button"
                className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={onViewDetails}
                title={t('common.details', '查看详情抽屉')}
            >
                <Info className="w-3.5 h-3.5" />
            </button>

            {/* 4. 更多菜单 (纯 Tailwind，消除 DaisyUI 冲突) */}
            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    title={t('common.more_actions', '更多操作')}
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuOpen && (
                    <div className={cn(
                        "absolute right-0 w-48 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-gray-100 dark:border-zinc-800 py-1 z-50 text-xs",
                        isNearTop ? "top-full mt-1" : "bottom-full mb-1"
                    )}>
                        {/* 客户端切换 */}
                        <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {t('accounts.switch_client_title', '切换客户端')}
                        </div>
                        <button
                            type="button"
                            onClick={() => { onSwitch('classic'); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
                            <span>Antigravity Classic</span>
                            {isClassic && <span className="ml-auto text-[9px] text-blue-600 font-bold">活跃</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => { onSwitch('ide'); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            <Repeat2 className="w-3.5 h-3.5 text-purple-500" />
                            <span>Antigravity IDE</span>
                            {isIde && <span className="ml-auto text-[9px] text-purple-600 font-bold">活跃</span>}
                        </button>
                        <button
                            type="button"
                            onClick={() => { onSwitch('agy'); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                            <span>AGY CLI</span>
                            {isAgy && <span className="ml-auto text-[9px] text-emerald-600 font-bold">活跃</span>}
                        </button>

                        <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />

                        {/* 工具与管理 */}
                        <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            {t('accounts.management_title', '账户与工具')}
                        </div>
                        <button
                            type="button"
                            onClick={() => { onViewDevice(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            <Fingerprint className="w-3.5 h-3.5 text-cyan-500" />
                            <span>{t('accounts.device_fingerprint', '设备指纹')}</span>
                        </button>
                        {onEditLabel && (
                            <button
                                type="button"
                                onClick={() => { onEditLabel(); setMenuOpen(false); }}
                                className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                            >
                                <Tag className="w-3.5 h-3.5 text-amber-500" />
                                <span>{t('accounts.edit_label', '自定义标签')}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => { onToggleProxy(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            {account.proxy_disabled ? (
                                <>
                                    <ToggleLeft className="w-3.5 h-3.5 text-gray-400" />
                                    <span>{t('accounts.enable_proxy', '启用反代调度')}</span>
                                </>
                            ) : (
                                <>
                                    <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>{t('accounts.disable_proxy', '暂停反代调度')}</span>
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => { onExport(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 text-left"
                        >
                            <Download className="w-3.5 h-3.5 text-gray-500" />
                            <span>{t('common.export', '导出凭据')}</span>
                        </button>

                        <div className="h-px bg-gray-100 dark:bg-zinc-800 my-1" />

                        {/* 删除 */}
                        <button
                            type="button"
                            onClick={() => { onDelete(); setMenuOpen(false); }}
                            className="w-full flex items-center gap-2 py-1.5 px-2.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-left font-medium"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('common.delete', '删除账户')}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AccountActionMenu;
