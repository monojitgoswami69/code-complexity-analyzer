import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from './components/EditorView';
import { DashboardView } from './components/DashboardView';
import { INITIAL_FILES } from './constants';
import { AnalysisResult, FileNode } from './types';
import { analyzeCodeWithGemini } from './services/geminiService';
import { Layout, AlertTriangle, ArrowLeft } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<'editor' | 'dashboard'>('editor');
  const [files, setFiles] = useState<FileNode[]>(INITIAL_FILES);
  const [activeFileId, setActiveFileId] = useState<string>(INITIAL_FILES[0].id);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileCreate = () => {
    const newFile: FileNode = {
      id: Date.now().toString(),
      name: `Snippet-${files.length + 1}`,
      content: 'Start coding here...',
      language: 'JavaScript'
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    const newFile: FileNode = {
      id: Date.now().toString(),
      name: file.name,
      content: text,
      language: 'JavaScript'
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleFileDelete = (id: string) => {
    if (files.length <= 1) return;
    
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    if (activeFileId === id && newFiles.length > 0) {
      setActiveFileId(newFiles[0].id);
    }
  };

  const handleCodeChange = (id: string, newCode: string) => {
    setFiles(files.map(f => f.id === id ? { ...f, content: newCode } : f));
  };

  const handleLanguageChange = (id: string, language: string) => {
    setFiles(files.map(f => f.id === id ? { ...f, language } : f));
  };

  const handleAnalyze = async (code: string) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      const currentFile = files.find(f => f.id === activeFileId);
      if (!currentFile) return;

      const result = await analyzeCodeWithGemini(code, currentFile.name);
      
      // Auto-rename and language update for new snippets
      const isNewSnippet = currentFile.name.startsWith('Snippet-') || currentFile.name === 'untitled';
      
      if (isNewSnippet) {
        const updates: Partial<typeof currentFile> = {};
        
        // Update name if suggested
        if (result.suggestedName && result.suggestedName !== currentFile.name) {
          updates.name = result.suggestedName;
          result.fileName = result.suggestedName;
        }
        
        // Update language from API detection
        if (result.language && result.language !== currentFile.language) {
          updates.language = result.language;
        }
        
        if (Object.keys(updates).length > 0) {
          setFiles(files.map(f => f.id === activeFileId ? { ...f, ...updates } : f));
        }
      }

      setAnalysisResult(result);
      setView('dashboard');
    } catch (error) {
      console.error("Analysis failed:", error);
      setErrorMessage("Analysis failed. Please check your API Key and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="h-12 border-b border-slate-800 bg-[#0b1120] flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1 rounded-md shadow-lg shadow-blue-900/50">
            <Layout size={18} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Complexity Analyzer <span className="text-blue-500 text-xs font-mono font-normal ml-1 opacity-70">// v2.4</span></span>
        </div>

        <div className="flex items-center gap-4">
           {view === 'dashboard' && (
             <button 
               onClick={() => setView('editor')}
               className="flex items-center gap-2 px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider transition-all border border-slate-700"
             >
               <ArrowLeft size={14} /> Back to Editor
             </button>
           )}

           <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs cursor-pointer shadow-lg shadow-blue-900/20">
             CA
           </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {errorMessage && (
            <div className="absolute top-4 right-4 z-50 bg-red-900/90 border border-red-700 text-red-200 px-4 py-3 rounded shadow-xl flex items-center gap-3">
                <AlertTriangle size={20} />
                <span className="text-sm font-medium">{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-300 hover:text-white">✕</button>
            </div>
        )}
        
        {view === 'editor' ? (
          <EditorView 
            files={files}
            activeFileId={activeFileId}
            onFileSelect={setActiveFileId}
            onFileCreate={handleFileCreate}
            onFileDelete={handleFileDelete}
            onFileUpload={handleFileUpload}
            onCodeChange={handleCodeChange}
            onLanguageChange={handleLanguageChange}
            onAnalyze={handleAnalyze} 
            isAnalyzing={isAnalyzing}
          />
        ) : (
          analysisResult && <DashboardView result={analysisResult} onNewAnalysis={() => setView('editor')} />
        )}
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = createRoot(rootElement);
root.render(<React.StrictMode><App /></React.StrictMode>);
