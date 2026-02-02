import { AnalysisResult, ComplexityRating } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

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

/**
 * Analyze code with Gemini backend API.
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
    console.error('API call failed:', error);
    throw error;
  }
};

