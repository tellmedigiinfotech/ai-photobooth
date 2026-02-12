#!/usr/bin/env python3
"""
Quick test to verify the fix - test with a small base64 data URL
"""

import requests
import time
import json

API_KEY = "7adc5393c02801b98cba0adbb9e19193"
CREATE_TASK_URL = "https://api.kie.ai/api/v1/jobs/createTask"
QUERY_TASK_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

# Small 1x1 red pixel as base64 data URL for testing
test_image_data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

print("Testing with base64 data URL...")
print("=" * 60)

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": "nano-banana-pro",
    "input": {
        "prompt": "A beautiful red rose",
        "image_input": [test_image_data_url],
        "aspect_ratio": "1:1",
        "resolution": "1K",
        "output_format": "jpg"
    }
}

print("Creating task with data URL...")
response = requests.post(CREATE_TASK_URL, headers=headers, json=payload)
print(f"Status: {response.status_code}")
result = response.json()
print(f"Response: {json.dumps(result, indent=2)}")

if result.get("code") == 200:
    print("\n✅ Data URL accepted! The fix should work.")
    task_id = result["data"]["taskId"]
    print(f"Task ID: {task_id}")
    
    # Poll a few times to confirm it's processing
    print("\nPolling status...")
    for i in range(3):
        time.sleep(2)
        status_response = requests.get(QUERY_TASK_URL, headers=headers, params={"taskId": task_id})
        status = status_response.json()
        print(f"Attempt {i+1}: {status['data']['state']}")
    
    print("\n✅ Fix verified! The photobooth should work now.")
else:
    print(f"\n❌ Error: {result.get('msg')}")
