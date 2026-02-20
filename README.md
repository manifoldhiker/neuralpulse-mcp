# neuralpulse-mcp

Personalized content feed served through any AI assistant via MCP.

An MCP server that fetches RSS/Atom feeds and returns raw items — summarization happens on the AI assistant side.

## Setup

```bash
npm install
```

## Run in Cursor

The repo includes `.cursor/mcp.json` which registers the server automatically. After `npm install`, restart Cursor (or reload MCP servers) and the `neuralpulse` server will appear.

You can then ask your AI assistant things like "give me my morning briefing" and it will call `get_feed` under the hood.

## Run standalone (for testing)

```bash
npm run dev
```

This starts the MCP server on stdio. It expects JSON-RPC messages on stdin and responds on stdout.

## Build

```bash
npm run build
```

Compiles TypeScript to `dist/`.

## Configure feeds

Edit `feeds.json` to add or remove RSS/Atom feed URLs:

```json
{
  "feeds": [
    { "name": "simonwillison.net", "url": "https://simonwillison.net/atom/everything/" },
    { "name": "Marca Football", "url": "https://e00-marca.uecdn.es/rss/en/football.xml" }
  ]
}
```

## Tool: `get_feed`

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `limit`   | number | no       | Max items to return (default 20, max 100)|
| `source`  | string | no       | Filter by feed name or URL substring     |

Returns feed items with `title`, `link`, `published`, `source`, and `snippet` fields.
