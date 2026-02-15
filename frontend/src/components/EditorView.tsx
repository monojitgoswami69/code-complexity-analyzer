import React, { useState, useEffect, useRef, useMemo } from 'react';
/* Removed @monaco-editor/react and monaco-editor imports */
import { ModernMonacoEditor } from './ModernMonacoEditor';

import { StoredFile } from '../services/storageService';
import { useTheme } from '../hooks/useTheme';
import { PRISM_LANGUAGE_MAP, VERSION } from '../constants';
import { detectLanguage } from '../utils/detectLanguage';
import { RateLimitInfo } from '../types';
import {
  FileCode, Plus, Upload, Trash2, Loader2, Zap, Code2, Eye,
  FolderOpen, Sun, Moon, ArrowLeft, Clock,
  AlertTriangle
} from 'lucide-react';
import {
  JavaScript,
  TypeScript,
  Python,
  CPlusPlus,
  C,
  Java,
  Go,
  RustDark,
  Ruby,
  PHP,
} from 'developer-icons';

// ─── Language Icons ─────────────────────────────────────────────────────

const langIconMap: Record<string, { icon: any }> = {
  JavaScript: { icon: JavaScript },
  TypeScript: { icon: TypeScript },
  Python: { icon: Python },
  'C++': { icon: CPlusPlus },
  C: { icon: C },
  Java: { icon: Java },
  Go: { icon: Go },
  Rust: { icon: RustDark },
  Ruby: { icon: Ruby },
  PHP: { icon: PHP },
};

function LanguageIcon({ language, size = 16, className = '', colorOverride }: { language: string; size?: number; className?: string; colorOverride?: string }) {
  const entry = langIconMap[language];
  if (!entry) return <FileCode size={size} className={className} />;
  const Icon = entry.icon;

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Icon size={size} color={colorOverride ? 'currentColor' : undefined} />
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────

interface EditorViewProps {
  files: StoredFile[];
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  onFileCreate: () => void;
  onFileDelete: (id: string) => void;
  onFileUpload: (file: File) => void;
  onCodeChange: (id: string, newCode: string) => void;
  onLanguageChange: (id: string, language: string) => void;
  onAnalyze: (code: string, forceReanalyze?: boolean) => void;
  onViewReport: () => void;
  onBack: () => void;
  onShowHistory: () => void;
  isAnalyzing: boolean;
  hasValidReport: boolean;
  rateLimit: RateLimitInfo | null;
}

// ─── Component ──────────────────────────────────────────────────────────

export const EditorView: React.FC<EditorViewProps> = ({
  files, activeFileId, onFileSelect, onFileCreate, onFileDelete, onFileUpload,
  onCodeChange, onLanguageChange, onAnalyze, onViewReport, onBack, onShowHistory,
  isAnalyzing, hasValidReport, rateLimit,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const activeFile = activeFileId ? files.find(f => f.id === activeFileId) : null;

  const [cursorPosition, setCursorPosition] = useState({ ln: 1, col: 1 });
  const [selectionCount, setSelectionCount] = useState(0);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('editor-font-size');
    return saved ? parseInt(saved, 10) : 16;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset cursor position when active file changes
  useEffect(() => {
    setCursorPosition({ ln: 1, col: 1 });
    setSelectionCount(0);
  }, [activeFileId]);

  // ─── Derived ──────────────────────────────────────────────────────────

  const detectedLanguage = useMemo(() => {
    if (!activeFile) return '';
    return detectLanguage(activeFile.name, activeFile.content);
  }, [activeFile?.name, activeFile?.content]);

  useEffect(() => {
    if (activeFile && !activeFile.language && detectedLanguage) {
      onLanguageChange(activeFile.id, detectedLanguage);
    }
  }, [detectedLanguage, activeFile, onLanguageChange]);

  useEffect(() => {
    localStorage.setItem('editor-font-size', fontSize.toString());
  }, [fontSize]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const bg = isDark ? 'bg-[#1E1E2A]' : 'bg-[#E5E8EE]';
  const bgEditor = isDark ? 'bg-[#232332]' : 'bg-[#EEF1F5]';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';

  return (
    <div className={`flex flex-col h-screen ${bg} text-slate-300 overflow-hidden`}>
      <header className={`h-11 flex items-center justify-between px-3 ${isDark ? 'bg-[#181821]' : 'bg-[#DBDFE7]'} z-20`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-1 rounded-md transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-white' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'}`}>
            <ArrowLeft size={18} />
          </button>
          <span className={`font-black tracking-tighter kode-font text-[24px] ${textPrimary}`}>
            CODALYZER<span className="text-blue-500 text-[12px] font-mono ml-2 opacity-70">// v{VERSION}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {activeFile && (
            <div className="flex items-center gap-3">
              {hasValidReport && (
                <button onClick={onViewReport} className="flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-bold tracking-tight transition-all bg-green-600 hover:bg-green-500 text-white jetbrains-font">
                  <Eye size={12} /> VIEW ANALYSIS
                </button>
              )}
              <button
                onClick={() => activeFile && onAnalyze(activeFile.content, hasValidReport)}
                disabled={isAnalyzing || activeFile.content.length >= 4096}
                className={`flex items-center gap-1.5 px-3 h-7 rounded-md text-[11px] font-bold tracking-tight transition-all jetbrains-font ${isAnalyzing || activeFile.content.length >= 4096 ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-[#CAA4F7] hover:bg-[#D4B5F9] text-[#1E1E2A]'}`}
              >
                {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                {isAnalyzing ? 'ANALYSING...' : hasValidReport ? 'ANALYSE AGAIN' : 'ANALYSE'}
              </button>
            </div>
          )}
          <button onClick={toggleTheme} className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'}`}>
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className={`w-64 flex flex-col ${bg}`}>
          <div className="px-2 pt-4 pb-2">
            <div className="flex gap-2">
              <button onClick={onFileCreate} className="flex-1 flex items-center justify-center gap-2 bg-[#CAA4F7] hover:bg-[#D4B5F9] text-[#1E1E2A] py-2 rounded text-xs font-medium transition-colors shadow-sm">
                <Plus size={14} /> New Snippet
              </button>
              <button onClick={() => fileInputRef.current?.click()} className={`flex items-center justify-center p-2 rounded border transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'}`}>
                <Upload size={14} />
              </button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".js,.ts,.jsx,.tsx,.py,.cpp,.c,.java,.go,.rs,.rb,.php" onChange={handleFileUpload} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
            {files.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full py-8 ${textMuted}`}>
                <FolderOpen size={28} className="mb-3 opacity-50" />
                <p className="text-xs text-center">No snippets yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {files.map(file => (
                  <div key={file.id} onClick={() => onFileSelect(file.id)} className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${file.id === activeFileId ? isDark ? 'bg-slate-800 text-blue-400 border border-slate-700/50' : 'bg-blue-50 text-blue-600 border border-blue-200' : isDark ? 'text-slate-400 hover:bg-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                    <div className="flex items-center gap-2 truncate">
                      <LanguageIcon language={file.language} size={14} />
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onFileDelete(file.id); }} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-3">
            <button onClick={onShowHistory} className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-xs transition-colors ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-300' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              <Clock size={12} /> Analysis History
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!activeFile ? (
            <div className={`flex-1 flex flex-col items-center justify-center ${bgEditor}`}>
              <div className="text-center max-w-md px-8">
                <FolderOpen size={48} className={`mx-auto mb-8 ${isDark ? 'text-blue-400/50' : 'text-blue-500/50'}`} />
                <h2 className={`text-xl font-semibold mb-2 ${textPrimary}`}>Welcome to Codalyzer</h2>
                <div className="flex gap-4 justify-center">
                  <button onClick={onFileCreate} className="flex items-center gap-2 px-6 py-3 bg-[#CAA4F7] hover:bg-[#D4B5F9] text-[#1E1E2A] rounded-lg text-sm font-medium transition-colors shadow-md">
                    <Plus size={18} /> New Snippet
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative overflow-hidden">
              <ModernMonacoEditor
                file={activeFile}
                theme={isDark ? 'dark' : 'light'}
                fontSize={fontSize}
                onChange={(code) => onCodeChange(activeFile.id, code)}
                onCursorChange={(ln, col) => setCursorPosition({ ln, col })}
                onSelectionChange={(count) => setSelectionCount(count)}
                onAnalyze={(code) => onAnalyze(code)}
                isAnalyzing={isAnalyzing}
              />
            </div>
          )}
        </div>
      </div>

      <div className={`h-8 flex items-center justify-between px-2 text-[12px] kode-font font-black ${isDark ? 'bg-[#181821] text-white/70' : 'bg-[#DBDFE7] text-slate-500/30'} relative`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 h-4">
            <FileCode size={14} />
            <span>{files.length} FILES</span>
          </div>
          {activeFile && (
            <div className="flex items-center animate-fade-in">
              <div className={`flex items-center gap-2 h-6 transition-colors ${isDark ? 'text-white/70' : 'text-slate-500/30'}`}>
                <LanguageIcon language={activeFile.language} size={14} colorOverride="text-current opacity-70" />
                <span>{activeFile.language ? activeFile.language.toUpperCase() : 'AUTO DETECTING...'}</span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeFile && (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 h-4">
                <Code2 size={14} />
                <span>LN {cursorPosition.ln}, COL {cursorPosition.col} {selectionCount > 0 && `(${selectionCount} selected)`}</span>
              </div>
            </div>
          )}
          {rateLimit && (
            <div className="flex items-center gap-2 h-4">
              <span>ATTEMPTS</span>
              <div className="flex items-center gap-2">
                <div className={`w-28 h-1 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-300'} overflow-hidden`}>
                  <div className={`h-full transition-all ${rateLimit.userRemaining <= 5 ? 'bg-red-500' : rateLimit.userRemaining <= 12 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${(rateLimit.userRemaining / rateLimit.userLimit) * 100}%` }} />
                </div>
                <span className={`${rateLimit.userRemaining <= 5 ? 'text-red-500' : rateLimit.userRemaining <= 12 ? 'text-yellow-500' : ''}`}>{rateLimit.userRemaining}/{rateLimit.userLimit}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};