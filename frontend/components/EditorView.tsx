import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { FileNode, StoredFileNode } from '../types';
import { StoredFile } from '../services/storageService';
import { 
  FileCode, Plus, Upload, Trash2, Box, Loader2, Zap, ChevronDown,
  FileJson, FileType, Braces, Hash, Coffee, Gem, Code2, Terminal, Eye, FolderOpen, Layout
} from 'lucide-react';

// Get language-specific icon
const getLanguageIcon = (language: string, size: number = 20, className: string = '') => {
  const iconProps = { size, className };
  switch (language) {
    case 'JavaScript':
      return <FileJson {...iconProps} className={`${className} text-yellow-400`} />;
    case 'TypeScript':
      return <FileType {...iconProps} className={`${className} text-blue-400`} />;
    case 'Python':
      return <Terminal {...iconProps} className={`${className} text-green-400`} />;
    case 'C++':
    case 'C':
      return <Hash {...iconProps} className={`${className} text-blue-300`} />;
    case 'Java':
      return <Coffee {...iconProps} className={`${className} text-orange-400`} />;
    case 'Go':
      return <Braces {...iconProps} className={`${className} text-cyan-400`} />;
    case 'Rust':
      return <Code2 {...iconProps} className={`${className} text-orange-500`} />;
    case 'Ruby':
      return <Gem {...iconProps} className={`${className} text-red-400`} />;
    case 'PHP':
      return <FileCode {...iconProps} className={`${className} text-purple-400`} />;
    default:
      return <FileCode {...iconProps} className={`${className} text-yellow-400`} />;
  }
};

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
  isAnalyzing: boolean;
  hasValidReport: boolean;
}

// Supported languages with their Prism identifiers
const SUPPORTED_LANGUAGES = [
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'Python', value: 'python' },
  { label: 'C++', value: 'cpp' },
  { label: 'C', value: 'c' },
  { label: 'Java', value: 'java' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'PHP', value: 'php' },
];

// Map display language to Prism language
const getPrismLanguage = (language: string): string => {
  const langMap: Record<string, string> = {
    'JavaScript': 'javascript',
    'TypeScript': 'typescript',
    'Python': 'python',
    'C++': 'cpp',
    'C': 'c',
    'Java': 'java',
    'Go': 'go',
    'Rust': 'rust',
    'Ruby': 'ruby',
    'PHP': 'php',
  };
  return langMap[language] || 'javascript';
};

// Detect language from file extension or content
const detectLanguage = (fileName: string, content: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // Extension-based detection
  const extMap: Record<string, string> = {
    'js': 'JavaScript',
    'jsx': 'JavaScript',
    'ts': 'TypeScript',
    'tsx': 'TypeScript',
    'py': 'Python',
    'cpp': 'C++',
    'cc': 'C++',
    'cxx': 'C++',
    'c': 'C',
    'h': 'C',
    'java': 'Java',
    'go': 'Go',
    'rs': 'Rust',
    'rb': 'Ruby',
    'php': 'PHP',
  };
  
  if (ext && extMap[ext]) return extMap[ext];
  
  // Content-based detection for new files
  if (content.includes('def ') || content.includes('import numpy') || content.includes('print(')) return 'Python';
  if (content.includes('#include') || content.includes('std::')) return 'C++';
  if (content.includes('public class') || content.includes('System.out')) return 'Java';
  if (content.includes('func ') && content.includes('package ')) return 'Go';
  if (content.includes('fn ') && content.includes('let mut')) return 'Rust';
  
  return 'JavaScript';
};

export const EditorView: React.FC<EditorViewProps> = ({ 
  files, activeFileId, onFileSelect, onFileCreate, onFileDelete, onFileUpload, 
  onCodeChange, onLanguageChange, onAnalyze, onViewReport, isAnalyzing, hasValidReport 
}) => {
  const activeFile = activeFileId ? files.find(f => f.id === activeFileId) : null;
  const [lineCount, setLineCount] = useState(1);
  const [parseStatus, setParseStatus] = useState<'parsing' | 'ready' | 'error'>('ready');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

  // Detected language for the current file
  const detectedLanguage = useMemo(() => {
    if (!activeFile) return 'JavaScript';
    return detectLanguage(activeFile.name, activeFile.content);
  }, [activeFile?.name, activeFile?.content]);

  // Update language when detection changes (only for auto-detect, not manual)
  useEffect(() => {
    if (activeFile && !activeFile.language) {
      onLanguageChange(activeFile.id, detectedLanguage);
    }
  }, [detectedLanguage]);

  useEffect(() => {
    if (activeFile?.content) {
      setLineCount(activeFile.content.split('\n').length);
    }
  }, [activeFile?.content]);

  // Simulate parsing status
  useEffect(() => {
    setParseStatus('parsing');
    const timer = setTimeout(() => {
      setParseStatus('ready');
    }, 300);
    return () => clearTimeout(timer);
  }, [activeFile?.content]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync scrolling between textarea, pre, and line numbers
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!textareaRef.current) return;

      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const value = activeFile.content;
      
      const newCode = value.substring(0, start) + "  " + value.substring(end);
      onCodeChange(activeFile.id, newCode);
      
      setTimeout(() => {
        if(textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLanguageSelect = (language: string) => {
    if (activeFile) {
      onLanguageChange(activeFile.id, language);
    }
    setShowLanguageDropdown(false);
  };

  const prismLanguage = getPrismLanguage(activeFile?.language || 'JavaScript');

  return (
    <div className="flex h-screen bg-[#0b1120] text-slate-300 font-sans overflow-hidden">
      
      {/* Flattened Sidebar */}
      <div className="w-64 border-r border-slate-800 flex flex-col bg-[#0b1120]">
        
        {/* Branding Header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-slate-800 bg-[#0b1120]">
          <div className="bg-blue-600 p-1 rounded-md shadow-lg shadow-blue-900/50">
            <Layout size={16} className="text-white" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">Codalyzer <span className="text-blue-500 text-[10px] font-mono font-normal ml-0.5 opacity-70">// v2.5</span></span>
        </div>

        <div className="p-4 border-b border-slate-800">
           <div className="flex items-center gap-2 mb-4 text-slate-400">
             <Box size={16} />
             <span className="text-xs font-bold uppercase tracking-wider">Workspace</span>
           </div>
           
           <div className="flex gap-2">
             <button 
               onClick={onFileCreate}
               className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded text-xs font-medium transition-colors"
             >
               <Plus size={14} /> New Snippet
             </button>
             <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                title="Upload File"
             >
               <Upload size={14} />
             </button>
             <input 
               type="file" 
               ref={fileInputRef} 
               className="hidden" 
               accept=".js,.ts,.jsx,.tsx,.py,.cpp,.c,.java,.go,.rs,.rb,.php"
               onChange={handleFileUpload}
             />
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
              <FolderOpen size={32} className="mb-3 opacity-50" />
              <p className="text-xs text-center">No snippets yet</p>
              <p className="text-[10px] text-center mt-1 opacity-60">Create or upload a file</p>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map(file => (
                <div 
                  key={file.id}
                  onClick={() => onFileSelect(file.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${file.id === activeFileId ? 'bg-slate-800 text-blue-400 border border-slate-700/50' : 'text-slate-400 hover:bg-slate-900'}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode size={14} className={file.id === activeFileId ? 'text-blue-400' : 'text-slate-500'} />
                    <span className="text-sm">{file.name}</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onFileDelete(file.id); }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-600 flex justify-between">
           <span>{files.length} Files</span>
           <span>Local Workspace</span>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {!activeFile ? (
          /* Empty Workspace Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center bg-[#0f172a]">
            <div className="text-center max-w-md px-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-slate-700 flex items-center justify-center">
                <FolderOpen size={40} className="text-blue-400" />
              </div>
              <h2 className="text-xl font-semibold text-slate-200 mb-2">Welcome to Codalyzer</h2>
              <p className="text-slate-400 text-sm mb-8">
                Start by creating a new code snippet or uploading an existing file to analyze its complexity.
              </p>
              <div className="flex gap-4 justify-center">
                <button 
                  onClick={onFileCreate}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                >
                  <Plus size={18} /> New Snippet
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                >
                  <Upload size={18} /> Upload File
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Editor Tabs/Header */}
            <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-[#0b1120]">
              <div className="flex items-center gap-2 text-sm">
                 {getLanguageIcon(activeFile?.language || 'JavaScript', 22)}
                 <span className="font-medium text-slate-200">{activeFile?.name}</span>
                 {isAnalyzing && <div className="text-xs text-blue-400 animate-pulse flex items-center gap-1 ml-2"><Loader2 size={12} className="animate-spin"/> Analyzing...</div>}
              </div>
              
              {hasValidReport ? (
                <button 
                  onClick={onViewReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all bg-green-600 hover:bg-green-500 text-white shadow-md shadow-green-600/20"
                >
                  <Eye size={14} />
                  View Analysis
                </button>
              ) : (
                <button 
                  onClick={() => activeFile && onAnalyze(activeFile.content)}
                  disabled={isAnalyzing || !activeFile}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${isAnalyzing || !activeFile ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'}`}
                >
                  <Zap size={14} />
                  {isAnalyzing ? 'Analysing...' : 'Analyse'}
                </button>
              )}
            </div>

        {/* Code Area with Prism Syntax Highlighting */}
        <div className="flex-1 flex relative overflow-hidden bg-[#0f172a]">
          {/* Line Numbers */}
          <div 
            ref={lineNumbersRef}
            className="w-12 pt-4 bg-[#0b1120] border-r border-slate-800 flex flex-col items-end pr-3 text-slate-600 text-xs font-mono select-none z-10 overflow-hidden"
          >
            {Array.from({ length: Math.max(lineCount, 30) }).map((_, i) => (
              <div key={i} className={`h-6 leading-6 shrink-0 ${i+1 === 1 ? 'text-white font-bold' : ''}`}>{i + 1}</div>
            ))}
          </div>

          {/* Editor Container */}
          <div className="flex-1 relative">
             <div className="absolute inset-0">
                {/* Syntax Highlighted Layer (Background) using Prism */}
                <div 
                  ref={preRef}
                  className="absolute inset-0 p-4 pt-4 font-mono text-sm leading-6 whitespace-pre overflow-auto pointer-events-none z-0"
                  style={{ tabSize: 2 }}
                >
                  <Highlight
                    theme={themes.nightOwl}
                    code={activeFile?.content || ''}
                    language={prismLanguage as any}
                  >
                    {({ tokens, getLineProps, getTokenProps }) => (
                      <>
                        {tokens.map((line, i) => (
                          <div key={i} {...getLineProps({ line })} className="leading-6 h-6">
                            {line.map((token, key) => (
                              <span key={key} {...getTokenProps({ token })} />
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </Highlight>
                </div>

                {/* Interactive Textarea Layer (Foreground) */}
                <textarea
                  ref={textareaRef}
                  value={activeFile?.content || ''}
                  onChange={(e) => activeFile && onCodeChange(activeFile.id, e.target.value)}
                  onKeyDown={handleKeyDown}
                  onScroll={handleScroll}
                  spellCheck={false}
                  className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-white font-mono text-sm leading-6 p-4 pt-4 outline-none resize-none z-10 selection:bg-blue-500/30"
                  style={{ tabSize: 2 }}
                />
             </div>
          </div>
        </div>

        {/* Footer Status Bar */}
        <div className="h-8 border-t border-slate-800 bg-[#0b1120] flex items-center justify-between px-4 text-xs text-slate-500">
           <div className="flex items-center gap-4">
              <span className="hover:text-slate-300 cursor-pointer">UTF-8</span>
              
              {/* Language Selector Dropdown */}
              <div ref={languageDropdownRef} className="relative">
                <button 
                  onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                  className="flex items-center gap-1 hover:text-slate-300 cursor-pointer transition-colors"
                >
                  {activeFile?.language || 'JavaScript'}
                  <ChevronDown size={12} />
                </button>
                
                {showLanguageDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 bg-slate-800 border border-slate-700 rounded-md shadow-xl py-1 min-w-[140px] z-50">
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <button
                        key={lang.value}
                        onClick={() => handleLanguageSelect(lang.label)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700 transition-colors ${activeFile?.language === lang.label ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'}`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
           </div>
           
           <div className="flex items-center gap-6">
              <span>Ln {lineCount}</span>
              {parseStatus === 'ready' && (
                <span className="flex items-center gap-1.5 text-green-500">
                   <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                   Ready
                </span>
              )}
              {parseStatus === 'parsing' && (
                <span className="flex items-center gap-1.5 text-yellow-500">
                   <Loader2 size={10} className="animate-spin" />
                   Parsing...
                </span>
              )}
           </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};
