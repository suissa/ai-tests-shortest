import { AIProvider } from "./ai";

export interface ShortestConfig {
  headless: boolean;
  baseUrl: string;
  testPattern: string;
  ai?: {
    provider?: AIProvider;
    apiKey?: string;
    model?: string;
    baseURL?: string;
  };
  /** @deprecated Use ai.apiKey with ai.provider = "anthropic" instead. */
  anthropicKey?: string;
  mailosaur?: {
    apiKey?: string;
    serverId?: string;
  };
}
