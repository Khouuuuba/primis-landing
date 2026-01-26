/**
 * Provider Module
 * 
 * Unified interface for all GPU and serverless providers.
 * 
 * Usage:
 *   import providers from './providers/index.js'
 *   
 *   // Get all GPU offerings from all providers
 *   const gpus = await providers.getAllGPUOfferings()
 *   
 *   // Find cheapest GPU with 24GB VRAM
 *   const recommendations = await providers.findBestGPU({ minVram: 24 })
 *   
 *   // Launch instance
 *   const instance = await providers.launchInstance({ name: 'my-gpu', gpuOfferingId: 'runpod-rtx-4090' })
 *   
 *   // Generate text
 *   const result = await providers.generateText('runpod-llama-3-8b', { prompt: 'Hello!' })
 */

// Re-export everything from registry
export * from './registry.js'
export { default } from './registry.js'

// Export types and constants
export * from './types.js'

// Export individual providers for direct access
export { default as RunPodInstanceProvider } from './runpod-instances.js'
export { default as RunPodServerlessProvider } from './runpod-serverless.js'
export { default as TogetherAiProvider } from './together-provider.js'
export { default as VastAiProvider } from './vastai-provider.js'
export { default as LambdaProvider } from './lambda-provider.js'
