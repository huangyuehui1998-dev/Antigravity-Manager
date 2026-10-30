import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs } from 'antd';
import ApiProxy from './ApiProxy';
import UserToken from './UserToken';
import Security from './Security';

export const ApiProxyHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'gateway';

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
            { key: 'gateway', label: '🌐 反向代理核心配置' },
            { key: 'tokens', label: '🔑 User Token 分发管理' },
            { key: 'security', label: '🛡️ IP 防护与安全规则' },
          ]}
        />
      </div>

      {/* 单一物理滚动条 + Keep-Alive 内存常驻 */}
      <div className="flex-1 h-full overflow-hidden relative">
        <div className={`h-full w-full ${currentTab === 'gateway' ? 'block' : 'hidden'}`}>
          <ApiProxy />
        </div>
        <div className={`h-full w-full ${currentTab === 'tokens' ? 'block' : 'hidden'}`}>
          <UserToken />
        </div>
        <div className={`h-full w-full ${currentTab === 'security' ? 'block' : 'hidden'}`}>
          <Security />
        </div>
      </div>
    </div>
  );
};

export default ApiProxyHub;
