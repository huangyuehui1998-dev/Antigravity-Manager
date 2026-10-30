import React from 'react';
import { useAccountStore } from '../../stores/useAccountStore';
import { UserPlus, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const ActiveAccountCapsule: React.FC = () => {
  const { currentAccount, loading } = useAccountStore();
  const navigate = useNavigate();

  // 1. 加载态：骨架脉冲微光
  if (loading && !currentAccount) {
    return (
      <div className="h-6 w-28 rounded-full bg-gray-200 dark:bg-zinc-800 animate-pulse" />
    );
  }

  // 2. 空状态：无账号登录时的安全占位，支持一键引导去账号页添加
  if (!currentAccount) {
    return (
      <button
        onClick={() => navigate('/accounts')}
        className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
        title="点击前往账号矩阵添加账号"
      >
        <UserPlus size={12} />
        <span>未绑定账号</span>
      </button>
    );
  }

  // 3. 就绪态：正常呈现激活账号邮箱前缀与 5h 水位指示
  const emailPrefix = currentAccount.email ? currentAccount.email.split('@')[0] : 'Account';
  const quota = currentAccount.quota?.models && currentAccount.quota.models.length > 0
    ? (currentAccount.quota.models[0]?.percentage ?? 100)
    : 100;

  return (
    <div
      onClick={() => navigate('/accounts')}
      className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.06] text-gray-700 dark:text-gray-300 cursor-pointer hover:border-[#6366F1]/40 transition-colors"
      title={`当前激活账号: ${currentAccount.email}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-ping" />
      <span className="max-w-[100px] truncate">{emailPrefix}</span>
      <span className="flex items-center text-[10px] text-gray-400">
        <Zap size={10} className="text-[#6366F1] mr-0.5" />
        {quota}%
      </span>
    </div>
  );
};

export default ActiveAccountCapsule;
