#!/usr/bin/env python3
"""
Terminal test script for the Complexity Analyzer API.
"""
import asyncio
import json

from app.gemini_provider import gemini_provider


TEST_CODE = '''
function quickSort(arr) {
    if (arr.length <= 1) return arr;
    
    const pivot = arr[arr.length - 1];
    const leftArr = [];
    const rightArr = [];
    
    for (let i = 0; i < arr.length - 1; i++) {
        if (arr[i] < pivot) {
            leftArr.push(arr[i]);
        } else {
            rightArr.push(arr[i]);
        }
    }
    
    return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
}
'''


async def main():
    print("=" * 60)
    print("Complexity Analyzer - Terminal Test")
    print("=" * 60)
    
    if not gemini_provider.is_available():
        print("ERROR: Gemini provider not available!")
        print("Please check your GEMINI_API_KEY in .env")
        return
    
    print(f"\nModel: {gemini_provider.get_model_name()}")
    print("\nAnalyzing test code...")
    print("-" * 40)
    
    try:
        result = await gemini_provider.analyze_code(
            code=TEST_CODE,
            filename="untitled",
            language="auto"
        )
        
        print("\n✓ Analysis Complete!\n")
        print(json.dumps(result, indent=2, default=str))
        
    except Exception as e:
        print(f"\n✗ Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
