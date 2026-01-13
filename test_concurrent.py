"""
Test script for concurrent requests to the complexity analyzer API.

Tests 20 concurrent requests and measures timing for each.
"""

import asyncio
import time
from typing import List, Tuple

import httpx


# Test code samples
TEST_CODES = [
    "for i in range(n): print(i)",
    "def bubble_sort(arr):\n    for i in range(len(arr)):\n        for j in range(len(arr)-i-1):\n            if arr[j] > arr[j+1]:\n                arr[j], arr[j+1] = arr[j+1], arr[j]",
    "def binary_search(arr, target):\n    left, right = 0, len(arr)-1\n    while left <= right:\n        mid = (left+right)//2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid+1\n        else:\n            right = mid-1\n    return -1",
    "result = [x*2 for x in range(n)]",
    "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n-1)",
]


async def make_request(
    client: httpx.AsyncClient, 
    code: str, 
    request_num: int
) -> Tuple[int, float, dict]:
    """
    Make a single request to the API.
    
    Args:
        client: HTTP client
        code: Code to analyze
        request_num: Request number
        
    Returns:
        Tuple of (request_num, time_taken, response_data)
    """
    start = time.time()
    
    try:
        response = await client.post(
            "http://localhost:8000/analyze",
            json={"code": code},
            timeout=30.0
        )
        elapsed = time.time() - start
        
        data = response.json()
        return (request_num, elapsed, data)
    
    except Exception as e:
        elapsed = time.time() - start
        return (request_num, elapsed, {"error": str(e)})


async def run_concurrent_test(num_requests: int = 20):
    """
    Run concurrent requests test.
    
    Args:
        num_requests: Number of concurrent requests to make
    """
    print("=" * 80)
    print(f"CONCURRENT REQUEST TEST - {num_requests} requests")
    print("=" * 80)
    print()
    
    # Create test data (cycle through test codes)
    test_data = [TEST_CODES[i % len(TEST_CODES)] for i in range(num_requests)]
    
    # Track overall timing
    overall_start = time.time()
    
    async with httpx.AsyncClient() as client:
        # Create all tasks
        tasks = [
            make_request(client, code, i+1) 
            for i, code in enumerate(test_data)
        ]
        
        print(f"Starting {num_requests} concurrent requests...")
        print()
        
        # Execute all requests concurrently
        results = await asyncio.gather(*tasks)
    
    overall_elapsed = time.time() - overall_start
    
    # Sort by request number for display
    results.sort(key=lambda x: x[0])
    
    # Display results
    print("INDIVIDUAL REQUEST RESULTS:")
    print("-" * 80)
    print(f"{'Req #':<8} {'Time (s)':<12} {'Status':<12} {'Result'}")
    print("-" * 80)
    
    successful = 0
    failed = 0
    times = []
    
    for req_num, elapsed, data in results:
        if "error" in data:
            status = "FAILED"
            result = data.get("error", "Unknown error")[:50]
            failed += 1
        elif data.get("success"):
            status = "SUCCESS"
            result_data = data.get("result", {})
            result = f"Time: {result_data.get('time', 'N/A')}, Space: {result_data.get('space', 'N/A')}"
            successful += 1
            times.append(elapsed)
        else:
            status = "ERROR"
            result = data.get("error", "Unknown")[:50]
            failed += 1
        
        print(f"{req_num:<8} {elapsed:<12.3f} {status:<12} {result}")
    
    # Statistics
    print()
    print("=" * 80)
    print("STATISTICS")
    print("=" * 80)
    print(f"Total requests:        {num_requests}")
    print(f"Successful:            {successful}")
    print(f"Failed:                {failed}")
    print(f"Total time:            {overall_elapsed:.3f}s")
    print(f"Requests per second:   {num_requests / overall_elapsed:.2f}")
    print()
    
    if times:
        print("Response Time Statistics:")
        print(f"  Minimum:   {min(times):.3f}s")
        print(f"  Maximum:   {max(times):.3f}s")
        print(f"  Average:   {sum(times)/len(times):.3f}s")
        print(f"  Median:    {sorted(times)[len(times)//2]:.3f}s")
    
    print("=" * 80)


if __name__ == "__main__":
    print("\n🚀 Starting concurrent request test...\n")
    
    try:
        asyncio.run(run_concurrent_test(20))
    except KeyboardInterrupt:
        print("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Test failed: {e}")
