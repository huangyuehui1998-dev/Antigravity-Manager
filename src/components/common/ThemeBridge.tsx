import React, { useMemo } from 'react';
import { ConfigProvider, App as AntdApp, theme as antdTheme } from 'antd';
import { useConfigStore } from '../../stores/useConfigStore';

export const ModernThemeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { config } = useConfigStore();

  const isDark = useMemo(() => {
    const currentTheme = config?.theme || 'system';
    if (currentTheme === 'system') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return currentTheme === 'dark';
  }, [config?.theme]);

  const themeConfig = useMemo(() => ({
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: isDark ? '#6366F1' : '#4F46E5',
      colorSuccess: '#10B981',
      colorWarning: '#F59E0B',
      colorError: '#EF4444',
      colorBgBase: isDark ? '#0B0F17' : '#FAFBFC',
      colorBgContainer: isDark ? '#111827' : '#FFFFFF',
      colorBgElevated: isDark ? '#1F2937' : '#F1F5F9',
      colorBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
      colorText: isDark ? '#F3F4F6' : '#111827',
      colorTextSecondary: isDark ? '#9CA3AF' : '#6B7280',
      borderRadius: 10,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontSize: 13,
    },
    components: {
      Table: {
        headerBg: isDark ? '#161F30' : '#F8FAFC',
        headerColor: isDark ? '#9CA3AF' : '#475569',
        rowHoverBg: isDark ? 'rgba(99, 102, 241, 0.06)' : 'rgba(79, 70, 229, 0.04)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
      },
      Modal: {
        contentBg: isDark ? '#111827' : '#FFFFFF',
        headerBg: isDark ? '#111827' : '#FFFFFF',
      },
    },
  }), [isDark]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp className="h-full w-full">
        {children}
      </AntdApp>
    </ConfigProvider>
  );
};

export default ModernThemeBridge;
