#!/usr/bin/env python3
"""
Test script for Nano Banana Pro API
Tests the complete workflow: create task -> poll status -> get result
"""

import requests
import time
import json
import base64

# Configuration
API_KEY = "32842f8220c424693c46d5c393c41310"
CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
QUERY_TASK_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

def create_task(prompt, image_urls=None, aspect_ratio="1:1", resolution="1K"):
    """Create a new generation task"""
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": prompt,
            "image_input": image_urls or [],
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "output_format": "jpg"
        }
    }
    
    print("=" * 60)
    print("CREATING TASK")
    print("=" * 60)
    print(f"Prompt: {prompt}")
    print(f"Image URLs: {image_urls}")
    print(f"Aspect Ratio: {aspect_ratio}")
    print(f"Resolution: {resolution}")
    print()
    
    response = requests.post(CREATE_TASK_URL, headers=headers, json=payload)
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    print()
    
    return response.json()

def query_task(task_id):
    """Query task status"""
    headers = {
        "Authorization": f"Bearer {API_KEY}"
    }
    
    params = {"taskId": task_id}
    response = requests.get(QUERY_TASK_URL, headers=headers, params=params)
    
    return response.json()

def poll_until_complete(task_id, max_attempts=60, interval=2):
    """Poll task until completion"""
    print("=" * 60)
    print("POLLING TASK STATUS")
    print("=" * 60)
    print(f"Task ID: {task_id}")
    print()
    
    for i in range(max_attempts):
        result = query_task(task_id)
        state = result.get("data", {}).get("state", "unknown")
        
        print(f"Attempt {i+1}/{max_attempts} - Status: {state}")
        
        if state == "success":
            print()
            print("=" * 60)
            print("TASK COMPLETED SUCCESSFULLY!")
            print("=" * 60)
            print(f"Full Response: {json.dumps(result, indent=2)}")
            print()
            
            # Extract result URL
            result_json = json.loads(result["data"]["resultJson"])
            image_url = result_json["resultUrls"][0]
            print(f"Generated Image URL: {image_url}")
            print(f"Cost Time: {result['data'].get('costTime', 'N/A')} ms")
            print()
            
            return result
        elif state == "fail":
            print()
            print("=" * 60)
            print("TASK FAILED!")
            print("=" * 60)
            print(f"Fail Code: {result['data'].get('failCode')}")
            print(f"Fail Message: {result['data'].get('failMsg')}")
            print()
            raise Exception(f"Task failed: {result['data'].get('failMsg')}")
        
        time.sleep(interval)
    
    raise Exception("Task timeout - maximum polling attempts reached")

def test_text_only():
    """Test with text prompt only (no images)"""
    print("\n" + "=" * 60)
    print("TEST 1: TEXT-ONLY GENERATION")
    print("=" * 60 + "\n")
    
    prompt = "A beautiful sunset over mountains, vibrant colors, professional photography, 4K quality"
    
    # Create task
    create_response = create_task(prompt, image_urls=[], resolution="1K")
    
    if create_response.get("code") != 200:
        print(f"❌ Failed to create task: {create_response.get('msg')}")
        return False
    
    task_id = create_response["data"]["taskId"]
    
    # Poll until complete
    try:
        result = poll_until_complete(task_id)
        print("✅ Text-only generation test PASSED")
        return True
    except Exception as e:
        print(f"❌ Text-only generation test FAILED: {e}")
        return False

def test_with_image():
    """Test with text prompt and image input"""
    print("\n" + "=" * 60)
    print("TEST 2: TEXT + IMAGE GENERATION")
    print("=" * 60 + "\n")
    
    # Using a publicly accessible test image
    test_image_url = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800"
    
    prompt = "Transform this landscape into a vibrant sunset scene with dramatic clouds, hyper-realistic, professional photography"
    
    # Create task
    create_response = create_task(
        prompt=prompt,
        image_urls=[test_image_url],
        resolution="1K"
    )
    
    if create_response.get("code") != 200:
        print(f"❌ Failed to create task: {create_response.get('msg')}")
        return False
    
    task_id = create_response["data"]["taskId"]
    
    # Poll until complete
    try:
        result = poll_until_complete(task_id)
        print("✅ Text + image generation test PASSED")
        return True
    except Exception as e:
        print(f"❌ Text + image generation test FAILED: {e}")
        return False

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("NANO BANANA PRO API TEST SUITE")
    print("=" * 60)
    print(f"API Key: {API_KEY[:20]}...")
    print()
    
    results = []
    
    # Run tests
    try:
        # Test 1: Text only
        results.append(("Text-only generation", test_text_only()))
        
        # Test 2: Text + Image
        results.append(("Text + Image generation", test_with_image()))
        
    except Exception as e:
        print(f"\n❌ Test suite error: {e}")
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    for test_name, passed in results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name}: {status}")
    print()
    
    total_passed = sum(1 for _, passed in results if passed)
    print(f"Total: {total_passed}/{len(results)} tests passed")
    print()
