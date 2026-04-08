export const AVAILABLE_MODELS: Record<string, { hfRepo: string; memoryMb: number }> = {
  'qwen3.5-35b-a3b': {
    hfRepo: 'mlx-community/Qwen3.5-35B-A3B-4bit',
    memoryMb: 18000,
  },
  'gemma-4-26b-a4b': {
    hfRepo: 'mlx-community/gemma-4-26b-a4b-it-4bit',
    memoryMb: 9600,
  },
}

export class ModelManager {
  private currentModel: string | null = null
  private loading: boolean = false
  private readonly backendUrl: string

  constructor(backendUrl: string = 'http://localhost:8080') {
    this.backendUrl = backendUrl
  }

  getCurrentModel(): string | null {
    return this.currentModel
  }

  isLoading(): boolean {
    return this.loading
  }

  async loadModel(modelId: string): Promise<void> {
    if (!(modelId in AVAILABLE_MODELS)) {
      throw new Error(`Unknown model: ${modelId}. Available: ${Object.keys(AVAILABLE_MODELS).join(', ')}`)
    }

    // No-op if same model already loaded
    if (this.currentModel === modelId) {
      return
    }

    if (this.loading) {
      throw new Error('Another model is currently being loaded. Please wait.')
    }

    this.loading = true

    try {
      // If a different model is loaded, unload it first
      if (this.currentModel !== null) {
        await fetch(`${this.backendUrl}/v1/models/unload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.currentModel }),
        })
      }

      // Load the requested model
      const modelInfo = AVAILABLE_MODELS[modelId]
      await fetch(`${this.backendUrl}/v1/models/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelInfo.hfRepo,
        }),
      })

      this.currentModel = modelId
    } finally {
      this.loading = false
    }
  }

  getStatus(): {
    models: Array<{ id: string; status: string; memoryMb: number }>
    gpuMemoryTotalMb: number
    gpuMemoryUsedMb: number
  } {
    const models = Object.entries(AVAILABLE_MODELS).map(([id, info]) => ({
      id,
      status: id === this.currentModel ? 'loaded' : 'available',
      memoryMb: info.memoryMb,
    }))

    const gpuMemoryUsedMb = this.currentModel
      ? AVAILABLE_MODELS[this.currentModel].memoryMb
      : 0

    return {
      models,
      gpuMemoryTotalMb: 24576,
      gpuMemoryUsedMb,
    }
  }
}
