export interface FileNode {
  id: string;
  name: string;
  content: string;
  language: string;
}

export enum ComplexityRating {
  Excellent = 'Excellent',
  Good = 'Good',
  Fair = 'Fair',
  Poor = 'Poor',
  Critical = 'Critical'
}

export interface ComplexityMetric {
  notation: string; // e.g., O(n log n)
  description: string;
  rating: ComplexityRating;
}

export interface Issue {
  id: string;
  line: number;
  type: 'High Impact' | 'Optimization' | 'Memory' | 'Good Practice' | 'Security';
  title: string;
  description: string;
  snippet?: string;
}

export interface PerformancePoint {
  n: number;
  ops: number;
}

export interface AnalysisResult {
  fileName: string;
  language: string;
  timestamp: string;
  sourceCode: string; // Source code that was analyzed
  timeComplexity: {
    best: ComplexityMetric;
    average: ComplexityMetric;
    worst: ComplexityMetric;
  };
  spaceComplexity: ComplexityMetric;
  performanceData: PerformancePoint[];
  issues: Issue[];
  summary: string;
  suggestedName?: string; // New field for auto-naming
}