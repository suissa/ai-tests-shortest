import Anthropic from "@anthropic-ai/sdk";
import pc from "picocolors";
import { BashTool } from "../browser/core/bash-tool";
import { BrowserTool } from "../browser/core/browser-tool";
import { ToolResult } from "../types";
import { AIConfig, RequestBash, RequestComputer } from "../types/ai";
import { CacheAction, CacheStep } from "../types/cache";
import { SYSTEM_PROMPT } from "./prompts";
import { AITools, OpenAITools } from "./tools";

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: any;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ToolRequest = {
  id: string;
  name: string;
  input: any;
};

export class AIClient {
  private client?: Anthropic;
  private provider: AIConfig["provider"];
  private apiKey: string;
  private baseURL?: string;
  private model: string;
  private maxMessages: number;
  private debugMode: boolean;

  constructor(config: AIConfig, debugMode: boolean = false) {
    this.provider = config.provider || "anthropic";
    this.apiKey = config.apiKey;

    if (!this.apiKey) {
      throw new Error(
        "AI API key is required. Set ai.apiKey in shortest.config.ts or use SHORTEST_AI_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY",
      );
    }

    if (this.provider === "anthropic") {
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });
      this.model = config.model || "claude-3-5-sonnet-20241022";
    } else {
      this.model = config.model || "gpt-4o";
      this.baseURL = (config.baseURL || "https://api.openai.com/v1").replace(
        /\/$/,
        "",
      );
    }

    this.maxMessages = config.maxMessages || 10;
    this.debugMode = debugMode;
  }

  async processAction(
    prompt: string,
    browserTool: BrowserTool,
    outputCallback?: (content: any) => void,
    toolOutputCallback?: (name: string, input: any) => void,
  ): Promise<{
    finalResponse: any;
    tokenUsage: { input: number; output: number };
    pendingCache: any;
  }> {
    const maxRetries = 3;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        return await this.makeRequest(
          prompt,
          browserTool,
          outputCallback,
          toolOutputCallback,
        );
      } catch (error: any) {
        attempts++;
        if (attempts === maxRetries) throw error;

        console.log(`  Retry attempt ${attempts}/${maxRetries}`);
        await new Promise((r) => setTimeout(r, 5000 * attempts));
      }
    }
    return {
      finalResponse: null,
      tokenUsage: { input: 0, output: 0 },
      pendingCache: null,
    };
  }

  async makeRequest(
    prompt: string,
    browserTool: BrowserTool,
    outputCallback?: (content: any) => void,
    toolOutputCallback?: (name: string, input: any) => void,
  ): Promise<{
    messages: any;
    finalResponse: any;
    pendingCache: any;
    tokenUsage: { input: number; output: number };
  }> {
    if (this.provider === "anthropic") {
      return this.makeAnthropicRequest(
        prompt,
        browserTool,
        outputCallback,
        toolOutputCallback,
      );
    }

    return this.makeOpenAICompatibleRequest(
      prompt,
      browserTool,
      outputCallback,
      toolOutputCallback,
    );
  }

  private async makeAnthropicRequest(
    prompt: string,
    browserTool: BrowserTool,
    _outputCallback?: (content: any) => void,
    toolOutputCallback?: (name: string, input: any) => void,
  ): Promise<{
    messages: any;
    finalResponse: any;
    pendingCache: any;
    tokenUsage: { input: number; output: number };
  }> {
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
    const pendingCache: Partial<{ steps?: CacheStep[] }> = {};

    if (this.debugMode) {
      console.log(pc.cyan("\n🤖 Prompt:"), pc.dim(prompt));
    }

    messages.push({
      role: "user",
      content: prompt,
    });

    while (true) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const response = await this.client!.beta.messages.create({
          model: this.model,
          max_tokens: 1024,
          messages,
          system: SYSTEM_PROMPT,
          tools: [...AITools],
          betas: ["computer-use-2024-10-22"],
        });

        const tokenUsage = {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        };

        if (this.debugMode) {
          response.content.forEach((block) => {
            if (block.type === "text") {
              console.log(pc.green("\n🤖 AI:"), pc.dim((block as any).text));
            } else if (block.type === "tool_use") {
              const toolBlock =
                block as Anthropic.Beta.Messages.BetaToolUseBlock;

              console.log(pc.yellow("\n🔧 Tool Request:"), {
                tool: toolBlock.name,
                input: toolBlock.input,
              });
            }
          });
        }

        messages.push({
          role: "assistant",
          content: response.content,
        });

        const toolRequests = response.content.filter(
          (block) => block.type === "tool_use",
        ) as Anthropic.Beta.Messages.BetaToolUseBlock[];

        if (toolRequests.length > 0) {
          const toolResults = await Promise.all(
            toolRequests.map(async (toolRequest) => {
              const toolResult = await this.executeToolRequest(
                toolRequest as ToolRequest,
                browserTool,
                pendingCache,
              );
              toolOutputCallback?.(toolRequest.name, toolRequest.input);
              return { toolRequest, toolResult };
            }),
          );

          toolResults.forEach((result) => {
            const { toolRequest, toolResult } = result;

            messages.push({
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolRequest.id,
                  content:
                    toolRequest.name !== "bash" &&
                    (toolResult as ToolResult).base64_image
                      ? [
                          {
                            type: "image" as const,
                            source: {
                              type: "base64" as const,
                              media_type: "image/jpeg" as const,
                              data: (toolResult as ToolResult).base64_image!,
                            },
                          },
                        ]
                      : [
                          {
                            type: "text" as const,
                            text:
                              toolRequest.name === "bash"
                                ? JSON.stringify(toolResult)
                                : (toolResult as ToolResult).output || "",
                          },
                        ],
                },
              ],
            });
          });
        } else {
          return {
            messages,
            finalResponse: response,
            pendingCache,
            tokenUsage,
          };
        }
      } catch (error: any) {
        if (error.message?.includes("rate_limit")) {
          console.log("⏳ Rate limited, waiting 60s...");
          await new Promise((resolve) => setTimeout(resolve, 60000));
          continue;
        }
        throw error;
      }
    }
  }

  private async makeOpenAICompatibleRequest(
    prompt: string,
    browserTool: BrowserTool,
    _outputCallback?: (content: any) => void,
    toolOutputCallback?: (name: string, input: any) => void,
  ): Promise<{
    messages: any;
    finalResponse: any;
    pendingCache: any;
    tokenUsage: { input: number; output: number };
  }> {
    const messages: OpenAIMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];
    const pendingCache: Partial<{ steps?: CacheStep[] }> = {};
    let tokenUsage = { input: 0, output: 0 };

    if (this.debugMode) {
      console.log(pc.cyan("\n🤖 Prompt:"), pc.dim(prompt));
    }

    for (let i = 0; i < this.maxMessages; i++) {
      const response = await this.createOpenAIChatCompletion(messages);
      const choice = response.choices?.[0]?.message;

      tokenUsage = {
        input: tokenUsage.input + (response.usage?.prompt_tokens || 0),
        output: tokenUsage.output + (response.usage?.completion_tokens || 0),
      };

      if (!choice) {
        throw new Error("AI provider returned no message");
      }

      if (this.debugMode && choice.content) {
        console.log(pc.green("\n🤖 AI:"), pc.dim(choice.content));
      }

      messages.push(choice);

      const toolCalls = choice.tool_calls || [];
      if (toolCalls.length === 0) {
        return {
          messages,
          finalResponse: {
            content: [{ type: "text", text: choice.content || "" }],
            raw: response,
          },
          pendingCache,
          tokenUsage,
        };
      }

      for (const toolCall of toolCalls) {
        const toolRequest = this.openAIToolCallToRequest(toolCall);

        if (this.debugMode) {
          console.log(pc.yellow("\n🔧 Tool Request:"), {
            tool: toolRequest.name,
            input: toolRequest.input,
          });
        }

        const toolResult = await this.executeToolRequest(
          toolRequest,
          browserTool,
          pendingCache,
        );
        toolOutputCallback?.(toolRequest.name, toolRequest.input);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            output: toolResult.output,
            error: toolResult.error,
            metadata: toolResult.metadata,
          }),
        });

        if (toolResult.base64_image) {
          messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: "Screenshot returned by the previous browser tool call.",
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${toolResult.base64_image}`,
                },
              },
            ],
          });
        }
      }
    }

    throw new Error(
      `AI provider exceeded the maximum of ${this.maxMessages} tool iterations`,
    );
  }

  private async createOpenAIChatCompletion(messages: OpenAIMessage[]) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        tools: OpenAITools,
        tool_choice: "auto",
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `AI provider request failed with ${response.status}: ${body}`,
      );
    }

    return response.json() as Promise<any>;
  }

  private openAIToolCallToRequest(toolCall: OpenAIToolCall): ToolRequest {
    const args = toolCall.function.arguments
      ? JSON.parse(toolCall.function.arguments)
      : {};
    const name = toolCall.function.name;

    if (name === "computer" || name === "bash") {
      return { id: toolCall.id, name, input: args };
    }

    return {
      id: toolCall.id,
      name,
      input: {
        ...args,
        action: args.action || name,
      },
    };
  }

  private async executeToolRequest(
    toolRequest: ToolRequest,
    browserTool: BrowserTool,
    pendingCache: Partial<{ steps?: CacheStep[] }>,
  ): Promise<ToolResult> {
    switch (toolRequest.name) {
      case "bash":
        try {
          const result = await new BashTool().execute(
            (toolRequest as RequestBash).input.command,
          );
          return typeof result === "string" ? { output: result } : result;
        } catch (error) {
          console.error("Error executing bash command:", error);
          throw error;
        }
      default:
        try {
          const toolInput =
            toolRequest.name === "computer"
              ? (toolRequest as RequestComputer).input
              : { ...toolRequest.input, action: toolRequest.name };
          const toolResult = await browserTool.execute(toolInput);

          let extras: any = {};
          if ((toolInput as any).coordinate || (toolInput as any).coordinates) {
            const [x, y] =
              (toolInput as any).coordinate || (toolInput as any).coordinates;
            const componentStr =
              await browserTool.getNormalizedComponentStringByCoords(x, y);
            extras = { componentStr };
          }

          pendingCache.steps = [
            ...(pendingCache.steps || []),
            {
              action: toolRequest as unknown as CacheAction,
              reasoning: toolResult.output || "",
              result: toolResult.output || null,
              extras,
              timestamp: Date.now(),
            },
          ];

          return toolResult;
        } catch (error) {
          console.error("Error executing browser tool:", error);
          throw error;
        }
    }
  }
}
