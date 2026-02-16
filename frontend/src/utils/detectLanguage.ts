// ─── Utility: Detect language from filename or content ──────────────────
// Two-tier detection system:
//   1. Synchronous: Extension lookup + weighted heuristic (instant, used for UI)
//   2. Async AI:    Google Magika deep-learning model (~99% accuracy, lazy-loaded)
//
// The synchronous detector is used for immediate UI feedback. The async AI
// detector refines the result once the model is loaded.

import { EXT_TO_LANGUAGE } from '../constants';


// ─── Types ──────────────────────────────────────────────────────────────

interface LanguageProfile {
  /** High-confidence keywords unique or near-unique to this language */
  keywords: string[];
  /** Builtin functions / standard library identifiers */
  builtins: string[];
  /** Regex patterns for structural signals (function defs, imports, etc.) */
  patterns: RegExp[];
  /** Weight multiplier — higher for more distinctive signals */
  keywordWeight: number;
  builtinWeight: number;
  patternWeight: number;
}

// ─── Language Profiles ──────────────────────────────────────────────────

const PROFILES: Record<string, LanguageProfile> = {
  Python: {
    keywords: ['def ', 'elif ', 'except:', 'except ', 'lambda ', 'yield ', 'nonlocal ', 'pass\n', 'raise ', 'with ', 'as ', 'finally:'],
    builtins: ['print(', 'range(', 'len(', 'input(', 'isinstance(', 'enumerate(', '__init__', '__name__', 'self.', 'self,', 'True', 'False', 'None'],
    patterns: [
      /^from\s+\S+\s+import\s/m,         // from X import Y
      /^import\s+\w+/m,                   // import X (at line start)
      /^\s*def\s+\w+\s*\(/m,              // def func(
      /^\s*class\s+\w+.*:/m,              // class Foo:
      /^\s*@\w+/m,                        // decorators
      /:\s*$/m,                           // colon at end of line (blocks)
      /^\s*if\s+.*:\s*$/m,               // if cond:
      /^\s*for\s+\w+\s+in\s+/m,          // for x in
    ],
    keywordWeight: 2,
    builtinWeight: 3,
    patternWeight: 4,
  },

  JavaScript: {
    keywords: ['const ', 'let ', 'var ', 'function ', 'async ', 'await ', 'undefined', 'null', '=>', '===', '!=='],
    builtins: ['console.log(', 'console.error(', 'document.', 'window.', 'setTimeout(', 'setInterval(', 'Promise.', 'Array.', 'JSON.parse(', 'JSON.stringify(', 'require(', 'module.exports'],
    patterns: [
      /^(import|export)\s+.*\s+from\s+['"][^'"]+['"]/m,  // ES module import/export
      /^const\s+\w+\s*=\s*\(.*\)\s*=>/m,                  // arrow function
      /^(async\s+)?function\s+\w+\s*\(/m,                  // function declaration
      /\bfunction\s*\(/,                                    // anonymous function
      /\bcatch\s*\(\s*\w+\s*\)\s*\{/,                     // catch(e) {
      /\.then\s*\(/,                                        // promise chain
      /\.forEach\s*\(/,                                     // array method
      /\bnew\s+Promise\s*\(/,                               // new Promise(
    ],
    keywordWeight: 1.5,
    builtinWeight: 3,
    patternWeight: 3,
  },

  TypeScript: {
    keywords: ['interface ', 'type ', 'enum ', 'readonly ', 'keyof ', 'typeof ', 'as ', 'implements ', 'declare ', 'namespace '],
    builtins: ['string', 'number', 'boolean', 'void', 'never', 'unknown', 'any', 'Record<', 'Partial<', 'Required<', 'Omit<', 'Pick<', 'Promise<'],
    patterns: [
      /:\s*(string|number|boolean|void|any|never|unknown)\b/,  // type annotations
      /\w+\s*:\s*\w+(\[\])?\s*[;,=)]/,                        // typed params/vars
      /^(export\s+)?(interface|type|enum)\s+\w+/m,             // interface/type/enum declaration
      /<[A-Z]\w*>/,                                             // generic type params
      /\bas\s+\w+/,                                             // type assertion
      /\w+\?\s*:/,                                              // optional property
      /^import\s+type\s/m,                                     // import type
    ],
    keywordWeight: 4,
    builtinWeight: 2,
    patternWeight: 5,
  },

  'C++': {
    keywords: ['#include', 'std::', 'cout', 'cin', 'endl', 'namespace', 'template', 'class ', 'public:', 'private:', 'protected:', 'virtual ', 'nullptr', 'auto ', 'constexpr'],
    builtins: ['vector<', 'string ', 'map<', 'set<', 'pair<', 'unique_ptr<', 'shared_ptr<', 'make_unique<', 'make_shared<', 'begin()', 'end()'],
    patterns: [
      /^#include\s*<\w+>/m,                     // #include <iostream>
      /^#include\s*"[^"]+"/m,                   // #include "file.h"
      /^using\s+namespace\s+\w+/m,              // using namespace
      /^\s*(class|struct)\s+\w+\s*[\{:]/m,      // class/struct declaration
      /std::\w+/,                                // std:: prefix
      /^\s*template\s*<.*>/m,                    // template<typename T>
      /::\w+\s*\(/,                              // scope resolution
    ],
    keywordWeight: 4,
    builtinWeight: 3,
    patternWeight: 5,
  },

  C: {
    keywords: ['#include', '#define', 'typedef ', 'struct ', 'sizeof(', 'malloc(', 'free(', 'NULL', 'void ', 'extern ', 'static '],
    builtins: ['printf(', 'scanf(', 'fprintf(', 'sprintf(', 'strlen(', 'strcmp(', 'memcpy(', 'memset(', 'calloc(', 'realloc(', 'fopen(', 'fclose('],
    patterns: [
      /^#include\s*<(stdio|stdlib|string|math|stdbool|stdint|assert|ctype)\.h>/m,
      /^#define\s+\w+/m,                         // macro definition
      /^typedef\s+/m,                            // typedef
      /^\s*struct\s+\w+\s*\{/m,                  // struct definition
      /\bint\s+main\s*\(/,                        // int main(
      /\b(int|char|float|double|long|short|unsigned)\s+\w+\s*[;=,\[]/,  // C-style declarations
      /^\s*void\s+\w+\s*\([^)]*\)\s*\{/m,       // void func() {
    ],
    keywordWeight: 2,
    builtinWeight: 4,
    patternWeight: 4,
  },

  Java: {
    keywords: ['public ', 'private ', 'protected ', 'class ', 'extends ', 'implements ', 'interface ', 'abstract ', 'synchronized ', 'throws ', 'final ', 'static '],
    builtins: ['System.out.', 'System.err.', 'String ', 'Integer', 'ArrayList', 'HashMap', 'List<', 'Map<', 'Set<', 'Optional<', '.stream()', 'Collections.', '@Override', '@Autowired'],
    patterns: [
      /^package\s+[\w.]+;/m,                     // package declaration
      /^import\s+[\w.]+;/m,                      // import com.foo.Bar;
      /^public\s+(class|interface|enum)\s+\w+/m, // public class Foo
      /public\s+static\s+void\s+main\s*\(/,      // main method
      /new\s+\w+(<[^>]+>)?\s*\(/,                // new Object()
      /@\w+(\([^)]*\))?$/m,                      // annotations
      /\bthrows\s+\w+/,                           // throws Exception
    ],
    keywordWeight: 2,
    builtinWeight: 4,
    patternWeight: 5,
  },

  Go: {
    keywords: ['func ', 'package ', 'import ', 'go ', 'chan ', 'defer ', 'goroutine', 'range ', 'select ', 'fallthrough', ':='],
    builtins: ['fmt.', 'log.', 'os.', 'strconv.', 'strings.', 'errors.', 'context.', 'http.', 'make(', 'append(', 'panic(', 'recover('],
    patterns: [
      /^package\s+(main|\w+)\s*$/m,               // package main
      /^import\s+\(/m,                             // import (
      /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/m, // func (r *T) Name(
      /\w+\s*:=\s*/,                               // short variable declaration
      /\bgo\s+\w+\s*\(/,                           // go func()
      /\bchan\s+\w+/,                              // chan Type
      /\bdefer\s+/,                                // defer
      /\bif\s+\w+\s*:=.*;\s*\w+/,                 // if err := ...; err
    ],
    keywordWeight: 4,
    builtinWeight: 3,
    patternWeight: 5,
  },

  Rust: {
    keywords: ['fn ', 'let ', 'mut ', 'pub ', 'impl ', 'trait ', 'enum ', 'match ', 'struct ', 'mod ', 'use ', 'crate', 'unsafe ', 'where '],
    builtins: ['println!', 'format!', 'vec!', 'panic!', 'unwrap()', 'expect(', 'Option<', 'Result<', 'Some(', 'None', 'Ok(', 'Err(', 'String::from', '&str', '&self', 'Box<'],
    patterns: [
      /^use\s+(std|crate|super|self)::/m,          // use std::io
      /^\s*fn\s+\w+\s*(<[^>]+>)?\s*\(/m,          // fn name(
      /^\s*(pub\s+)?(struct|enum|trait|impl)\s+/m, // pub struct/enum/trait/impl
      /\b(let|let\s+mut)\s+\w+\s*:\s*/,            // let x: Type
      /->\s*\w+/,                                    // return type annotation
      /\bmatch\s+\w+\s*\{/,                         // match expr {
      /\b\w+!\s*\(/,                                // macro invocation
      /&(mut\s+)?\w+/,                              // references
    ],
    keywordWeight: 4,
    builtinWeight: 4,
    patternWeight: 5,
  },

  Ruby: {
    keywords: ['def ', 'end\n', 'end ', 'puts ', 'require ', 'attr_accessor', 'attr_reader', 'attr_writer', 'class ', 'module ', 'do ', 'elsif ', 'unless ', 'until ', 'rescue ', 'begin ', 'ensure '],
    builtins: ['.each ', '.map ', '.select ', '.reject ', '.reduce ', '.include?', '.nil?', '.empty?', '.to_s', '.to_i', '.to_f', 'puts(', 'gets', 'Kernel.', 'ARGV'],
    patterns: [
      /^require\s+['"][^'"]+['"]/m,               // require 'lib'
      /^require_relative\s+/m,                     // require_relative
      /^\s*def\s+\w+/m,                            // def method
      /^\s*class\s+\w+\s*(<\s*\w+)?/m,            // class Foo < Bar
      /^\s*module\s+\w+/m,                         // module Foo
      /\bdo\s*\|[^|]+\|/,                          // do |x|
      /\{\s*\|[^|]+\|\s*/,                         // { |x|
      /\b(puts|p|pp)\s+/,                          // output methods
    ],
    keywordWeight: 3,
    builtinWeight: 3,
    patternWeight: 4,
  },

  PHP: {
    keywords: ['<?php', '<?=', '$', 'echo ', 'function ', 'public ', 'private ', 'protected ', 'namespace ', 'use ', 'class ', 'abstract ', 'trait '],
    builtins: ['echo ', 'print(', 'var_dump(', 'print_r(', 'isset(', 'empty(', 'array(', 'strlen(', 'str_replace(', 'array_map(', 'array_filter(', 'preg_match(', 'mysqli_', 'PDO'],
    patterns: [
      /^<\?php/m,                                   // PHP opening tag
      /^\$\w+\s*=/m,                                // $var =
      /^\s*(public|private|protected)\s+(static\s+)?function\s+/m,  // method definition
      /^\s*function\s+\w+\s*\(/m,                   // function definition
      /^\s*namespace\s+[\w\\]+;/m,                  // namespace
      /^\s*use\s+[\w\\]+;/m,                        // use statement
      /\$this->/,                                    // $this->
      /->\w+\s*\(/,                                 // method call
    ],
    keywordWeight: 3,
    builtinWeight: 3,
    patternWeight: 5,
  },
};

// ─── Scoring Engine ─────────────────────────────────────────────────────

function scoreLanguage(content: string, profile: LanguageProfile): number {
  let score = 0;

  // Keyword matches
  for (const kw of profile.keywords) {
    // Count occurrences (capped at 5 to prevent one repeated keyword from dominating)
    const count = Math.min(countOccurrences(content, kw), 5);
    score += count * profile.keywordWeight;
  }

  // Builtin matches
  for (const bi of profile.builtins) {
    const count = Math.min(countOccurrences(content, bi), 5);
    score += count * profile.builtinWeight;
  }

  // Pattern matches
  for (const pat of profile.patterns) {
    const matches = content.match(new RegExp(pat.source, pat.flags + (pat.flags.includes('g') ? '' : 'g')));
    const count = Math.min(matches?.length ?? 0, 5);
    score += count * profile.patternWeight;
  }

  return score;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

// ─── Disambiguation Rules ───────────────────────────────────────────────
// Applied after scoring to resolve confusable language pairs.

function applyDisambiguation(scores: Record<string, number>, content: string): void {
  // C vs C++: If both score, check for C++-specific features
  if (scores['C'] > 0 && scores['C++'] > 0) {
    const hasCppFeatures = /std::|cout|cin|class\s+\w+|template\s*<|namespace\s|::\w+\(|vector<|string\s|nullptr/.test(content);
    if (hasCppFeatures) {
      scores['C'] *= 0.3;  // Heavily penalize C if C++ features present
    } else {
      scores['C++'] *= 0.5;  // Reduce C++ score if no C++-specific features
    }
  }

  // JS vs TS: If both score, check for TypeScript-specific features
  if (scores['JavaScript'] > 0 && scores['TypeScript'] > 0) {
    const hasTsFeatures = /:\s*(string|number|boolean|void|any|never)\b|interface\s+\w+|type\s+\w+\s*=|<[A-Z]\w*>|import\s+type\s/.test(content);
    if (hasTsFeatures) {
      scores['JavaScript'] *= 0.3;
    } else {
      scores['TypeScript'] *= 0.4;
    }
  }

  // C vs Java: Both use `public`, `class`, etc.
  if (scores['C'] > 0 && scores['Java'] > 0) {
    const hasJavaFeatures = /^package\s+[\w.]+;|^import\s+[\w.]+;|System\.out|public\s+static\s+void\s+main/m.test(content);
    if (hasJavaFeatures) {
      scores['C'] *= 0.2;
    }
  }

  // PHP: If `<?php` or `$variable` pattern is dominant, boost PHP and reduce others
  if (scores['PHP'] > 0 && /^<\?php/m.test(content)) {
    scores['PHP'] *= 2;
  }

  // Ruby vs Python: Both use `def`, `class`, etc.
  if (scores['Ruby'] > 0 && scores['Python'] > 0) {
    const hasRubyEnd = /^\s*end\s*$/m.test(content);
    const hasPythonColon = /^\s*(def|class|if|for|while)\s+.*:\s*$/m.test(content);
    if (hasRubyEnd && !hasPythonColon) {
      scores['Python'] *= 0.3;
    } else if (hasPythonColon && !hasRubyEnd) {
      scores['Ruby'] *= 0.3;
    }
  }
}

// ─── Synchronous Heuristic Detection ────────────────────────────────────

/** Minimum score threshold to return a detection result */
const MIN_CONFIDENCE = 5;

/**
 * **Synchronous** language detection using file extension + weighted heuristics.
 * Use this for immediate UI feedback (e.g., status bar, language icon).
 *
 * Extension-based detection is authoritative — if the extension matches a
 * known language, the content is not analysed at all.
 */
export function detectLanguage(fileName: string, content: string): string {
  // 1. Extension-based detection is authoritative
  if (fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && EXT_TO_LANGUAGE[ext]) return EXT_TO_LANGUAGE[ext];
  }

  // 2. Content-based detection via weighted scoring
  if (!content || content.trim().length < 10) return '';

  const scores: Record<string, number> = {};
  for (const [lang, profile] of Object.entries(PROFILES)) {
    scores[lang] = scoreLanguage(content, profile);
  }

  // 3. Apply disambiguation rules for confusable pairs
  applyDisambiguation(scores, content);

  // 4. Return highest-scoring language above threshold
  let bestLang = '';
  let bestScore = MIN_CONFIDENCE;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestLang;
}


