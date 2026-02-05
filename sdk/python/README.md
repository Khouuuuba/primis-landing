# primis-sdk

Official Python SDK for **Primis Protocol** - the AI Compute Platform.

## Installation

```bash
pip install primis-sdk
```

## Quick Start

```python
from primis import Primis

client = Primis(api_key="prmis_your_api_key_here")

# Generate an image
job = client.images.generate(prompt="A futuristic cityscape at sunset")

# Wait for completion
result = client.images.wait_for_job(job["id"])
print("Generated images:", result["images"])
```

## Features

- 🔐 **Secure Authentication** - API key-based auth with Bearer tokens
- 🐍 **Pythonic API** - Clean, intuitive interface
- 🖼️ **Image Generation** - Generate images with SDXL
- 💬 **Text Generation** - Generate text with Llama models
- 🖥️ **GPU Instances** - Launch and manage dedicated GPU instances
- 📁 **File Storage** - Upload and manage files (10GB per user)
- ⚡ **Rate Limiting** - Automatic rate limit handling

## API Reference

### Images

```python
# Estimate cost before generating
estimate = client.images.estimate(
    prompt="A beautiful landscape",
    num_images=4
)
print(f"Estimated cost: ${estimate['estimatedCost']}")

# Generate images
job = client.images.generate(
    prompt="A serene mountain lake at dawn",
    negative_prompt="blurry, low quality",
    num_images=2,
    width=1024,
    height=1024,
    steps=30,
    guidance_scale=7.5
)

# Wait for completion (polling)
result = client.images.wait_for_job(job["id"])
print(result["images"])

# Or check status manually
status = client.images.get_job(job["id"])

# List all jobs
jobs = client.images.list_jobs()
```

### Text Generation

```python
# Generate text with Llama
response = client.text.generate(
    prompt="Write a short poem about artificial intelligence",
    max_tokens=256,
    temperature=0.8,
    model="llama8b"  # or "llama70b"
)

print(response["result"])
```

### Files

```python
# List all files
result = client.files.list()
print(f"Used {result['storage']['usedGB']} GB of {result['storage']['maxGB']} GB")

for file in result["files"]:
    print(f"  - {file['name']} ({file['size']} bytes)")

# Delete a file
client.files.delete("outputs", "image.png")
```

### GPU Instances

```python
# List available GPUs
gpus = client.instances.get_gpu_types()
for gpu in gpus:
    print(f"{gpu['name']}: ${gpu['pricePerHour']}/hr")

# Launch an instance
instance = client.instances.launch(
    gpu_type="RTX 4090",
    name="my-training-instance"
)
print(f"SSH: {instance['sshHost']}:{instance['sshPort']}")

# List your instances
instances = client.instances.list()

# Stop/terminate
client.instances.stop(instance["id"])
client.instances.terminate(instance["id"])
```

## Error Handling

```python
from primis import Primis, PrimisError, PrimisAPIError, PrimisTimeoutError

try:
    result = client.images.generate(prompt="test")
except PrimisAPIError as e:
    print(f"API Error [{e.code}]: {e.message}")
    print(f"HTTP Status: {e.status_code}")
except PrimisTimeoutError as e:
    print("Request timed out")
except PrimisError as e:
    print(f"Error: {e.message}")
```

## Configuration

```python
client = Primis(
    api_key="prmis_xxx",           # Required
    base_url="https://api.primis.ai",  # Optional (default: production)
    timeout=60,                    # Optional (default: 30 seconds)
)
```

## Rate Limits

The SDK automatically handles rate limiting:
- Default: 100 requests per minute
- 429 responses include `Retry-After` header
- `PrimisRateLimitError` includes `retry_after` attribute

## Requirements

- Python 3.8+
- requests >= 2.28.0

## License

MIT
