/**
 * 账号表格组件
 * 支持拖拽排序功能，用户可以通过拖拽行来调整账号顺序
 */
import { useMemo, useState, useEffect, useRef } from 'react';
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
    Ban,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
} from 'lucide-react';
import { type Account, type ActiveClientsStatus, getAccountTier } from '../../types/account';
import { useTranslation } from 'react-i18next';
import { cn } from '../../utils/cn';
import { DoubleQuotaCapsule } from './DoubleQuotaCapsule';
import { AccountStatusBadge } from './AccountStatusBadge';
import { AccountActionMenu } from './AccountActionMenu';
import { showToast } from '../common/ToastContainer';
import { releaseAccountQoSJail } from '../../services/accountService';

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
            onClick={() => onViewDetails()}
            className={cn(
                "group transition-colors border-b border-gray-100 dark:border-base-200 cursor-pointer",
                isRowCurrent && "bg-blue-50/50 dark:bg-blue-900/10",
                isDragging && "bg-blue-100 dark:bg-blue-900/30 shadow-lg",
                !isDragging && "hover:bg-gray-50/80 dark:hover:bg-zinc-800/50"
            )}
        >
            {/* 拖拽手柄 */}
            <td className="pl-2 py-1 w-8 align-middle" onClick={(e) => e.stopPropagation()}>
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
            <td className="px-2 py-1 w-10 align-middle" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
 * 账号行内容组件 (工业级 5 核心列极简架构)
 */
function AccountRowContent({
    index: _index = 0,
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
    onWarmup: _onWarmup,
    onUpdateLabel: _onUpdateLabel,
    onViewError,
}: AccountRowContentProps) {
    const { t } = useTranslation();
    const isClassic = activeClients?.classic_account_id === account.id;
    const isIde = activeClients?.ide_account_id === account.id;
    const isAgy = activeClients?.agy_account_id === account.id;
    const isRowActive = isCurrent || isClassic || isIde || isAgy;

    const tier = useMemo(() => getAccountTier(account), [account]);

    const handleReleaseJail = async () => {
        try {
            await releaseAccountQoSJail(account.id);
            showToast(t('accounts.qos.release_success', '已解除该账号的小黑屋限制'), 'success');
            onRefresh();
        } catch (err: any) {
            showToast(err?.message || '解除失败', 'error');
        }
    };

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

    const c = account.consumption;
    const tokens = consumptionWindow === '5h' ? c?.tokens_5h : consumptionWindow === '7d' ? c?.tokens_7d : c?.tokens_30d;
    const cost = consumptionWindow === '5h' ? c?.cost_usd_5h : consumptionWindow === '7d' ? c?.cost_usd_7d : c?.cost_usd_30d;

    return (
        <>
            {/* 1. 账号列 (Account) */}
            <td className="px-3 py-2 align-middle max-w-[280px]">
                <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn(
                            "font-medium text-xs break-all transition-colors truncate max-w-[200px]",
                            isRowActive ? "text-blue-700 dark:text-blue-400 font-semibold" : "text-gray-900 dark:text-zinc-100"
                        )} title={account.email}>
                            {account.email}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40">
                            {tier.toUpperCase()}
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1 min-w-0">
                        {isClassic && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                CLASSIC
                            </span>
                        )}
                        {isIde && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                                IDE
                            </span>
                        )}
                        {isAgy && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                CLI
                            </span>
                        )}
                        {account.custom_label && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/40">
                                {account.custom_label}
                            </span>
                        )}
                    </div>
                </div>
            </td>

            {/* 2. 状态列 (Status) */}
            <td className="px-2.5 py-2 align-middle whitespace-nowrap w-[110px]">
                <AccountStatusBadge
                    account={account}
                    onViewError={onViewError}
                    onReleaseJail={handleReleaseJail}
                />
            </td>

            {/* 3. 配额进度列 (Quota Progress) */}
            <td className="px-3 py-2 align-middle min-w-[210px]">
                {isDisabled || account.quota?.is_forbidden || account.validation_blocked ? (
                    <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
                        <Ban className="w-3.5 h-3.5" />
                        <span>{account.validation_blocked ? t('accounts.validation_restricted', '验证受限') : isDisabled ? t('accounts.disabled', '已禁用') : t('accounts.access_blocked', '访问受阻')}</span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onViewError(); }}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline ml-1"
                        >
                            {t('common.details', '详情')}
                        </button>
                    </div>
                ) : (
                    <DoubleQuotaCapsule account={account} />
                )}
            </td>

            {/* 4. 周期消费列 (Consumption) */}
            <td className="px-3 py-2 align-middle font-mono whitespace-nowrap min-w-[150px]">
                <div className="flex flex-col gap-0.5 min-w-[130px]">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-800 dark:text-gray-100">
                            {fmtTokens(tokens)}
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {fmtCost(cost)}
                        </span>
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 font-sans">
                        {account.last_used ? new Date(account.last_used > 1e11 ? account.last_used : account.last_used * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </div>
                </div>
            </td>

            {/* 5. 操作列 (Actions) */}
            <td className="px-3 py-2 align-middle sticky right-0 w-[170px] min-w-[170px] bg-white dark:bg-zinc-900 border-l border-gray-100 dark:border-zinc-800 shadow-sm z-10" onClick={(e) => e.stopPropagation()}>
                <AccountActionMenu
                    account={account}
                    isCurrent={isCurrent}
                    isRefreshing={isRefreshing}
                    isSwitching={isSwitching}
                    activeClients={activeClients}
                    onSwitch={onSwitch}
                    onRefresh={onRefresh}
                    onViewDetails={onViewDetails}
                    onViewDevice={onViewDevice}
                    onExport={onExport}
                    onDelete={onDelete}
                    onToggleProxy={onToggleProxy}
                    isNearTop={_index < 3}
                />
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

    const headerCheckboxRef = useRef<HTMLInputElement>(null);
    const isAllSelected = accounts.length > 0 && accounts.every(a => selectedIds.has(a.id));
    const isIndeterminate = accounts.some(a => selectedIds.has(a.id)) && !isAllSelected;

    useEffect(() => {
        if (headerCheckboxRef.current) {
            headerCheckboxRef.current.indeterminate = isIndeterminate;
        }
    }, [isIndeterminate]);

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
                            {/* 1. 拖拽手柄列 */}
                            <th className="pl-2 py-2 text-left w-8">
                                <span className="sr-only">{t('accounts.drag_to_reorder')}</span>
                            </th>
                            {/* 2. 复选框列 */}
                            <th className="px-2 py-2 text-left w-10">
                                <input
                                    ref={headerCheckboxRef}
                                    type="checkbox"
                                    className="checkbox checkbox-sm rounded border-2 border-gray-400 dark:border-gray-500 checked:border-blue-600 checked:bg-blue-600 [--chkbg:theme(colors.blue.600)] [--chkfg:white]"
                                    checked={isAllSelected}
                                    onChange={onToggleAll}
                                />
                            </th>
                            {/* 3. 账号列 */}
                            <th className="px-3 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider max-w-[280px] whitespace-nowrap">
                                {t('accounts.table.email')}
                            </th>
                            {/* 4. 状态列 */}
                            <th className="px-2.5 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-[110px]">
                                {t('accounts.table.status', '状态')}
                            </th>
                            {/* 5. 配额进度列 */}
                            <th className="px-3 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[210px] whitespace-nowrap">
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
                            {/* 6. 周期消费与最后使用列 */}
                            <th className="px-3 py-1 text-left rtl:text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[150px] whitespace-nowrap">
                                <div className="flex items-center justify-between gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => handleSortToggle('last_used')}
                                        className={cn(
                                            "inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors uppercase font-medium",
                                            sortConfig.key === 'last_used' && "text-blue-600 dark:text-blue-400 font-semibold"
                                        )}
                                        title={t('accounts.table.sort_by_last_used', '点击按最后使用时间排序')}
                                    >
                                        <span>{t('accounts.table.consumption', '消费与花费')}</span>
                                        {sortConfig.key === 'last_used' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                        ) : (
                                            <ArrowUpDown className="w-3 h-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-60 hover:opacity-100" />
                                        )}
                                    </button>
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
                                                {w === '5h' ? '5H' : w === '7d' ? '7D' : '30D'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </th>
                            {/* 7. 操作列 */}
                            <th className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap sticky right-0 w-[170px] min-w-[170px] bg-gray-50 dark:bg-base-200 z-20 shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.1)] dark:shadow-[-12px_0_12px_-12px_rgba(255,255,255,0.05)] text-center">{t('accounts.table.actions')}</th>
                        </tr>
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
