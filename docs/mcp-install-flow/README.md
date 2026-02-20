Here is the technical documentation you can drop straight into your repo:

***

# One-Click MCP Server Installation: Technical Requirements

This document covers everything needed to make your TypeScript MCP server installable in one click on both **Cursor** and **Claude Desktop**.

***

## Cursor — Deep Link

Cursor uses a custom URL scheme (deep link) that opens the IDE and registers the server automatically. [docs.cursor](https://docs.cursor.com/en/tools/developers)

### URL format

```
cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$BASE64_ENCODED_CONFIG
```

| Parameter | Description |
|---|---|
| `name` | Machine-readable server name (e.g. `my-mcp-server`) |
| `config` | Base64-encoded JSON of the server's `mcp.json` config block |

 [aiengineerguide](https://aiengineerguide.com/blog/cursor-mcp-deeplink/)

### Config JSON schema

The `config` value is the inner config object (same format as `mcp.json`): [docs.cursor](https://docs.cursor.com/en/tools/developers)

```json
{
  "command": "npx",
  "args": ["-y", "@your-org/your-mcp-server"],
  "env": {
    "API_KEY": "your-api-key"
  }
}
```

### TypeScript: generating the deep link

```typescript
function generateCursorInstallLink(name: string, config: object): string {
  const configString = JSON.stringify(config);
  const base64Config = Buffer.from(configString).toString("base64");
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(name)}&config=${base64Config}`;
}

// Usage
const link = generateCursorInstallLink("my-mcp-server", {
  command: "npx",
  args: ["-y", "@your-org/your-mcp-server"],
  env: { API_KEY: "${API_KEY}" }
});
```



### Exposing the link

Render it as a regular `<a href="...">` button in your README, website, or docs. When clicked in a browser, it triggers Cursor to open and prompt the user to confirm installation. [forum.cursor](https://forum.cursor.com/t/install-link-generator-for-mcp-servers-produces-invalid-config-parameter/128080)

***

## Claude Desktop — Desktop Extension (`.mcpb`)

Claude Desktop uses a packaged bundle format called **Desktop Extension** (`.mcpb`), which is a ZIP archive containing your compiled server and a `manifest.json`. [anthropic](https://www.anthropic.com/engineering/desktop-extensions)

### Toolchain

```bash
npm install -g @anthropic-ai/mcpb

# In your project root:
mcpb init    # Interactive manifest generator
mcpb pack    # Produces extension.mcpb
```



### Required project structure

```
your-server/
├── manifest.json          # Required
├── server/
│   └── index.js           # Compiled TypeScript output
├── node_modules/          # Bundled dependencies
└── icon.png               # Optional
```



### `manifest.json` — minimal (TypeScript/Node.js)

```json
{
  "mcpb_version": "0.1",
  "name": "your-mcp-server",
  "version": "1.0.0",
  "description": "What your server does",
  "author": { "name": "Your Name" },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"]
    }
  }
}
```



### `manifest.json` — with user config (e.g. API key)

```json
{
  "mcpb_version": "0.1",
  "name": "your-mcp-server",
  "version": "1.0.0",
  "description": "What your server does",
  "author": { "name": "Your Name" },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "API_KEY": "${user_config.api_key}"
      }
    }
  },
  "user_config": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": true
    }
  }
}
```



- `${__dirname}` — replaced at runtime with the extension's install directory [anthropic](https://www.anthropic.com/engineering/desktop-extensions)
- `${user_config.*}` — values collected from the user via Claude Desktop's UI and stored in the OS keychain [anthropic](https://www.anthropic.com/engineering/desktop-extensions)
- `sensitive: true` — tells Claude Desktop to store the value in the OS keychain (Keychain on macOS, Credential Manager on Windows) [anthropic](https://www.anthropic.com/engineering/desktop-extensions)

### TypeScript build requirements

Since Claude Desktop runs your compiled output via `node server/index.js`, ensure your `tsconfig.json` outputs to `server/` and bundles or copies `node_modules`:

```json
// tsconfig.json
{
  "compilerOptions": {
    "outDir": "./server",
    "module": "commonjs",
    "target": "es2020"
  }
}
```

Then run `mcpb pack` after `tsc`, so the archive contains compiled JS. [anthropic](https://www.anthropic.com/engineering/desktop-extensions)

### Distributing the `.mcpb` file

- Host the file on **GitHub Releases** or your website. [anthropic](https://www.anthropic.com/engineering/desktop-extensions)
- Link to it as a regular download. Users double-click it → Claude Desktop opens → one-click **Install**. [anthropic](https://www.anthropic.com/engineering/desktop-extensions)
- Optionally submit to the **Claude Desktop Extensions Directory** for broader discovery. [anthropic](https://www.anthropic.com/engineering/desktop-extensions)

***

## Side-by-side summary

| | Cursor | Claude Desktop |
|---|---|---|
| **Mechanism** | Deep link URL | `.mcpb` bundle file |
| **What user does** | Clicks link in browser | Downloads & double-clicks file |
| **Config location** | Base64 URL parameter | `manifest.json` inside bundle |
| **User config (API keys etc.)** | Must be filled manually after install | Collected via UI, stored in OS keychain |
| **Packaging tool** | None (just generate the URL) | `npx @anthropic-ai/mcpb pack` |
| **Runtime bundling** | Not required (`npx` fetches) | Required (bundle `node_modules`) |
| **Cursor docs** | `cursor.com/docs/context/mcp/install-links` | — |
| **Claude docs** | — | `anthropic.com/engineering/desktop-extensions` |
