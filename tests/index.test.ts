import { describe, it, expect } from "vitest";
import { validateConfig, defaultConfig } from "../src/config/schema.js";

describe("llmdoc", () => {
  describe("config validation", () => {
    it("should validate a minimal valid config", () => {
      const config = {
        llm: {
          provider: "openai" as const,
          model: "gpt-4o",
        },
      };

      const validated = validateConfig(config);

      expect(validated.llm.provider).toBe("openai");
      expect(validated.llm.model).toBe("gpt-4o");
      expect(validated.include).toEqual(defaultConfig.include);
      expect(validated.exclude).toEqual(defaultConfig.exclude);
    });

    it("should validate config with subfolders", () => {
      const config = {
        llm: {
          provider: "anthropic" as const,
          model: "claude-3-opus-20240229",
        },
        subfolders: [
          {
            path: "src/api",
            prompt: "Custom API docs prompt",
          },
        ],
      };

      const validated = validateConfig(config);

      expect(validated.subfolders).toHaveLength(1);
      expect(validated.subfolders![0].path).toBe("src/api");
    });

    it("should reject invalid provider", () => {
      const config = {
        llm: {
          provider: "invalid-provider",
          model: "some-model",
        },
      };

      expect(() => validateConfig(config)).toThrow();
    });

    it("should apply default values", () => {
      const config = {
        llm: {
          provider: "google-genai" as const,
          model: "gemini-pro",
        },
      };

      const validated = validateConfig(config);

      expect(validated.outputDir).toBe("docs/");
      expect(validated.include).toContain("**/*.ts");
      expect(validated.exclude).toContain("node_modules/**");
      expect(validated.prompt).toBeDefined();
    });
  });
});
