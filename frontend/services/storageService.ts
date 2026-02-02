import { FileNode, AnalysisResult } from '../types';

const STORAGE_KEYS = {
  FILES: 'codalyzer-files',
  REPORTS: 'codalyzer-reports',
  ACTIVE_FILE_ID: 'codalyzer-active-file'
} as const;

export interface StoredFile extends FileNode {
  contentHash: string; // Hash to detect content changes
  lastModified: number;
}

export interface StoredReport {
  fileId: string;
  contentHash: string; // Hash of the code when analysis was done
  result: AnalysisResult;
  analyzedAt: number;
}

// Simple hash function for content comparison
const hashContent = (content: string): string => {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
};

// File operations
export const getStoredFiles = (): StoredFile[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.FILES);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveFiles = (files: StoredFile[]): void => {
  localStorage.setItem(STORAGE_KEYS.FILES, JSON.stringify(files));
};

export const addFile = (file: FileNode): StoredFile => {
  const files = getStoredFiles();
  const storedFile: StoredFile = {
    ...file,
    contentHash: hashContent(file.content),
    lastModified: Date.now()
  };
  files.push(storedFile);
  saveFiles(files);
  return storedFile;
};

export const updateFile = (fileId: string, updates: Partial<FileNode>): StoredFile | null => {
  const files = getStoredFiles();
  const index = files.findIndex(f => f.id === fileId);
  if (index === -1) return null;
  
  const updatedFile: StoredFile = {
    ...files[index],
    ...updates,
    contentHash: updates.content !== undefined 
      ? hashContent(updates.content) 
      : files[index].contentHash,
    lastModified: Date.now()
  };
  files[index] = updatedFile;
  saveFiles(files);
  return updatedFile;
};

export const deleteFile = (fileId: string): void => {
  const files = getStoredFiles().filter(f => f.id !== fileId);
  saveFiles(files);
  // Also delete associated report
  deleteReport(fileId);
};

// Report operations
export const getStoredReports = (): StoredReport[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.REPORTS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveReports = (reports: StoredReport[]): void => {
  localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
};

export const getReportForFile = (fileId: string): StoredReport | null => {
  const reports = getStoredReports();
  return reports.find(r => r.fileId === fileId) || null;
};

export const saveReport = (fileId: string, contentHash: string, result: AnalysisResult): StoredReport => {
  const reports = getStoredReports();
  const existingIndex = reports.findIndex(r => r.fileId === fileId);
  
  const storedReport: StoredReport = {
    fileId,
    contentHash,
    result,
    analyzedAt: Date.now()
  };
  
  if (existingIndex >= 0) {
    reports[existingIndex] = storedReport;
  } else {
    reports.push(storedReport);
  }
  
  saveReports(reports);
  return storedReport;
};

export const deleteReport = (fileId: string): void => {
  const reports = getStoredReports().filter(r => r.fileId !== fileId);
  saveReports(reports);
};

// Active file ID
export const getActiveFileId = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_FILE_ID);
};

export const setActiveFileId = (fileId: string): void => {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_FILE_ID, fileId);
};

// Check if file has been modified since last analysis
export const hasFileChanged = (file: StoredFile): boolean => {
  const report = getReportForFile(file.id);
  if (!report) return true; // No report means needs analysis
  return report.contentHash !== file.contentHash;
};

// Utility to compute hash for a file
export const computeContentHash = hashContent;

// Clear all storage (for debugging/reset)
export const clearAllStorage = (): void => {
  localStorage.removeItem(STORAGE_KEYS.FILES);
  localStorage.removeItem(STORAGE_KEYS.REPORTS);
  localStorage.removeItem(STORAGE_KEYS.ACTIVE_FILE_ID);
};
