export const AITools = [
  {
    type: "computer_20241022",
    name: "computer",
    display_width_px: 1920,
    display_height_px: 1080,
    display_number: 1,
  },
  {
    name: "github_login",
    description: "Handle GitHub OAuth login with 2FA",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["github_login"],
          description:
            "The action to perform. It's always equal to 'github_login'",
        },
        username: {
          type: "string",
          description: "GitHub username or email",
        },
        password: {
          type: "string",
          description: "GitHub password",
        },
      },
      required: ["action", "username", "password"],
    },
  },
  {
    name: "check_email",
    description: "View received email in new browser tab",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["check_email"],
          description:
            "Check that the email was received with specified content in a new tab",
        },
      },
      required: ["action", "email"],
    },
  },
  {
    name: "sleep",
    description: "Pause test execution for specified duration",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["sleep"],
          description: "The action to perform",
        },
        duration: {
          type: "number",
          description:
            "Duration to sleep in milliseconds (e.g. 5000 for 5 seconds)",
          minimum: 0,
          maximum: 60000,
        },
      },
      required: ["action", "duration"],
    },
  },
  {
    name: "run_callback",
    description: "Run callback function for current test step",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["run_callback"],
          description: "Execute callback for current step",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "navigate",
    description: "Navigate to URLs in new browser tabs",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["navigate"],
          description: "The action to perform",
        },
        url: {
          type: "string",
          description: "The URL to navigate to",
        },
      },
      required: ["action", "url"],
    },
  },
  {
    type: "bash_20241022",
    name: "bash",
  },
] as const;

export type AITool = (typeof AITools)[number]["name"];

const browserActionSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "mouse_move",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "screenshot",
        "cursor_position",
        "clear_session",
        "type",
        "key",
      ],
      description: "Browser action to perform.",
    },
    coordinates: {
      type: "array",
      items: { type: "number" },
      minItems: 2,
      maxItems: 2,
      description: "x,y screen coordinates for mouse actions.",
    },
    text: {
      type: "string",
      description: "Text to type or keyboard key/shortcut to press.",
    },
  },
  required: ["action"],
  additionalProperties: false,
};

const toOpenAIFunctionTool = (tool: {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description || `Execute ${tool.name}`,
    parameters: tool.input_schema || browserActionSchema,
  },
});

export const OpenAITools = [
  toOpenAIFunctionTool({
    name: "computer",
    description:
      "Interact with the browser using screenshots, mouse, keyboard, and session actions.",
    input_schema: browserActionSchema,
  }),
  ...AITools.filter((tool) => !("type" in tool)).map(toOpenAIFunctionTool),
  toOpenAIFunctionTool({
    name: "bash",
    description: "Execute a bash command.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to execute in bash.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  }),
] as const;
