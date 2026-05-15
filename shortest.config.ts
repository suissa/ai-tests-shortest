import type { ShortestConfig } from "@antiwork/shortest";

export default {
  headless: false,
  baseUrl: "http://localhost:3000",
  testPattern: "app/**/*.test.ts", // Don't test example tests
  ai: {
    provider: "openai-compatible",
    apiKey: process.env.SHORTEST_AI_API_KEY || process.env.OPENAI_API_KEY,
    model: process.env.SHORTEST_AI_MODEL || "gpt-4o",
    baseURL: process.env.SHORTEST_AI_BASE_URL,
  },
  mailosaur: {
    apiKey: process.env.MAILOSAUR_API_KEY,
    serverId: process.env.MAILOSAUR_SERVER_ID,
  },
} satisfies ShortestConfig;
