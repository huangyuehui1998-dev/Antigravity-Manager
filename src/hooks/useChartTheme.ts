import { useMemo } from 'react';
import { useConfigStore } from '../stores/useConfigStore';

export interface ChartThemeColors {
  gridStroke: string;
  gridOpacity: number;
  axisStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  accentIndigo: string;
  accentEmerald: string;
}

export function useChartTheme(): ChartThemeColors {
  const { config } = useConfigStore();

  const isDark = useMemo(() => {
    const currentTheme = config?.theme || 'system';
    if (currentTheme === 'system') {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return currentTheme === 'dark';
  }, [config?.theme]);

  return useMemo(() => {
    if (isDark) {
      return {
        gridStroke: 'rgba(255, 255, 255, 0.12)',
        gridOpacity: 0.15,
        axisStroke: '#9CA3AF',
        tooltipBg: '#111827',
        tooltipBorder: 'rgba(255, 255, 255, 0.1)',
        tooltipText: '#F3F4F6',
        accentIndigo: '#6366F1',
        accentEmerald: '#10B981',
      };
    } else {
      return {
        gridStroke: 'rgba(0, 0, 0, 0.08)',
        gridOpacity: 0.8,
        axisStroke: '#64748B',
        tooltipBg: '#FFFFFF',
        tooltipBorder: 'rgba(0, 0, 0, 0.08)',
        tooltipText: '#0F172A',
        accentIndigo: '#4F46E5',
        accentEmerald: '#059669',
      };
    }
  }, [isDark]);
}
