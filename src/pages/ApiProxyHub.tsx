import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ApiProxy from './ApiProxy';
import UserToken from './UserToken';
import Security from './Security';
import { cn } from '../utils/cn';

import { Globe, KeyRound, ShieldCheck } from 'lucide-react';

export const ApiProxyHub: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'gateway';

  const handleTabChange = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  const tabs = [
    { key: 'gateway', label: t('api_proxy_hub.tabs.gateway', '反向代理核心配置'), icon: Globe },
    { key: 'tokens', label: t('api_proxy_hub.tabs.tokens', 'User Token 分发管理'), icon: KeyRound },
    { key: 'security', label: t('api_proxy_hub.tabs.security', 'IP 防护与安全规则'), icon: ShieldCheck },
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
