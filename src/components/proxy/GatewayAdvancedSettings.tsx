import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, BrainCircuit, Sparkles, Bot, ShieldAlert, ChevronDown } from 'lucide-react';
import { ProxyConfig, ExperimentalConfig, CircuitBreakerConfig } from '../../types/config';
import StreamTimeoutSettings from '../settings/StreamTimeoutSettings';
import ThinkingBudget from '../settings/ThinkingBudget';
import MultimodalSettings from '../settings/MultimodalSettings';
import AgentSettings from '../settings/AgentSettings';
import CircuitBreaker from '../settings/CircuitBreaker';
import { cn } from '../../utils/cn';

interface GatewayAdvancedSettingsProps {
    proxyConfig: ProxyConfig;
    circuitBreakerConfig?: CircuitBreakerConfig;
    onUpdateProxyConfig: (partial: Partial<ProxyConfig>) => void;
    onUpdateExperimentalConfig: (partial: Partial<ExperimentalConfig>) => void;
    onUpdateCircuitBreakerConfig?: (config: CircuitBreakerConfig) => void;
    onSave: () => void;
}

interface SettingCardProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultExpanded?: boolean;
}

const SettingCard: React.FC<SettingCardProps> = ({
    title,
    icon,
    children,
    defaultExpanded = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    return (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 shadow-xs overflow-hidden transition-all">
            <div
                className="px-5 py-3.5 flex items-center justify-between cursor-pointer bg-gray-50/70 dark:bg-zinc-800/40 hover:bg-gray-100/70 dark:hover:bg-zinc-800/70 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="text-gray-500 dark:text-zinc-400">
                        {icon}
                    </div>
                    <span className="font-semibold text-xs text-gray-900 dark:text-zinc-100">
                        {title}
                    </span>
                </div>
                <button
                    type="button"
                    className={cn('p-1.5 rounded-lg text-gray-400 hover:text-gray-600 transition-all', isExpanded ? 'rotate-180' : '')}
                >
                    <ChevronDown size={14} />
                </button>
            </div>
            {isExpanded && (
                <div className="p-4 border-t border-gray-100 dark:border-zinc-800">
                    {children}
                </div>
            )}
        </div>
    );
};

export const GatewayAdvancedSettings: React.FC<GatewayAdvancedSettingsProps> = ({
    proxyConfig,
    circuitBreakerConfig,
    onUpdateProxyConfig,
    onUpdateExperimentalConfig,
    onUpdateCircuitBreakerConfig,
    onSave,
}) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-3">
            {/* 流式超时设置 */}
            <SettingCard
                title={t('proxy.config.stream_timeout_settings.title', '流式超时设置 (Stream Timeout Settings)')}
                icon={<Timer size={16} className="text-blue-500" />}
            >
                <StreamTimeoutSettings
                    config={proxyConfig.stream_timeouts}
                    onChange={(timeoutConfig) => onUpdateProxyConfig({ stream_timeouts: timeoutConfig })}
                    onSave={onSave}
                />
            </SettingCard>

            {/* 思考设置 */}
            <SettingCard
                title={t('proxy.config.thinking_settings.title', '思考设置 (Thinking & Reasoning Settings)')}
                icon={<BrainCircuit size={16} className="text-purple-500" />}
            >
                <ThinkingBudget
                    config={proxyConfig.thinking_budget}
                    onChange={(tbConfig) => onUpdateProxyConfig({ thinking_budget: tbConfig })}
                    onSave={onSave}
                    thinkingStoreEnabled={proxyConfig.experimental?.thinking_store_enabled !== false}
                    onThinkingStoreChange={(enabled) =>
                        onUpdateExperimentalConfig({ thinking_store_enabled: enabled })
                    }
                    thinkingMaxMemoryTurns={proxyConfig.experimental?.thinking_max_memory_turns ?? 600}
                    onThinkingMaxMemoryTurnsChange={(turns: number) =>
                        onUpdateExperimentalConfig({ thinking_max_memory_turns: turns })
                    }
                    thinkingRetentionDays={proxyConfig.experimental?.thinking_retention_days ?? 15}
                    onThinkingRetentionDaysChange={(days: number) =>
                        onUpdateExperimentalConfig({ thinking_retention_days: days })
                    }
                    globalCompactionStripEnabled={proxyConfig.experimental?.enable_global_compaction_strip === true}
                    onGlobalCompactionStripChange={(enabled) =>
                        onUpdateExperimentalConfig({ enable_global_compaction_strip: enabled })
                    }
                />
            </SettingCard>

            {/* 多模态交互设置 */}
            <SettingCard
                title={t('proxy.config.multimodal_settings.title', '多模态交互设置 (Multimodal Settings)')}
                icon={<Sparkles size={16} className="text-pink-500" />}
            >
                <MultimodalSettings
                    config={proxyConfig.multimodal}
                    onChange={(mConfig) => onUpdateProxyConfig({ multimodal: mConfig })}
                    onSave={onSave}
                />
            </SettingCard>

            {/* 特定 Agent 特性配置 */}
            <SettingCard
                title={t('proxy.config.agent_settings.title', '特定 Agent 配置 (Specific Agent Settings)')}
                icon={<Bot size={16} className="text-cyan-500" />}
            >
                <AgentSettings
                    experimentalConfig={proxyConfig.experimental}
                    onChange={onUpdateExperimentalConfig}
                    onSave={onSave}
                />
            </SettingCard>

            {/* 熔断器配置 */}
            {circuitBreakerConfig && onUpdateCircuitBreakerConfig && (
                <SettingCard
                    title={t('proxy.config.circuit_breaker.title', '熔断与限流保护 (Circuit Breaker)')}
                    icon={<ShieldAlert size={16} className="text-amber-500" />}
                >
                    <CircuitBreaker
                        config={circuitBreakerConfig}
                        onChange={onUpdateCircuitBreakerConfig}
                    />
                </SettingCard>
            )}
        </div>
    );
};

export default GatewayAdvancedSettings;
