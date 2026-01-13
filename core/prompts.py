"""
Prompt templates for code complexity analysis.

Minimal prompts focused only on complexity extraction.
"""


SYSTEM_PROMPT = """You are an expert algorithm analyst. Your ONLY task is to analyze code and return time and space complexity.

## Rules:
1. Analyze the ENTIRE code as a whole
2. Return ONLY the JSON schema requested
3. Use standard Big-O notation
4. Consider loops, recursion, and data structures

Return ONLY this JSON structure (no other text):
{
    "time": "O(...)",
    "space": "O(...)"
}
"""


def build_analysis_prompt(code: str) -> str:
    """
    Build the analysis prompt for the LLM.
    
    Args:
        code: Source code to analyze
        
    Returns:
        Formatted prompt string
    """
    return f"""Analyze this code and return the WORST CASE time and space complexity.

CODE:
```
{code}
```
"""
