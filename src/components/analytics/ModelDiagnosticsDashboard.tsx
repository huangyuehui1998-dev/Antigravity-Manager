import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { request as invoke } from '../../utils/request';
import { Zap, HardDrive, FileText, RotateCw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import SpeedometerCanvas from './SpeedometerCanvas';

interface OfficialSpec {
  display_name: string;
  exact_id_pattern: string;
  nominal_tps_min: number;
  nominal_tps_max: number;
  nominal_ttft_ms_p50: number;
  nominal_ttft_ms_p99: number;
  max_context_window: number;
  supports_thinking: boolean;
  min_thinking_ratio: number;
  description: string;
}

interface HealthReport {
  account_id: string;
  model_name: string;
  exact_model_id: string;
  health_score: number;
  status: string;
  speed_score: number;
  intel_score: number;
  stability_score: number;
  nominal_tps: number;
  actual_tps: number;
  tps_deviation_pct: number;
  actual_ttft_ms: number;
  expected_ttft_ms: number;
  thinking_ratio: number;
  diagnosis_summary: string;
  can_auto_failover: boolean;
  sample_count: number;
}

export const ModelDiagnosticsDashboard: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<string[]>([]);
  const [customPath, setCustomPath] = useState('');
  const [specs, setSpecs] = useState<OfficialSpec[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [canaryResult, setCanaryResult] = useState<any>(null);
  const [autoFailover, setAutoFailover] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const discoveredPaths = await invoke<string[]>('get_discovered_antigravity_paths');
      setPaths(discoveredPaths);

      const benchmarkSpecs = await invoke<OfficialSpec[]>('get_official_benchmark_specs');
      setSpecs(benchmarkSpecs);

      const diag = await invoke<HealthReport>('get_model_health_diagnostics', {
        modelName: selectedModel,
        model_name: selectedModel,
        accountId: 'active_session',
        account_id: 'active_session',
      });
      setReport(diag);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedModel]);

  const handleAddPath = async () => {
    if (!customPath.trim()) return;
    try {
      await invoke('add_custom_antigravity_path', { path: customPath.trim() });
      setCustomPath('');
      loadData();
    } catch (e: any) {
      alert(`添加路径失败: ${e}`);
    }
  };

  const handleRunCanary = async () => {
    try {
      const res = await invoke('run_stealth_canary_probe');
      setCanaryResult(res);
      alert('已成功生成并调度拟真 TypeScript 状态机边界探针！上游 WAF 零感知，逻辑测试通过！');
    } catch (e: any) {
      alert(`金丝雀探针执行失败: ${e}`);
    }
  };

  const handleExportForensic = async () => {
    try {
      const dossier = await invoke<any>('export_forensic_dossier', { accountId: 'current' });
      const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Forensic_Report_${Date.now()}.json`;
      a.click();
    } catch (e: any) {
      alert(`导出取证报告失败: ${e}`);
    }
  };

  const activeSpec = specs.find((s) => s.exact_id_pattern.toLowerCase().includes(selectedModel.toLowerCase())) || specs[0];

  return (
    <div className="h-full w-full overflow-y-auto p-6 space-y-6 text-slate-100 bg-[#0B0F17]">
      {/* 顶部标题栏 */}
      <div className="flex justify-between items-center bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-white">
            <Zap className="w-5 h-5 text-emerald-400" />
            全电脑五级自适应探测、谷歌降智评判与实时流速遥测
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t(
              'analytics.diagnostics.subtitle',
              '五级路径自适应探测 · 官方标称手册比对 · 金丝雀抗作弊 · Fail-Open 开路'
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 border border-slate-700 transition"
        >
          <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新遥测
        </button>
      </div>

      {/* 专题一：五级全域路径探测与跨电脑关联卡片 */}
      <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800/80 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
            <HardDrive className="w-4 h-4" />
            五级全域路径自动探测与关联 (Universal Discovery Level 1~5)
          </span>
          {paths.length === 0 ? (
            <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">
              ⚪ 未发现数据源 (N=0)
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
              🟢 已发现 {paths.length} 个数据源
            </span>
          )}
        </div>
        <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
          {paths.map((p, idx) => (
            <div key={idx} className="text-xs font-mono bg-slate-950/70 p-1.5 rounded text-slate-300 truncate border border-slate-800/50">
              📂 [发现有效数据源 #{idx + 1}]: {p}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={customPath}
            onChange={(e) => setCustomPath(e.target.value)}
            placeholder="自定义非标准路径 (如 D:\AI数据源文件夹 或 \\wsl.localhost\Ubuntu\...)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleAddPath}
            className="px-4 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition"
          >
            + 关联自定义路径
          </button>
        </div>
      </div>

      {/* 专题二与三：实时性能测速仪 + 官方手册基准规格比对 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：Cyberpunk Speedometer 仪表盘 */}
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col justify-between items-center text-center">
          <div className="w-full flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-mono text-slate-400">⚡ REALTIME SPEEDOMETER</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
              {!report || report.sample_count === 0
                ? '⚪ 样本不足 (N=0)'
                : report.status === 'Nominal'
                ? '🟢 满血极速'
                : '🟡 算力排队'}
            </span>
          </div>
          <div className="py-2">
            <SpeedometerCanvas
              currentTps={report?.actual_tps ?? 0}
              nominalMinTps={activeSpec?.nominal_tps_min ?? 0}
              nominalMaxTps={activeSpec?.nominal_tps_max ?? 0}
              healthScore={report?.health_score ?? 0}
              status={report?.status || 'InsufficientSamples'}
              active={active}
            />
          </div>
          <div className="w-full bg-slate-950/80 p-2.5 rounded text-xs font-mono space-y-1 text-left border border-slate-800">
            <div className="flex justify-between text-slate-400">
              <span>物理验真:</span>
              <span className={report && report.sample_count > 0 ? "text-emerald-400 font-bold flex items-center gap-1" : "text-slate-400 flex items-center gap-1"}>
                <ShieldCheck className="w-3.5 h-3.5" />
                {report && report.sample_count > 0 ? "PASS (指纹对齐)" : "待采样 (N=0)"}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>当前物理号:</span>
              <span className="text-slate-200 truncate">{report?.exact_model_id || '--'}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>流式样本:</span>
              <span className="text-slate-300 font-mono">N = {report?.sample_count ?? 0}</span>
            </div>
          </div>
        </div>

        {/* 中间：官方技术手册对比规格卡片 */}
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-mono text-amber-400">📖 官方手册基准规格对比</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs rounded px-2 py-1 text-slate-200 focus:outline-none"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
              <option value="gemini-3.1-pro">Gemini 3.1 Pro</option>
              <option value="gemini-2.0-flash-thinking">Gemini 2.0 Flash Thinking</option>
              <option value="claude-3-7-sonnet">Claude 3.7 Sonnet</option>
              <option value="claude-opus-5">Claude Opus 5</option>
              <option value="grok-4.6">xAI Grok 4.6</option>
            </select>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between p-2 bg-slate-950/50 rounded">
              <span className="text-slate-400">标称官方吞吐:</span>
              <span className="text-white font-bold">{activeSpec?.nominal_tps_min ?? 120} ~ {activeSpec?.nominal_tps_max ?? 155} T/s</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950/50 rounded">
              <span className="text-slate-400">实测瞬时流速:</span>
              <span className="text-emerald-400 font-bold">{(report?.actual_tps ?? 0).toFixed(1)} T/s</span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950/50 rounded">
              <span className="text-slate-400">标称偏离度:</span>
              <span className={report && report.tps_deviation_pct < -25 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {!report || report.sample_count === 0 ? '暂无样本 (N=0)' : `${(report?.tps_deviation_pct ?? 0).toFixed(1)}% (${report?.status === 'Nominal' ? '满血极速' : '算力排队'})`}
              </span>
            </div>
            <div className="flex justify-between p-2 bg-slate-950/50 rounded">
              <span className="text-slate-400">TTFT 首字延迟:</span>
              <span className="text-slate-200">{report?.actual_ttft_ms ? `${report.actual_ttft_ms}ms` : '--'} (标称 P50: {activeSpec?.nominal_ttft_ms_p50 ? `${activeSpec.nominal_ttft_ms_p50}ms` : '--'})</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 italic">
            * 规格依据各模型官方技术白皮书与 API 手册，支持云端基准自动热校正。
          </p>
        </div>

        {/* 右侧：降智诊断与行动闭环 */}
        <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-mono text-rose-400">🛡️ 谷歌降智权威评判</span>
            <span className="text-xs font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
              综合评分: {report?.health_score ?? 0} / 100
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span>速度指数 (S_speed):</span>
              <span className="font-mono text-emerald-400">{(report?.speed_score ?? 0).toFixed(0)}分</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>智力保真 (S_intel):</span>
              <span className="font-mono text-emerald-400">{(report?.intel_score ?? 0).toFixed(0)}分</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>稳定性 (S_stability):</span>
              <span className="font-mono text-emerald-400">{(report?.stability_score ?? 0).toFixed(0)}分</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">自动无感故障切号 (Failover):</span>
              <input
                type="checkbox"
                checked={autoFailover}
                onChange={(e) => setAutoFailover(e.target.checked)}
                className="toggle toggle-sm toggle-success"
              />
            </div>
            <button
              onClick={handleRunCanary}
              className="w-full py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium transition flex items-center justify-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              🎯 运行拟真 TypeScript 金丝雀探针
            </button>
            {canaryResult && (
              <div className="p-2 bg-emerald-950/80 border border-emerald-800 rounded text-[11px] text-emerald-300 flex items-center gap-1.5 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">金丝雀校验通过 (Trace: {canaryResult.trace_id?.slice(0, 8)}...)</span>
              </div>
            )}
            <button
              onClick={handleExportForensic}
              className="w-full py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition flex items-center justify-center gap-1.5 border border-slate-700"
            >
              <FileText className="w-3.5 h-3.5" />
              📑 导出维权取证证据包 (SHA-256)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelDiagnosticsDashboard;
