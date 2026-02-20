# YouTube Atom Feed Sample: Lex Fridman Podcast

Fetched 2026-02-20 from `https://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA`

The feed returns 15 entries (YouTube's fixed limit for Atom feeds).

---

## 1. Raw Atom XML (first 2 entries)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCSHZKyawb77ixDdsGog4iWA"/>
 <id>yt:channel:SHZKyawb77ixDdsGog4iWA</id>
 <yt:channelId>SHZKyawb77ixDdsGog4iWA</yt:channelId>
 <title>Lex Fridman</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA"/>
 <author>
  <name>Lex Fridman</name>
  <uri>https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA</uri>
 </author>
 <published>2006-09-20T05:17:16+00:00</published>

 <entry>
  <id>yt:video:YFjfBk8HI5o</id>
  <yt:videoId>YFjfBk8HI5o</yt:videoId>
  <yt:channelId>UCSHZKyawb77ixDdsGog4iWA</yt:channelId>
  <title>OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger | Lex Fridman Podcast #491</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=YFjfBk8HI5o"/>
  <author>
   <name>Lex Fridman</name>
   <uri>https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA</uri>
  </author>
  <published>2026-02-12T03:07:03+00:00</published>
  <updated>2026-02-19T10:02:14+00:00</updated>
  <media:group>
   <media:title>OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger | Lex Fridman Podcast #491</media:title>
   <media:content url="https://www.youtube.com/v/YFjfBk8HI5o?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
   <media:thumbnail url="https://i2.ytimg.com/vi/YFjfBk8HI5o/hqdefault.jpg" width="480" height="360"/>
   <media:description>Peter Steinberger is the creator of OpenClaw, an open-source AI agent framework that's the fastest-growing project in GitHub history.
Thank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep491-sb
See below for timestamps, transcript, and to give feedback, submit questions, contact Lex, etc.

*Transcript:*
https://lexfridman.com/peter-steinberger-transcript

*CONTACT LEX:*
*Feedback* - give feedback to Lex: https://lexfridman.com/survey
...

*OUTLINE:*
0:00 - Episode highlight
1:30 - Introduction
5:36 - OpenClaw origin story
8:55 - Mind-blowing moment
18:22 - Why OpenClaw went viral
22:19 - Self-modifying AI agent
27:04 - Name-change drama
...
3:12:57 - Future of OpenClaw community</media:description>
   <media:community>
    <media:starRating count="15712" average="5.00" min="1" max="5"/>
    <media:statistics views="720016"/>
   </media:community>
  </media:group>
 </entry>

 <entry>
  <id>yt:video:EV7WhVT270Q</id>
  <yt:videoId>EV7WhVT270Q</yt:videoId>
  <yt:channelId>UCSHZKyawb77ixDdsGog4iWA</yt:channelId>
  <title>State of AI in 2026: LLMs, Coding, Scaling Laws, China, Agents, GPUs, AGI | Lex Fridman Podcast #490</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=EV7WhVT270Q"/>
  <author>
   <name>Lex Fridman</name>
   <uri>https://www.youtube.com/channel/UCSHZKyawb77ixDdsGog4iWA</uri>
  </author>
  <published>2026-01-31T22:33:33+00:00</published>
  <updated>2026-02-01T07:45:53+00:00</updated>
  <media:group>
   <media:title>State of AI in 2026: LLMs, Coding, Scaling Laws, China, Agents, GPUs, AGI | Lex Fridman Podcast #490</media:title>
   <media:content url="https://www.youtube.com/v/EV7WhVT270Q?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
   <media:thumbnail url="https://i2.ytimg.com/vi/EV7WhVT270Q/hqdefault.jpg" width="480" height="360"/>
   <media:description>Nathan Lambert and Sebastian Raschka are machine learning researchers, engineers, and educators. Nathan is the post-training lead at the Allen Institute for AI (Ai2) and the author of The RLHF Book. Sebastian Raschka is the author of Build a Large Language Model (From Scratch) and Build a Reasoning Model (From Scratch).
Thank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep490-sb
...

*OUTLINE:*
0:00 - Introduction
1:57 - China vs US: Who wins the AI race?
10:38 - ChatGPT vs Claude vs Gemini vs Grok: Who is winning?
...
4:08:15 - Future of human civilization</media:description>
   <media:community>
    <media:starRating count="29203" average="5.00" min="1" max="5"/>
    <media:statistics views="2356712"/>
   </media:community>
  </media:group>
 </entry>

 <!-- ... 13 more entries, back to ep #477 (Aug 2025) ... -->
</feed>
```

### What the Atom feed includes but the adapter does NOT extract

| XML field | Extracted? | Notes |
|---|---|---|
| `<title>` | Yes | → `NormalizedItem.title` |
| `<link rel="alternate">` | Yes | → `NormalizedItem.url` |
| `<published>` | Yes | → `NormalizedItem.publishedAt` |
| `<yt:videoId>` | Yes (via link) | → `NormalizedItem.meta.videoId` |
| `<media:description>` | Yes (truncated 300 chars) | → `NormalizedItem.snippet` |
| `<author><name>` | Yes | → `NormalizedItem.author` |
| `<media:thumbnail>` | **No** | Thumbnail URL not captured |
| `<media:starRating>` | **No** | Likes/rating not captured |
| `<media:statistics views>` | **No** | View count not captured |
| `<updated>` | **No** | Only `<published>` is used |

---

## 2. What `rss-parser` produces for one entry

`rss-parser` parses the Atom XML into a JS object. Relevant fields for entry #491:

```json
{
  "title": "OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger | Lex Fridman Podcast #491",
  "link": "https://www.youtube.com/watch?v=YFjfBk8HI5o",
  "pubDate": "2026-02-12T03:07:03.000Z",
  "isoDate": "2026-02-12T03:07:03.000Z",
  "author": "Lex Fridman",
  "content": "Peter Steinberger is the creator of OpenClaw, an open-source AI agent framework that's the fastest-growing project in GitHub history.\nThank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep491-sb\n... (full description, ~2500 chars)",
  "contentSnippet": "Peter Steinberger is the creator of OpenClaw, an open-source AI agent framework that's the fastest-growing project in GitHub history.\nThank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep491-sb\n... (full description, ~2500 chars)"
}
```

---

## 3. What `YouTubePodcastAdapter.sync()` maps this to

The adapter (see `src/adapters/youtube-podcast.ts`) maps each entry to a `NormalizedItem`:

```json
{
  "id": "lex-fridman:YFjfBk8HI5o",
  "channelId": "lex-fridman",
  "channelType": "youtube_podcast",
  "title": "OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger | Lex Fridman Podcast #491",
  "url": "https://www.youtube.com/watch?v=YFjfBk8HI5o",
  "publishedAt": "2026-02-12T03:07:03.000Z",
  "snippet": "Peter Steinberger is the creator of OpenClaw, an open-source AI agent framework that's the fastest-growing project in GitHub history.\nThank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep491-sb\nSee below for timestamps, transcript, and …",
  "author": "Lex Fridman",
  "meta": { "videoId": "YFjfBk8HI5o" }
}
```

Key transforms:
- `id` = `{channel.id}:{videoId}` (dedup key)
- `snippet` = `contentSnippet` truncated to 300 chars with `…`
- `videoId` extracted from `link` query param `?v=`
- Incremental sync: items with `publishedAt <= cursor.lastPublishedAt` are skipped

---

## 4. What `get_feed` returns to the MCP client

The `renderFeedItems()` function in `src/mcp/render.ts` produces plain text:

```
[1] OpenClaw: The Viral AI Agent that Broke the Internet - Peter Steinberger | Lex Fridman Podcast #491
    Source: youtube_podcast:lex-fridman
    Link: https://www.youtube.com/watch?v=YFjfBk8HI5o
    Date: 2026-02-12T03:07:03.000Z
    Peter Steinberger is the creator of OpenClaw, an open-source AI agent framework that's the fastest-growing project in GitHub history.
Thank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep491-sb
See below for timestamps, transcript, and …

[2] State of AI in 2026: LLMs, Coding, Scaling Laws, China, Agents, GPUs, AGI | Lex Fridman Podcast #490
    Source: youtube_podcast:lex-fridman
    Link: https://www.youtube.com/watch?v=EV7WhVT270Q
    Date: 2026-01-31T22:33:33.000Z
    Nathan Lambert and Sebastian Raschka are machine learning researchers, engineers, and educators. Nathan is the post-training lead at the Allen Institute for AI (Ai2) and the author of The RLHF Book. Sebastian Raschka is the author of Build a Large Language Model (Fr…

[3] Paul Rosolie: Uncontacted Tribes in the Amazon Jungle | Lex Fridman Podcast #489
    Source: youtube_podcast:lex-fridman
    Link: https://www.youtube.com/watch?v=Z-FRe5AKmCU
    Date: 2026-01-13T20:06:59.000Z
    Paul Rosolie is a naturalist, explorer, author of a new book titled Junglekeeper, and is someone who has dedicated his life to protecting the Amazon rainforest. Thank you for listening ❤ Check out our sponsors: https://lexfridman.com/sponsors/ep489-sb
See below for t…

[4] Infinity, Paradoxes, Gödel Incompleteness & the Mathematical Multiverse | Lex Fridman Podcast #488
    Source: youtube_podcast:lex-fridman
    Link: https://www.youtube.com/watch?v=14OPT6CcsH4
    Date: 2025-12-31T21:26:17.000Z
    Joel David Hamkins is a mathematician and philosopher specializing in set theory, the foundations of mathematics, and the nature of infinity, and he's the #1 highest-rated user on MathOverflow. He is also the author of several books, including Proof and the Art of Ma…

[5] Deciphering Secrets of Ancient Civilizations, Noah's Ark, and Flood Myths | Lex Fridman Podcast #487
    Source: youtube_podcast:lex-fridman
    Link: https://www.youtube.com/watch?v=_bBRVNkAfkQ
    Date: 2025-12-12T20:01:08.000Z
    Irving Finkel is a scholar of ancient languages and a longtime curator at the British Museum, renowned for his expertise in Mesopotamian history and cuneiform writing. He specializes in reading and interpreting cuneiform inscriptions, including tablets from Sumerian, …

... (up to 15 items total)
```

---

## 5. Observations

- **Snippet quality is good for Lex** — he puts the guest intro, sponsor block, and full chapter outline into the description. The 300-char truncation cuts deep into that, but the first sentence (guest intro) usually survives intact.
- **Snippet quality varies by channel** — channels with minimal descriptions would yield 1-2 sentence snippets or even empty strings.
- **No transcripts** — the Atom feed contains zero caption/transcript data. The description mentions a transcript link (`https://lexfridman.com/peter-steinberger-transcript`) but it's just text inside the snippet, not structured data.
- **15 entries max** — YouTube Atom feeds are capped at 15 most recent videos. For channels posting daily clips (not Lex's case), this can mean only a few days of history.
- **View count & likes available in XML but not extracted** — `media:statistics` and `media:starRating` are present in the Atom feed but `rss-parser` doesn't surface them and the adapter doesn't pull them.
