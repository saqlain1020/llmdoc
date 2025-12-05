# llmdoc

A CLI tool for automatically generating documentation for TypeScript projects using LLMs.

## Features

- 📂 **Scans TypeScript files** - Recursively indexes all `.ts` and `.tsx` files in your project
- 🤖 **LLM-powered docs** - Generates comprehensive markdown documentation using AI
- 📊 **Architecture diagrams** - Automatically generates Mermaid diagrams for code visualization
- ⚙️ **Configurable** - Supports OpenAI, Anthropic, and Google Generative AI via LangChain
- 📁 **Subfolder support** - Break down documentation by folder for better LLM context management
- 🔗 **Import resolution** - Automatically includes imported files for context
- 💰 **Cost estimation** - Preview token usage and estimated costs with `--dry-run`
- 🔄 **Update existing docs** - Preserves and updates existing documentation
- 🚀 **CI/CD ready** - Clean output with no LLM artifacts, designed for automated pipelines

## Installation

```bash
# Use directly with npx (no installation required)
npx llmdoc@latest
bunx llmdoc@latest

# Or install globally
npm install -g llmdoc@latest
bun add -g llmdoc@latest
```

> **✨ npx works without local installation!** The config file can import from `llmdoc` even when using npx - the package resolves imports automatically.

## Quick Start

1. **Initialize a config file:**

```bash
# Create a TypeScript config (with type safety)
npx llmdoc@latest init

# Or create a JSON config (simpler, no imports needed)
npx llmdoc@latest init --json
```

2. **Edit your config file** to configure your LLM provider:

**TypeScript (`llmdoc.config.ts`):**

```typescript
import { defineConfig } from 'llmdoc';

export default defineConfig({
  llm: {
    provider: 'openai', // 'openai' | 'anthropic' | 'google-genai'
    model: 'gpt-5.1',
    // apiKey: 'your-api-key', // Or use environment variables
  },
});
```

**JSON (`llmdoc.config.json`):**

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-5.1"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "node_modules/**"]
}
```

3. **Run documentation generation:**

```bash
npx llmdoc@latest
```

## Configuration

llmdoc supports both TypeScript (`.ts`) and JSON (`.json`) config files. TypeScript configs provide type safety, while JSON configs are simpler and don't require imports.

**Supported config file names:** `llmdoc.config.ts`, `llmdoc.config.js`, `llmdoc.config.mjs`, `llmdoc.config.json`

### Full Config Example

```typescript
import { defineConfig } from 'llmdoc';

export default defineConfig({
  // LLM provider configuration
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY
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
      
      // Include files imported by this subfolder (default: true)
      includeImports: true,
      
      // How deep to resolve nested imports (default: 2)
      importDepth: 2,
      
      // Additional files to include for context
      additionalFiles: ['src/types/**/*.ts'],
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

### Subfolder Context Options

Each subfolder can be configured with context options to help the LLM understand dependencies:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | string | required | Path to the subfolder relative to project root |
| `prompt` | string | global | Custom prompt override for this subfolder |
| `outputPath` | string | `{path}/README.md` | Where to save the generated docs |
| `existingDocs` | string | - | Path to existing docs to update |
| `includeImports` | boolean | `true` | Include files imported by this subfolder |
| `importDepth` | number | `2` | How deep to resolve nested imports (0-5) |
| `additionalFiles` | string[] | - | Glob patterns for extra context files |

**Example with import resolution:**

```typescript
subfolders: [
  {
    path: 'src/api',
    includeImports: true,      // Include imported files for context
    importDepth: 2,            // Resolve imports 2 levels deep
    additionalFiles: [         // Add extra files for context
      'src/types/**/*.ts',
      'src/utils/helpers.ts',
    ],
  },
]
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
  init [options]       Create a sample config file
    --json             Create a JSON config instead of TypeScript
```

## Supported LLM Providers

| Provider | Models | Environment Variable |
|----------|--------|---------------------|
| OpenAI | gpt-5, gpt-4o, gpt-4o-mini, o1, o1-mini, o3 | `OPENAI_API_KEY` |
| Anthropic | claude-opus-4, claude-sonnet-4, claude-sonnet-4-20250514, claude-3-5-sonnet | `ANTHROPIC_API_KEY` |
| Google | gemini-3-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | `GOOGLE_API_KEY` |

> **Note:** Any model supported by the provider can be used. The table above shows popular options.

## Token Estimation & Cost Preview

Use `--dry-run` to preview token usage and estimated costs before making LLM calls:

```bash
npx llmdoc --dry-run
```

Output includes:
- **Character count** - Total characters being sent
- **Estimated tokens** - Approximate token count (~0.35 tokens/char for code)
- **Context usage** - Percentage of model's context window used
- **Estimated cost** - Approximate input cost based on model pricing

Example output:
```
ℹ Token estimate:
ℹ Characters: 56,655
ℹ Estimated tokens: ~19,830
ℹ Context usage: 15.5% of 128K
ℹ Estimated input cost: $0.0496
```

The tool includes pricing data for common models (GPT-4o, Claude 3, Gemini). For custom/newer models, character and token counts are still shown.

## Context Window Limitations

> **Note:** While token estimates and warnings are provided, the tool does **not** automatically prevent context window overflow.

### Current Behavior

When files are sent to the LLM, all content is sent in a single request. If your project files exceed the LLM's context window, you may experience:
- API errors (context length exceeded)
- Truncated or incomplete documentation
- Failed generation requests

### Recommendations

To manage context effectively:

1. **Use subfolders** - Break your project into logical subfolders, each processed in separate LLM calls:
   ```typescript
   subfolders: [
     { path: 'src/api' },
     { path: 'src/utils' },
     { path: 'src/components' },
   ]
   ```

2. **Limit import depth** - Reduce nested import resolution:
   ```typescript
   { path: 'src/api', importDepth: 1 }  // Only direct imports
   ```

3. **Disable import resolution** for large folders:
   ```typescript
   { path: 'src/large-module', includeImports: false }
   ```

4. **Use exclude patterns** - Filter out verbose or generated files:
   ```typescript
   exclude: ['**/*.generated.ts', '**/migrations/**', '**/*.min.ts']
   ```

5. **Choose models with larger context windows**:


### Future Improvements

Planned features for better context management:
- [ ] Automatic token counting before API calls
- [ ] Smart chunking for large codebases
- [ ] Warning when approaching context limits
- [ ] Automatic file prioritization

## CI/CD Integration

### Clean Output for CI

The tool automatically cleans LLM output to ensure valid markdown files:
- Removes preamble text (e.g., "Here is your documentation...")
- Strips markdown code block wrappers that some LLMs add
- Ensures output starts directly with content
- Generates ASCII diagrams that render in any markdown viewer

This means the generated files can be committed directly without manual cleanup.

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
