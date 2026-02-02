import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from './components/EditorView';
import { DashboardView } from './components/DashboardView';
import { AnalysisResult, StoredFileNode } from './types';
import { analyzeCodeWithGemini } from './services/geminiService';
import {
  getStoredFiles,
  saveFiles,
  getStoredReports,
  getReportForFile,
  saveReport,
  deleteReport,
  getActiveFileId,
  setActiveFileId as saveActiveFileId,
  computeContentHash,
  StoredFile,
  StoredReport
} from './services/storageService';
import { AlertTriangle } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<'editor' | 'dashboard'>('editor');
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Load files from localStorage on mount
  useEffect(() => {
    const storedFiles = getStoredFiles();
    const storedActiveId = getActiveFileId();
    
    setFiles(storedFiles);
    
    if (storedFiles.length > 0) {
      // Use stored active file if it exists, otherwise use first file
      const activeId = storedActiveId && storedFiles.some(f => f.id === storedActiveId)
        ? storedActiveId
        : storedFiles[0].id;
      setActiveFileId(activeId);
    }
    
    setIsInitialized(true);
  }, []);

  // Save files to localStorage whenever they change
  useEffect(() => {
    if (isInitialized) {
      saveFiles(files);
    }
  }, [files, isInitialized]);

  // Save active file ID whenever it changes
  useEffect(() => {
    if (isInitialized && activeFileId) {
      saveActiveFileId(activeFileId);
    }
  }, [activeFileId, isInitialized]);

  const activeFile = files.find(f => f.id === activeFileId) || null;

  // Check if current file has a valid (unchanged) report
  const currentReport = activeFile ? getReportForFile(activeFile.id) : null;
  const hasValidReport = currentReport && currentReport.contentHash === activeFile?.contentHash;

  const handleFileCreate = () => {
    const newFile: StoredFile = {
      id: Date.now().toString(),
      name: `Snippet-${files.length + 1}`,
      content: '// Start coding here...',
      language: 'JavaScript',
      contentHash: computeContentHash('// Start coding here...'),
      lastModified: Date.now()
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    const newFile: StoredFile = {
      id: Date.now().toString(),
      name: file.name,
      content: text,
      language: 'JavaScript',
      contentHash: computeContentHash(text),
      lastModified: Date.now()
    };
    setFiles([...files, newFile]);
    setActiveFileId(newFile.id);
  };

  const handleFileDelete = (id: string) => {
    const newFiles = files.filter(f => f.id !== id);
    setFiles(newFiles);
    deleteReport(id);
    
    if (activeFileId === id) {
      setActiveFileId(newFiles.length > 0 ? newFiles[0].id : null);
    }
  };

  const handleCodeChange = (id: string, newCode: string) => {
    setFiles(files.map(f => {
      if (f.id === id) {
        return {
          ...f,
          content: newCode,
          contentHash: computeContentHash(newCode),
          lastModified: Date.now()
        };
      }
      return f;
    }));
  };

  const handleLanguageChange = (id: string, language: string) => {
    setFiles(files.map(f => f.id === id ? { ...f, language, lastModified: Date.now() } : f));
  };

  const handleAnalyze = async (code: string, forceReanalyze: boolean = false) => {
    if (!activeFile) return;

    // Check if we have a valid cached report and not forcing reanalysis
    if (!forceReanalyze && hasValidReport && currentReport) {
      setAnalysisResult(currentReport.result);
      setView('dashboard');
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      const result = await analyzeCodeWithGemini(code, activeFile.name);
      
      // Auto-rename and language update for new snippets
      const isNewSnippet = activeFile.name.startsWith('Snippet-') || activeFile.name === 'untitled';
      
      if (isNewSnippet) {
        const updates: Partial<StoredFile> = {};
        
        // Update name if suggested
        if (result.suggestedName && result.suggestedName !== activeFile.name) {
          updates.name = result.suggestedName;
          result.fileName = result.suggestedName;
        }
        
        // Update language from API detection
        if (result.language && result.language !== activeFile.language) {
          updates.language = result.language;
        }
        
        if (Object.keys(updates).length > 0) {
          setFiles(files.map(f => f.id === activeFileId ? { ...f, ...updates, lastModified: Date.now() } : f));
        }
      }

      // Save report to localStorage
      saveReport(activeFile.id, activeFile.contentHash, result);
      
      setAnalysisResult(result);
      setView('dashboard');
    } catch (error) {
      console.error("Analysis failed:", error);
      setErrorMessage("Analysis failed. Please check your API Key and try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleViewReport = () => {
    if (currentReport) {
      setAnalysisResult(currentReport.result);
      setView('dashboard');
    }
  };

  const handleReanalyze = () => {
    if (activeFile) {
      handleAnalyze(activeFile.content, true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 font-sans flex flex-col">
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
            onViewReport={handleViewReport}
            isAnalyzing={isAnalyzing}
            hasValidReport={!!hasValidReport}
          />
        ) : (
          analysisResult && (
            <DashboardView 
              result={analysisResult} 
              onNewAnalysis={() => setView('editor')}
              onReanalyze={handleReanalyze}
              isReanalyzing={isAnalyzing}
            />
          )
        )}
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = createRoot(rootElement);
root.render(<React.StrictMode><App /></React.StrictMode>);
