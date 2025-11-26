# LI Buddy - LinkedIn Engagement Collector

> Extract engagement data (reactions, comments, reposts) from LinkedIn posts. Send to webhook or download as CSV.

## Features

- 📊 **Complete Data Collection**: Extract all reactors, commenters, and reposters from any LinkedIn post
- 🖥️ **Visual Console**: Real-time floating console shows collection progress with color-coded logs
- 🔗 **Webhook Integration**: Send data directly to n8n, Make.com, Zapier, or any webhook endpoint
- 📥 **CSV Export**: Download engagement data as a structured CSV file
- 🎯 **Smart Filtering**: Automatically excludes your own profile and deduplicates entries
- 💾 **URL Memory**: Saves your webhook URL for future use
- ⚡ **Background Processing**: Works in a separate tab while you continue browsing

## Installation & Setup

### 1. Install the Extension

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the folder containing these files
6. Done! ✅

### 2. Use the Extension

1. Go to any LinkedIn post
2. Click the three-dot menu (⋯) on the post
3. Select **"Get reactions of this post"**
4. Choose your export method:
   - Enter webhook URL → Click **"Send to Webhook"**
   - Or click **"Download CSV"**
5. Watch the visual console as data is collected
6. Tab closes automatically when done

### 3. Webhook Setup (Optional)

#### n8n

1. Add a **Webhook** node to your workflow
2. Set **HTTP Method** to `POST`
3. Copy the **Test URL**
4. Paste into LI Buddy modal

#### Make.com

1. Add a **Webhook** module as trigger
2. Copy the webhook URL
3. Paste into LI Buddy modal

#### Zapier

1. Create a new Zap with **Webhooks by Zapier**
2. Select **Catch Hook**
3. Copy the webhook URL
4. Paste into LI Buddy modal

## Visual Console

The extension displays a floating console showing real-time progress:

```
🚀 LI Buddy Console                    Stage 1: Reactions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Collection process starting...
📍 STAGE 1: REACTIONS
📊 [1] Load more | Reactors: 10/21
📍 STAGE 1 COMPLETE: 21 reactors
📍 STAGE 2: COMMENTS
✅ Collected 4 new commenters
📍 STAGE 3: REPOSTS
✅ Data sent to webhook successfully!
```

## Data Format

### Webhook Payload (JSON)

```json
{
  "postUrl": "https://www.linkedin.com/feed/update/urn:li:activity:1234567890/",
  "scrapedAt": "2024-11-26T10:30:45.123Z",
  "totalCount": 150,
  "stats": {
    "reactors": 120,
    "commenters": 25,
    "reposters": 5
  },
  "profiles": [
    {
      "name": "John Doe",
      "profileUrl": "https://www.linkedin.com/in/johndoe",
      "headline": "CEO at Company | Entrepreneur",
      "degree": "1st",
      "engagementType": "reactor",
      "timestamp": "2024-11-26T10:30:45.123Z"
    }
  ]
}
```

### CSV Export

Columns: `Name`, `Profile URL`, `Headline`, `Degree`, `Engagement Type`, `Timestamp`

## Troubleshooting

**"Extension context invalidated" error**
- Close all LinkedIn tabs
- Reload extension at `chrome://extensions/`
- Open fresh LinkedIn tab (or just refresh the page)

**Webhook returns 404**
- Verify webhook URL is correct
- Make sure HTTP Method is set to **POST** (not GET)
- Check that webhook service is active

**"Could not find post URL"**
- Click the post timestamp first to go to post detail page, then try again

**Collection stops or freezes**
- Don't interact with the collection tab while it's running
- Keep tab visible (not minimized)

**Option doesn't appear in post menu**
- Refresh the LinkedIn page
- Make sure extension is enabled in `chrome://extensions/`

## How It Works

1. **Stage 1 - Reactions**: Opens reactions modal and loads all reactors progressively
2. **Stage 2 - Comments**: Expands comment threads and collects all commenters
3. **Stage 3 - Reposts**: Collects all users who reposted
4. **Final Sweep**: One last check to catch any missed profiles
5. **Export**: Sends to webhook or downloads CSV
6. **Auto-close**: Tab closes automatically after 2 seconds

## Technical Details

- **Manifest V3** compliant
- **CSP-safe**: Uses data attributes instead of inline scripts
- **Maximum**: 2000 profiles per collection (safety limit)
- **Deduplication**: Same person counted once even if they engaged multiple ways
- **Self-filtering**: Automatically excludes your own profile

## Privacy

- ✅ All collection happens locally in your browser
- ✅ Data only sent to YOUR webhook URL
- ✅ No third-party servers involved
- ✅ Webhook URL stored locally in Chrome
- ✅ Only works on LinkedIn domains

## Limitations

- Maximum 2000 profiles per collection
- Only works on LinkedIn post pages
- Requires active LinkedIn session
- Cannot collect from private/restricted profiles
- Rate limited by LinkedIn's UI loading speed

## License

MIT License - see LICENSE file

## Disclaimer

This extension automates interaction with LinkedIn's user interface. Use responsibly and in accordance with LinkedIn's Terms of Service. The developers are not responsible for any account restrictions that may result from use of this tool.

---

**Made with ❤️ for the LinkedIn community**
