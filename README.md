# AI Council

A Chrome extension (Manifest V3) that orchestrates an open **ChatGPT** tab and an open **Gemini** tab to review and refine answers together—no API keys, no backend.

ChatGPT acts as **Draftor** (drafts and refines). Gemini acts as **Reviewer** (critiques and delivers the final verdict). Everything runs by driving the DOM of ChatGPT and Gemini tabs—no API keys, no backend.

When you start a council, the extension opens any missing ChatGPT or Gemini tabs automatically, waits for them to load, then begins the review loop.

## How it works

1. You enter a question in the popup.
2. **Draftor** (ChatGPT) answers or refines based on the Reviewer's feedback.
3. **Reviewer** (Gemini) critiques each draft.
4. After **N review rounds**, **Reviewer** writes a final verdict (word-capped).
5. The popup shows status, verdict, a self-reported scoreboard, and a collapsible review history.

```
Question → [Draftor ↔ Reviewer] × N rounds → Reviewer final verdict
```

## Prerequisites

- Google Chrome (or Chromium)
- Logged-in accounts on [chatgpt.com](https://chatgpt.com) (or [chat.openai.com](https://chat.openai.com)) and [gemini.google.com](https://gemini.google.com)

You do not need to open those tabs yourself—the extension opens missing ones when you click **Start council**. If a new tab lands on a login page, sign in there and start again.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.

## Usage

1. Click the **AI Council** extension icon.
2. Enter your question.
3. Set **Review rounds** (default `1`) and **Max words** (default `100`).
4. Click **Start council**.

If ChatGPT or Gemini is not already open, the extension opens the missing tab(s) in the background before the run begins. Status lines show progress (for example, “Opening ChatGPT tab…”).

The popup updates live while a run is in progress. Closing the popup does not stop a run—the background service worker keeps orchestration in `chrome.storage.local`.

## Popup sections

| Section | Description |
|--------|-------------|
| **Setup** | Question, round count, word limit, Start button |
| **Status** | Draftor (ChatGPT) and Reviewer (Gemini) progress |
| **Verdict** | Final answer from Reviewer, with word count |
| **Scoreboard** | Self-reported change/issue totals from each model |
| **Review history** | Full transcript of drafts, reviews, and verdict |

## Project structure

```
manifest.json        Extension manifest (MV3)
background.js        Orchestration, storage, tab messaging
content-chatgpt.js   Draftor DOM automation (ChatGPT)
content-gemini.js    Reviewer DOM automation (Gemini)
popup.html / popup.js Popup UI
LICENSE              MIT License
```

Plain JavaScript only—no build step.

## Permissions

| Permission | Why |
|-----------|-----|
| `storage` | Persist run state, transcript, and verdict |
| `tabs` | Find, open, and message ChatGPT and Gemini tabs |
| `scripting` | Inject content scripts if messaging fails |
| Host access | ChatGPT and Gemini domains only |

## Limitations

- Depends on ChatGPT and Gemini DOM structure; site UI changes may break selectors until updated.
- Tabs must be **logged in** before automation can run. Opening a tab does not sign you in.
- New tabs may take a few seconds to load; tab open timeouts after 30 seconds.
- Scoreboard counts are **self-reported** by the models (`CHANGES: N` lines)—not independently verified.
- Verdict length is enforced client-side if the model exceeds the cap by more than ~20%.

## License

[MIT License](LICENSE) — Copyright (c) 2026 Prithvi Bhargav
