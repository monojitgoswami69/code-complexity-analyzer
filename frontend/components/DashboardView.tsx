import React, { useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { AnalysisResult, ComplexityRating, Issue } from '../types';
import { 
  Share2, Download, AlertTriangle, CheckCircle, Info, Cpu, 
  AlertOctagon, Layers, ArrowUpRight
} from 'lucide-react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend
} from 'recharts';

interface DashboardViewProps {
  result: AnalysisResult;
  onNewAnalysis: () => void;
}

const MetricCard: React.FC<{
  title: string;
  value: string;
  rating: ComplexityRating;
  icon?: React.ReactNode;
}> = ({ title, value, rating, icon }) => {
  let colorClass = "text-slate-400";
  let barColor = "bg-slate-600";
  let glowClass = "";

  switch (rating) {
    case ComplexityRating.Excellent:
      colorClass = "text-cyan-400";
      barColor = "bg-cyan-400";
      glowClass = "shadow-[0_0_15px_rgba(34,211,238,0.2)]";
      break;
    case ComplexityRating.Good:
      colorClass = "text-blue-500";
      barColor = "bg-blue-500";
      glowClass = "shadow-[0_0_15px_rgba(59,130,246,0.2)]";
      break;
    case ComplexityRating.Fair:
      colorClass = "text-yellow-400";
      barColor = "bg-yellow-400";
      glowClass = "shadow-[0_0_15px_rgba(250,204,21,0.2)]";
      break;
    case ComplexityRating.Poor:
      colorClass = "text-rose-500";
      barColor = "bg-rose-500";
      glowClass = "shadow-[0_0_15px_rgba(244,63,94,0.2)]";
      break;
    case ComplexityRating.Critical:
      colorClass = "text-red-600";
      barColor = "bg-red-600";
      glowClass = "shadow-[0_0_15px_rgba(220,38,38,0.3)]";
      break;
  }

  return (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-xl p-5 relative overflow-hidden group hover:border-slate-600 transition-all ${glowClass}`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        {icon || (rating === ComplexityRating.Excellent ? <CheckCircle size={16} className="text-cyan-400" /> : <AlertTriangle size={16} className={colorClass} />)}
      </div>
      <div className={`text-2xl md:text-4xl font-bold font-mono mb-6 ${colorClass} tracking-tight`}>{value}</div>
      
      {/* Visual Bar */}
      <div className="w-full h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: rating === 'Excellent' ? '20%' : rating === 'Good' ? '40%' : rating === 'Fair' ? '60%' : '100%' }}></div>
      </div>
      
      {/* Decorative background glow */}
      <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full blur-3xl opacity-10 ${barColor}`}></div>
    </div>
  );
};

const IssueCard: React.FC<{ issue: Issue }> = ({ issue }) => {
  const getColors = (type: string) => {
    switch(type) {
      case 'High Impact': return 'border-rose-500/50 bg-rose-500/10 text-rose-400';
      case 'Optimization': return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
      case 'Memory': return 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400';
      default: return 'border-green-500/50 bg-green-500/10 text-green-400';
    }
  };

  const style = getColors(issue.type);

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 mb-3 hover:bg-slate-800/60 transition-colors">
      <div className="flex justify-between items-start mb-2">
         <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${style} bg-opacity-10`}>
           {issue.type}
         </span>
         <span className="text-xs text-slate-500 font-mono">Line {issue.line}</span>
      </div>
      <h4 className="text-slate-200 font-medium mb-1">{issue.title}</h4>
      <p className="text-slate-400 text-xs leading-relaxed">{issue.description}</p>
      
      {issue.snippet && (
        <div className="mt-3 bg-slate-900 rounded p-2 border border-slate-700/50">
          <code className="text-xs font-mono text-slate-300 block overflow-x-auto whitespace-pre">
            {issue.snippet}
          </code>
        </div>
      )}
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({ result, onNewAnalysis }) => {
  // Function to calculate operations based on complexity notation
  const calculateOps = (n: number, notation: string): number => {
    const notationLower = notation.toLowerCase().replace(/\s/g, '');
    
    // Parse the complexity notation and calculate ops
    if (notationLower.includes('o(1)') || notationLower === '1') {
      return 1;
    }
    if (notationLower.includes('o(logn)') || notationLower.includes('log(n)') || notationLower === 'logn') {
      return Math.max(1, Math.log2(n));
    }
    if (notationLower.includes('o(n)') && !notationLower.includes('logn') && !notationLower.includes('log') && !notationLower.includes('²') && !notationLower.includes('^2')) {
      return n;
    }
    if (notationLower.includes('o(nlogn)') || notationLower.includes('nlog(n)') || notationLower.includes('n*logn') || (notationLower.includes('n') && notationLower.includes('log'))) {
      return n * Math.log2(n);
    }
    if (notationLower.includes('o(n²)') || notationLower.includes('o(n^2)') || notationLower.includes('n²') || notationLower.includes('n^2')) {
      return n * n;
    }
    if (notationLower.includes('o(n³)') || notationLower.includes('o(n^3)') || notationLower.includes('n³') || notationLower.includes('n^3')) {
      return n * n * n;
    }
    if (notationLower.includes('o(2^n)') || notationLower.includes('2^n') || notationLower.includes('exponential')) {
      return Math.pow(2, Math.min(n, 30)); // Cap to prevent overflow
    }
    if (notationLower.includes('o(n!)') || notationLower.includes('factorial')) {
      // Factorial grows too fast, use approximation capped
      let result = 1;
      for (let i = 2; i <= Math.min(n, 12); i++) result *= i;
      return result;
    }
    // Default to O(n) if unknown
    return n;
  };

  // Generate 2x progression with 10 data points: 50, 100, 200, 400...
  const timeChartData = useMemo(() => {
    const baseValues = Array.from({ length: 10 }, (_, i) => 50 * Math.pow(2, i));
    // 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800, 25600
    
    const worstCaseNotation = result.timeComplexity.worst.notation;
    
    return baseValues.map((n) => {
      const ops = Math.round(calculateOps(n, worstCaseNotation));
      return {
        n: n,
        displayN: n,
        ops: ops,
        originalN: n
      };
    });
  }, [result.timeComplexity.worst.notation]);

  // Generate space complexity chart data
  const spaceChartData = useMemo(() => {
    const baseValues = Array.from({ length: 10 }, (_, i) => 50 * Math.pow(2, i));
    
    const spaceNotation = result.spaceComplexity.notation;
    
    return baseValues.map((n) => {
      const memory = Math.round(calculateOps(n, spaceNotation));
      return {
        n: n,
        displayN: n,
        memory: memory,
        originalN: n
      };
    });
  }, [result.spaceComplexity.notation]);

  // Custom tooltip formatter
  const tooltipFormatter = (value: number, name: string, props: any) => {
    if (name === 'ops') {
      return [value.toLocaleString(), 'Operations'];
    }
    if (name === 'memory') {
      return [value.toLocaleString(), 'Memory Units'];
    }
    return [value, name];
  };

  const tooltipLabelFormatter = (label: any, payload: any) => {
    if (payload && payload[0]) {
      return `Input size (n): ${payload[0].payload.originalN}`;
    }
    return `Input size: ${label}`;
  };

  // PDF Export function
  const handleExportPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - 2 * margin;
    let yPos = 20;

    // Helper to add text with word wrap
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5) => {
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y);
      return y + (lines.length * lineHeight);
    };

    // Header - Website name
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 130, 246); // Blue
    doc.text('Complexity Analyzer', margin, yPos);
    yPos += 8;

    // Generation date/time
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // Slate
    const fullTimestamp = new Date().toLocaleString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    doc.text(`Generated: ${fullTimestamp}`, margin, yPos);
    yPos += 10;

    // Horizontal line
    doc.setDrawColor(51, 65, 85);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // File info
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Analysis Report: ${result.fileName}`, margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Language: ${result.language}`, margin, yPos);
    yPos += 12;

    // Complexity Metrics
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Complexity Analysis', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    
    const metrics = [
      ['Time Complexity (Best Case)', result.timeComplexity.best.notation, result.timeComplexity.best.rating],
      ['Time Complexity (Average)', result.timeComplexity.average.notation, result.timeComplexity.average.rating],
      ['Time Complexity (Worst Case)', result.timeComplexity.worst.notation, result.timeComplexity.worst.rating],
      ['Space Complexity', result.spaceComplexity.notation, result.spaceComplexity.rating],
    ];

    metrics.forEach(([label, value, rating]) => {
      doc.text(`${label}: ${value} (${rating})`, margin, yPos);
      yPos += 6;
    });
    yPos += 6;

    // Issues
    if (result.issues.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text('Issues Detected', margin, yPos);
      yPos += 8;

      doc.setFontSize(9);
      result.issues.forEach((issue, i) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        doc.text(`${i + 1}. [${issue.type}] ${issue.title} (Line ${issue.line})`, margin, yPos);
        yPos += 5;
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        yPos = addWrappedText(issue.description, margin + 5, yPos, contentWidth - 5, 4);
        yPos += 4;
      });
      yPos += 4;
    }

    // Summary
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Summary', margin, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    yPos = addWrappedText(result.summary, margin, yPos, contentWidth);
    yPos += 10;

    // Source Code Section
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Source Code', margin, yPos);
    yPos += 8;

    // Code block background
    doc.setFillColor(241, 245, 249);
    const codeLines = result.sourceCode.split('\n');
    const codeHeight = Math.min(codeLines.length * 4 + 10, 100);
    
    // Check if we need a new page
    if (yPos + codeHeight > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      yPos = 20;
    }

    doc.roundedRect(margin, yPos, contentWidth, codeHeight, 2, 2, 'F');
    
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');
    doc.setTextColor(51, 65, 85);
    
    let codeY = yPos + 5;
    const maxCodeLines = 20;
    codeLines.slice(0, maxCodeLines).forEach((line) => {
      const truncatedLine = line.length > 80 ? line.substring(0, 77) + '...' : line;
      doc.text(truncatedLine, margin + 3, codeY);
      codeY += 4;
    });
    
    if (codeLines.length > maxCodeLines) {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(`... and ${codeLines.length - maxCodeLines} more lines`, margin + 3, codeY);
    }
    
    yPos += codeHeight + 15;

    // Check if we need a new page for disclaimer
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      yPos = 20;
    }

    // Disclaimer
    doc.setDrawColor(251, 191, 36); // Yellow warning color
    doc.setFillColor(254, 252, 232);
    doc.roundedRect(margin, yPos, contentWidth, 20, 2, 2, 'FD');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text('⚠ Important Disclaimer', margin + 5, yPos + 6);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 63, 18);
    const disclaimer = 'This analysis was generated by AI and may contain inaccuracies. Always review and verify the results manually. The complexity estimations are based on static code analysis and may not reflect actual runtime performance.';
    addWrappedText(disclaimer, margin + 5, yPos + 11, contentWidth - 10, 3);

    // Save the PDF
    doc.save(`complexity-analysis-${result.fileName.replace(/\.[^/.]+$/, '')}.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 font-sans p-6 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300 uppercase">{result.language}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-700 text-[10px] font-mono text-slate-300 uppercase">V 2.4.1</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight flex flex-wrap items-center gap-2">
            Analysis Results: <span className="text-blue-500 break-all">{result.fileName}</span>
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-2 font-mono">
            <Layers size={12}/>
            <span>Generated on {result.timestamp}</span>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm font-medium transition-colors">
            <Share2 size={16} /> Share
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
          >
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Metrics Grid - All on same line */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard 
          title="Best Case (Time)" 
          value={result.timeComplexity.best.notation} 
          rating={result.timeComplexity.best.rating}
          icon={<CheckCircle size={16} className="text-slate-500" />}
        />
        <MetricCard 
          title="Average Case (Time)" 
          value={result.timeComplexity.average.notation} 
          rating={result.timeComplexity.average.rating}
          icon={<ArrowUpRight size={16} className="text-slate-500" />}
        />
        <MetricCard 
          title="Worst Case (Time)" 
          value={result.timeComplexity.worst.notation} 
          rating={result.timeComplexity.worst.rating}
          icon={<AlertOctagon size={16} className="text-slate-500" />}
        />
        <MetricCard 
          title="Space Complexity" 
          value={result.spaceComplexity.notation} 
          rating={result.spaceComplexity.rating}
          icon={<Cpu size={16} className="text-slate-500" />}
        />
      </div>

      {/* Charts Grid - Two graphs side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* Time Complexity Chart */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-lg font-bold text-white">Time Complexity</h3>
            <span className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-sm font-mono font-bold border border-blue-500/30">
              {result.timeComplexity.worst.notation}
            </span>
          </div>

          <div className="h-[300px] w-full relative z-10">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={timeChartData}>
                 <defs>
                   <linearGradient id="colorOps" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                     <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                 <XAxis 
                   dataKey="displayN" 
                   stroke="#64748b" 
                   tick={{fontSize: 10, fill: '#64748b'}} 
                   tickLine={false}
                   axisLine={false}
                   label={{ value: 'Input Size (n)', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#64748b' }}
                   tickFormatter={(val) => {
                     if (val >= 1000) return `${(val/1000).toFixed(1)}k`;
                     return val;
                   }}
                 />
                 <YAxis 
                   dataKey="ops"
                   stroke="#64748b" 
                   tick={{fontSize: 10, fill: '#64748b'}} 
                   tickLine={false}
                   axisLine={false}
                   width={60}
                   label={{ value: 'Operations', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                   tickFormatter={(val) => {
                     if (val >= 1000000) return `${(val/1000000).toFixed(1)}M`;
                     if (val >= 1000) return `${(val/1000).toFixed(0)}k`;
                     return val;
                   }}
                 />
                 <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#93c5fd', fontSize: '12px', fontFamily: 'monospace' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={tooltipFormatter}
                 />
                 <Legend 
                   verticalAlign="top" 
                   align="right"
                   wrapperStyle={{ paddingBottom: '10px' }}
                   formatter={() => 'Operations'}
                 />
                 <Area 
                    type="monotone" 
                    dataKey="ops" 
                    name="Operations"
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    fill="url(#colorOps)" 
                    dot={{ fill: '#0b1120', stroke: '#3b82f6', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                 />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Space Complexity Chart */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <h3 className="text-lg font-bold text-white">Space Complexity</h3>
            <span className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-mono font-bold border border-cyan-500/30">
              {result.spaceComplexity.notation}
            </span>
          </div>

          <div className="h-[300px] w-full relative z-10">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={spaceChartData}>
                 <defs>
                   <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4}/>
                     <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                 <XAxis 
                   dataKey="displayN" 
                   stroke="#64748b" 
                   tick={{fontSize: 10, fill: '#64748b'}} 
                   tickLine={false}
                   axisLine={false}
                   label={{ value: 'Input Size (n)', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#64748b' }}
                   tickFormatter={(val) => {
                     if (val >= 1000) return `${(val/1000).toFixed(1)}k`;
                     return val;
                   }}
                 />
                 <YAxis 
                   dataKey="memory"
                   stroke="#64748b" 
                   tick={{fontSize: 10, fill: '#64748b'}} 
                   tickLine={false}
                   axisLine={false}
                   width={60}
                   label={{ value: 'Memory', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }}
                   tickFormatter={(val) => {
                     if (val >= 1000000) return `${(val/1000000).toFixed(1)}M`;
                     if (val >= 1000) return `${(val/1000).toFixed(0)}k`;
                     return val;
                   }}
                 />
                 <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#67e8f9', fontSize: '12px', fontFamily: 'monospace' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}
                    labelFormatter={tooltipLabelFormatter}
                    formatter={tooltipFormatter}
                 />
                 <Legend 
                   verticalAlign="top" 
                   align="right"
                   wrapperStyle={{ paddingBottom: '10px' }}
                   formatter={() => 'Memory Units'}
                 />
                 <Area 
                    type="monotone" 
                    dataKey="memory" 
                    name="Memory"
                    stroke="#22d3ee" 
                    strokeWidth={3} 
                    fill="url(#colorMemory)" 
                    dot={{ fill: '#0b1120', stroke: '#22d3ee', strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, fill: '#67e8f9', stroke: '#fff', strokeWidth: 2 }}
                 />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
           <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-white">Detailed Breakdown</h3>
             <Info size={16} className="text-slate-600 hover:text-slate-400 cursor-pointer" />
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.issues.length > 0 ? (
                result.issues.map(issue => <IssueCard key={issue.id} issue={issue} />)
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center h-40 text-slate-500">
                  <CheckCircle size={32} className="mb-2 text-green-500/50" />
                  <p className="text-sm">No significant issues detected.</p>
                </div>
              )}
           </div>

           <div className="mt-6 pt-4 border-t border-slate-800">
             <button 
              onClick={onNewAnalysis}
              className="w-full py-3 rounded-lg border border-slate-700 bg-slate-800/50 text-xs font-bold text-blue-400 hover:bg-slate-800 hover:text-blue-300 transition-all uppercase tracking-wider"
             >
               View Full Source Code
             </button>
           </div>
        </div>
      </div>

      {/* AI Disclaimer */}
      <div className="mt-6 bg-amber-900/20 border border-amber-700/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-400 mb-1">AI-Generated Analysis</h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              This analysis was generated by an AI model and may contain inaccuracies. 
              The complexity estimations are based on static code analysis and heuristics, 
              which may not accurately reflect actual runtime performance. Always review 
              and verify the results manually before making critical decisions based on this analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
