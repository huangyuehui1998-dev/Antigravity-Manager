/**
 * 账号表格组件
 * 支持拖拽排序功能，用户可以通过拖拽行来调整账号顺序
 */
import { useMemo, useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    GripVertical,
    ArrowRightLeft,
    RefreshCw,
    Trash2,
    MoreHorizontal,
    Download,
    Fingerprint,
    Info,
    Lock,
    Ban,
    Diamond,
    Gem,
    Circle,
    ToggleLeft,
    ToggleRight,
    Sparkles,
    Tag,
    X,
    Check,
    Clock,
    Repeat2,
    Terminal,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
import { type Account, type ActiveClientsStatus, getAccountTier } from '../../types/account';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';

import { useConfigStore } from '../../stores/useConfigStore';
import { GroupQuotaCard } from './GroupQuotaCard';
import { getGroupQuotaSummaries } from '../../utils/quotaDisplay';
import { getValidationBlockedStatusLabel } from './accountValidationStatus';
import { showToast } from '../common/ToastContainer';
import { releaseAccountQoSJail } from '../../services/accountService';
import { QoSStatusBadge } from './QoSStatusBadge';
import { getLiveLimitForModel } from '../../utils/liveLimit';

// ============================================================================
// 类型定义
// ============================================================================

interface AccountTableProps {
    accounts: Account[];
    selectedIds: Set<string>;
    refreshingIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onToggleAll: () => void;
    currentAccountId: string | null;
    activeClients?: ActiveClientsStatus;
    switchingAccountId: string | null;
    onSwitch: (accountId: string, targetIde?: string) => void;
    onRefresh: (accountId: string) => void;
    onViewDevice: (accountId: string) => void;
    onViewDetails: (accountId: string) => void;
    onExport: (accountId: string) => void;
    onDelete: (accountId: string) => void;
    onToggleProxy: (accountId: string) => void;
    onWarmup?: (accountId: string) => void;
    onUpdateLabel?: (accountId: string, label: string) => void;
    /** 拖拽排序回调，当用户完成拖拽时触发 */
    onReorder?: (accountIds: string[]) => void;
    onViewError: (accountId: string) => void;
}

interface SortableRowProps {
    index?: number;
    account: Account;
    consumptionWindow?: '5h' | '7d' | '30d';
    selected: boolean;
    isRefreshing: boolean;
    isCurrent: boolean;
    activeClients?: ActiveClientsStatus;
    isSwitching: boolean;
    isDragging?: boolean;
    onSelect: () => void;
    onSwitch: (targetIde?: string) => void;
    onRefresh: () => void;
    onViewDevice: () => void;
    onViewDetails: () => void;
    onExport: () => void;
    onDelete: () => void;
    onToggleProxy: () => void;
    onWarmup?: () => void;
    onUpdateLabel?: (label: string) => void;
    onViewError: () => void;
    isDragDisabled?: boolean;
}

interface AccountRowContentProps {
    index?: number;
    account: Account;
    consumptionWindow?: '5h' | '7d' | '30d';
    isCurrent: boolean;
    activeClients?: ActiveClientsStatus;
    isRefreshing: boolean;
    isSwitching: boolean;
    isDisabled: boolean;
    onSwitch: (targetIde?: string) => void;
    onRefresh: () => void;
    onViewDevice: () => void;
    onViewDetails: () => void;
    onExport: () => void;
    onDelete: () => void;
    onToggleProxy: () => void;
    onWarmup?: () => void;
    onUpdateLabel?: (label: string) => void;
    onViewError: () => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

function isGroupProtected(protectedModels: string[] | undefined, groupKey: 'gemini' | 'claude' | 'argon'): boolean {
    if (!protectedModels || protectedModels.length === 0) return false;
    if (groupKey === 'argon') {
        return protectedModels.some(m => m.toLowerCase().includes('argon'));
    } else if (groupKey === 'gemini') {
        return protectedModels.some(m => m.toLowerCase().startsWith('gemini') && !m.toLowerCase().includes('argon'));
    } else {
        return protectedModels.some(m => m.toLowerCase().startsWith('claude') || m.toLowerCase().startsWith('gpt'));
    }
}

/**
 * 提取账号的最快配额重置时间（毫秒时间戳）
 * 用于表格排序
 */
function extractAccountResetTime(account: Account): number | null {
    let earliestTime: number | null = null;

    // 优先从 quota_groups 的各个 bucket 获取最早重置时间
    const groups = account.quota?.quota_groups || [];
    for (const group of groups) {
        for (const bucket of group.buckets || []) {
            if (bucket.reset_time) {
                const t = new Date(bucket.reset_time).getTime();
                if (!isNaN(t) && (earliestTime === null || t < earliestTime)) {
                    earliestTime = t;
                }
            }
        }
    }

    // 也遍历 models 获取最早重置时间作为补充
    const models = account.quota?.models || [];
    for (const model of models) {
        if (model.reset_time) {
            const t = new Date(model.reset_time).getTime();
            if (!isNaN(t) && (earliestTime === null || t < earliestTime)) {
                earliestTime = t;
            }
        }
    }

    return earliestTime;
}

// ============================================================================
// 子组件
// ============================================================================

/**
 * 可拖拽的表格行组件
 * 使用 @dnd-kit/sortable 实现拖拽功能
 */
function SortableAccountRow({
    index = 0,
    account,
    selected,
    isRefreshing,
    isCurrent,
    activeClients,
    isSwitching,
    isDragging,
    onSelect,
    onSwitch,
    onRefresh,
    onViewDevice,
    onViewDetails,
    onExport,
    onDelete,
    onToggleProxy,
    onWarmup,
    onUpdateLabel,
    onViewError,
    isDragDisabled = false,
    consumptionWindow = '5h',
}: SortableRowProps) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging,
    } = useSortable({ id: account.id, disabled: isDragDisabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isSortableDragging ? 0.5 : 1,
        zIndex: isSortableDragging ? 1000 : 'auto',
    };

    const isClassic = activeClients?.classic_account_id === account.id;
    const isIde = activeClients?.ide_account_id === account.id;
    const isAgy = activeClients?.agy_account_id === account.id;
    const isRowCurrent = isCurrent || isClassic || isIde || isAgy;

    return (
        <tr
            ref={setNodeRef}
            style={style as React.CSSProperties}
            className={cn(
                "group transition-colors border-b border-gray-100 dark:border-base-200",
                isRowCurrent && "bg-blue-50/50 dark:bg-blue-900/10",
                isDragging && "bg-blue-100 dark:bg-blue-900/30 shadow-lg",
                !isDragging && "hover:bg-gray-50 dark:hover:bg-base-200"
            )}
        >
            {/* 拖拽手柄 */}
            <td className="pl-2 py-1 w-8 align-middle">
                <div
                    {...(!isDragDisabled ? attributes : {})}
                    {...(!isDragDisabled ? listeners : {})}
                    className={cn(
                        "flex items-center justify-center w-6 h-6 rounded transition-colors",
                        isDragDisabled
                            ? "text-gray-200 dark:text-gray-700 cursor-not-allowed opacity-40"
                            : "cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                    title={isDragDisabled ? t('accounts.drag_disabled_during_sort', '已激活列排序，拖拽排序已暂停') : t('accounts.drag_to_reorder')}
                >
                    <GripVertical className="w-4 h-4" />
                </div>
            </td>
            {/* 复选框 */}
            <td className="px-2 py-1 w-10 align-middle">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm rounded border-2 border-gray-400 dark:border-gray-500 checked:border-blue-600 checked:bg-blue-600 [--chkbg:theme(colors.blue.600)] [--chkfg:white]"
                    checked={selected}
                    onChange={onSelect}
                    disabled={isRefreshing}
                />
            </td>
            <AccountRowContent
                index={index}
                account={account}
                consumptionWindow={consumptionWindow}
                isCurrent={isCurrent}
                activeClients={activeClients}
                isRefreshing={isRefreshing}
                isSwitching={isSwitching}
                isDisabled={Boolean(account.disabled)}
                onSwitch={onSwitch}
                onRefresh={onRefresh}
                onViewDevice={onViewDevice}
                onViewDetails={onViewDetails}
                onExport={onExport}
                onDelete={onDelete}
                onToggleProxy={onToggleProxy}
                onWarmup={onWarmup}
                onUpdateLabel={onUpdateLabel}
                onViewError={onViewError}
            />
        </tr>
    );
}

/**
 * 账号行内容组件
 * 渲染邮箱、配额、最后使用时间和操作按钮等列
 */
function AccountRowContent({
    index = 0,
    account,
    consumptionWindow = '5h',
    isCurrent,
    activeClients,
    isRefreshing,
    isSwitching,
    isDisabled,
    onSwitch,
    onRefresh,
    onViewDevice,
    onViewDetails,
    onExport,
    onDelete,
    onToggleProxy,
    onWarmup,
    onUpdateLabel,
    onViewError,
}: AccountRowContentProps) {
    const { t } = useTranslation();
    const { config } = useConfigStore();
    const validationBlockedLabel = getValidationBlockedStatusLabel(account.validation_blocked_reason, t);

    // 自定义标签编辑状态
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [labelInput, setLabelInput] = useState(account.custom_label || '');

    const isClassic = activeClients?.classic_account_id === account.id;
    const isIde = activeClients?.ide_account_id === account.id;
    const isAgy = activeClients?.agy_account_id === account.id;
    const isRowActive = isCurrent || isClassic || isIde || isAgy;
    const isNearTop = index < 3;

    const handleSaveLabel = () => {
        if (onUpdateLabel) {
            onUpdateLabel(labelInput.trim());
        }
        setIsEditingLabel(false);
    };

    const handleReleaseJail = async () => {
        try {
            await releaseAccountQoSJail(account.id);
            showToast(t('accounts.qos.release_success', '已解除该账号的小黑屋限制'), 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err?.message || '解除失败', 'error');
        }
    };

    const handleCancelLabel = () => {
        setLabelInput(account.custom_label || '');
        setIsEditingLabel(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveLabel();
        } else if (e.key === 'Escape') {
            handleCancelLabel();
        }
    };

    const tier = useMemo(() => getAccountTier(account), [account]);
    const groupSummaries = useMemo(() => {
        return getGroupQuotaSummaries(account.quota?.quota_groups, account.quota?.models, tier);
    }, [account.quota?.quota_groups, account.quota?.models, tier]);

    const modelCapabilities = useMemo(() => {
        const supported = Array.from(new Set(groupSummaries.flatMap(s => s.supportedModels || [])));
        const hasArgon = supported.some(m => m.includes('argon')) || groupSummaries.some(s => s.key === 'argon');
        const hasClaude55 = supported.some(m => m.includes('5-5') || m.includes('5.5'));
        const hasClaude46 = supported.some(m => m.includes('4-6') || m.includes('4.6'));
        const hasGpt = supported.some(m => m.startsWith('gpt'));
        const hasGemini38 = supported.some(m => m.includes('3.8') || m.includes('3-8'));
        return { hasArgon, hasClaude55, hasClaude46, hasGpt, hasGemini38, supportedCount: supported.length };
    }, [groupSummaries]);

    return (
        <>
            {/* 邮箱列 */}
            <td className="px-2 py-1.5 align-middle max-w-[320px]">
                <div className="flex flex-col gap-1 min-w-0">
                    <span className={cn(
                        "font-medium text-sm break-all transition-colors",
                        isRowActive ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-base-content"
                    )} title={account.email}>
                        {account.email}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        {isClassic && (
                            <span
                                className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold shadow-sm border border-blue-200/50 dark:border-blue-800/50"
                                title={t('accounts.client_classic_tooltip', '当前 Antigravity 经典款客户端登录账号')}
                            >
                                {t('accounts.client_classic', '经典款')}
                            </span>
                        )}
                        {isIde && (
                            <span
                                className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-[10px] font-bold shadow-sm border border-sky-200/50 dark:border-sky-800/50"
                                title={t('accounts.client_ide_tooltip', '当前 Antigravity IDE 客户端登录账号')}
                            >
                                {t('accounts.client_ide', 'IDE')}
                            </span>
                        )}
                        {isAgy && (
                            <span
                                className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shadow-sm border border-emerald-200/50 dark:border-emerald-800/50"
                                title={t('accounts.client_cli_tooltip', '当前 Antigravity CLI (agy) 登录账号')}
                            >
                                {t('accounts.client_cli', 'CLI')}
                            </span>
                        )}
                        {!isClassic && !isIde && !isAgy && isCurrent && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-[10px] font-bold shadow-sm border border-blue-200/50 dark:border-blue-800/50">
                                {t('accounts.current').toUpperCase()}
                            </span>
                        )}
                        {isDisabled && (
                            <span
                                className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-rose-200/50"
                            >
                                <Ban className="w-2.5 h-2.5" />
                                <span>{t('accounts.disabled')}</span>
                            </span>
                        )}

                        {account.proxy_disabled && !isDisabled && (
                            <span
                                className="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-orange-200/50"
                            >
                                <Ban className="w-2.5 h-2.5" />
                                <span>{t('accounts.proxy_disabled')}</span>
                            </span>
                        )}

                        {account.quota?.is_forbidden && (
                            <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-red-200/50">
                                <Lock className="w-2.5 h-2.5" />
                                <span>{t('accounts.forbidden')}</span>
                            </span>
                        )}
                        {account.validation_blocked && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-[10px] font-bold flex items-center gap-1 shadow-sm border border-amber-200/50">
                                <Clock className="w-2.5 h-2.5" />
                                <span>{validationBlockedLabel}</span>
                            </span>
                        )}
                        <QoSStatusBadge
                            status={account.qos_status}
                            resetSeconds={account.qos_reset_seconds}
                            size="md"
                            onRelease={handleReleaseJail}
                        />


                        {/* 订阅类型徽章 */}
                        {(() => {
                            const tier = getAccountTier(account);
                            if (tier === 'ultra') {
                                return (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold shadow-sm hover:scale-105 transition-transform cursor-default">
                                        <Gem className="w-2.5 h-2.5 fill-current" />
                                        {t('accounts.ultra')}
                                    </span>
                                );
                            } else if (tier === 'pro') {
                                return (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold shadow-sm hover:scale-105 transition-transform cursor-default">
                                        <Diamond className="w-2.5 h-2.5 fill-current" />
                                        {t('accounts.pro')}
                                    </span>
                                );
                            } else {
                                return (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400 text-[10px] font-bold shadow-sm border border-gray-200 dark:border-white/10 hover:bg-gray-200 transition-colors cursor-default">
                                        <Circle className="w-2.5 h-2.5" />
                                        {t('accounts.free')}
                                    </span>
                                );
                            }
                        })()}
                        {/* 自定义标签 */}
                        <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-base-300 text-gray-500 dark:text-gray-400 text-[10px] font-bold" title={t('accounts.priority_hint')}>
                            {t('accounts.priority')}: {account.priority ?? 50}
                        </span>
                        {account.custom_label && !isEditingLabel && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-[10px] font-bold shadow-sm border border-orange-200/50 dark:border-orange-800/50">
                                <Tag className="w-2.5 h-2.5" />
                                {account.custom_label}
                            </span>
                        )}

                        {/* 核心支持模型徽章栏 (直观展现该账号具体可用的旗舰模型代际) */}
                        {modelCapabilities.hasArgon && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-purple-500/15 to-indigo-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-bold shadow-2xs border border-purple-200/60 dark:border-purple-800/50 cursor-default"
                            >
                                <Sparkles className="w-2.5 h-2.5 text-purple-500" />
                                Argon
                            </span>
                        )}
                        {modelCapabilities.hasClaude55 && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-bold shadow-2xs border border-amber-200/60 dark:border-amber-800/50 cursor-default"
                            >
                                Claude 5.5
                            </span>
                        )}
                        {modelCapabilities.hasClaude46 && !modelCapabilities.hasClaude55 && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600/90 dark:text-amber-400/90 text-[10px] font-bold shadow-2xs border border-amber-200/40 dark:border-amber-800/30 cursor-default"
                            >
                                Claude 4.6
                            </span>
                        )}
                        {modelCapabilities.hasGpt && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold shadow-2xs border border-emerald-200/60 dark:border-emerald-800/50 cursor-default"
                            >
                                GPT-120B
                            </span>
                        )}
                        {(account.provider === 'kiro' || account.email?.toLowerCase().includes('kiro')) && (
                            <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 text-[10px] font-bold shadow-2xs border border-purple-200/60 dark:border-purple-800/50 cursor-default"
                            >
                                KIRO
                            </span>
                        )}
                        {/* 标签编辑输入框 */}
                        {isEditingLabel && (
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    className="px-1.5 py-0.5 text-[10px] w-20 border border-orange-300 dark:border-orange-700 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white dark:bg-base-200"
                                    placeholder={t('accounts.custom_label_placeholder', 'Label')}
                                    value={labelInput}
                                    onChange={(e) => setLabelInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    autoFocus
                                    maxLength={15}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    className="p-0.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-all"
                                    onClick={(e) => { e.stopPropagation(); handleSaveLabel(); }}
                                >
                                    <Check className="w-3 h-3" />
                                </button>
                                <button
                                    className="p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all"
                                    onClick={(e) => { e.stopPropagation(); handleCancelLabel(); }}
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>

                </div>
            </td>

            {/* 模型配额列 */}
            <td className="px-3 py-2 align-middle">
                {isDisabled || account.quota?.is_forbidden || account.validation_blocked ? (
                    <div className={cn(
                        "flex items-center justify-center gap-3 py-1.5 px-4 rounded-xl border group/error",
                        account.validation_blocked ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-100/50 dark:border-amber-900/20" : "bg-red-50/50 dark:bg-red-900/10 border-red-100/50 dark:border-red-900/20"
                    )}>
                        <div className={cn(
                            "flex items-center gap-1.5",
                            account.validation_blocked ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                        )}>
                            {account.validation_blocked ? <Clock className="w-3.5 h-3.5" /> : (account.quota?.is_forbidden ? <Lock className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />)}
                            <span className={cn(
                                "text-[11px] font-bold",
                                account.validation_blocked ? "text-amber-700/80 dark:text-amber-400" : "text-red-700/80 dark:text-red-400"
                            )}>
                                {account.validation_blocked ? validationBlockedLabel : (isDisabled ? t('accounts.status.disabled') : t('accounts.forbidden_msg'))}
                            </span>
                        </div>
                        <div className={cn(
                            "w-px h-3",
                            account.validation_blocked ? "bg-amber-200 dark:bg-amber-800/50" : "bg-red-200 dark:bg-red-800/50"
                        )} />
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewError(); }}
                            className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                        >
                            {t('accounts.view_error')}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 py-0.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {groupSummaries.filter(s => s.key !== 'argon').map((summary) => (
                                <GroupQuotaCard
                                    key={summary.key}
                                    summary={summary}
                                    isProtected={Boolean(config?.quota_protection?.enabled && isGroupProtected(account.protected_models, summary.key))}
                                    liveLimit={summary.key === 'gemini' ? getLiveLimitForModel(account, 'gemini-pro') : getLiveLimitForModel(account, 'claude')}
                                    compact
                                />
                            ))}
                        </div>
                        {(() => {
                            const argon = groupSummaries.find(s => s.key === 'argon');
                            if (!argon) return null;
                            return (
                                <div className="w-full pt-0.5">
                                    <GroupQuotaCard
                                        summary={argon}
                                        isProtected={Boolean(config?.quota_protection?.enabled && isGroupProtected(account.protected_models, 'argon'))}
                                        liveLimit={getLiveLimitForModel(account, 'gemini-4-argon')}
                                        compact
                                        fullWidth
                                    />
                                </div>
                            );
                        })()}
                    </div>
                )}
            </td>

            {/* 真实用量与花费列 (5H, 7D, 30D 动态多维看板) */}
            <td className="px-2.5 py-1.5 align-middle">
                {(() => {
                    const c = account.consumption;
                    const tokens = consumptionWindow === '5h' ? c?.tokens_5h : consumptionWindow === '7d' ? c?.tokens_7d : c?.tokens_30d;
                    const cost = consumptionWindow === '5h' ? c?.cost_usd_5h : consumptionWindow === '7d' ? c?.cost_usd_7d : c?.cost_usd_30d;
                    const fmtTokens = (num?: number) => {
                        if (!num || num <= 0) return '0';
                        if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
                        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
                        if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
                        return `${num}`;
                    };
                    const fmtCost = (usd?: number) => {
                        if (!usd || usd <= 0) return '$0.00';
                        return `$${usd.toFixed(2)}`;
                    };

                    return (
                        <div className="flex flex-col gap-0.5 min-w-[130px] font-mono tabular-nums">
                            <div className="flex items-center justify-between text-[11px] leading-tight">
                                <span className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1">
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold uppercase">
                                        {consumptionWindow === '5h' ? '5H' : consumptionWindow === '7d' ? '周' : '月'}
                                    </span>
                                    <span>{fmtTokens(tokens)}</span>
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[10.5px]">
                                    {fmtCost(cost)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-[9px] text-gray-400 dark:text-gray-500 font-mono tabular-nums">
                                <span><span className="font-sans text-[8.5px] text-gray-400 dark:text-gray-500 mr-0.5">7D:</span>{fmtTokens(c?.tokens_7d)}</span>
                                <span><span className="font-sans text-[8.5px] text-gray-400 dark:text-gray-500 mr-0.5">30D:</span>{fmtTokens(c?.tokens_30d)}</span>
                            </div>
                        </div>
                    );
                })()}
            </td>

            {/* 最后使用时间列 */}
            <td className="px-2 py-1 align-middle">
                <div className="flex flex-col">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 font-mono whitespace-nowrap">
                        {new Date(account.last_used * 1000).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono whitespace-nowrap leading-tight">
                        {new Date(account.last_used * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </div>
            </td>

            {/* 操作列 */}
            {/* 操作 */}
            <td className={cn(
                "px-2 py-1.5 sticky right-0 z-10 focus-within:z-30 border-l border-black/[0.04] dark:border-white/[0.04] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)] dark:shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.4)] text-right align-middle",
                isCurrent
                    ? "bg-[#f1f6ff] dark:bg-[#1e2330]"
                    : "bg-white dark:bg-base-100",
                !isCurrent && "group-hover:bg-gray-50 dark:group-hover:bg-base-200"
            )}>
                <div className="flex items-center justify-end gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                    {/* 1. 快速切换主操作 */}
                    <button
                        onClick={(e) => { e.stopPropagation(); onSwitch('classic'); }}
                        disabled={isSwitching || isDisabled}
                        className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold shadow-xs transition-all",
                            isRowActive
                                ? "bg-blue-600 text-white shadow-blue-500/20 hover:bg-blue-700"
                                : "bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-600 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-blue-900/30 dark:hover:text-blue-300",
                            (isSwitching || isDisabled) && "opacity-50 cursor-not-allowed"
                        )}
                        title={isDisabled ? t('accounts.disabled_tooltip') : t('accounts.switch_to_account', '切换到此账号')}
                    >
                        <ArrowRightLeft className={cn("w-3 h-3", isSwitching && "animate-spin")} />
                        <span>{t('accounts.switch', '切换')}</span>
                    </button>

                    {/* 2. 快速刷新 */}
                    <button
                        className={cn(
                            "p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors",
                            (isRefreshing || isDisabled) && "opacity-50 cursor-not-allowed"
                        )}
                        onClick={(e) => { e.stopPropagation(); onRefresh(); }}
                        title={isDisabled ? t('accounts.disabled_tooltip') : (isRefreshing ? t('common.refreshing') : t('common.refresh'))}
                        disabled={isRefreshing || isDisabled}
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
                    </button>

                    {/* 3. 更多操作下拉菜单 (···) */}
                    <div className={cn("dropdown dropdown-left", isNearTop ? "dropdown-bottom" : "dropdown-end")} onClick={(e) => e.stopPropagation()}>
                        <label
                            tabIndex={0}
                            className="p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title={t('common.more_actions', '更多操作')}
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </label>
                        <ul
                            tabIndex={0}
                            className="dropdown-content z-50 menu p-1.5 shadow-2xl bg-white/95 dark:bg-[#181920]/95 backdrop-blur-md rounded-xl border border-black/[0.08] dark:border-white/[0.1] w-52 text-xs divide-y divide-gray-100 dark:divide-white/5 max-h-[340px] overflow-y-auto"
                        >
                            {/* 客户端切换 */}
                            <div className="py-1">
                                <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {t('accounts.switch_client_title', '切换客户端')}
                                </div>
                                <li>
                                    <button
                                        onClick={() => onSwitch('classic')}
                                        disabled={isSwitching || isDisabled}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-200"
                                    >
                                        <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
                                        <span>Antigravity Classic</span>
                                        {isClassic && <span className="ml-auto text-[9px] text-blue-600 font-bold">活跃</span>}
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => onSwitch('ide')}
                                        disabled={isSwitching || isDisabled}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 text-gray-700 dark:text-gray-200"
                                    >
                                        <Repeat2 className="w-3.5 h-3.5 text-purple-500" />
                                        <span>Antigravity IDE</span>
                                        {isIde && <span className="ml-auto text-[9px] text-purple-600 font-bold">活跃</span>}
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => onSwitch('agy')}
                                        disabled={isSwitching || isDisabled}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-gray-700 dark:text-gray-200"
                                    >
                                        <Terminal className="w-3.5 h-3.5 text-emerald-500" />
                                        <span>AGY CLI</span>
                                        {isAgy && <span className="ml-auto text-[9px] text-emerald-600 font-bold">活跃</span>}
                                    </button>
                                </li>
                            </div>

                            {/* 账户管理 */}
                            <div className="py-1">
                                <div className="px-2.5 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    {t('accounts.management_title', '账户与工具')}
                                </div>
                                <li>
                                    <button
                                        onClick={() => onViewDetails()}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                                    >
                                        <Info className="w-3.5 h-3.5 text-sky-500" />
                                        <span>{t('common.details', '账户详情')}</span>
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => onViewDevice()}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                                    >
                                        <Fingerprint className="w-3.5 h-3.5 text-indigo-500" />
                                        <span>{t('accounts.device_fingerprint', '设备指纹')}</span>
                                    </button>
                                </li>
                                {onUpdateLabel && (
                                    <li>
                                        <button
                                            onClick={() => setIsEditingLabel(true)}
                                            className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                                        >
                                            <Tag className="w-3.5 h-3.5 text-orange-500" />
                                            <span>{t('accounts.edit_label', '自定义标签')}</span>
                                        </button>
                                    </li>
                                )}
                                {onWarmup && (
                                    <li>
                                        <button
                                            onClick={() => onWarmup()}
                                            disabled={isRefreshing || isDisabled}
                                            className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                            <span>{t('accounts.warmup', '配额预热')}</span>
                                        </button>
                                    </li>
                                )}
                                <li>
                                    <button
                                        onClick={() => onToggleProxy()}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
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
                                </li>
                                <li>
                                    <button
                                        onClick={() => onExport()}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200"
                                    >
                                        <Download className="w-3.5 h-3.5 text-gray-500" />
                                        <span>{t('common.export', '导出凭据')}</span>
                                    </button>
                                </li>
                            </div>

                            {/* 危险区 */}
                            <div className="pt-1">
                                <li>
                                    <button
                                        onClick={() => onDelete()}
                                        className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:text-rose-400 font-medium"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>{t('common.delete', '删除账户')}</span>
                                    </button>
                                </li>
                            </div>
                        </ul>
                    </div>
                </div>
            </td>
        </>
    );
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * 账号表格组件
 * 支持拖拽排序、多选、批量操作等功能
 */
function AccountTable({
    accounts,
    selectedIds,
    refreshingIds,
    onToggleSelect,
    onToggleAll,
    currentAccountId,
    activeClients,
    switchingAccountId,
    onSwitch,
    onRefresh,
    onViewDevice,
    onViewDetails,
    onExport,
    onDelete,
    onToggleProxy,
    onReorder,
    onWarmup,
    onUpdateLabel,
    onViewError,
}: AccountTableProps) {
    const { t } = useTranslation();

    const [activeId, setActiveId] = useState<string | null>(null);
    const [consumptionWindow, setConsumptionWindow] = useState<'5h' | '7d' | '30d'>('5h');
    // 排序状态配置: 支持按配额重置时间 (reset_time) 或最后使用时间 (last_used) 排序
    const [sortConfig, setSortConfig] = useState<{
        key: 'reset_time' | 'last_used' | null;
        direction: 'asc' | 'desc' | null;
    }>({
        key: null,
        direction: null,
    });

    const isSortingActive = sortConfig.key !== null && sortConfig.direction !== null;

    const handleSortToggle = (key: 'reset_time' | 'last_used') => {
        setSortConfig(prev => {
            if (prev.key !== key) {
                return { key, direction: 'asc' };
            }
            if (prev.direction === 'asc') {
                return { key, direction: 'desc' };
            }
            return { key: null, direction: null };
        });
    };

    // 根据排序状态对 accounts 进行拦截排序
    const sortedAccounts = useMemo(() => {
        if (!isSortingActive) return accounts;

        return [...accounts].sort((a, b) => {
            if (sortConfig.key === 'reset_time') {
                const timeA = extractAccountResetTime(a);
                const timeB = extractAccountResetTime(b);

                // 没有 reset_time 的排到后面
                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;

                return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
            }

            if (sortConfig.key === 'last_used') {
                const timeA = a.last_used || 0;
                const timeB = b.last_used || 0;

                return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
            }

            return 0;
        });
    }, [accounts, sortConfig, isSortingActive]);

    // 配置拖拽传感器
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 }, // 需要移动 8px 才触发拖拽
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const accountIds = useMemo(() => sortedAccounts.map(a => a.id), [sortedAccounts]);
    const activeAccount = useMemo(() => sortedAccounts.find(a => a.id === activeId), [sortedAccounts, activeId]);

    const handleDragStart = (event: DragStartEvent) => {
        if (isSortingActive) return;
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (isSortingActive) return;

        if (over && active.id !== over.id) {
            const oldIndex = accountIds.indexOf(active.id as string);
            const newIndex = accountIds.indexOf(over.id as string);

            if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
                onReorder(arrayMove(accountIds, oldIndex, newIndex));
            }
        }
    };

    if (accounts.length === 0) {
        return (
            <div className="bg-white dark:bg-base-100 rounded-2xl p-12 shadow-sm border border-gray-100 dark:border-base-200 text-center">
                <p className="text-gray-400 mb-2">{t('accounts.empty.title')}</p>
                <p className="text-sm text-gray-400">{t('accounts.empty.desc')}</p>
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-gray-100 dark:border-base-200 bg-gray-50 dark:bg-base-200">
                            <th className="pl-2 py-2 text-left w-8">
                                <span className="sr-only">{t('accounts.drag_to_reorder')}</span>
                            </th>
                            <th className="px-2 py-2 text-left w-10">
                                <input
                                    type="checkbox"
                                    className="checkbox checkbox-sm rounded border-2 border-gray-400 dark:border-gray-500 checked:border-blue-600 checked:bg-blue-600 [--chkbg:theme(colors.blue.600)] [--chkfg:white]"
                                    checked={accounts.length > 0 && selectedIds.size === accounts.length}
                                    onChange={onToggleAll}
                                />
                            </th>
                            <th className="px-2 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[300px] whitespace-nowrap">{t('accounts.table.email')}</th>
                            <th className="px-2 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[340px] whitespace-nowrap">
                                <button
                                    type="button"
                                    onClick={() => handleSortToggle('reset_time')}
                                    className={cn(
                                        "inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase font-medium",
                                        sortConfig.key === 'reset_time' && "text-blue-600 dark:text-blue-400 font-semibold"
                                    )}
                                    title={t('accounts.table.sort_by_reset_time', '点击按配额重置时间排序')}
                                >
                                    <span>{t('accounts.table.quota', '模型配额')}</span>
                                    {sortConfig.key === 'reset_time' ? (
                                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    ) : (
                                        <ArrowUpDown className="w-3 h-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-60 hover:opacity-100" />
                                    )}
                                </button>
                            </th>
                            <th className="px-2 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[150px] whitespace-nowrap">
                                <div className="flex items-center justify-between gap-1.5">
                                    <span>{t('accounts.table.consumption', '消费与花费')}</span>
                                    <div className="inline-flex items-center bg-gray-200/60 dark:bg-white/10 rounded-md p-0.5 text-[9px] font-mono leading-none">
                                        {(['5h', '7d', '30d'] as const).map(w => (
                                            <button
                                                key={w}
                                                type="button"
                                                onClick={() => setConsumptionWindow(w)}
                                                className={cn(
                                                    "px-1.5 py-0.5 rounded transition-all",
                                                    consumptionWindow === w
                                                        ? "bg-white dark:bg-base-100 text-blue-600 dark:text-blue-400 font-bold shadow-xs"
                                                        : "text-gray-500 hover:text-gray-800 dark:text-gray-400"
                                                )}
                                            >
                                                {w === '5h' ? '5H' : w === '7d' ? '周' : '月'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </th>
                            <th className="px-2 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[90px] whitespace-nowrap">
                                <button
                                    type="button"
                                    onClick={() => handleSortToggle('last_used')}
                                    className={cn(
                                        "inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase font-medium",
                                        sortConfig.key === 'last_used' && "text-blue-600 dark:text-blue-400 font-semibold"
                                    )}
                                    title={t('accounts.table.sort_by_last_used', '点击按最后使用时间排序')}
                                >
                                    <span>{t('accounts.table.last_used')}</span>
                                    {sortConfig.key === 'last_used' ? (
                                        sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    ) : (
                                        <ArrowUpDown className="w-3 h-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-60 hover:opacity-100" />
                                    )}
                                </button>
                            </th>
                            <th className="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap sticky right-0 w-[110px] bg-gray-50 dark:bg-base-200 z-20 shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.1)] dark:shadow-[-12px_0_12px_-12px_rgba(255,255,255,0.05)] text-center">{t('accounts.table.actions')}</th>
                        </tr >
                    </thead >
                    <SortableContext items={accountIds} strategy={verticalListSortingStrategy}>
                        <tbody className="divide-y divide-gray-100 dark:divide-base-200">
                            {sortedAccounts.map((account, index) => (
                                <SortableAccountRow
                                    index={index}
                                    key={account.id}
                                    account={account}
                                    selected={selectedIds.has(account.id)}
                                    isRefreshing={refreshingIds.has(account.id)}
                                    isCurrent={account.id === currentAccountId}
                                    activeClients={activeClients}
                                    isSwitching={account.id === switchingAccountId}
                                    isDragging={account.id === activeId}
                                    onSelect={() => onToggleSelect(account.id)}
                                    onSwitch={(targetIde?: string) => onSwitch(account.id, targetIde)}
                                    onRefresh={() => onRefresh(account.id)}
                                    onViewDevice={() => onViewDevice(account.id)}
                                    onViewDetails={() => onViewDetails(account.id)}
                                    onExport={() => onExport(account.id)}
                                    onDelete={() => onDelete(account.id)}
                                    onToggleProxy={() => onToggleProxy(account.id)}
                                    onWarmup={onWarmup ? () => onWarmup(account.id) : undefined}
                                    onUpdateLabel={onUpdateLabel ? (label: string) => onUpdateLabel(account.id, label) : undefined}
                                    onViewError={() => onViewError(account.id)}
                                    isDragDisabled={isSortingActive}
                                    consumptionWindow={consumptionWindow}
                                />
                            ))}
                        </tbody>
                    </SortableContext>
                </table >
            </div >

            {/* 拖拽悬浮预览层 */}
            <DragOverlay>
                {
                    activeAccount ? (
                        <table className="w-full bg-white dark:bg-base-100 shadow-2xl rounded-lg border border-blue-200 dark:border-blue-800">
                            <tbody>
                                <tr className="bg-blue-50 dark:bg-blue-900/30">
                                    <td className="pl-2 py-1 w-8">
                                        <div className="flex items-center justify-center w-6 h-6 text-blue-500">
                                            <GripVertical className="w-4 h-4" />
                                        </div>
                                    </td>
                                    <td className="px-2 py-1 w-10">
                                        <input
                                            type="checkbox"
                                            className="checkbox checkbox-xs rounded border-2"
                                            checked={selectedIds.has(activeAccount.id)}
                                            readOnly
                                        />
                                    </td>
                                    <AccountRowContent
                                        account={activeAccount}
                                        isCurrent={activeAccount.id === currentAccountId}
                                        activeClients={activeClients}
                                        isRefreshing={refreshingIds.has(activeAccount.id)}
                                        isSwitching={activeAccount.id === switchingAccountId}
                                        onSwitch={() => { }}
                                        onRefresh={() => { }}
                                        onViewDevice={() => { }}
                                        onViewDetails={() => { }}
                                        onExport={() => { }}
                                        onDelete={() => { }}
                                        onToggleProxy={() => { }}
                                        isDisabled={Boolean(activeAccount.disabled)}
                                        onViewError={() => { }}
                                        consumptionWindow={consumptionWindow}
                                    />
                                </tr>
                            </tbody>
                        </table>
                    ) : null
                }
            </DragOverlay>
        </DndContext>
    );
}

export default AccountTable;
