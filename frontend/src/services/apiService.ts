// ─── API Service ────────────────────────────────────────────────────────
// Communicates with backendv2 API. Handles rate limit headers, share endpoints,
// initialization, and 429 responses gracefully.

import { AnalysisResult, ComplexityRating, RateLimitInfo, ShareInfo } from '../types';
import { setStoredRateLimit } from './storageService';

// In development, use Vite's proxy (relative URL) to avoid CORS entirely.
// In production, use the full backend URL from env.
const API_BASE = import.meta.env.VITE_API_URL || '';
const API_V1 = `${API_BASE}/api/v1`;

// ─── Helpers ───────────────────────────────────────────────────────────

function mapRating(rating: string): ComplexityRating {
  const map: Record<string, ComplexityRating> = {
    Good: ComplexityRating.Good,
    Fair: ComplexityRating.Fair,
    Poor: ComplexityRating.Poor,
  };
  return map[rating] ?? ComplexityRating.Fair;
}

function normalizeLanguage(lang: string): string {
  if (!lang) return '';
  const l = lang.toLowerCase();
  if (l === 'javascript' || l === 'js') return 'JavaScript';
  if (l === 'typescript' || l === 'ts') return 'TypeScript';
  if (l === 'python' || l === 'py') return 'Python';
  if (l === 'cpp' || l === 'c++') return 'C++';
  if (l === 'c') return 'C';
  if (l === 'java') return 'Java';
  if (l === 'go') return 'Go';
  if (l === 'rust') return 'Rust';
  if (l === 'ruby') return 'Ruby';
  if (l === 'php') return 'PHP';
  // Capitalize first letter as fallback
  return lang.charAt(0).toUpperCase() + lang.slice(1);
}

function transformResponse(data: any, code: string): AnalysisResult {
  return {
    fileName: data.fileName,
    language: normalizeLanguage(data.language),
    timestamp: data.timestamp,
    sourceCode: code,
    timeComplexity: {
      best: { ...data.timeComplexity.best, rating: mapRating(data.timeComplexity.best.rating) },
      average: { ...data.timeComplexity.average, rating: mapRating(data.timeComplexity.average.rating) },
      worst: { ...data.timeComplexity.worst, rating: mapRating(data.timeComplexity.worst.rating) },
    },
    spaceComplexity: {
      ...data.spaceComplexity,
      rating: mapRating(data.spaceComplexity.rating),
    },
    performanceData: [],
    issues: (data.issues || []).map((issue: any) => ({
      id: issue.id,
      type: issue.type,
      title: issue.title,
      description: issue.description,
      codeSnippet: issue.code_snippet,
      fixType: issue.fix_type,
      fix: issue.fix
    })),
    summary: data.summary,
  };
}

/** Extract rate limit info from response headers */
function extractRateLimitFromHeaders(headers: Headers): Partial<RateLimitInfo> {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  const gLimit = headers.get('X-RateLimit-Global-Limit');
  const gRemaining = headers.get('X-RateLimit-Global-Remaining');

  const info: Partial<RateLimitInfo> = {};
  if (limit !== null) info.userLimit = parseInt(limit, 10);
  if (remaining !== null) info.userRemaining = parseInt(remaining, 10);
  if (reset !== null) info.resetAt = reset;
  if (gLimit !== null) info.globalLimit = parseInt(gLimit, 10);
  if (gRemaining !== null) info.globalRemaining = parseInt(gRemaining, 10);

  return info;
}

/** Broadcast rate limit updates to subscribers */
function notifyRateLimit(headers: Headers) {
  const info = extractRateLimitFromHeaders(headers);
  if (Object.keys(info).length > 0) {
    setStoredRateLimit(info);
    if (_rateLimitCallback) {
      _rateLimitCallback(info);
    }
  }
}

// ─── Rate limit callback for real-time updates ─────────────────────────

let _rateLimitCallback: ((info: Partial<RateLimitInfo>) => void) | null = null;

export function onRateLimitUpdate(cb: (info: Partial<RateLimitInfo>) => void): void {
  _rateLimitCallback = cb;
}

// ─── API Calls ─────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public isRateLimit: boolean = false,
    public rateLimitInfo?: Partial<RateLimitInfo>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Initialize: fetch rate limit status for current user */
export async function initialize(): Promise<RateLimitInfo> {
  try {
    const res = await fetch(`${API_V1}/initialize`);
    notifyRateLimit(res.headers);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const info = {
      userRemaining: data.user_requests_remaining,
      userLimit: data.user_requests_limit,
      globalRemaining: data.global_requests_remaining,
      globalLimit: data.global_requests_limit,
      resetAt: data.reset_at,
    };
    setStoredRateLimit(info);
    return info;
  } catch {
    // Fallback if backend unreachable
    return { userRemaining: 20, userLimit: 20, globalRemaining: 1000, globalLimit: 1000, resetAt: '' };
  }
}

/** Analyze code */
export async function analyzeCode(code: string, fileName?: string): Promise<AnalysisResult> {
  const payload: any = { code };

  // Only send filename if it's not a generic new snippet name (Snippet-X)
  const isGeneric = !fileName || fileName.startsWith('Snippet-');
  if (!isGeneric) {
    payload.filename = fileName;
  }

  // Backend prefers "auto" if we don't know the language
  payload.language = 'auto';

  const res = await fetch(`${API_V1}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // Extract rate limit info from headers
  notifyRateLimit(res.headers);

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const rlInfo = extractRateLimitFromHeaders(res.headers);
    throw new ApiError(
      body.message || 'Rate limit exceeded',
      429,
      true,
      { ...rlInfo, userRemaining: 0, resetAt: body.reset_at || rlInfo.resetAt || '' },
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new ApiError(body.detail || body.error || `HTTP ${res.status}`, res.status);
  }

  const data = await res.json();
  if (!data.success) {
    throw new ApiError(data.error || 'Analysis failed', 500);
  }

  return transformResponse(data.result, code);
}

/** Create a shareable link for an analysis result */
export async function createShare(result: AnalysisResult): Promise<ShareInfo> {
  const payload = {
    fileName: result.fileName,
    language: result.language,
    timestamp: result.timestamp,
    sourceCode: result.sourceCode,
    timeComplexity: result.timeComplexity,
    spaceComplexity: result.spaceComplexity,
    issues: result.issues,
    summary: result.summary,
  };

  const res = await fetch(`${API_V1}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  notifyRateLimit(res.headers);

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Share failed' }));
    throw new ApiError(body.detail || 'Failed to create share link', res.status);
  }

  const data = await res.json();
  return { shareId: data.share_id, expiresIn: data.expires_in };
}

/** Retrieve a shared analysis */
export async function getShare(shareId: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_V1}/share/${encodeURIComponent(shareId)}`);
  notifyRateLimit(res.headers);
  if (res.status === 404) throw new ApiError('Share not found or expired', 404);
  if (!res.ok) throw new ApiError('Failed to load shared result', res.status);

  const data = await res.json();
  if (!data.success) throw new ApiError('Invalid share data', 500);

  // Shared results already have sourceCode embedded
  return transformResponse(data.result, data.result.sourceCode || '');
}

/** Health check */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_V1}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
