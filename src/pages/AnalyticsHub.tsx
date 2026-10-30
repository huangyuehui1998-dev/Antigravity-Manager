import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import FinancialDashboard from './FinancialDashboard';
import TokenStats from './TokenStats';
import Monitor from './Monitor';

export const AnalyticsHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'financial';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-transparent">
      {/* 顶部二级导航 Tab */}
      <div className="px-6 pt-3 flex-shrink-0 bg-[#FAFBFC] dark:bg-[#0B0F17] border-b border-black/[0.04] dark:border-white/[0.06]">
        <Tabs
          activeKey={currentTab}
          onChange={handleTabChange}
          className="[&_.ant-tabs-nav]:mb-0"
          items={[
            { key: 'financial', label: '💰 商业财务价值看板' },
            { key: 'tokens', label: '📊 模型用量画像统计' },
            { key: 'logs', label: '📝 全电脑调用流水日志' },
          ]}
        />
      </div>

      {/* 单一物理滚动条 + Keep-Alive 内存常驻 */}
      <div className="flex-1 h-full overflow-hidden relative">
        <div className={`h-full w-full ${currentTab === 'financial' ? 'block' : 'hidden'}`}>
          <FinancialDashboard />
        </div>
        <div className={`h-full w-full ${currentTab === 'tokens' ? 'block' : 'hidden'}`}>
          <TokenStats />
        </div>
        <div className={`h-full w-full ${currentTab === 'logs' ? 'block' : 'hidden'}`}>
          <Monitor />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsHub;
