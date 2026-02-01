import { AnalysisResult, ComplexityRating } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

const detectFunctionName = (code: string): string | undefined => {
  const functionRegex = /function\s+([a-zA-Z_$][0-9a-zA-Z_$]*)/;
  const constRegex = /(?:const|let|var)\s+([a-zA-Z_$][0-9a-zA-Z_$]*)\s*=\s*(?:async\s*)?(?:\(|arr|str|nums)/;
  
  const fnMatch = code.match(functionRegex);
  if (fnMatch) return fnMatch[1];
  
  const constMatch = code.match(constRegex);
  if (constMatch) return constMatch[1];
  
  return undefined;
};

const mapRating = (rating: string): ComplexityRating => {
  switch (rating) {
    case "Excellent": return ComplexityRating.Excellent;
    case "Good": return ComplexityRating.Good;
    case "Fair": return ComplexityRating.Fair;
    case "Poor": return ComplexityRating.Poor;
    case "Critical": return ComplexityRating.Critical;
    default: return ComplexityRating.Fair;
  }
};

const transformResponse = (data: any, code: string): AnalysisResult => {
  return {
    fileName: data.fileName,
    language: data.language,
    timestamp: data.timestamp,
    sourceCode: code,
    timeComplexity: {
      best: {
        notation: data.timeComplexity.best.notation,
        description: data.timeComplexity.best.description,
        rating: mapRating(data.timeComplexity.best.rating),
      },
      average: {
        notation: data.timeComplexity.average.notation,
        description: data.timeComplexity.average.description,
        rating: mapRating(data.timeComplexity.average.rating),
      },
      worst: {
        notation: data.timeComplexity.worst.notation,
        description: data.timeComplexity.worst.description,
        rating: mapRating(data.timeComplexity.worst.rating),
      },
    },
    spaceComplexity: {
      notation: data.spaceComplexity.notation,
      description: data.spaceComplexity.description,
      rating: mapRating(data.spaceComplexity.rating),
    },
    performanceData: [],
    issues: data.issues || [],
    summary: data.summary,
    suggestedName: data.suggestedName,
  };
};

export const getMockAnalysis = async (code: string, currentFileName: string): Promise<AnalysisResult> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  const detectedName = detectFunctionName(code);
  const suggestedName = detectedName ? `${detectedName.charAt(0).toUpperCase() + detectedName.slice(1)}.js` : undefined;

  // Determine complexity roughly based on loops (very basic heuristic for mock variety)
  const loopCount = (code.match(/for\s*\(/g) || []).length + (code.match(/while\s*\(/g) || []).length;
  const isRecursion = code.includes(detectedName || 'recurse');
  
  let complexity = 'O(n)';
  if (loopCount >= 2) complexity = 'O(n²)';
  if (isRecursion && loopCount > 0) complexity = 'O(n log n)';
  if (loopCount === 0 && !isRecursion) complexity = 'O(1)';

  return {
    fileName: suggestedName || currentFileName,
    language: 'JavaScript',
    timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    sourceCode: code,
    timeComplexity: {
      best: { notation: 'O(n)', description: 'Best case scenario (sorted input)', rating: ComplexityRating.Good },
      average: { notation: complexity, description: 'Typical execution', rating: complexity === 'O(n²)' ? ComplexityRating.Poor : ComplexityRating.Good },
      worst: { notation: complexity, description: 'Upper bound limit', rating: complexity === 'O(n²)' ? ComplexityRating.Poor : ComplexityRating.Fair },
    },
    spaceComplexity: { notation: 'O(log n)', description: 'Stack space for recursion', rating: ComplexityRating.Good },
    issues: [
      {
        id: 'issue-1',
        line: 12,
        type: 'Optimization',
        title: 'Pivot Selection',
        description: 'Choosing the last element as pivot can lead to worst-case O(n²) time on sorted arrays.',
        snippet: 'const pivot = arr[arr.length - 1];'
      },
      {
        id: 'issue-2',
        line: 14,
        type: 'Memory',
        title: 'Array Allocation',
        description: 'Creating new arrays (leftArr, rightArr) consumes O(n) space. Consider in-place partitioning.',
        snippet: 'const leftArr = [];\nconst rightArr = [];'
      }
    ],
    performanceData: [], // Not used - charts calculate from complexity notation
    summary: `Analysis suggests this implementation of ${detectedName || 'the algorithm'} has standard characteristics but could be optimized for space efficiency.`,
    suggestedName
  };
};

/**
 * Analyze code with Gemini backend API.
 * Falls back to mock data if API is unavailable.
 */
export const analyzeCodeWithGemini = async (code: string, fileName: string): Promise<AnalysisResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        filename: fileName,
        language: 'auto',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Analysis failed');
    }

    return transformResponse(data.result, code);
    
  } catch (error) {
    console.warn('API call failed, using mock data:', error);
    // Fallback to mock data if API is unavailable
    return getMockAnalysis(code, fileName);
  }
};
