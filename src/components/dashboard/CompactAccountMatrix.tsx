import React from 'react';
import { Account, getAccountTier } from '../../types/account';
import { Zap, CheckCircle2, RefreshCw } from 'lucide-react';

interface CompactAccountMatrixProps {
  accounts: Account[];
  currentAccountId?: string;
  onSwitch: (accountId: string) => void;
}

export const CompactAccountMatrix: React.FC<CompactAccountMatrixProps> = ({
  accounts,
  currentAccountId,
  onSwitch,
}) => {

  const normalAccounts = accounts.filter(
    (a) => !a.validation_blocked && !a.quota?.is_forbidden
  );

  return (
    <div className="bg-base-100 rounded-2xl border border-base-200 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-base-200">
        <div>
          <h2 className="text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6366F1]" />
            多账号 5 小时高密度配额矩阵
          </h2>
          <p className="text-[11px] opacity-60">
            一屏极速扫视 · 共 {normalAccounts.length} 个就绪账号
          </p>
        </div>
        <span className="text-[10px] text-gray-400 font-mono">
          极速切换模式
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {normalAccounts.map((account) => {
          const isActive = account.id === currentAccountId;
          const tier = getAccountTier(account);
          const emailPrefix = account.email ? account.email.split('@')[0] : 'Account';
          const quota = account.quota?.models && account.quota.models.length > 0
            ? (account.quota.models[0]?.percentage ?? 100)
            : 100;

          // 配额状态颜色
          let quotaColor = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
          let barGradient = 'from-emerald-500 to-teal-400';
          if (quota < 20) {
            quotaColor = 'text-rose-500 bg-rose-500/10 border-rose-500/20';
            barGradient = 'from-rose-500 to-red-400';
          } else if (quota < 50) {
            quotaColor = 'text-amber-500 bg-amber-500/10 border-amber-500/20';
            barGradient = 'from-amber-500 to-yellow-400';
          }

          return (
            <div
              key={account.id}
              className={`p-3 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                isActive
                  ? 'bg-[#6366F1]/5 border-[#6366F1]/40 shadow-xs ring-1 ring-[#6366F1]/30'
                  : 'bg-base-200/40 hover:bg-base-200/80 border-base-200/80'
              }`}
            >
              {/* 顶部：邮箱与等级 */}
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {isActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping flex-shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400/50 flex-shrink-0" />
                  )}
                  <span
                    className="text-xs font-semibold truncate text-gray-800 dark:text-gray-200"
                    title={account.email}
                  >
                    {emailPrefix}
                  </span>
                </div>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-black/[0.04] dark:bg-white/[0.06] text-gray-500 dark:text-gray-400">
                  {tier}
                </span>
              </div>

              {/* 中间：5h 配额进度 */}
              <div className="space-y-1 my-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400 flex items-center gap-0.5">
                    <Zap size={10} className="text-[#6366F1]" /> 5h 配额
                  </span>
                  <span className={`font-mono font-bold px-1 rounded text-[10px] border ${quotaColor}`}>
                    {quota}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-gray-200/70 dark:bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-300`}
                    style={{ width: `${Math.min(quota, 100)}%` }}
                  />
                </div>
              </div>

              {/* 底部：操作按钮 */}
              <div className="pt-2 mt-1 border-t border-black/[0.03] dark:border-white/[0.04] flex items-center justify-between text-[11px]">
                {isActive ? (
                  <span className="text-emerald-500 text-[10px] font-semibold flex items-center gap-1">
                    <CheckCircle2 size={12} /> 当前激活
                  </span>
                ) : (
                  <button
                    onClick={() => onSwitch(account.id)}
                    className="w-full py-1 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-white/10 dark:hover:bg-white/15 text-white text-[10px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={10} />
                    <span>一键切号</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CompactAccountMatrix;
