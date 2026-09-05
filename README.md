# PII Guard for Email

A Chrome extension that scans email drafts in **Gmail** and **Outlook on the
web** and blocks the Send action if the draft appears to contain personal or
sensitive information (PII).

Everything runs locally in the browser tab — draft text is never sent to any
server. See [How it works](#how-it-works) for details.

## Features

- Scans the subject and body of a draft the moment you click **Send**.
- Detects, by default:
  - Email addresses
  - Social Security Numbers
  - Credit card numbers (validated with a Luhn checksum to cut down on false
    positives)
  - Phone numbers
  - IP addresses
  - AWS access keys
  - Generic API keys / secret tokens (`sk-...`, `ghp_...`, Stripe-style keys)
  - Bank routing/account number mentions
  - Passport number mentions
  - Date-of-birth mentions
- Blocks the send with a modal listing what was found (values are masked,
  e.g. `••••1111`) and lets you either go back and edit, or explicitly
  **Send anyway**.
- Per-rule toggles and an allowlist for text you never want flagged (e.g.
  your own email address), managed from the popup and options page.
- No network requests, no analytics, no accounts.

## Install (load unpacked, for now)

This extension isn't published to the Chrome Web Store. To run it locally:

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` folder produced by
   `npm run build`.
4. Open Gmail or Outlook on the web, start composing a message, and try
   sending a draft containing something like a fake SSN (`219-09-9999`) to
   see the block dialog.

Re-run `npm run build` after pulling changes; Chrome picks up the new
`dist/` contents the next time you reload the extension from
`chrome://extensions`.

## Development

```bash
npm install       # install dependencies
npm test          # run the Jest test suite
npm run lint      # run ESLint
npm run build     # bundle src/ into dist/ (the loadable extension)
```

## How it works

- **Detector** (`src/detector/`): a pure, framework-free regex-based scanner
  (`scanText`) that runs against plain text and returns every match, its
  category, and severity. No DOM or browser APIs involved — this is the most
  heavily unit-tested part of the codebase.
- **Adapters** (`src/adapters/`): one module per webmail provider (Gmail,
  Outlook Web). Each adapter knows how to find open compose windows, their
  Send button, and their text content, using stable accessibility attributes
  (`aria-label`, `role`, `data-tooltip`) rather than obfuscated class names,
  since those are what's least likely to break when Gmail/Outlook ship a
  redesign.
- **Content script** (`src/content/content.js`): picks the right adapter for
  the current site, watches the page for compose windows via a
  `MutationObserver`, and attaches a capture-phase `click` listener to each
  Send button. On click, it scans the compose text; if it's clean the click
  proceeds normally, otherwise the click is cancelled and a blocking dialog
  (`src/ui/warningDialog.js`) is shown. Choosing "Send anyway" replays the
  click, bypassing the guard exactly once for that button.
- **Background service worker**: sets default settings on install and keeps
  a running count of blocked sends (shown in the toolbar badge).
- **Popup / options pages**: manage the master on/off switch, per-rule
  toggles, and the allowlist, all persisted with `chrome.storage.sync`.

## Known limitations

- Detection is regex-based and local — it will miss cleverly obfuscated PII
  (e.g. "two one nine, oh nine, nine nine nine nine") and can occasionally
  flag things that only look like PII (a 16-digit tracking number that
  happens to pass the credit card checksum, for instance). Use the allowlist
  for known-safe recurring text.
- Gmail and Outlook frequently change their DOM. The adapters target stable
  accessibility attributes to minimize breakage, but a future redesign could
  still require adapter updates.
- Automated tests simulate Gmail/Outlook markup with jsdom fixtures; they do
  not drive a real, logged-in Gmail/Outlook session (that would risk actually
  sending mail and isn't something CI can safely do).

## Privacy

PII Guard requests only the `storage` permission and host permissions for
Gmail/Outlook Web. It does not make any network requests, does not collect
analytics, and does not transmit draft content anywhere — all scanning
happens in the content script, in memory, in your browser.

## License

MIT — see [LICENSE](LICENSE).
