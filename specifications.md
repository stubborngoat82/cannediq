PRODUCT SPEC: Canned Response Launcher (Browser Extension)
🧠 Product Overview

A browser extension that allows users to quickly insert prewritten responses into any text field across the web (email, chat, forms, etc.) using keyboard shortcuts, slash commands, or a UI overlay.

Primary goal:
👉 Reduce repetitive typing and increase response speed

🎯 Core Features (MVP)
1. Universal Text Injection
Detect active text input fields (input, textarea, contenteditable)
Insert selected canned response at cursor position
2. Launcher Trigger System

Support multiple triggers:

Keyboard shortcut (Ctrl + Space)
Slash command (/keyword)
Extension icon click
Right-click context menu
3. Response Picker UI

Overlay modal with:

Category list (left panel)
Responses (right panel)
Search bar (top)
Keyboard navigation:
↑ ↓ navigate
→ enter category
Enter = select
Esc = close
4. Response Management
Create, edit, delete responses
Organize into categories
Inline editing UI or separate options page
5. Local Storage
Use chrome.storage.local
Persist:
categories
responses
user preferences
⚙️ Technical Architecture
🧱 Stack
Frontend (Extension)
Vanilla JS or TypeScript
HTML + CSS (or lightweight framework like Preact)
Chrome Extension Manifest V3
Storage
chrome.storage.local
Optional Enhancements
Fuse.js (fuzzy search)
Hotkeys library
📁 File Structure
/extension
  ├── manifest.json
  ├── background.js
  ├── contentScript.js
  ├── popup/
  │     ├── popup.html
  │     ├── popup.js
  ├── options/
  │     ├── options.html
  │     ├── options.js
  ├── overlay/
  │     ├── overlay.html
  │     ├── overlay.js
  │     ├── overlay.css
  ├── utils/
  │     ├── storage.js
  │     ├── dom.js
🔑 Key Components
1. contentScript.js

Responsibilities:

Detect focused input field
Inject overlay UI
Handle insertion logic
2. overlay UI
Floating modal injected into DOM
Controlled via keyboard + mouse
3. background.js
Handle global shortcuts
Messaging between components
4. storage.js

Wrapper for:

chrome.storage.local.get()
chrome.storage.local.set()
🔄 Core Workflow
Step 1: User focuses input

Detect active element:

document.activeElement
Step 2: Trigger launcher

Example:

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'Space') {
    openOverlay();
  }
});
Step 3: Show overlay
Inject UI into DOM
Load responses from storage
Step 4: Select response

User navigates categories and selects response

Step 5: Insert text
const el = document.activeElement;
el.value = el.value.substring(0, el.selectionStart) 
  + responseText 
  + el.value.substring(el.selectionEnd);

Handle:

contenteditable separately
🧩 Data Model
{
  "categories": [
    {
      "id": "cat_1",
      "name": "Work",
      "responses": [
        {
          "id": "res_1",
          "title": "Follow Up",
          "text": "Just checking in on this..."
        }
      ]
    }
  ]
}
🗺️ ROADMAP
🚀 Phase 1 (MVP - 1–2 weeks)
Basic overlay
Keyboard trigger
Insert into text fields
Local storage
Simple UI
⚡ Phase 2 (2–4 weeks)
Slash commands (/thanks)
Search functionality
Better UI/UX
Context menu trigger
🔥 Phase 3 (4–8 weeks)
Sync (chrome.storage.sync)
Import/export responses
Usage analytics (local)
💰 Phase 4 (Monetization)
AI rewrite feature
Premium templates
Subscription model
💸 MONETIZATION
Free Tier
Unlimited local responses
Basic UI
Paid Tier ($5–10/mo)
AI rewrite
Cloud sync (future)
Advanced search
Templates
📈 MARKETING PLAN
🎯 Target Users
Customer support reps
Freelancers
Sales professionals
Recruiters
Anyone sending repetitive messages
🚀 Launch Strategy
1. Chrome Web Store SEO

Optimize listing for:

“text expander”
“canned responses”
“auto reply tool”
2. Short-form Content (HIGH ROI)

Platforms:

TikTok
Instagram Reels

Content ideas:

“Stop typing this over and over”
“This Chrome extension saves me 2 hours/day”
Before vs after demos
3. Reddit Distribution

Target:

r/productivity
r/freelance
r/sales

Post angle:
👉 “Built a free tool to stop rewriting the same messages”

4. Product Hunt Launch
Offer free premium for early users
Collect feedback
5. Cold Outreach

Message:

Customer support teams
Virtual assistants
Agencies
6. Landing Page

Simple site with:

Demo GIF
“Try it free” CTA
Use cases
🧠 DIFFERENTIATION ANGLE

You’re competing with generic text expanders.

So position it as:

👉 “Works anywhere on the internet instantly”
👉 “No setup, no syntax, just click and send”

🔥 Claude Prompt (you can paste this)
Build a Chrome Extension (Manifest V3) called "Canned Response Launcher".

Requirements:
- Detect active text fields on any webpage
- Open overlay UI on Ctrl+Space
- Display categories and responses from chrome.storage.local
- Allow keyboard navigation (arrow keys + enter)
- Insert selected response into the active field at cursor position
- Support textarea, input, and contenteditable elements
- Include options page to create/edit/delete responses
- Clean UI with minimal styling

Tech:
- Vanilla JS or TypeScript
- No heavy frameworks
- Modular file structure

Return:
- Full working codebase
- manifest.json
- All JS/HTML/CSS files
- Instructions to load into Chrome

AI + MONETIZATION LAYER
AI Features
1. Tone Rewrite

Users can rewrite any saved response or typed draft into:

Professional
Friendly
Direct
Empathetic
Shorter
More detailed
Sales-focused
Customer-support tone

Example:

Original:
I’ll get back to you soon.

AI rewrite:
Thanks for reaching out. I’ll review this and follow up with you shortly.
2. Smart Response Generator

User gives a short intent:

Need to reschedule a meeting

AI generates:

Hi, I need to reschedule our meeting. Please send a few times that work for you, and I’ll confirm one.
3. Page Context Reply

When user is inside a webpage, email, support ticket, or form, the extension can use selected page text as context.

Workflow:

User highlights text
Opens launcher
Clicks “Generate reply”
Chooses tone
AI drafts a response
User inserts or edits before sending

Important: never auto-send.

4. AI Template Builder

User describes a reusable response:

Create a polite refund denial message

The extension generates a reusable canned response and saves it to a category.

AI Technical Stack
Frontend
Chrome Extension Manifest V3
TypeScript
React or Preact for popup/options UI
Content script for text detection and insertion
Backend

Use a backend instead of calling AI directly from the extension.

Recommended:

Node.js + Express
OpenAI API
Stripe
Supabase or Firebase for auth and user data
Why backend is required

Do not expose the OpenAI API key in the browser extension.

The extension should call your backend:

Extension → Your API → OpenAI

Not:

Extension → OpenAI directly
Backend Endpoints
POST /api/ai/rewrite

Body:

{
  "text": "I’ll get back to you soon.",
  "tone": "professional"
}

Returns:

{
  "result": "Thanks for reaching out. I’ll review this and follow up with you shortly."
}
POST /api/ai/generate

Body:

{
  "intent": "reschedule a meeting",
  "tone": "friendly"
}
POST /api/ai/page-reply

Body:

{
  "selectedText": "Customer says the order arrived late.",
  "tone": "empathetic",
  "goal": "apologize and offer next steps"
}
POST /api/templates/save

Body:

{
  "title": "Refund Denial",
  "category": "Customer Support",
  "text": "Generated response text here"
}
Monetization Model
Free Plan

Price: $0

Includes:

Local canned responses
Categories
Keyboard launcher
Basic search
Limited AI rewrites, example: 10/month

Goal: drive adoption.

Pro Plan

Price: $7/month or $60/year

Includes:

Unlimited saved responses
AI rewrite
AI response generator
Page-context replies
Cloud sync
Import/export
Priority templates

Best for freelancers, salespeople, recruiters, and support reps.

Team Plan

Price: $12–20/user/month

Includes:

Shared response libraries
Team templates
Admin-managed categories
Usage analytics
Brand voice presets
Seat management

Best for agencies, support teams, and sales teams.

Stripe Integration

Use Stripe Checkout for billing.

Core flow:

User creates account
User chooses plan
Frontend calls backend:
POST /api/billing/create-checkout-session
Backend creates Stripe Checkout session
User pays
Stripe webhook updates subscription status
Extension unlocks Pro features
Stripe Tables / Fields

User table:

{
  "id": "user_123",
  "email": "user@example.com",
  "plan": "free",
  "stripeCustomerId": "cus_123",
  "subscriptionStatus": "active",
  "aiCreditsUsed": 4,
  "aiCreditsLimit": 10
}
Feature Gating

Before AI request:

Check user plan
Check monthly AI limit
If allowed → process request
If not allowed → show upgrade modal

Example rules:

{
  "free": {
    "aiCreditsPerMonth": 10,
    "cloudSync": false,
    "teamTemplates": false
  },
  "pro": {
    "aiCreditsPerMonth": 1000,
    "cloudSync": true,
    "teamTemplates": false
  },
  "team": {
    "aiCreditsPerMonth": 3000,
    "cloudSync": true,
    "teamTemplates": true
  }
}
AI UX Flow
Rewrite saved response
User opens Options page
Selects a saved response
Clicks “Rewrite with AI”
Chooses tone
AI returns 2–3 versions
User picks one
Saves it
Generate new response
User opens launcher
Clicks “AI Generate”
Enters short prompt
Chooses tone
AI drafts message
User inserts or saves
Page-context reply
User highlights page text
Opens launcher
Clicks “Reply to selection”
Adds goal
AI drafts response
User reviews and inserts
Upgrade Prompts

Do not block the whole app. Only gate premium actions.

Example:

You’ve used your 10 free AI rewrites this month.
Upgrade to Pro for more AI responses, cloud sync, and advanced templates.

Buttons:

Upgrade
Maybe later
Updated Claude Prompt
Extend the Canned Response Launcher Chrome Extension with AI and monetization.

Build the app as a Chrome Extension Manifest V3 with a backend API.

Frontend requirements:
- TypeScript
- Chrome Extension Manifest V3
- Content script for detecting active fields and inserting text
- Popup and options pages
- Overlay launcher
- AI buttons for:
  - Rewrite selected response
  - Generate new response
  - Reply to highlighted page text
- Upgrade modal when free limits are reached

Backend requirements:
- Node.js + Express
- OpenAI API integration
- Stripe Checkout integration
- Stripe webhook for subscription status
- Supabase or Firebase for auth/user storage
- Feature gating by plan
- Monthly AI usage tracking

AI endpoints:
- POST /api/ai/rewrite
- POST /api/ai/generate
- POST /api/ai/page-reply

Billing endpoints:
- POST /api/billing/create-checkout-session
- POST /api/billing/webhook

Plans:
- Free: local responses + 10 AI credits/month
- Pro: $7/month or $60/year, cloud sync + 1000 AI credits/month
- Team: $12–20/user/month, shared libraries + admin templates

Security:
- Never expose OpenAI or Stripe secret keys in the extension
- AI requests must go through backend
- Validate auth before AI calls
- Rate limit requests
- Store only necessary user data

Return:
- Full working codebase
- Extension files
- Backend files
- Database schema
- Stripe setup notes
- Environment variable list
- Local dev instructions