import os
import requests
import json
import base64

# Configuration
API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
MODEL = "gemini-3-pro-image-preview" # or whatever model you are using

def check_gemini_api():
    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("❌ ERROR: Please replace 'YOUR_API_KEY_HERE' in the script with your actual Gemini API Key.")
        print("   If you don't have one, get it from: https://aistudio.google.com/apikey")
        return

    print("=" * 60)
    print("TESTING GEMINI IMAGE GENERATION API")
    print("=" * 60)
    
    url = f"https://generativelanguage.googleapis.com/v1alpha/models/{MODEL}:generateImages?key={API_KEY}"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "instances": [
            {
                "prompt": "A beautiful sunset over mountains, vibrant colors, professional photography, 4K quality"
            }
        ],
        "parameters": {
            "sampleCount": 1,
            "outputOptions": {
                "mimeType": "image/jpeg"
            }
        }
    }
    
    print(f"Request URL: {url.split('key=')[0]}key=***hidden***")
    print(f"Model ID: {MODEL}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("\nSending request to Gemini... (this might take 10-30 seconds)")
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=60)
        
        print("\n" + "=" * 60)
        print("RESPONSE DETAILS")
        print("=" * 60)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("✅ SUCCESS! The Gemini API is working perfectly.")
            data = response.json()
            # Just print the structure without the huge base64 string
            for img in data.get("generatedImages", []):
                print(f"- Generated image: mimetype={img.get('image', {}).get('mimeType')}, base64 length={len(img.get('image', {}).get('imageBytes', ''))}")
        else:
            print("❌ FAILURE: The API request failed.")
            print("\nError Details:")
            print(json.dumps(response.json(), indent=2))
            
            if response.status_code == 429:
                print("\n💡 DIAGNOSIS: Error 429 means 'Resource Exhausted' or 'Too Many Requests'.")
                print("   If using gemini-3-pro-image-preview, this usually means your Google Cloud project")
                print("   does not have billing enabled. Image generation requires a paid/billing account.")
            elif response.status_code == 400:
                print("\n💡 DIAGNOSIS: Error 400 means 'Bad Request'. Usually the payload structure is wrong or")
                print("   the model does not exist/isn't accessible by your key.")
            elif response.status_code == 403:
                print("\n💡 DIAGNOSIS: Error 403 means 'Forbidden'. API key might be invalid, or the Generative")
                print("   Language API is not enabled in your Google Cloud project.")
    
    except requests.exceptions.Timeout:
        print("\n❌ ERROR: Request timed out. Gemini API took too long to respond.")
    except Exception as e:
        print(f"\n❌ ERROR: An unexpected exception occurred: {str(e)}")

if __name__ == "__main__":
    check_gemini_api()
