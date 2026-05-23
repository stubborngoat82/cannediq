# cannedIQ — Chrome Web Store Listing

---

## Extension Name
```
cannedIQ — Canned Responses & AI Reply
```
*(45 chars — fits Chrome's 45-char limit)*

---

## Short Description *(132 chars max)*
```
Launch saved responses, AI-written replies, and smart templates into any text field — with one keystroke.
```
*(105 chars)*

---

## Full Description

**Stop retyping the same messages. Start shipping responses instantly.**

cannedIQ is a command launcher for your words. Store your best responses, templates, and AI prompts in a searchable library — then fire them into any text field on any website with a single keystroke.

---

**⚡ Open your entire library in one press**
Hit Ctrl+Space (or ⌘+Space on Mac) to open the palette. Search, navigate with arrow keys, press Enter — your text appears at the cursor. Works in Gmail, Zendesk, Intercom, LinkedIn, GitHub, Slack, and everywhere else.

**/ Type a shortcode to expand instantly**
Assign a slash keyword to any command (e.g. `/refund`). Type it in any text field, press Tab — the full response replaces it. No menu required.

**{{Variables}} that fill themselves in**
Use `{{today}}`, `{{pageTitle}}`, `{{selectedText}}`, or `{{clipboard}}` and they resolve automatically. Add your own custom fields — text, date, dropdown — and a clean modal prompts you to fill them in before inserting.

**✦ AI commands that write for you**
Describe what you need in a prompt, use `{{inputText}}` to pass your current draft, and let AI generate the response. No API key needed — it's built in. Available on Pro + AI and Team plans.

**🎯 Context-aware triggers**
Conditions let you show commands only on specific sites, only when text is selected, or only inside a focused text field. Keep your palette clean and relevant wherever you are.

**🏢 Shared team libraries**
Team admins can publish a shared command library that syncs automatically to every team member. Everyone stays on-message, without maintaining their own copy.

---

**What you can do with cannedIQ:**
• Customer support teams — consistent, fast ticket replies
• Sales — personalized outreach with per-prospect variables
• Recruiters — templated candidate messages on LinkedIn
• Developers — PR templates, GitHub comment boilerplate, doc links
• Anyone who types the same things every day

---

**Plans:**
• **Free** — Up to 25 commands, 3 stacks, instant palette & slash triggers
• **Pro** — Unlimited commands, stacks, and context-aware conditions
• **Pro + AI** — Everything in Pro, plus AI command generation (100 credits/month)
• **Team** — Shared command libraries, member management, per-seat billing

Full pricing at cannediq.com/pricing

---

## Category
**Productivity**

---

## Language
English

---

## Store Icon
`store-icon-128x128.png` — 128×128 PNG (gradient ⚡ on dark card)

## Screenshots (1280×800, in order)
1. `screenshot-1-palette.png` — Command palette open on Gmail
2. `screenshot-2-variables.png` — Variable fill-in modal
3. `screenshot-3-options.png` — Options page with stacks + command editor
4. `screenshot-4-ai.png` — AI command generating a LinkedIn message
5. `screenshot-5-slash.png` — Slash trigger expanding in Intercom

## Promotional Tile
`promo-tile-440x280.png` — 440×280 (small promo tile)

---

## Privacy Policy URL
```
https://cannediq.com/privacy
```

## Website
```
https://cannediq.com
```

---

---

# Permission Justification — `<all_urls>`

*This section is for the Chrome Web Store review team and should be submitted in the "Additional information for reviewers" field during submission.*

---

## Why cannedIQ requests `<all_urls>`

cannedIQ is a **text expansion and AI response tool**. Its core purpose is to detect active text fields on webpages and insert user-defined content into them on demand. This functionality is inherently cross-site — users rely on cannedIQ to work on every website they use: Gmail, LinkedIn, Zendesk, Intercom, GitHub, Slack, HubSpot, Notion, and any other site where they communicate via text.

### Specific use of `<all_urls>`

The `<all_urls>` host permission is used exclusively for the following:

1. **Content script injection** — cannedIQ injects `content.js` and `overlay.css` into every tab the user visits. The content script:
   - Monitors for `Ctrl+Space` keyboard shortcut to open the command palette overlay
   - Detects `<textarea>`, `<input>`, and `contenteditable` elements that the user focuses
   - Watches for slash keyword patterns (e.g. `/refund`) in text fields
   - Inserts resolved template text at the cursor position when a command is launched

2. **Page context gathering** — When a command is executed, the content script reads:
   - `window.location.href` and `document.title` for dynamic variables (`{{pageTitle}}`, `{{currentUrl}}`, `{{hostname}}`)
   - `window.getSelection()` for the `{{selectedText}}` variable
   - The focused element's current value for the `{{inputText}}` / `{{activeInput}}` variables
   - None of this data is transmitted anywhere. It is used only to resolve the user's template before inserting it.

3. **Condition evaluation** — Pro users can configure site-specific conditions (e.g., "only show this command on zendesk.com"). The content script evaluates these conditions against the current URL/hostname client-side before showing or hiding commands in the palette.

### What cannedIQ does NOT do

- Does **not** read, collect, or transmit the content of pages the user visits
- Does **not** capture keystrokes outside of the keyboard shortcut detection and slash trigger detection in active text fields
- Does **not** access browsing history, cookies, passwords, or any sensitive browser data
- Does **not** inject scripts into `chrome://` pages, PDF viewers, or other restricted origins (these are excluded via the `matches` pattern and gracefully fail silently)
- Does **not** use the host permission for advertising, analytics, or any purpose other than the text-insertion feature described above

### Why a narrower permission is not feasible

The user experience depends on cannedIQ working on **any site the user chooses to use it on** without requiring them to manually grant access per domain. Users cannot predict in advance which sites they will need it on — a support agent might be on Zendesk one minute and Salesforce the next. Restricting to a fixed list of domains would break the core value proposition of the product and create constant friction.

The `activeTab` permission was considered but is insufficient because it only grants access to the currently focused tab at the moment a browser action is clicked — it does not support keyboard-shortcut–triggered content scripts or slash triggers that must already be listening in the page context before the user interacts.

### Data handling

All user data (commands, stacks, settings) is stored in `chrome.storage.local` on the user's device. Signed-in users optionally sync to Supabase (cannedIQ's backend) for cross-device access. Page content is never sent to cannedIQ's servers. AI commands send only the resolved prompt (containing user-authored text) to the AI service, with the user's explicit action initiating each call.

Full privacy policy: **https://cannediq.com/privacy**

---

*Submitted by: AH Push It LLC — support@cannediq.com*
