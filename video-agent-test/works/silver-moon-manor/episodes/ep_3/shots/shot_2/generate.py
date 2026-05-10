#!/usr/bin/env python3
import json
import requests
import sys
import time

# Read prompt
with open('prompt.md', 'r') as f:
    content = f.read()

# Extract frontmatter and prompt body
lines = content.split('---\n')
prompt_body = lines[2] if len(lines) > 2 else content

# Build payload
payload = {
    "action": "generate",
    "prompt": prompt_body.strip(),
    "duration": 12,
    "ratio": "9:16",
    "resolution": "720P",
    "sourceImageUrl": "https://mob-ai.oss-ap-southeast-1.aliyuncs.com/public/public/image/scene-mopkvgwj-onu4ii.png",
    "referenceImageUrls": [
        "https://mob-ai.oss-ap-southeast-1.aliyuncs.com/public/public/image/costume-mopbjw4c-v9r0ot.png"
    ]
}

# Call API
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer af_JFicP4-5cnkjr82nk33ORPFNkynQUcep"
}

print("Submitting video generation request...")
response = requests.post(
    "https://agent.mob-ai.cn/api/external/video/generate",
    headers=headers,
    json=payload,
    timeout=300
)

print(f"Status: {response.status_code}")
result = response.json()
print(json.dumps(result, indent=2, ensure_ascii=False))

if response.status_code == 200 and 'taskId' in result:
    task_id = result['taskId']
    print(f"\nTask ID: {task_id}")
    print("Polling for completion (max 20 minutes)...")

    # Poll for completion
    max_wait = 1200  # 20 minutes
    interval = 30
    elapsed = 0

    while elapsed < max_wait:
        time.sleep(interval)
        elapsed += interval

        status_response = requests.get(
            f"https://agent.mob-ai.cn/api/external/video/status/{task_id}",
            headers=headers,
            timeout=10
        )

        status_result = status_response.json()
        print(f"[{elapsed}s] Status: {status_result.get('status', 'unknown')}")

        if status_result.get('status') == 'completed':
            print("\n✅ Video generation completed!")
            print(json.dumps(status_result, indent=2, ensure_ascii=False))

            # Save result
            with open('result.json', 'w') as f:
                json.dump(status_result, f, indent=2, ensure_ascii=False)

            sys.exit(0)
        elif status_result.get('status') in ['failed', 'error']:
            print(f"\n❌ Generation failed: {status_result.get('error', 'unknown error')}")
            sys.exit(1)

    print(f"\n⏱️ Timeout after {max_wait}s")
    sys.exit(1)
