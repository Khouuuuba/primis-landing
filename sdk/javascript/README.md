# @primis/sdk

Official JavaScript/TypeScript SDK for **Primis Protocol** - the AI Compute Platform.

## Installation

```bash
npm install @primis/sdk
# or
yarn add @primis/sdk
# or
pnpm add @primis/sdk
```

## Quick Start

```typescript
import { Primis } from '@primis/sdk';

const primis = new Primis({
  apiKey: 'prmis_your_api_key_here'
});

// Generate an image
const job = await primis.images.generate({
  prompt: 'A futuristic cityscape at sunset, cyberpunk style'
});

// Wait for completion
const result = await primis.images.waitForJob(job.id);
console.log('Generated images:', result.images);
```

## Features

- 🔐 **Secure Authentication** - API key-based auth with Bearer tokens
- 📝 **Full TypeScript Support** - Complete type definitions for IDE autocomplete
- 🖼️ **Image Generation** - Generate images with SDXL
- 💬 **Text Generation** - Generate text with Llama models
- 🖥️ **GPU Instances** - Launch and manage dedicated GPU instances
- 📁 **File Storage** - Upload and manage files (10GB per user)
- ⚡ **Rate Limiting** - Built-in rate limit handling

## API Reference

### Images

```typescript
// Estimate cost before generating
const estimate = await primis.images.estimate({
  prompt: 'A beautiful landscape',
  numImages: 4
});
console.log(`Estimated cost: $${estimate.estimatedCost}`);

// Generate images
const job = await primis.images.generate({
  prompt: 'A serene mountain lake at dawn',
  negativePrompt: 'blurry, low quality',
  numImages: 2,
  width: 1024,
  height: 1024,
  steps: 30,
  guidanceScale: 7.5
});

// Wait for completion (polling)
const result = await primis.images.waitForJob(job.id);

// Or check status manually
const status = await primis.images.getJob(job.id);

// List all jobs
const jobs = await primis.images.listJobs();
```

### Text Generation

```typescript
// Generate text with Llama
const response = await primis.text.generate({
  prompt: 'Write a short poem about artificial intelligence',
  maxTokens: 256,
  temperature: 0.8,
  model: 'llama8b' // or 'llama70b'
});

console.log(response.text);
```

### Files

```typescript
// List all files
const { files, storage } = await primis.files.list();
console.log(`Used ${storage.usedGB} GB of ${storage.maxGB} GB`);

// Delete a file
await primis.files.delete('outputs', 'image.png');
```

### GPU Instances

```typescript
// List available GPUs
const gpus = await primis.instances.getGpuTypes();

// Launch an instance
const instance = await primis.instances.launch({
  gpuType: 'RTX 4090',
  name: 'my-training-instance'
});

// List your instances
const instances = await primis.instances.list();

// Stop/terminate
await primis.instances.stop(instance.id);
await primis.instances.terminate(instance.id);
```

## Error Handling

```typescript
import { Primis, PrimisError } from '@primis/sdk';

try {
  const result = await primis.images.generate({ prompt: 'test' });
} catch (error) {
  if (error instanceof PrimisError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    console.error(`HTTP Status: ${error.status}`);
  }
}
```

## Configuration

```typescript
const primis = new Primis({
  apiKey: 'prmis_xxx',           // Required
  baseUrl: 'https://api.primis.ai', // Optional (default: production)
  timeout: 60000,                // Optional (default: 30000ms)
});
```

## Rate Limits

The SDK automatically includes rate limit headers in responses:
- `X-RateLimit-Limit`: Max requests per minute
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Seconds until reset

## License

MIT
