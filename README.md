# llmdoc

A CLI tool for automatically generating documentation for TypeScript projects using LLMs.

## Features

- 📂 **Scans TypeScript files** - Recursively indexes all `.ts` and `.tsx` files in your project
- 🤖 **LLM-powered docs** - Generates comprehensive markdown documentation using AI
- ⚙️ **Configurable** - Supports OpenAI, Anthropic, and Google Generative AI via LangChain
- 📁 **Subfolder support** - Break down documentation by folder for better LLM context management
- 🔄 **Update existing docs** - Preserves and updates existing documentation
- 🚀 **CI/CD ready** - Designed to run in automated pipelines

## Installation

```bash
# Using npm
npm install -g llmdoc

# Using bun
bun add -g llmdoc

# Or use directly with npx
npx llmdoc
```

## Quick Start

1. **Initialize a config file:**

```bash
llmdoc init
```

2. **Edit `llmdoc.config.ts`** to configure your LLM provider:

```typescript
import { defineConfig } from 'llmdoc';

export default defineConfig({
  llm: {
    provider: 'openai', // 'openai' | 'anthropic' | 'google-genai'
    model: 'gpt-4o',
    // apiKey: 'your-api-key', // Or use environment variables
  },
});
```

3. **Run documentation generation:**

```bash
llmdoc
```

## Configuration

### Full Config Example

```typescript
import { defineConfig } from 'llmdoc';

export default defineConfig({
  // LLM provider configuration
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0.3,
    maxTokens: 4096,
  },

  // Custom documentation prompt
  prompt: `You are a technical documentation expert. Generate clear, 
comprehensive markdown documentation for the provided TypeScript code.`,

  // File patterns to include
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  
  // File patterns to exclude
  exclude: [
    'node_modules/**',
    'dist/**',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],

  // Subfolder configurations for separate LLM calls
  subfolders: [
    {
      path: 'src/api',
      prompt: 'Generate API reference documentation...',
      outputPath: 'src/api/README.md',
      existingDocs: 'src/api/README.md',
    },
    {
      path: 'src/utils',
      // Uses global prompt, saves to src/utils/README.md
    },
  ],

  // Fallback output directory for ungrouped files
  outputDir: 'docs/',
});
```

### Environment Variables

Set API keys via environment variables:

- **OpenAI**: `OPENAI_API_KEY`
- **Anthropic**: `ANTHROPIC_API_KEY`
- **Google**: `GOOGLE_API_KEY`

## CLI Options

```bash
llmdoc [options] [command]

Options:
  -V, --version        Output version number
  -c, --config <path>  Path to config file (default: llmdoc.config.ts)
  -r, --root <path>    Project root directory (default: current directory)
  -d, --dry-run        Preview without making LLM calls or writing files
  -v, --verbose        Enable verbose logging
  -h, --help           Display help

Commands:
  init                 Create a sample llmdoc.config.ts file
```

## Supported LLM Providers

| Provider | Models | Environment Variable |
|----------|--------|---------------------|
| OpenAI | gpt-4o, gpt-4-turbo, gpt-3.5-turbo | `OPENAI_API_KEY` |
| Anthropic | claude-3-opus, claude-3-sonnet, claude-3-haiku | `ANTHROPIC_API_KEY` |
| Google | gemini-pro, gemini-1.5-pro | `GOOGLE_API_KEY` |

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Generate Documentation

on:
  push:
    branches: [main]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: oven-sh/setup-bun@v1
      
      - run: bun install
      
      - run: npx llmdoc
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "docs: update documentation"
```

## Programmatic API

You can also use llmdoc programmatically:

```typescript
import { loadConfig, scanProject, createLLMService, createGenerator } from 'llmdoc';

async function generateDocs() {
  const config = await loadConfig(process.cwd());
  const scanResult = await scanProject(
    process.cwd(),
    config.include!,
    config.exclude!,
    config.subfolders
  );
  
  const llmService = createLLMService(config.llm);
  const generator = createGenerator(llmService, config, process.cwd());
  
  const docs = await generator.generate(scanResult);
  console.log(`Generated ${docs.length} documentation files`);
}
```

## License

MIT
