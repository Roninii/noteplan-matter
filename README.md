# Matter Plugin for NotePlan

A [NotePlan](https://noteplan.co) plugin that syncs your reading highlights from [Matter](https://getmatter.app) into NotePlan notes.

Each article you've highlighted in Matter becomes a note in NotePlan with metadata (author, URL, publisher, tags) and all your highlights formatted as blockquotes, separated by horizontal rules for readability.

## Features

- **QR Code Login** - Authenticate with Matter by scanning a QR code in the Matter mobile app
- **Full Sync** - Import all your Matter highlights at once
- **Incremental Sync** - Only fetch new highlights since your last sync
- **Auto-Sync** - Automatically sync in the background on a configurable interval
- **Frontmatter Metadata** - Each note includes author, URL, publisher, publication date, and tags
- **Highlight Notes** - Your annotations on highlights are preserved
- **Notifications** - Configurable notifications for sync results and errors
- **Configurable** - Choose between frontmatter or heading-based metadata, quote or list highlight styles, and more

## Installation

1. In NotePlan, open **Preferences > Plugins**
2. Click **"Open Plugin Folder"**
3. Create a folder called `ronini.Matter`
4. Copy `plugin.json` and `script.js` from the `ronini.Matter/` directory in this repo into that folder
5. Restart NotePlan

## Usage

### Login

1. Open the NotePlan Command Bar and run **"Matter: Login"**
2. A QR code will appear - scan it with the Matter app on your phone (Profile > Settings > Connected Accounts)
3. After Matter confirms the connection, run **"Matter: Complete Login"** in NotePlan

### Syncing

- **"Matter: Sync"** - Incremental sync (new highlights since last sync)
- **"Matter: Rebuild"** - Full sync of all highlights (useful for first sync or to reformat notes after changing settings)

### Other Commands

- **"Matter: Logout"** - Clear your authentication tokens
- **"Matter: Complete Login"** - Complete the login after scanning the QR code

## Settings

Configure via **NotePlan Preferences > Plugins > Matter**:

### Sync Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-Sync Interval | `Every hour` | How often to automatically sync in the background. Options: Off, Every 30 minutes, Every hour, Every 4 hours, Every 12 hours, Every 24 hours |
| Base Folder | `Matter` | Root folder where notes are created. Change this if you move your Matter notes |
| Tag Prefix | `Matter` | Prefix for imported tags (e.g., `Matter/philosophy`) |
| Group by Content Type | `false` | Organize notes into subfolders (articles, podcasts, etc.) |
| Recreate If Missing | `true` | Recreate deleted notes on next sync |

### Note Formatting

| Setting | Default | Description |
|---------|---------|-------------|
| Metadata Format | `FrontMatter` | `FrontMatter` (YAML) or `Heading` (markdown headings) |
| Highlight Style | `quote` | `quote` (blockquote) or `list` (bullet points) |
| Include Highlight Notes | `true` | Show your notes on individual highlights |
| Include Article Note | `true` | Show your overall note for the article |

### Notifications

| Setting | Default | Description |
|---------|---------|-------------|
| Notify on Sync | `Errors only` | When to show notifications. Options: Always, Errors only, Never |

### Advanced

| Setting | Default | Description |
|---------|---------|-------------|
| Log Level | `INFO` | Logging verbosity in the Plugin Console. Options: DEBUG, INFO, WARN, ERROR, none |

## Example Note

```markdown
How to Remember What You Read
---
author: "[[James Clear]]"
url: https://jamesclear.com/reading-comprehension-strategies
publisher: James Clear
published: 2021-03-15
tags: Matter/reading, Matter/learning
---

# Highlights

> Quality matters more than quantity. If you read one book a month but fully appreciate and absorb it, you'll be better off than someone who skims through four.

---

> The key to reading well is being selective. Pick books that genuinely interest you.

**Note:** This applies to articles too, not just books

---
```

## How It Works

The plugin uses the Matter API (`api.getmatter.app/api/v11`) to:

1. Authenticate via QR code login flow (same as the Obsidian Matter plugin)
2. Fetch your highlights feed with pagination
3. Create or update NotePlan notes with article metadata and highlights
4. Track sync timestamps for incremental updates

Auto-sync hooks into NotePlan's `onEditorWillSave` event - each time a note is saved, it checks if enough time has elapsed since the last sync and runs a silent incremental sync if so.

Authentication tokens are stored locally via NotePlan's `DataStore` and automatically refresh when expired.

## Credits

- Inspired by the [Readwise Unofficial plugin](https://github.com/NotePlan/plugins/tree/main/aaronpoweruser.ReadwiseUnofficial) for NotePlan
- Matter API patterns adapted from the [Obsidian Matter plugin](https://github.com/getmatterapp/obsidian-matter)

## License

MIT
