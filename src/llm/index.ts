import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LLMConfig, Logger } from "../types.js";

/**
 * Environment variable names for API keys
 */
const API_KEY_ENV_VARS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "google-genai": "GOOGLE_API_KEY",
};

/**
 * Get API key from config or environment
 */
function getApiKey(config: LLMConfig): string {
  if (config.apiKey) {
    return config.apiKey;
  }

  const envVar = API_KEY_ENV_VARS[config.provider];
  const envKey = process.env[envVar];

  if (!envKey) {
    throw new Error(
      `No API key provided for ${config.provider}. ` + `Set ${envVar} environment variable or provide apiKey in config.`
    );
  }

  return envKey;
}

/**
 * Create an OpenAI chat model instance
 */
function createOpenAIModel(config: LLMConfig): BaseChatModel {
  const apiKey = getApiKey(config);

  return new ChatOpenAI({
    modelName: config.model,
    openAIApiKey: apiKey,
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });
}

/**
 * Create an Anthropic chat model instance
 */
function createAnthropicModel(config: LLMConfig): BaseChatModel {
  const apiKey = getApiKey(config);

  return new ChatAnthropic({
    modelName: config.model,
    anthropicApiKey: apiKey,
    temperature: config.temperature ?? 0.3,
    maxTokens: config.maxTokens ?? 4096,
  });
}

/**
 * Create a Google Generative AI chat model instance
 */
function createGoogleModel(config: LLMConfig): BaseChatModel {
  const apiKey = getApiKey(config);

  return new ChatGoogleGenerativeAI({
    modelName: config.model,
    apiKey: apiKey,
    temperature: config.temperature ?? 0.3,
    maxOutputTokens: config.maxTokens,
  });
}

/**
 * Factory function to create the appropriate LLM model based on provider
 */
export function createLLMModel(config: LLMConfig, logger?: Logger): BaseChatModel {
  logger?.debug(`Creating LLM model: ${config.provider}/${config.model}`);

  switch (config.provider) {
    case "openai":
      return createOpenAIModel(config);
    case "anthropic":
      return createAnthropicModel(config);
    case "google-genai":
      return createGoogleModel(config);
    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

/**
 * LLM Service for generating documentation
 */
export class LLMService {
  private model: BaseChatModel;
  private logger?: Logger;

  constructor(config: LLMConfig, logger?: Logger) {
    this.model = createLLMModel(config, logger);
    this.logger = logger;
  }

  /**
   * Generate documentation from source files
   */
  async generateDocumentation(systemPrompt: string, filesContent: string, existingDocs?: string): Promise<string> {
    this.logger?.debug("Generating documentation with LLM...");

    const messages = [new SystemMessage(systemPrompt)];

    let userContent = `Here are the source files to document:\n\n${filesContent}`;

    if (existingDocs) {
      userContent += `\n\n---\n\nHere is the existing documentation to update:\n\n${existingDocs}`;
    }

    messages.push(new HumanMessage(userContent));

    try {
      const response = await this.model.invoke(messages);
      const content = response.content;

      if (typeof content === "string") {
        return content;
      }

      // Handle complex content types (array of content blocks)
      if (Array.isArray(content)) {
        return content
          .map((block) => {
            if (typeof block === "string") return block;
            if ("text" in block) return block.text;
            return "";
          })
          .join("");
      }

      throw new Error("Unexpected response format from LLM");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LLM generation failed: ${message}`);
    }
  }

  /**
   * Generate README content
   */
  async generateReadme(
    systemPrompt: string,
    filesContent: string,
    projectName: string,
    existingReadme?: string
  ): Promise<string> {
    const readmePrompt = `${systemPrompt}

Generate a comprehensive README.md for the project "${projectName}". Include:
- Project title and description
- Installation instructions
- Usage examples
- API overview (brief)
- Contributing guidelines
- License information

${
  existingReadme
    ? "Update the existing README while preserving any custom sections the user may have added."
    : "Create a new README from scratch."
}`;

    return this.generateDocumentation(readmePrompt, filesContent, existingReadme);
  }

  /**
   * Generate API reference documentation
   */
  async generateApiReference(systemPrompt: string, filesContent: string, existingDocs?: string): Promise<string> {
    const apiPrompt = `${systemPrompt}

Generate detailed API reference documentation in markdown format. Include:
- All exported functions, classes, interfaces, and types
- Parameter descriptions with types
- Return value descriptions
- Code examples for each export
- Group related items together logically`;

    return this.generateDocumentation(apiPrompt, filesContent, existingDocs);
  }
}

/**
 * Create an LLM service instance
 */
export function createLLMService(config: LLMConfig, logger?: Logger): LLMService {
  return new LLMService(config, logger);
}
