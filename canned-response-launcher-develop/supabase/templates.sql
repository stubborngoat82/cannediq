-- ============================================================
-- cannedIQ — Template Store Schema
-- Run in Supabase SQL editor (or via `supabase db push`).
-- ============================================================

-- ── Template packs (the products) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS template_packs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  category     text        NOT NULL DEFAULT 'general', -- support, sales, recruiting, dev, general
  icon         text        NOT NULL DEFAULT '📦',
  price_cents  int         NOT NULL DEFAULT 0,          -- 0 = free
  stripe_price_id text,                                 -- set for paid packs
  command_count int        NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  is_featured  boolean     NOT NULL DEFAULT false,
  preview_text text,                                    -- short teaser shown on card
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE template_packs IS 'Purchasable command template packs available in the template store.';
COMMENT ON COLUMN template_packs.price_cents IS '0 = free. Positive = USD cents (e.g. 499 = $4.99).';

-- ── Template commands (the actual commands inside each pack) ──────────────────

CREATE TABLE IF NOT EXISTS template_commands (
  id           uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id      uuid  NOT NULL REFERENCES template_packs(id) ON DELETE CASCADE,
  command_data jsonb NOT NULL,   -- full command object matching chrome.storage.local format
  sort_order   int   NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_template_commands_pack_id ON template_commands(pack_id);

COMMENT ON TABLE template_commands IS 'Individual commands belonging to a template pack. command_data matches the extension storage format.';

-- ── User purchases ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_template_purchases (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id                  uuid        NOT NULL REFERENCES template_packs(id),
  purchased_at             timestamptz NOT NULL DEFAULT now(),
  stripe_payment_intent_id text,
  applied_at               timestamptz,               -- when the user applied commands to their extension
  UNIQUE (user_id, pack_id)
);

CREATE INDEX IF NOT EXISTS idx_user_template_purchases_user ON user_template_purchases(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE template_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_template_purchases ENABLE ROW LEVEL SECURITY;

-- Packs: anyone can read active packs (including unauthenticated browse)
CREATE POLICY "Public read active template packs"
  ON template_packs FOR SELECT
  USING (is_active = true);

-- Commands: only users who have purchased (or free pack) can read commands
-- Service role (edge functions) bypasses this for delivery
CREATE POLICY "Purchased users can read template commands"
  ON template_commands FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM template_packs tp
      WHERE tp.id = pack_id AND tp.price_cents = 0
    )
    OR EXISTS (
      SELECT 1 FROM user_template_purchases utp
      WHERE utp.pack_id = pack_id AND utp.user_id = (select auth.uid())
    )
  );

-- Purchases: users can read/insert their own
CREATE POLICY "Users can view own purchases"
  ON user_template_purchases FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own purchases"
  ON user_template_purchases FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own purchases"
  ON user_template_purchases FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ── Seed: starter template packs ─────────────────────────────────────────────

INSERT INTO template_packs (name, description, category, icon, price_cents, command_count, is_featured, preview_text) VALUES

('Customer Support Essentials', 'The most common support responses — ticket acknowledgements, escalations, refunds, and follow-ups. Works great in Zendesk, Intercom, and Freshdesk.', 'support', '🎧', 0, 8, true, 'Hi {{firstName}}, thanks for reaching out! I''ve reviewed your case and...'),

('Sales Outreach Pro', 'Cold outreach, follow-ups, objection handling, and closing sequences. Built for reps who live in their inbox.', 'sales', '💼', 499, 10, true, 'Hi {{firstName}}, I noticed {{company}} recently...'),

('Recruiting & HR Toolkit', 'Candidate outreach, interview scheduling, offer letters, and rejection messages. Saves hours per week for talent teams.', 'recruiting', '🧑‍💼', 499, 9, false, 'Hi {{firstName}}, your background in {{role}} caught my attention...'),

('Developer Workflow Pack', 'Code review comments, PR descriptions, bug report templates, standup updates, and on-call handoffs.', 'dev', '💻', 299, 8, false, 'LGTM — left a few inline comments. Main concern is...'),

('E-commerce Support', 'Order status, shipping delays, returns, refunds, and product FAQs. Optimized for Shopify and WooCommerce stores.', 'support', '🛍️', 299, 7, false, 'I can see your order #{{orderNumber}} shipped on...'),

('Executive Assistant Essentials', 'Meeting requests, follow-up summaries, calendar holds, travel confirmations, and professional declines.', 'general', '📅', 399, 6, false, 'Thank you for reaching out. {{executiveName}} has asked me to...')

ON CONFLICT DO NOTHING;

-- ── Seed: commands for "Customer Support Essentials" (free) ──────────────────

DO $$
DECLARE
  pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'Customer Support Essentials' LIMIT 1;
  IF pack_id IS NULL THEN RETURN; END IF;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, ‘{
    "name": "Ticket Acknowledgement",
    "description": "First response to a new support ticket",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you for reaching out to {{companyName}} Support! I’’ve received your request and want you to know we’’re on it.\n\nI’’ll be reviewing your case and will follow up within {{responseTime}} business hours with an update.\n\nIn the meantime, if you have any additional details to share, please reply to this message.\n\nBest,\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "companyName", "label": "Your company or team name", "type": "text"}, {"name": "responseTime", "label": "Response time (hours)", "type": "text", "defaultValue": "4"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/ack"}],
    "actions": [{"type": "insert_text"}]
  }’::jsonb),

  (pack_id, 2, '{
    "name": "Refund Approved",
    "description": "Notify customer their refund has been approved",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nGreat news! Your refund of {{amount}} has been approved and processed.\n\nYou should see the funds returned to your {{paymentMethod}} within 3–5 business days, depending on your bank.\n\nIf you don’t see it by {{expectedDate}}, please don’t hesitate to reach back out.\n\nWe appreciate your patience and hope to serve you again!\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "amount", "label": "Refund amount (e.g. $49.00)", "type": "text"}, {"name": "paymentMethod", "label": "Payment method", "type": "select", "options": ["credit card", "debit card", "PayPal", "bank account"]}, {"name": "expectedDate", "label": "Expected by date", "type": "text"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/refund-ok"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "Escalation Notice",
    "description": "Let customer know their case has been escalated",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI wanted to update you that your case has been escalated to our {{teamName}} team who specialize in {{issueType}}.\n\nA specialist will be in touch within {{timeframe}}. Your case reference is {{caseId}}.\n\nThank you for your patience.\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "teamName", "label": "Team name (e.g. Technical)", "type": "text"}, {"name": "issueType", "label": "Issue type", "type": "text"}, {"name": "timeframe", "label": "Response timeframe", "type": "text", "defaultValue": "24 hours"}, {"name": "caseId", "label": "Case/ticket ID", "type": "text"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/escalate"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Issue Resolved — Closing",
    "description": "Close a resolved ticket professionally",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI’m glad we were able to resolve {{issue}} for you!\n\nIf you have any other questions or run into anything else, don’t hesitate to reach out. We’re always happy to help.\n\nHave a great {{dayPart}}!\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "issue", "label": "Issue summary", "type": "text"}, {"name": "dayPart", "label": "Time of day", "type": "select", "options": ["day", "weekend", "week"]}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/close-ok"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Need More Information",
    "description": "Ask for clarification before proceeding",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you for contacting {{companyName}}! To help you as quickly as possible, I need a bit more information:\n\n{{questions}}\n\nOnce I have these details, I’’ll be able to get this sorted out for you right away.\n\nLooking forward to hearing from you!\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "companyName", "label": "Your company or team name", "type": "text"}, {"name": "questions", "label": "Questions (one per line)", "type": "text"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/need-info"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Shipping Delay Apology",
    "description": "Proactively communicate a shipping delay",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI’m reaching out to let you know that your order (#{{orderNumber}}) is experiencing a slight delay due to {{reason}}.\n\nYour updated estimated delivery date is {{newDate}}. I sincerely apologize for any inconvenience this causes.\n\nAs a thank-you for your patience, {{compensation}}.\n\nIf you have any questions, I’m here to help.\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "orderNumber", "label": "Order number", "type": "text"}, {"name": "reason", "label": "Delay reason", "type": "text", "defaultValue": "high demand"}, {"name": "newDate", "label": "New estimated delivery", "type": "text"}, {"name": "compensation", "label": "Compensation offer (or leave blank)", "type": "text", "defaultValue": "we’ve added a 10% discount to your account"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/ship-delay"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 7, '{
    "name": "Subscription Cancellation",
    "description": "Acknowledge a subscription cancellation gracefully",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI’’ve processed your cancellation request for {{productName}}. Your subscription is now cancelled and you won’’t be charged again.\n\nYou’’ll continue to have access until {{endDate}}.\n\nIf you ever decide to come back, we’’d love to have you. Is there anything we could have done better? Your feedback means a lot to us.\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "productName", "label": "Product or plan name", "type": "text"}, {"name": "endDate", "label": "Access end date", "type": "text"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/cancel-ack"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 8, '{
    "name": "Follow-Up Check-In",
    "description": "Follow up after a resolved issue",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI wanted to follow up and make sure everything is still working well after we resolved {{issue}} last week.\n\nIs there anything else I can help you with?\n\n{{agentName}}",
    "variables": [{"name": "firstName", "label": "Customer first name", "type": "text"}, {"name": "issue", "label": "Issue that was resolved", "type": "text"}, {"name": "agentName", "label": "Your name", "type": "text"}],
    "triggers": [{"type": "slash", "value": "/follow-up"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  -- Update command count
  UPDATE template_packs SET command_count = 8 WHERE id = pack_id;
END $$;
