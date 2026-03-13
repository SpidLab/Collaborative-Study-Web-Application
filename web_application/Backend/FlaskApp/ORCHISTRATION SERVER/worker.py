import os
import json
import time
import sys
import requests

def send_completion_callback(pod_name, login_token, status, results=None):
    """Send callback to orchestrator when work is complete"""
    callback_url = os.environ.get('CALLBACK_URL')
    if not callback_url:
        print("Warning: No CALLBACK_URL set, cannot notify orchestrator")
        return
    
    payload = {
        'podName': pod_name,
        'loginToken': login_token,
        'status': status,
        'results': results or {}
    }
    
    try:
        print(f"Sending completion callback to {callback_url}")
        response = requests.post(callback_url, json=payload, timeout=5)
        print(f"Callback response: {response.status_code}")
    except Exception as e:
        print(f"Failed to send callback: {e}")

def main():
    print("=" * 60)
    print("--- Worker Container Started ---")
    print("=" * 60)
    
    # Get environment variables
    pod_name = os.environ.get('POD_NAME', 'unknown')
    login_token = os.environ.get('LOGIN_TOKEN')
    raw_data = os.environ.get('PAYLOAD_DATA')
    
    print(f"Pod Name: {pod_name}")
    print(f"Login Token: {login_token[:20]}..." if login_token else "No token")
    
    # Validate payload
    if not raw_data:
        print("Error: No payload received from Orchestrator.")
        send_completion_callback(pod_name, login_token, 'failed')
        sys.exit(1)

    try:
        metadata = json.loads(raw_data)
        print(f"Metadata Received: {len(metadata)} items")
        print(json.dumps(metadata, indent=2))
    except json.JSONDecodeError:
        print("Error: Malformed JSON payload")
        send_completion_callback(pod_name, login_token, 'failed')
        sys.exit(1)

    # Process metadata (simulate work)
    print("\n" + "=" * 60)
    print("Processing Metadata:")
    print("=" * 60)
    
    results = {}
    for item in metadata:
        print(f"\n-> Processing: {item}")
        # Simulate different processing based on metadata
        time.sleep(2)  # Simulate work
        results[item.get('key', 'unknown')] = 'processed'
    
    print("\n" + "=" * 60)
    print("--- Job Complete ---")
    print("=" * 60)
    print(f"Results: {results}")
    
    # Send completion callback
    send_completion_callback(pod_name, login_token, 'success', results)
    
    print("Callback sent. Waiting for orchestrator to terminate container...")
    time.sleep(5)  # Give time for callback to be processed

if __name__ == "__main__":
    main()