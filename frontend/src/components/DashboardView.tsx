import React, { useMemo, useState } from 'react';
import { AnalysisResult, ComplexityRating, Issue } from '../types';
import { useTheme } from '../hooks/useTheme';
import { exportPDF } from '../utils/exportPdf';
import { createShare, ApiError } from '../services/apiService';
import {
  Share2, Download, AlertTriangle, CheckCircle, Cpu,
  AlertOctagon, ArrowUpRight, RefreshCw, Loader2,
  ArrowLeft, Sun, Moon, Copy, Check, Github,
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceDot,
} from 'recharts';
import { VERSION, PRISM_LANGUAGE_MAP } from '../constants';
import { Highlight, themes } from 'prism-react-renderer';

// ─── Props ──────────────────────────────────────────────────────────────

interface DashboardViewProps {
  result: AnalysisResult;
  onNewAnalysis: () => void;
  onReanalyze: () => void;
  isReanalyzing: boolean;
}

// ─── Complexity calculation ─────────────────────────────────────────────

function calculateOps(n: number, notation: string): number {
  const s = notation.toLowerCase().replace(/\s/g, '');
  if (s.includes('o(1)') || s === '1') return 1;
  if (s.includes('o(logn)') || s.includes('log(n)')) return Math.max(1, Math.log2(n));
  if (s.includes('o(n)') && !s.includes('log') && !s.includes('²') && !s.includes('^2')) return n;
  if (s.includes('nlogn') || s.includes('nlog(n)') || (s.includes('n') && s.includes('log'))) return n * Math.log2(n);
  if (s.includes('n²') || s.includes('n^2')) return n * n;
  if (s.includes('n³') || s.includes('n^3')) return n * n * n;
  if ((s.includes('2^n') && s.includes('*n')) || s.includes('n*2^n')) return Math.pow(2, n) * n;
  if (s.includes('2^n') || s.includes('exponential')) return Math.pow(2, n);
  if (s.includes('n!') || s.includes('factorial')) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return n;
}

function getChartRange(notation: string): number[] {
  const s = notation.toLowerCase().replace(/\s/g, '');
  if (s.includes('n!') || s.includes('factorial') || s.includes('2^n') || s.includes('exponential')) {
    return Array.from({ length: 13 }, (_, i) => i);
  }
  if (s.includes('n²') || s.includes('n^2') || s.includes('n³') || s.includes('n^3')) {
    return Array.from({ length: 11 }, (_, i) => i * 10);
  }
  return Array.from({ length: 11 }, (_, i) => i * 100);
}

// ─── Sub-components ─────────────────────────────────────────────────────

function MetricCard({ title, value, rating, description, icon, isDark, className = '' }: {
  title: string; value: string; rating: ComplexityRating; description: string;
  icon?: React.ReactNode; isDark: boolean; className?: string;
}) {
  const colors: Record<ComplexityRating, { text: string; bar: string; darkBg: string; lightBg: string }> = {
    [ComplexityRating.Good]: { text: 'text-blue-500', bar: 'bg-blue-500', darkBg: 'border-blue-800/30', lightBg: 'border-blue-200' },
    [ComplexityRating.Fair]: { text: 'text-yellow-400', bar: 'bg-yellow-400', darkBg: 'border-yellow-800/30', lightBg: 'border-yellow-200' },
    [ComplexityRating.Poor]: { text: 'text-rose-500', bar: 'bg-rose-500', darkBg: 'border-rose-800/30', lightBg: 'border-rose-200' },
  };
  const c = colors[rating];


  return (
    <div className={`rounded-xl p-4 border transition-colors flex flex-col ${isDark ? 'bg-[#111828] border-slate-700/50' : 'bg-white border-slate-200'} ${className}`}>
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{title}</span>
        {icon || (rating === ComplexityRating.Good
          ? <CheckCircle size={16} className="text-blue-500" />
          : <AlertTriangle size={16} className={c.text} />)}
      </div>
      <div className={`text-2xl md:text-3xl font-bold font-mono mb-1 ${c.text} tracking-tight`}>{value}</div>
      <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
    </div>
  );
}

function IssueCard({ issue, isDark, sourceCode, language }: { issue: Issue; isDark: boolean; sourceCode: string; language: string }) {
  const typeColors: Record<string, { dark: string; light: string; accent: string }> = {
    Optimization: { dark: 'border-blue-500/50 text-blue-400', light: 'border-blue-300 text-blue-600', accent: 'border-blue-500/30' },
    Bug: { dark: 'border-rose-500/50 text-rose-400', light: 'border-rose-300 text-rose-600', accent: 'border-rose-500/30' },
    Critical: { dark: 'border-red-500/50 text-red-400', light: 'border-red-300 text-red-600', accent: 'border-red-500/30' },
    Security: { dark: 'border-amber-500/50 text-amber-400', light: 'border-amber-300 text-amber-600', accent: 'border-amber-500/30' },
    Style: { dark: 'border-green-500/50 text-green-400', light: 'border-green-300 text-green-600', accent: 'border-green-500/30' },
  };
  const tc = typeColors[issue.type] || typeColors['Optimization'];

  // Try to find the snippet in the source code to get line numbers
  const allLines = sourceCode.split('\n');
  let startLine = -1;

  if (issue.codeSnippet) {
    const snippetLines = issue.codeSnippet.trim().split('\n');
    const firstSnippetLine = snippetLines[0].trim();

    // Find the first line that matches
    for (let i = 0; i < allLines.length; i++) {
      if (allLines[i].includes(firstSnippetLine)) {
        startLine = i + 1;
        break;
      }
    }
  }

  const hasLines = startLine !== -1;
  const displayStartLine = hasLines ? startLine : 1;
  const displayEndLine = hasLines ? startLine + issue.codeSnippet.split('\n').length - 1 : 1;

  // Extract lines with context if found, otherwise just show the snippet
  let contextStart = 0;

  if (startLine !== -1) {
    contextStart = Math.max(0, displayStartLine - 3);
  }

  const normalizedSnippet = useMemo(() => {
    if (!issue.codeSnippet) return '';
    const lines = issue.codeSnippet.split('\n');
    const minIndent = lines.reduce((min, line) => {
      if (line.trim().length === 0) return min;
      const match = line.match(/^\s*/);
      const count = match ? match[0].length : 0;
      return Math.min(min, count);
    }, Infinity);

    if (minIndent === Infinity || minIndent === 0) return issue.codeSnippet;
    return lines.map(line => line.slice(minIndent)).join('\n');
  }, [issue.codeSnippet]);

  const snippetValue = normalizedSnippet;
  const prismLang = PRISM_LANGUAGE_MAP[language] || 'javascript';

  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${isDark ? 'bg-[#111828] border-slate-700/50' : 'bg-white border-slate-200'}`}>
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-700/50">

        {/* Section 1: Content */}
        <div className="p-5 flex flex-col relative">
          <div className="flex items-center gap-2 mb-3">
            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${tc.dark}`}>
              {issue.type}
            </span>
            {hasLines && (
              <span className={`text-[10px] font-mono opacity-50 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                LINES {displayStartLine}-{displayEndLine}
              </span>
            )}
          </div>
          <h4 className={`text-base font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{issue.title}</h4>
          <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{issue.description}</p>
        </div>

        {/* Section 2: Detection */}
        <div className="flex flex-col relative">
          <div className="px-5 pt-4 pb-2">
            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-500/70 space-font">DETECTION</h5>
          </div>
          <div className="flex-1 overflow-hidden">
            <Highlight theme={isDark ? themes.vsDark : themes.vsLight} code={snippetValue} language={prismLang}>
              {({ className, tokens, getLineProps, getTokenProps }) => (
                <pre className={`${className} bg-transparent p-0 m-0 text-[13px] leading-6 font-mono`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {tokens.map((line, i) => {
                    const lineNo = hasLines ? contextStart + i + 1 : i + 1;
                    const isAffected = hasLines ? (lineNo >= displayStartLine && lineNo <= displayEndLine) : true;
                    return (
                      <div key={i} {...getLineProps({ line, key: i })} className={`grid grid-cols-[3rem_1fr] items-start ${isAffected ? (isDark ? 'bg-rose-500/10 border-l-2 border-rose-500/50' : 'bg-rose-50 border-l-2 border-rose-300') : 'border-l-2 border-transparent'}`}>
                        <span className={`text-right pr-4 select-none opacity-30 text-[11px] font-mono leading-6 ${isAffected ? 'text-rose-500 opacity-80' : ''}`}>{lineNo}</span>
                        <div className="font-mono leading-6 whitespace-pre-wrap break-words">
                          {line.map((token, key) => (
                            <span key={key} {...getTokenProps({ token, key })} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </pre>
              )}
            </Highlight>
          </div>
        </div>

        {/* Section 3: Suggested Fix */}
        <div className="flex flex-col relative">
          <div className="px-5 pt-4 pb-2">
            <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-500/70 space-font">SUGGESTED FIX</h5>
          </div>
          <div className="flex-1 overflow-hidden">
            <Highlight theme={isDark ? themes.vsDark : themes.vsLight} code={issue.fix || '// No suggested fix available'} language={prismLang}>
              {({ className, tokens, getLineProps, getTokenProps }) => (
                <pre className={`${className} bg-transparent p-0 m-0 text-[13px] leading-6 font-mono`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line, key: i })} className="grid grid-cols-[3rem_1fr] items-start border-l-2 border-transparent">
                      <span className="text-right pr-4 select-none opacity-30 text-[11px] font-mono leading-6">{i + 1}</span>
                      <div className="font-mono leading-6 whitespace-pre-wrap break-words">
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token, key })} />
                        ))}
                      </div>
                    </div>
                  ))}
                </pre>
              )}
            </Highlight>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────

export const DashboardView: React.FC<DashboardViewProps> = ({
  result, onNewAnalysis, onReanalyze, isReanalyzing,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Chart data ──────────────────────────────────────────────────────

  const timeChartData = useMemo(() => {
    const values = getChartRange(result.timeComplexity.worst.notation);
    return values.map(n => ({
      n,
      displayN: n,
      ops: Math.round(calculateOps(n, result.timeComplexity.worst.notation)),
      originalN: n,
    }));
  }, [result.timeComplexity.worst.notation]);

  const spaceChartData = useMemo(() => {
    const values = getChartRange(result.spaceComplexity.notation);
    return values.map(n => ({
      n,
      displayN: n,
      memory: Math.round(calculateOps(n, result.spaceComplexity.notation)),
      originalN: n,
    }));
  }, [result.spaceComplexity.notation]);

  const tooltipFormatter = ((value: any, name: any) => {
    const v = typeof value === 'number' ? value : 0;
    if (name === 'ops') return [v.toLocaleString(), 'Operations'];
    if (name === 'memory') return [v.toLocaleString(), 'Memory Units'];
    return [v, name];
  }) as any;

  const tooltipLabelFormatter = (_: any, payload: any) => {
    if (payload?.[0]) return `Input size (n): ${payload[0].payload.originalN}`;
    return '';
  };

  // ── Chart colors ────────────────────────────────────────────────────

  const chartGrid = isDark ? '#334155' : '#e2e8f0';
  const chartTick = isDark ? '#64748b' : '#94a3b8';
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';

  // ── Share handler ───────────────────────────────────────────────────

  const handleShare = async () => {
    setSharing(true);
    setShareError(null);
    try {
      const info = await createShare(result);
      const url = `${window.location.origin}?share=${info.shareId}`;
      setShareUrl(url);
    } catch (err) {
      setShareError(err instanceof ApiError ? err.message : 'Failed to create share link');
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ── Colors ──────────────────────────────────────────────────────────

  const bg = isDark ? 'bg-[#0b1120]' : 'bg-[#EEF1F5]';
  const cardBg = isDark ? 'bg-[#111828]' : 'bg-white';
  const border = isDark ? 'border-slate-800' : 'border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  const tickFormat = (val: number) => {
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(0)}k`;
    return val.toString();
  };

  return (
    <div className={`min-h-screen ${bg} ${isDark ? 'text-slate-200' : 'text-slate-800'} font-sans px-4 py-6`}>

      {/* Header */}
      <div className="flex flex-col mb-6 overflow-hidden">
        {/* Row 1: Branding */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onNewAnalysis}
              className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}`}
            >
              <ArrowLeft size={18} />
            </button>
            <span className={`font-black tracking-tighter kode-font text-[32px] ${textPrimary}`}>
              CODALYZER<span className="text-blue-500 text-[16px] font-mono ml-2.5 opacity-70">// v{VERSION}</span>
            </span>
          </div>
          <button onClick={toggleTheme} className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'}`} aria-label="Toggle theme">
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Row 2: Title & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <h1 className={`text-3xl md:text-4xl font-bold space-font ${textPrimary}`}>
            Report:<span className="text-blue-500 ml-3 break-all">{result.fileName}</span>
          </h1>

          <div className="flex gap-3 flex-wrap items-center">
            {shareUrl ? (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <input
                  readOnly
                  value={shareUrl}
                  className={`bg-transparent text-xs font-mono w-48 outline-none ${textMuted}`}
                />
                <button onClick={handleCopy} className="text-blue-500 hover:text-blue-400 transition-colors">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <button
                onClick={handleShare}
                disabled={sharing}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-bold transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 hover:border-slate-600' : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'}`}
              >
                {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                SHARE REPORT
              </button>
            )}
            {shareError && <span className="text-xs text-red-400 self-center">{shareError}</span>}
            <button
              onClick={() => exportPDF(result)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <Download size={16} /> EXPORT PDF
            </button>
          </div>
        </div>

        {/* Row 3: Metadata */}
        <div className={`text-sm mt-1.5 space-font ${textMuted} opacity-80 uppercase`}>
          <span>GENERATED ON {result.timestamp.toUpperCase()}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6">
        <h3 className={`text-base font-black uppercase tracking-[0.2em] mb-2 kode-font ${textMuted}`}>SUMMARY</h3>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{result.summary}</p>
      </div>

      {/* Complexities Grouped */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6 relative items-stretch">
        {/* Time Complexities Column */}
        <div className="lg:col-span-3 relative flex flex-col">
          <h3 className={`text-base font-black uppercase tracking-[0.2em] mb-2 kode-font ${textMuted}`}>
            TIME COMPLEXITIES
          </h3>
          <div className={`rounded-xl border border-slate-700/50 transition-colors overflow-hidden flex-1 flex flex-col ${isDark ? 'bg-[#111828]' : 'bg-white border-slate-200'}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 flex-1">
              {/* Best Case Segment */}
              <div className="p-4 flex flex-col flex-1 relative">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Best Case</span>
                  <CheckCircle size={16} className="text-blue-500" />
                </div>
                <div className={`text-2xl md:text-3xl font-bold font-mono mb-1 tracking-tight ${result.timeComplexity.best.rating === ComplexityRating.Good ? 'text-blue-500' : 'text-yellow-400'
                  }`}>{result.timeComplexity.best.notation}</div>
                <p className={`text-sm leading-relaxed flex-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{result.timeComplexity.best.description}</p>
                {/* Vertical Separator */}
                <div className={`hidden md:block absolute right-0 top-[5%] bottom-[5%] w-0 border-r ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`} />
              </div>

              {/* Average Case Segment */}
              <div className="p-4 flex flex-col flex-1 relative">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Average Case</span>
                  <ArrowUpRight size={16} className="text-blue-500" />
                </div>
                <div className={`text-2xl md:text-3xl font-bold font-mono mb-1 tracking-tight ${result.timeComplexity.average.rating === ComplexityRating.Good ? 'text-blue-500' : 'text-yellow-400'
                  }`}>{result.timeComplexity.average.notation}</div>
                <p className={`text-sm leading-relaxed flex-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{result.timeComplexity.average.description}</p>
                {/* Vertical Separator */}
                <div className={`hidden md:block absolute right-0 top-[5%] bottom-[5%] w-0 border-r ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`} />
              </div>

              {/* Worst Case Segment */}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Worst Case</span>
                  <AlertOctagon size={16} className="text-rose-500" />
                </div>
                <div className={`text-2xl md:text-3xl font-bold font-mono mb-1 tracking-tight ${result.timeComplexity.worst.rating === ComplexityRating.Good ? 'text-blue-500' :
                  result.timeComplexity.worst.rating === ComplexityRating.Fair ? 'text-yellow-400' : 'text-rose-500'
                  }`}>{result.timeComplexity.worst.notation}</div>
                <p className={`text-sm leading-relaxed flex-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{result.timeComplexity.worst.description}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Space Complexity Column */}
        <div className="lg:col-span-1 flex flex-col">
          <h3 className={`text-base font-black uppercase tracking-[0.2em] mb-2 kode-font ${textMuted}`}>
            SPACE COMPLEXITY
          </h3>
          <MetricCard
            title="Worst Case" value={result.spaceComplexity.notation}
            rating={result.spaceComplexity.rating} description={result.spaceComplexity.description}
            icon={<Cpu size={14} className="text-cyan-400" />} isDark={isDark}
            className="flex-1"
          />
        </div>
      </div>

      {/* Charts Unified Card */}
      <h3 className={`text-base font-black uppercase tracking-[0.2em] mb-2 kode-font ${textMuted}`}>
        VISUALIZATIONS
      </h3>
      <div className={`rounded-xl border mb-8 overflow-hidden ${isDark ? 'bg-[#111828] border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className={`grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 ${isDark ? 'divide-slate-700/50' : 'divide-slate-200'}`}>
          {/* Time Complexity Chart Segment */}
          <div className="p-4 relative">
            <div className="flex justify-between items-start mb-6">
              <h3 className={`text-lg font-bold space-font ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Time Complexity</h3>
              <span className={`px-3 py-1 rounded-lg text-sm font-mono font-bold border ${isDark ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                {result.timeComplexity.worst.notation}
              </span>
            </div>
            {/* Vertical Separator */}
            <div className={`hidden lg:block absolute right-0 top-[5%] bottom-[5%] w-0 border-r ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`} />
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <defs>
                    <linearGradient id="colorOps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} opacity={0.4} />
                  <XAxis dataKey="displayN" stroke={chartTick} tick={{ fontSize: 12, fill: chartTick }} tickLine={false} axisLine={false}
                    label={{ value: 'Input Size (n)', position: 'insideBottom', offset: -15, fontSize: 13, fill: chartTick }}
                    tickFormatter={(val) => val === 0 ? '' : tickFormat(val)}
                  />
                  <YAxis dataKey="ops" stroke={chartTick} tick={{ fontSize: 12, fill: chartTick }} tickLine={false} axisLine={false} width={60} allowDecimals={false}
                    label={{ value: 'Operations', angle: -90, position: 'insideLeft', fontSize: 13, fill: chartTick }}
                    tickFormatter={(val) => val === 0 ? '' : tickFormat(val)}
                  />
                  <ReferenceDot x={0} y={0} r={0} label={{ value: '0', position: 'insideBottomLeft', offset: -15, fill: chartTick, fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px' }}
                    itemStyle={{ color: '#93c5fd', fontSize: '12px', fontFamily: 'monospace' }}
                    labelStyle={{ color: chartTick, fontSize: '11px', marginBottom: '4px' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={tooltipFormatter}
                  />

                  <Area type="monotone" dataKey="ops" name="Operations" stroke="#3b82f6" strokeWidth={2.5} fill="url(#colorOps)"
                    dot={{ fill: isDark ? '#0b1120' : '#fff', stroke: '#3b82f6', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Space Complexity Chart Segment */}
          <div className="p-4">
            <div className="flex justify-between items-start mb-6">
              <h3 className={`text-lg font-bold space-font ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Space Complexity</h3>
              <span className={`px-3 py-1 rounded-lg text-sm font-mono font-bold border ${isDark ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-cyan-50 text-cyan-600 border-cyan-200'}`}>
                {result.spaceComplexity.notation}
              </span>
            </div>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spaceChartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                  <defs>
                    <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} opacity={0.4} />
                  <XAxis dataKey="displayN" stroke={chartTick} tick={{ fontSize: 12, fill: chartTick }} tickLine={false} axisLine={false}
                    label={{ value: 'Input Size (n)', position: 'insideBottom', offset: -15, fontSize: 13, fill: chartTick }}
                    tickFormatter={(val) => val === 0 ? '' : tickFormat(val)}
                  />
                  <YAxis dataKey="memory" stroke={chartTick} tick={{ fontSize: 12, fill: chartTick }} tickLine={false} axisLine={false} width={60} allowDecimals={false}
                    label={{ value: 'Memory', angle: -90, position: 'insideLeft', fontSize: 13, fill: chartTick }}
                    tickFormatter={(val) => val === 0 ? '' : tickFormat(val)}
                  />
                  <ReferenceDot x={0} y={0} r={0} label={{ value: '0', position: 'insideBottomLeft', offset: -15, fill: chartTick, fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, borderRadius: '8px' }}
                    itemStyle={{ color: '#67e8f9', fontSize: '12px', fontFamily: 'monospace' }}
                    labelStyle={{ color: chartTick, fontSize: '11px', marginBottom: '4px' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={tooltipFormatter}
                  />

                  <Area type="monotone" dataKey="memory" name="Memory" stroke="#22d3ee" strokeWidth={2.5} fill="url(#colorMemory)"
                    dot={{ fill: isDark ? '#0b1120' : '#fff', stroke: '#22d3ee', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#67e8f9', stroke: '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Issues */}
      <h3 className={`text-base font-black uppercase tracking-[0.2em] mb-2 kode-font ${textMuted}`}>
        ISSUES & SUGGESTIONS
        {result.issues.length > 0 && (
          <span className="ml-2 opacity-50 font-normal">({result.issues.length})</span>
        )}
      </h3>

      <div className="grid grid-cols-1 gap-4 mb-6">
        {result.issues.length > 0 ? (
          result.issues.map(issue => <IssueCard key={issue.id} issue={issue} isDark={isDark} sourceCode={result.sourceCode} language={result.language} />)
        ) : (
          <div className={`${cardBg} border ${border} rounded-xl p-8 flex flex-col items-center justify-center h-32 ${textMuted}`}>
            <CheckCircle size={28} className="mb-2 text-green-500/50" />
            <p className="text-sm">No significant issues detected</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={onNewAnalysis}
          className={`flex-1 py-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all ${isDark ? 'border-slate-700 bg-slate-800/50 text-blue-400 hover:bg-slate-800' : 'border-slate-200 bg-white text-blue-600 hover:bg-slate-50'}`}
        >
          Back to Editor
        </button>
        <button
          onClick={onReanalyze}
          disabled={isReanalyzing}
          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isReanalyzing
            ? isDark ? 'border border-slate-700 bg-slate-800/50 text-slate-500 cursor-not-allowed' : 'border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
            : isDark ? 'border border-amber-600/50 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40' : 'border border-amber-300 bg-white text-amber-600 hover:bg-amber-50'
            }`}
        >
          {isReanalyzing ? (
            <><Loader2 size={14} className="animate-spin" /> Reanalyzing...</>
          ) : (
            <><RefreshCw size={14} /> Reanalyze</>
          )}
        </button>
      </div>

      {/* AI Disclaimer */}
      <div className={`mt-6 rounded-xl p-4 border ${isDark ? 'bg-amber-900/20 border-amber-700/50' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className={isDark ? 'text-amber-500' : 'text-amber-600'} />
          <div>
            <h4 className={`text-sm font-bold mb-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>AI-Generated Analysis</h4>
            <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-200/80' : 'text-amber-700/80'}`}>
              This analysis was generated by an AI model and may contain inaccuracies.
              The complexity estimations are based on static code analysis and heuristics,
              which may not accurately reflect actual runtime performance. Always review
              and verify the results manually.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 pb-6 text-center">
        <div className={`h-[1px] w-full max-w-6xl mx-auto mb-8 ${isDark ? 'bg-gradient-to-r from-transparent via-white/10 to-transparent' : 'bg-gradient-to-r from-transparent via-slate-200 to-transparent'}`} />
        <div className={`flex items-center justify-center gap-3 kode-font text-[12px] font-black uppercase tracking-[0.3em] ${isDark ? 'text-white/60' : 'text-slate-800'}`}>
          <span>© 2026 MONOJIT GOSWAMI</span>
          <span className="opacity-40">•</span>
          <a
            href="https://github.com/monojitgoswami69/code-complexity-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-blue-500 transition-colors"
          >
            <Github size={14} />
            <span>CODALYZER</span>
          </a>
        </div>
      </footer>
    </div>
  );
};
