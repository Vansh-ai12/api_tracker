import { ProviderAdapter } from "./types";
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GeminiAdapter } from "./gemini";

/**
 * Provider registry
 * Maps provider identifiers to their adapters
 */
class ProviderRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new AnthropicAdapter());
    this.register(new GeminiAdapter());
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): ProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  has(provider: string): boolean {
    return this.adapters.has(provider);
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();
