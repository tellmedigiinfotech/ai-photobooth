#!/usr/bin/env python3
"""
Test image upload to verify it works
"""

import requests
import base64

# Create a small test image (1x1 red pixel PNG)
test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="

print("Testing freeimage.host upload...")
print("=" * 60)

# Test freeimage.host
try:
    data = {
        'source': test_image_base64,
        'type': 'base64',
        'action': 'upload',
        'timestamp': '1234567890',
        'auth_token': ''
    }
    
    response = requests.post(
        'https://freeimage.host/api/1/upload',
        data=data,
        params={'key': '6d207e02198a847aa98d0a2a901485a5'},
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        result = response.json()
        if result.get('image') and result['image'].get('url'):
            print(f"\n✅ Upload successful!")
            print(f"Image URL: {result['image']['url']}")
        else:
            print(f"\n❌ Upload failed: {result}")
    else:
        print(f"\n❌ HTTP Error: {response.status_code}")
        
except Exception as e:
    print(f"\n❌ Error: {e}")

print("\n" + "=" * 60)
print("Testing imgbb upload...")
print("=" * 60)

# Test imgbb
try:
    data = {
        'image': test_image_base64
    }
    
    response = requests.post(
        'https://api.imgbb.com/1/upload',
        data=data,
        params={'key': 'd2f1a3c8e9b4f7a6d5c3e8b9a7f6d4c2'},
        timeout=30
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text[:500]}")
    
    if response.status_code == 200:
        result = response.json()
        if result.get('data') and result['data'].get('url'):
            print(f"\n✅ Upload successful!")
            print(f"Image URL: {result['data']['url']}")
        else:
            print(f"\n❌ Upload failed: {result}")
    else:
        print(f"\n❌ HTTP Error: {response.status_code}")
        
except Exception as e:
    print(f"\n❌ Error: {e}")
