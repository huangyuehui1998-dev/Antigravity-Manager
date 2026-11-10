import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FinancialDashboard from './FinancialDashboard';
import TokenStats from './TokenStats';
import Monitor from './Monitor';
import ModelDiagnosticsDashboard from '../components/analytics/ModelDiagnosticsDashboard';
import { cn } from '../utils/cn';

import { BadgeDollarSign, BarChart3, Activity, FileText } from 'lucide-react';

export const AnalyticsHub: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'financial';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  const tabs = [
    { key: 'financial', label: t('analytics_hub.tabs.financial', '商业财务价值看板'), icon: BadgeDollarSign },
    { key: 'tokens', label: t('analytics_hub.tabs.tokens', '模型用量画像统计'), icon: BarChart3 },
    { key: 'diagnostics', label: t('analytics_hub.tabs.diagnostics', '模型真伪评判与实时流速遥测'), icon: Activity },
    { key: 'logs', label: t('analytics_hub.tabs.logs', '全电脑调用流水日志'), icon: FileText },
  ];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-transparent">
      {/* 顶部二级导航 Tab (纯 Tailwind，彻底杜绝 DaisyUI 与 Antd 样式冲突) */}
      <div className="px-6 pt-2.5 flex-shrink-0 bg-[#FAFBFC] dark:bg-[#0B0F17] border-b border-black/[0.04] dark:border-white/[0.06]">
        <div className="flex items-center gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "px-4 py-2 text-xs font-semibold rounded-t-lg transition-all border-b-2 -mb-px flex items-center gap-1.5",
                  currentTab === tab.key
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 bg-white dark:bg-[#121620] shadow-2xs"
                    : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 单一物理滚动条 + Keep-Alive 内存常驻 */}
      <div className="flex-1 h-full overflow-hidden relative">
        <div className={`h-full w-full ${currentTab === 'financial' ? 'block' : 'hidden'}`}>
          <FinancialDashboard active={currentTab === 'financial'} />
        </div>
        <div className={`h-full w-full ${currentTab === 'tokens' ? 'block' : 'hidden'}`}>
          <TokenStats />
        </div>
        <div className={`h-full w-full ${currentTab === 'diagnostics' ? 'block' : 'hidden'}`}>
          <ModelDiagnosticsDashboard active={currentTab === 'diagnostics'} />
        </div>
        <div className={`h-full w-full ${currentTab === 'logs' ? 'block' : 'hidden'}`}>
          <Monitor />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsHub;
