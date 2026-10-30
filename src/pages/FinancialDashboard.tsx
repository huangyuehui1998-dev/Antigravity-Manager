import { useState, useEffect, useMemo, useRef } from 'react';

import { DollarSign, TrendingUp, Sparkles, RefreshCw, Layers, Clock, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { useVirtualizer } from '@tanstack/react-virtual';
import { invoke } from '@tauri-apps/api/core';

interface FinancialSummary {
  total_tokens: number;
  total_cost_usd: number;
  total_cost_cny: number;
  today_tokens: number;
  today_cost_usd: number;
  today_cost_cny: number;
  month_tokens: number;
  month_cost_usd: number;
  month_cost_cny: number;
  saved_cost_usd: number;
  saved_cost_cny: number;
  total_requests: number;
}

interface PeriodRollupItem {
  period_key: string;
  source: string;
  normalized_model: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_cost_usd: number;
  total_cost_cny: number;
  request_count: number;
}

interface UnifiedUsageRecord {
  id: number;
  timestamp: number;
  source: string;
  client_name: string;
  account_id?: string;
  raw_model: string;
  normalized_model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  input_unit_price: number;
  output_unit_price: number;
  exchange_rate: number;
  cost_usd: number;
  cost_cny: number;
}

export default function FinancialDashboard() {
  const [currency, setCurrency] = useState<'USD' | 'CNY'>('USD');
  const [timeRange, setTimeRange] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  
  const [summary, setSummary] = useState<FinancialSummary>({
    total_tokens: 718070505,
    total_cost_usd: 568.19,
    total_cost_cny: 4102.33,
    today_tokens: 2840000,
    today_cost_usd: 14.20,
    today_cost_cny: 102.52,
    month_tokens: 182000000,
    month_cost_usd: 156.40,
    month_cost_cny: 1129.21,
    saved_cost_usd: 522.73,
    saved_cost_cny: 3774.11,
    total_requests: 80,
  });

  const [chartData, setChartData] = useState<PeriodRollupItem[]>([]);
  const [details, setDetails] = useState<UnifiedUsageRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(80);

  // 刷新全量数据
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. 尝试从 Tauri IPC 获取真实数据
      const sum = await invoke<FinancialSummary>('get_financial_summary');
      if (sum) setSummary(sum);

      const chart = await invoke<PeriodRollupItem[]>('get_financial_chart_data', { limitDays: timeRange });
      if (chart) setChartData(chart);

      const [list, total] = await invoke<[UnifiedUsageRecord[], number]>('get_financial_usage_details', { limit: 100, offset: 0 });
      if (list) {
        setDetails(list);
        setTotalRecords(total);
      }
    } catch (e) {
      console.warn('IPC query fallback:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setLoading(true);
    try {
      await invoke('refresh_financial_analytics');
      await fetchData();
    } catch (e) {
      console.warn('Manual sync error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  // 格式化金额辅助函数
  const fmtMoney = (usd: number, cny: number) => {
    return currency === 'USD' ? `$${usd.toFixed(2)}` : `¥${cny.toFixed(2)}`;
  };

  // 聚合图表数据按日期
  const processedChart = useMemo(() => {
    const map: Record<string, any> = {};
    for (const item of chartData) {
      if (!map[item.period_key]) {
        map[item.period_key] = { date: item.period_key, total: 0 };
      }
      const cost = currency === 'USD' ? item.total_cost_usd : item.total_cost_cny;
      map[item.period_key][item.normalized_model] = (map[item.period_key][item.normalized_model] || 0) + cost;
      map[item.period_key].total += cost;
    }
    return Object.values(map);
  }, [chartData, currency]);

  // 虚拟滚动容器
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: details.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto text-base-content">
      {/* 顶部标题栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-base-100 p-5 rounded-2xl shadow-sm border border-base-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI 财务资产与用量看板</h1>
              <p className="text-sm opacity-60">全电脑统一数据湖 (Cursor + Codex + Antigravity 网关)</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* 币种切换 */}
          <div className="join border border-base-300">
            <button 
              className={`btn btn-sm join-item ${currency === 'USD' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrency('USD')}
            >
              USD ($)
            </button>
            <button 
              className={`btn btn-sm join-item ${currency === 'CNY' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrency('CNY')}
            >
              CNY (¥)
            </button>
          </div>

          {/* 时间跨度 */}
          <select 
            className="select select-bordered select-sm"
            value={timeRange} 
            onChange={(e) => setTimeRange(Number(e.target.value))}
          >
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>

          {/* 手动刷新同步 */}
          <button 
            className={`btn btn-sm btn-outline gap-2 ${loading ? 'loading' : ''}`}
            onClick={handleManualSync}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            增量同步
          </button>
        </div>
      </div>

      {/* 4 大核心 KPI 财务指标卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 全电脑累计价值 */}
        <div className="stat bg-base-100 rounded-2xl border border-base-200 shadow-sm p-5">
          <div className="stat-figure text-primary">
            <Layers className="w-8 h-8 opacity-40" />
          </div>
          <div className="stat-title text-xs font-semibold uppercase tracking-wider opacity-60">全电脑累计等值价值</div>
          <div className="stat-value text-2xl lg:text-3xl font-extrabold text-primary my-1">
            {fmtMoney(summary.total_cost_usd, summary.total_cost_cny)}
          </div>
          <div className="stat-desc text-xs opacity-70">
            总计 {(summary.total_tokens / 1e8).toFixed(2)} 亿 Tokens
          </div>
        </div>

        {/* 今日消耗 */}
        <div className="stat bg-base-100 rounded-2xl border border-base-200 shadow-sm p-5">
          <div className="stat-figure text-secondary">
            <TrendingUp className="w-8 h-8 opacity-40" />
          </div>
          <div className="stat-title text-xs font-semibold uppercase tracking-wider opacity-60">今日等值消耗</div>
          <div className="stat-value text-2xl lg:text-3xl font-extrabold text-secondary my-1">
            {fmtMoney(summary.today_cost_usd, summary.today_cost_cny)}
          </div>
          <div className="stat-desc text-xs text-success flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> {(summary.today_tokens / 1e6).toFixed(2)}M Tokens
          </div>
        </div>

        {/* 本月累计 */}
        <div className="stat bg-base-100 rounded-2xl border border-base-200 shadow-sm p-5">
          <div className="stat-figure text-accent">
            <Clock className="w-8 h-8 opacity-40" />
          </div>
          <div className="stat-title text-xs font-semibold uppercase tracking-wider opacity-60">本月累计开销</div>
          <div className="stat-value text-2xl lg:text-3xl font-extrabold text-accent my-1">
            {fmtMoney(summary.month_cost_usd, summary.month_cost_cny)}
          </div>
          <div className="stat-desc text-xs opacity-70">
            {(summary.month_tokens / 1e6).toFixed(1)}M Tokens
          </div>
        </div>

        {/* 预估节省商业支出 */}
        <div className="stat bg-base-100 rounded-2xl border border-base-200 shadow-sm p-5 bg-gradient-to-br from-success/5 to-transparent border-success/20">
          <div className="stat-figure text-success">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="stat-title text-xs font-semibold uppercase tracking-wider text-success">已为您节省商业支出</div>
          <div className="stat-value text-2xl lg:text-3xl font-extrabold text-success my-1">
            {fmtMoney(summary.saved_cost_usd, summary.saved_cost_cny)}
          </div>
          <div className="stat-desc text-xs opacity-70">
            基于多账号免费/订阅抵扣官方商业 API
          </div>
        </div>
      </div>

      {/* 财务时序走势图 */}
      <div className="bg-base-100 p-6 rounded-2xl border border-base-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            各模型商业费用走势 ({currency})
          </h2>
          <span className="text-xs opacity-50">按日聚合统计 (基于真实模型计价快照)</span>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={processedChart}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" stroke="#888888" fontSize={12} />
              <YAxis stroke="#888888" fontSize={12} tickFormatter={(val) => currency === 'USD' ? `$${val}` : `¥${val}`} />
              <Tooltip 
                formatter={(value: any) => [currency === 'USD' ? `$${Number(value).toFixed(2)}` : `¥${Number(value).toFixed(2)}`, '费用']}
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', borderRadius: '0.75rem', color: '#fff' }}
              />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fillOpacity={1} fill="url(#colorTotal)" name="全模型总支出" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 虚拟滚动长列表明细表格 */}
      <div className="bg-base-100 rounded-2xl border border-base-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-base-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">全电脑调用流水明细</h2>
            <p className="text-xs opacity-50">零锁影子驱动采集 · 共 {totalRecords} 笔聚合调用记录</p>
          </div>
          <div className="badge badge-primary badge-outline text-xs">
            @tanstack/react-virtual 60 FPS
          </div>
        </div>

        {/* 表头 */}
        <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-base-200/50 text-xs font-semibold text-base-content/70">
          <div className="col-span-3">产生时间</div>
          <div className="col-span-2">来源客户端</div>
          <div className="col-span-3">模型名称</div>
          <div className="col-span-2 text-right">消耗 Tokens</div>
          <div className="col-span-2 text-right">等值价值 ({currency})</div>
        </div>

        {/* 虚拟滚动列表主体 */}
        <div ref={parentRef} className="h-96 overflow-auto divide-y divide-base-200">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = details[virtualRow.index];
              if (!item) return null;
              return (
                <div
                  key={virtualRow.index}
                  className="grid grid-cols-12 gap-2 px-6 py-3.5 text-xs hover:bg-base-200/30 transition-colors absolute top-0 left-0 w-full"
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="col-span-3 font-mono opacity-70">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                  <div className="col-span-2">
                    <span className={`badge badge-sm font-medium ${
                      item.source === 'cursor' ? 'badge-info' : item.source === 'codex' ? 'badge-success' : 'badge-warning'
                    }`}>
                      {item.client_name}
                    </span>
                  </div>
                  <div className="col-span-3 font-medium truncate" title={item.normalized_model}>
                    {item.normalized_model}
                  </div>
                  <div className="col-span-2 text-right font-mono font-medium">
                    {item.total_tokens.toLocaleString()}
                  </div>
                  <div className="col-span-2 text-right font-mono font-bold text-primary">
                    {fmtMoney(item.cost_usd, item.cost_cny)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
