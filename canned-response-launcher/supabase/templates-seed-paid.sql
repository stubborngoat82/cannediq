-- ============================================================
-- cannedIQ — Paid Template Pack Seeds
-- Run AFTER templates.sql has been executed.
-- Safe to re-run: deletes and re-inserts commands for each pack.
-- ============================================================

-- ── Sales Outreach Pro ────────────────────────────────────────────────────────

DO $$
DECLARE pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'Sales Outreach Pro' LIMIT 1;
  IF pack_id IS NULL THEN RAISE NOTICE 'Pack not found: Sales Outreach Pro'; RETURN; END IF;

  DELETE FROM template_commands WHERE pack_id = pack_id;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, '{
    "name": "Cold Outreach — First Touch",
    "description": "Initial cold email to a prospect",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI came across {{company}} and was impressed by {{specificDetail}}.\n\nI work with companies like yours to {{valueProposition}}. Most of our customers see {{outcome}} within {{timeframe}}.\n\nWould it make sense to connect for a quick 15-minute call this week to see if there''s a fit?\n\n{{senderName}}\n{{senderTitle}}, {{senderCompany}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "specificDetail", "label": "Specific thing you noticed (e.g. your recent Series B)", "type": "text"},
      {"name": "valueProposition", "label": "What you help with", "type": "text"},
      {"name": "outcome", "label": "Key outcome (e.g. 30% faster onboarding)", "type": "text"},
      {"name": "timeframe", "label": "Timeframe (e.g. 90 days)", "type": "text", "defaultValue": "90 days"},
      {"name": "senderName", "label": "Your name", "type": "text"},
      {"name": "senderTitle", "label": "Your title", "type": "text"},
      {"name": "senderCompany", "label": "Your company", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/cold-first"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 2, '{
    "name": "Follow-Up #1 — Soft Nudge",
    "description": "First follow-up after no response",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nJust wanted to bump this to the top of your inbox in case it got buried.\n\nI know your time is valuable — I''ll keep it brief: I think {{company}} could benefit from {{benefit}}, and I''d love to show you how.\n\nWorth a quick chat?\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "benefit", "label": "Key benefit (short)", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/follow-1"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "Follow-Up #2 — Add Value",
    "description": "Second follow-up with a relevant resource",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI wanted to share something that might be useful regardless of whether we ever work together — {{resourceDescription}}.\n\n{{resourceLink}}\n\nHope it''s helpful. And if the timing ever is right to talk about {{topic}}, I''m just a reply away.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "resourceDescription", "label": "What the resource is (e.g. a case study on reducing churn)", "type": "text"},
      {"name": "resourceLink", "label": "Link or attachment", "type": "text"},
      {"name": "topic", "label": "Your solution topic", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/follow-2"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Follow-Up #3 — Break-Up",
    "description": "Final follow-up before closing the thread",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''ve reached out a few times and haven''t heard back — I completely understand, things get busy.\n\nI''ll stop following up after this, but if {{triggerEvent}} or you ever want to explore {{topic}}, feel free to reach out.\n\nWishing you and the {{company}} team all the best.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "triggerEvent", "label": "Trigger event (e.g. your team grows past 50)", "type": "text"},
      {"name": "topic", "label": "Your solution topic", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/break-up"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Objection — Too Expensive",
    "description": "Handle price objection confidently",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI appreciate you being upfront about the budget concern — it''s a fair one.\n\nA few things worth considering:\n\n1. {{roi}} — meaning the tool typically pays for itself within {{paybackPeriod}}.\n2. We offer {{flexibilityOption}} to make it easier to get started.\n3. The cost of not solving {{problem}} is often higher than the cost of fixing it.\n\nWould it help to walk through the ROI numbers specific to {{company}}? I can put together a quick analysis.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "roi", "label": "ROI statement (e.g. customers save 5 hrs/week per agent)", "type": "text"},
      {"name": "paybackPeriod", "label": "Payback period (e.g. 2 months)", "type": "text", "defaultValue": "60–90 days"},
      {"name": "flexibilityOption", "label": "Flexibility (e.g. monthly billing, a pilot tier)", "type": "text"},
      {"name": "problem", "label": "The problem you solve", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/obj-price"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Objection — Not the Right Time",
    "description": "Handle timing objection and keep the door open",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nCompletely understand — timing is everything.\n\nWhen you say not right now, is it more of a budget cycle thing, a capacity thing, or something else? I ask because it helps me figure out if we should reconnect in {{timeframe}} or if it makes more sense to touch base when {{condition}}.\n\nEither way, happy to put a reminder on my calendar for whenever works best for you.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "timeframe", "label": "Suggested reconnect timeframe (e.g. Q2)", "type": "text", "defaultValue": "next quarter"},
      {"name": "condition", "label": "Condition to reconnect (e.g. your new hire is onboarded)", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/obj-timing"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 7, '{
    "name": "Demo Follow-Up",
    "description": "Follow up after a product demo",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nGreat connecting with you today! Here''s a quick recap of what we covered:\n\n{{recapPoints}}\n\nBased on our conversation, I think the biggest opportunity for {{company}} is {{keyOpportunity}}.\n\nNext steps: {{nextSteps}}\n\nI''ll follow up {{followUpDate}}. Let me know if you have any questions in the meantime.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "recapPoints", "label": "Key points covered (use bullet points)", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "keyOpportunity", "label": "Top opportunity identified", "type": "text"},
      {"name": "nextSteps", "label": "Agreed next steps", "type": "text"},
      {"name": "followUpDate", "label": "Follow-up date (e.g. Thursday)", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/demo-follow"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 8, '{
    "name": "Proposal Sent",
    "description": "Send a proposal and set expectations",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nAs promised, I''ve attached the proposal for {{company}}. Here''s a quick summary:\n\n• Investment: {{price}}\n• Scope: {{scope}}\n• Timeline: {{timeline}}\n• What''s included: {{inclusions}}\n\nI''m available {{availability}} to walk through any questions. The proposal is valid through {{expirationDate}}.\n\nLooking forward to moving forward together!\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "company", "label": "Prospect company", "type": "text"},
      {"name": "price", "label": "Pricing", "type": "text"},
      {"name": "scope", "label": "Project scope summary", "type": "text"},
      {"name": "timeline", "label": "Timeline", "type": "text"},
      {"name": "inclusions", "label": "What is included", "type": "text"},
      {"name": "availability", "label": "Your availability (e.g. Tuesday or Wednesday this week)", "type": "text"},
      {"name": "expirationDate", "label": "Proposal expiration date", "type": "text"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/proposal"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 9, '{
    "name": "Closing — Trial Conversion",
    "description": "Move a trial user toward a paid plan",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nYour trial of {{productName}} ends on {{trialEndDate}} — I wanted to reach out before it expires.\n\nBased on your usage, you''ve {{usageHighlight}}, which tells me you''re seeing real value.\n\nTo keep the momentum going, {{upgradeOffer}}.\n\nWant me to set you up? Takes 2 minutes.\n\n{{senderName}}",
    "variables": [
      {"name": "firstName", "label": "Prospect first name", "type": "text"},
      {"name": "productName", "label": "Product name", "type": "text"},
      {"name": "trialEndDate", "label": "Trial end date", "type": "text"},
      {"name": "usageHighlight", "label": "Usage stat (e.g. launched 47 commands this week)", "type": "text"},
      {"name": "upgradeOffer", "label": "Upgrade offer or CTA", "type": "text", "defaultValue": "I''d love to extend your trial by 7 days or get you set up on the plan that fits best"},
      {"name": "senderName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/trial-close"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 10, '{
    "name": "Win Announcement — Internal",
    "description": "Announce a closed deal to the team",
    "commandType": "variable",
    "template": "🎉 New {{dealType}}!\n\nCompany: {{company}}\nContact: {{contactName}}, {{contactTitle}}\nValue: {{dealValue}}\nClose date: {{closeDate}}\nPlan/Product: {{product}}\n\nHow we won: {{winReason}}\n\nHandoff to: {{csOwner}}\n\nThanks to {{contributors}} for the support on this one! 💪",
    "variables": [
      {"name": "dealType", "label": "Deal type (e.g. New Customer, Expansion)", "type": "select", "options": ["New Customer", "Expansion", "Renewal", "Upsell"]},
      {"name": "company", "label": "Customer company", "type": "text"},
      {"name": "contactName", "label": "Primary contact name", "type": "text"},
      {"name": "contactTitle", "label": "Primary contact title", "type": "text"},
      {"name": "dealValue", "label": "Deal value (e.g. $12,000 ARR)", "type": "text"},
      {"name": "closeDate", "label": "Close date", "type": "text"},
      {"name": "product", "label": "Plan or product purchased", "type": "text"},
      {"name": "winReason", "label": "Why we won (1–2 sentences)", "type": "text"},
      {"name": "csOwner", "label": "CS/onboarding owner", "type": "text"},
      {"name": "contributors", "label": "Team members who helped", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/win"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  UPDATE template_packs SET command_count = 10 WHERE id = pack_id;
END $$;


-- ── Recruiting & HR Toolkit ───────────────────────────────────────────────────

DO $$
DECLARE pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'Recruiting & HR Toolkit' LIMIT 1;
  IF pack_id IS NULL THEN RAISE NOTICE 'Pack not found: Recruiting & HR Toolkit'; RETURN; END IF;

  DELETE FROM template_commands WHERE pack_id = pack_id;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, '{
    "name": "Candidate Outreach — LinkedIn",
    "description": "Initial outreach to a passive candidate",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI came across your profile and was impressed by your background in {{background}}.\n\nI''m currently working on a {{role}} opportunity at {{company}} that I think could be a great next step for someone with your experience — specifically {{specificDetail}}.\n\nThe role offers {{highlight1}} and {{highlight2}}.\n\nWould you be open to a 15-minute call to learn more? No pressure at all — happy to share details first if that''s easier.\n\n{{recruiterName}}\n{{recruiterTitle}}, {{hiringCompany}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "background", "label": "Their relevant background (e.g. enterprise SaaS sales)", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Hiring company", "type": "text"},
      {"name": "specificDetail", "label": "Specific experience that caught your eye", "type": "text"},
      {"name": "highlight1", "label": "Key benefit #1 (e.g. remote-first culture)", "type": "text"},
      {"name": "highlight2", "label": "Key benefit #2 (e.g. Series B with clear equity upside)", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"},
      {"name": "recruiterTitle", "label": "Your title", "type": "text"},
      {"name": "hiringCompany", "label": "Your company", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/recruit-out"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 2, '{
    "name": "Interview Invitation",
    "description": "Invite a candidate to interview",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you for your interest in the {{role}} position at {{company}} — after reviewing your application, we''d love to schedule an interview!\n\nHere''s what to expect:\n\nStage: {{stage}}\nFormat: {{format}}\nDuration: {{duration}}\nInterviewer(s): {{interviewers}}\n\nPlease use this link to pick a time that works for you: {{schedulingLink}}\n\nLet me know if you have any questions beforehand. Looking forward to connecting!\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "stage", "label": "Interview stage (e.g. Phone Screen, Technical Round)", "type": "text"},
      {"name": "format", "label": "Format (e.g. Video call via Zoom)", "type": "text", "defaultValue": "Video call via Zoom"},
      {"name": "duration", "label": "Duration (e.g. 45 minutes)", "type": "text", "defaultValue": "45 minutes"},
      {"name": "interviewers", "label": "Interviewer name(s) and title(s)", "type": "text"},
      {"name": "schedulingLink", "label": "Scheduling link (Calendly, etc.)", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/interview-invite"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "Interview Confirmation",
    "description": "Confirm scheduled interview details",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThis is a confirmation for your upcoming interview for the {{role}} position at {{company}}.\n\nDate: {{date}}\nTime: {{time}} {{timezone}}\nFormat: {{format}}\nLink/Location: {{link}}\nInterviewer: {{interviewer}}\n\nTo prepare, you may want to {{prepTip}}.\n\nPlease reach out if anything changes or if you have questions. We''re looking forward to speaking with you!\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "date", "label": "Interview date", "type": "text"},
      {"name": "time", "label": "Interview time", "type": "text"},
      {"name": "timezone", "label": "Timezone (e.g. ET)", "type": "text", "defaultValue": "ET"},
      {"name": "format", "label": "Format (e.g. Zoom, phone, in-person)", "type": "text"},
      {"name": "link", "label": "Meeting link or address", "type": "text"},
      {"name": "interviewer", "label": "Interviewer name and title", "type": "text"},
      {"name": "prepTip", "label": "Preparation tip (e.g. review our product page)", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/interview-confirm"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Post-Interview Thank You Request",
    "description": "Prompt candidate to send a thank-you note",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nGreat speaking with you today! I wanted to pass along a tip — {{interviewer}} appreciates hearing from candidates after interviews. A short thank-you note within 24 hours goes a long way.\n\nYou can reach them at {{interviewerEmail}}.\n\nI''ll be in touch by {{updateDate}} with next steps. In the meantime, feel free to reach out with any questions.\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "interviewer", "label": "Interviewer name", "type": "text"},
      {"name": "interviewerEmail", "label": "Interviewer email", "type": "text"},
      {"name": "updateDate", "label": "When you''ll update them (e.g. end of week)", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/post-interview"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Offer Letter Intro",
    "description": "Present a job offer with excitement",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''m thrilled to share that we''d like to offer you the position of {{role}} at {{company}}!\n\nHere are the key details:\n\nStart date: {{startDate}}\nSalary: {{salary}}\nBonus: {{bonus}}\nEquity: {{equity}}\nBenefits: {{benefits}}\n\nThe formal offer letter is attached. Please review it and let us know if you have any questions.\n\nWe''d love to have your decision by {{decisionDate}}. We''re genuinely excited about the possibility of you joining the team — don''t hesitate to reach out!\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "startDate", "label": "Proposed start date", "type": "text"},
      {"name": "salary", "label": "Base salary", "type": "text"},
      {"name": "bonus", "label": "Bonus structure (or N/A)", "type": "text"},
      {"name": "equity", "label": "Equity details (or N/A)", "type": "text"},
      {"name": "benefits", "label": "Benefits summary", "type": "text"},
      {"name": "decisionDate", "label": "Decision deadline", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/offer"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Rejection — Post-Application",
    "description": "Decline a candidate after application review",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you for taking the time to apply for the {{role}} position at {{company}} and for your interest in joining our team.\n\nAfter careful consideration, we''ve decided to move forward with candidates whose experience more closely aligns with our current needs. This was a competitive pool, and the decision was not easy.\n\nWe''ll keep your information on file and encourage you to apply again in the future — we''re always growing.\n\nThank you again, and we wish you all the best in your search.\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/reject-app"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 7, '{
    "name": "Rejection — Post-Interview",
    "description": "Decline a candidate after interviewing",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you so much for taking the time to interview for the {{role}} role at {{company}}. We genuinely enjoyed getting to know you.\n\nAfter careful deliberation, we''ve decided to move forward with another candidate whose background more closely matches our immediate needs. This was a very difficult decision given the strength of our candidate pool.\n\n{{personalNote}}\n\nI''d love to stay in touch — your skills in {{skillArea}} are impressive, and I could see opportunities to collaborate in the future.\n\nWishing you the very best.\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "personalNote", "label": "Personal note (optional, e.g. Your presentation was excellent)", "type": "text"},
      {"name": "skillArea", "label": "Standout skill area", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/reject-interview"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 8, '{
    "name": "Reference Check Request",
    "description": "Ask a candidate for references",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nGreat news — things are progressing well, and we''d like to move to the reference check stage!\n\nCould you please provide {{numRefs}} professional references (ideally including a former manager)? For each, please share:\n\n• Name and title\n• Company\n• Relationship to you\n• Best contact method (email or phone)\n\nPlease give them a heads-up that {{recruiterName}} from {{company}} will be in touch within the next few days.\n\nThanks, and we''ll be in touch soon!\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "Candidate first name", "type": "text"},
      {"name": "numRefs", "label": "Number of references needed", "type": "text", "defaultValue": "2–3"},
      {"name": "recruiterName", "label": "Your name", "type": "text"},
      {"name": "company", "label": "Your company", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/ref-check"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 9, '{
    "name": "New Hire Welcome",
    "description": "Welcome a new hire before their start date",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nWelcome to the {{company}} family! We are so excited to have you joining us as our new {{role}}.\n\nA few things to help you prepare for Day 1:\n\n📅 Start date: {{startDate}}\n🕘 Arrival time: {{arrivalTime}}\n📍 Location/Link: {{location}}\n👋 Your manager: {{managerName}}\n💻 Equipment: {{equipmentNote}}\n\nIn the meantime, {{preboardingTask}}.\n\nDon''t hesitate to reach out if you have any questions before your first day. We can''t wait to have you on the team!\n\n{{recruiterName}}",
    "variables": [
      {"name": "firstName", "label": "New hire first name", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "role", "label": "Role title", "type": "text"},
      {"name": "startDate", "label": "Start date", "type": "text"},
      {"name": "arrivalTime", "label": "Arrival time (e.g. 9:00 AM)", "type": "text", "defaultValue": "9:00 AM"},
      {"name": "location", "label": "Office address or Zoom link", "type": "text"},
      {"name": "managerName", "label": "Manager name", "type": "text"},
      {"name": "equipmentNote", "label": "Equipment info (e.g. your laptop will be ready at reception)", "type": "text"},
      {"name": "preboardingTask", "label": "Preboarding task (e.g. please complete the forms in your Workday inbox)", "type": "text"},
      {"name": "recruiterName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/welcome-hire"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  UPDATE template_packs SET command_count = 9 WHERE id = pack_id;
END $$;


-- ── Developer Workflow Pack ───────────────────────────────────────────────────

DO $$
DECLARE pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'Developer Workflow Pack' LIMIT 1;
  IF pack_id IS NULL THEN RAISE NOTICE 'Pack not found: Developer Workflow Pack'; RETURN; END IF;

  DELETE FROM template_commands WHERE pack_id = pack_id;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, '{
    "name": "PR Review — Approved",
    "description": "Approve a pull request with feedback",
    "commandType": "variable",
    "template": "LGTM ✅\n\n{{mainFeedback}}\n\nA few minor nits (non-blocking):\n{{nits}}\n\nNice work on {{highlight}} — that''s a clean approach.",
    "variables": [
      {"name": "mainFeedback", "label": "Main feedback (1–2 sentences)", "type": "text"},
      {"name": "nits", "label": "Minor nits (one per line)", "type": "text"},
      {"name": "highlight", "label": "Something done well", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/pr-approve"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 2, '{
    "name": "PR Review — Changes Requested",
    "description": "Request changes on a pull request",
    "commandType": "variable",
    "template": "Thanks for the PR! A few things before this is ready to merge:\n\n🔴 Blocking:\n{{blocking}}\n\n🟡 Should address:\n{{shouldAddress}}\n\n💡 Optional / to discuss:\n{{optional}}\n\nOverall the approach is {{overallTake}} — just want to make sure we nail {{concern}} before this lands.",
    "variables": [
      {"name": "blocking", "label": "Blocking issues (must fix)", "type": "text"},
      {"name": "shouldAddress", "label": "Should-address items", "type": "text"},
      {"name": "optional", "label": "Optional suggestions", "type": "text"},
      {"name": "overallTake", "label": "Overall take (e.g. solid, on the right track)", "type": "text"},
      {"name": "concern", "label": "Key concern to address", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/pr-changes"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "PR Description",
    "description": "Write a clear pull request description",
    "commandType": "variable",
    "template": "## What\n{{what}}\n\n## Why\n{{why}}\n\n## How\n{{how}}\n\n## Testing\n{{testing}}\n\n## Screenshots\n{{screenshots}}\n\n## Checklist\n- [ ] Tests added/updated\n- [ ] Docs updated\n- [ ] No breaking changes (or migration path documented)\n- [ ] Reviewed for performance implications",
    "variables": [
      {"name": "what", "label": "What this PR does (1–2 sentences)", "type": "text"},
      {"name": "why", "label": "Why this change is needed", "type": "text"},
      {"name": "how", "label": "How it was implemented (brief)", "type": "text"},
      {"name": "testing", "label": "How to test (steps or test names)", "type": "text"},
      {"name": "screenshots", "label": "Screenshots or N/A", "type": "text", "defaultValue": "N/A"}
    ],
    "triggers": [{"type": "slash", "value": "/pr-desc"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Bug Report",
    "description": "File a detailed bug report",
    "commandType": "variable",
    "template": "## Bug Report\n\n**Summary:** {{summary}}\n\n**Environment:**\n- OS: {{os}}\n- Browser/Version: {{browser}}\n- App version: {{appVersion}}\n\n**Steps to reproduce:**\n{{steps}}\n\n**Expected behavior:**\n{{expected}}\n\n**Actual behavior:**\n{{actual}}\n\n**Frequency:** {{frequency}}\n\n**Additional context:**\n{{context}}",
    "variables": [
      {"name": "summary", "label": "One-line summary", "type": "text"},
      {"name": "os", "label": "Operating system", "type": "text"},
      {"name": "browser", "label": "Browser or client version", "type": "text"},
      {"name": "appVersion", "label": "App/service version", "type": "text"},
      {"name": "steps", "label": "Steps to reproduce (numbered)", "type": "text"},
      {"name": "expected", "label": "Expected behavior", "type": "text"},
      {"name": "actual", "label": "Actual behavior", "type": "text"},
      {"name": "frequency", "label": "How often (e.g. Always, Intermittent)", "type": "select", "options": ["Always", "Often", "Intermittent", "Once"]},
      {"name": "context", "label": "Additional context, logs, or screenshots", "type": "text", "defaultValue": "N/A"}
    ],
    "triggers": [{"type": "slash", "value": "/bug"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Daily Standup",
    "description": "Post a structured standup update",
    "commandType": "variable",
    "template": "**Yesterday:** {{yesterday}}\n\n**Today:** {{today}}\n\n**Blockers:** {{blockers}}",
    "variables": [
      {"name": "yesterday", "label": "What you did yesterday", "type": "text"},
      {"name": "today", "label": "What you''re doing today", "type": "text"},
      {"name": "blockers", "label": "Blockers (or None)", "type": "text", "defaultValue": "None"}
    ],
    "triggers": [{"type": "slash", "value": "/standup"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Incident Postmortem",
    "description": "Structure a postmortem after an incident",
    "commandType": "variable",
    "template": "# Postmortem: {{incidentTitle}}\n\n**Date:** {{date}}\n**Severity:** {{severity}}\n**Duration:** {{duration}}\n**Author:** {{author}}\n\n## Summary\n{{summary}}\n\n## Timeline\n{{timeline}}\n\n## Root Cause\n{{rootCause}}\n\n## Impact\n{{impact}}\n\n## What Went Well\n{{wentWell}}\n\n## What Could Be Improved\n{{improvements}}\n\n## Action Items\n{{actionItems}}",
    "variables": [
      {"name": "incidentTitle", "label": "Incident title", "type": "text"},
      {"name": "date", "label": "Date of incident", "type": "text"},
      {"name": "severity", "label": "Severity", "type": "select", "options": ["SEV-1 (Critical)", "SEV-2 (High)", "SEV-3 (Medium)", "SEV-4 (Low)"]},
      {"name": "duration", "label": "Duration (e.g. 47 minutes)", "type": "text"},
      {"name": "author", "label": "Postmortem author", "type": "text"},
      {"name": "summary", "label": "1–2 sentence summary", "type": "text"},
      {"name": "timeline", "label": "Key timeline events (time — event)", "type": "text"},
      {"name": "rootCause", "label": "Root cause analysis", "type": "text"},
      {"name": "impact", "label": "User/system impact", "type": "text"},
      {"name": "wentWell", "label": "What went well", "type": "text"},
      {"name": "improvements", "label": "What could be improved", "type": "text"},
      {"name": "actionItems", "label": "Action items with owners and due dates", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/postmortem"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 7, '{
    "name": "On-Call Handoff",
    "description": "Hand off on-call responsibilities",
    "commandType": "variable",
    "template": "**On-Call Handoff — {{date}}**\n\n**Outgoing:** {{outgoing}}\n**Incoming:** {{incoming}}\n\n**Active incidents / known issues:**\n{{activeIssues}}\n\n**Things to watch:**\n{{watchItems}}\n\n**Runbook reminders:**\n{{runbooks}}\n\n**Anything else:**\n{{notes}}",
    "variables": [
      {"name": "date", "label": "Handoff date", "type": "text"},
      {"name": "outgoing", "label": "Outgoing on-call engineer", "type": "text"},
      {"name": "incoming", "label": "Incoming on-call engineer", "type": "text"},
      {"name": "activeIssues", "label": "Active incidents or known issues (or None)", "type": "text", "defaultValue": "None"},
      {"name": "watchItems", "label": "Things to keep an eye on", "type": "text"},
      {"name": "runbooks", "label": "Relevant runbook links", "type": "text"},
      {"name": "notes", "label": "Additional notes", "type": "text", "defaultValue": "None"}
    ],
    "triggers": [{"type": "slash", "value": "/oncall-hand"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 8, '{
    "name": "Deployment Announcement",
    "description": "Announce a deployment to the team",
    "commandType": "variable",
    "template": "🚀 **Deployment: {{version}}**\n\n**Environment:** {{environment}}\n**Time:** {{time}}\n**Deployed by:** {{deployer}}\n\n**What''s in this release:**\n{{changes}}\n\n**Rollback plan:** {{rollback}}\n\n**Monitoring:** {{monitoringLink}}\n\nPing {{deployer}} with any issues.",
    "variables": [
      {"name": "version", "label": "Version or release name", "type": "text"},
      {"name": "environment", "label": "Environment (e.g. Production, Staging)", "type": "select", "options": ["Production", "Staging", "Preview"]},
      {"name": "time", "label": "Deployment time", "type": "text"},
      {"name": "deployer", "label": "Your name/handle", "type": "text"},
      {"name": "changes", "label": "Changes in this release", "type": "text"},
      {"name": "rollback", "label": "Rollback plan", "type": "text", "defaultValue": "Revert to previous tag and redeploy"},
      {"name": "monitoringLink", "label": "Monitoring dashboard link", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/deploy"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  UPDATE template_packs SET command_count = 8 WHERE id = pack_id;
END $$;


-- ── E-commerce Support ────────────────────────────────────────────────────────

DO $$
DECLARE pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'E-commerce Support' LIMIT 1;
  IF pack_id IS NULL THEN RAISE NOTICE 'Pack not found: E-commerce Support'; RETURN; END IF;

  DELETE FROM template_commands WHERE pack_id = pack_id;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, '{
    "name": "Order Status Update",
    "description": "Respond to an order status inquiry",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThanks for reaching out! I looked up your order #{{orderNumber}} and here''s the latest:\n\nStatus: {{status}}\n{{trackingInfo}}\n\n{{additionalNote}}\n\nLet me know if you have any other questions — happy to help!\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "orderNumber", "label": "Order number", "type": "text"},
      {"name": "status", "label": "Current status (e.g. Shipped, Processing, Delivered)", "type": "text"},
      {"name": "trackingInfo", "label": "Tracking number/link (or leave blank)", "type": "text"},
      {"name": "additionalNote", "label": "Any additional context", "type": "text"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/order-status"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 2, '{
    "name": "Return Request Approved",
    "description": "Approve a return request and provide instructions",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nGreat news — your return request for order #{{orderNumber}} has been approved!\n\nHere''s what to do next:\n\n1. Pack the item(s) securely in the original packaging if possible.\n2. Use the prepaid label attached to this email.\n3. Drop the package off at any {{carrier}} location.\n\nOnce we receive and inspect the return, your refund of {{refundAmount}} will be processed to your {{refundMethod}} within {{refundTimeline}}.\n\nThank you for giving us a chance to make it right!\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "orderNumber", "label": "Order number", "type": "text"},
      {"name": "carrier", "label": "Carrier (e.g. UPS, FedEx, USPS)", "type": "select", "options": ["UPS", "FedEx", "USPS", "DHL"]},
      {"name": "refundAmount", "label": "Refund amount", "type": "text"},
      {"name": "refundMethod", "label": "Refund method (e.g. original credit card)", "type": "text", "defaultValue": "original payment method"},
      {"name": "refundTimeline", "label": "Refund timeline (e.g. 5–7 business days)", "type": "text", "defaultValue": "5–7 business days"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/return-ok"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "Item Damaged in Shipping",
    "description": "Handle a damaged item complaint",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''m so sorry to hear your order arrived damaged — that''s not the experience we want for you at all.\n\nTo make this right, I''ve gone ahead and {{resolution}}.\n\n{{resolutionDetails}}\n\nYou don''t need to return the damaged item. Please keep or dispose of it as you see fit.\n\nIf you have photos of the damage, feel free to share them for our records, but it''s not required.\n\nAgain, my sincerest apologies for the inconvenience.\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "resolution", "label": "Resolution taken (e.g. issued a full refund / sent a replacement)", "type": "text"},
      {"name": "resolutionDetails", "label": "Details (e.g. Refund will appear within 3–5 days)", "type": "text"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/damaged"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Wrong Item Received",
    "description": "Handle a wrong item sent complaint",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''m so sorry — it looks like we sent you the wrong item. That''s entirely our mistake, and I want to fix it right away.\n\nI''ve arranged for the correct item ({{correctItem}}) to be sent to you. You''ll receive a shipping confirmation at this email address within {{shippingTimeline}}.\n\nAs for the incorrect item: {{wrongItemInstruction}}.\n\nThank you so much for your patience — we truly appreciate it.\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "correctItem", "label": "Correct item name/SKU", "type": "text"},
      {"name": "shippingTimeline", "label": "Shipping confirmation timeline (e.g. 1 business day)", "type": "text", "defaultValue": "1–2 business days"},
      {"name": "wrongItemInstruction", "label": "What to do with wrong item (e.g. keep it, or prepaid return label attached)", "type": "text", "defaultValue": "please keep it with our compliments"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/wrong-item"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Discount Code — Goodwill",
    "description": "Offer a discount code as a goodwill gesture",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nAs a thank-you for your patience and to make up for the inconvenience, I''d like to offer you a {{discountAmount}} discount on your next order.\n\nUse code: {{discountCode}}\nValid until: {{expirationDate}}\nApplies to: {{applicability}}\n\nWe truly value your business and hope to exceed your expectations on your next order.\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "discountAmount", "label": "Discount amount (e.g. 15% or $10)", "type": "text"},
      {"name": "discountCode", "label": "Discount code", "type": "text"},
      {"name": "expirationDate", "label": "Expiration date", "type": "text"},
      {"name": "applicability", "label": "What it applies to (e.g. all orders over $25)", "type": "text", "defaultValue": "all full-price items"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/goodwill-code"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Out of Stock Notification",
    "description": "Notify customer an item is out of stock",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nUnfortunately, {{itemName}} is currently out of stock. We''re sorry for the inconvenience!\n\nHere are your options:\n\n1. We can notify you by email as soon as it''s back in stock (expected {{restockDate}}).\n2. We can offer you {{alternative}} as an alternative.\n3. We can issue a full refund of {{amount}} if you''d prefer.\n\nJust reply with your preference and we''ll take care of it right away.\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "itemName", "label": "Item name", "type": "text"},
      {"name": "restockDate", "label": "Expected restock date (or ''soon'')", "type": "text"},
      {"name": "alternative", "label": "Alternative product suggestion", "type": "text"},
      {"name": "amount", "label": "Refund amount", "type": "text"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/out-of-stock"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 7, '{
    "name": "Order Cancellation Confirmed",
    "description": "Confirm an order has been cancelled",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nYour order #{{orderNumber}} has been successfully cancelled.\n\n{{refundNote}}\n\nIf you change your mind or would like to place a new order, we''d love to have you back. Feel free to reach out anytime.\n\n{{agentName}}",
    "variables": [
      {"name": "firstName", "label": "Customer first name", "type": "text"},
      {"name": "orderNumber", "label": "Order number", "type": "text"},
      {"name": "refundNote", "label": "Refund details (e.g. Your refund of $X will appear within 3–5 days, or No charge was made)", "type": "text"},
      {"name": "agentName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/order-cancel"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  UPDATE template_packs SET command_count = 7 WHERE id = pack_id;
END $$;


-- ── Executive Assistant Essentials ────────────────────────────────────────────

DO $$
DECLARE pack_id uuid;
BEGIN
  SELECT id INTO pack_id FROM template_packs WHERE name = 'Executive Assistant Essentials' LIMIT 1;
  IF pack_id IS NULL THEN RAISE NOTICE 'Pack not found: Executive Assistant Essentials'; RETURN; END IF;

  DELETE FROM template_commands WHERE pack_id = pack_id;

  INSERT INTO template_commands (pack_id, sort_order, command_data) VALUES

  (pack_id, 1, '{
    "name": "Meeting Request — On Behalf Of",
    "description": "Request a meeting on behalf of an executive",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''m reaching out on behalf of {{executiveName}}, {{executiveTitle}} at {{company}}. {{executiveName}} would love to connect with you for a {{duration}} conversation about {{topic}}.\n\nWould any of the following times work for you?\n\n• {{option1}}\n• {{option2}}\n• {{option3}}\n\nAll times are in {{timezone}}. If none of these work, please feel free to suggest an alternative.\n\nThank you for your time!\n\n{{yourName}}\nExecutive Assistant to {{executiveName}}",
    "variables": [
      {"name": "firstName", "label": "Recipient first name", "type": "text"},
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "executiveTitle", "label": "Executive title", "type": "text"},
      {"name": "company", "label": "Company name", "type": "text"},
      {"name": "duration", "label": "Meeting duration (e.g. 30-minute)", "type": "text", "defaultValue": "30-minute"},
      {"name": "topic", "label": "Meeting topic", "type": "text"},
      {"name": "option1", "label": "Time option 1", "type": "text"},
      {"name": "option2", "label": "Time option 2", "type": "text"},
      {"name": "option3", "label": "Time option 3", "type": "text"},
      {"name": "timezone", "label": "Timezone (e.g. ET)", "type": "text", "defaultValue": "ET"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/mtg-request"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 2, '{
    "name": "Meeting Summary",
    "description": "Send a post-meeting summary and next steps",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you for taking the time to meet with {{executiveName}} today. Here''s a brief recap:\n\n**Key discussion points:**\n{{discussionPoints}}\n\n**Decisions made:**\n{{decisions}}\n\n**Next steps:**\n{{nextSteps}}\n\nPlease let us know if anything above needs clarification. {{executiveName}} is looking forward to {{nextMilestone}}.\n\n{{yourName}}\nExecutive Assistant to {{executiveName}}",
    "variables": [
      {"name": "firstName", "label": "Recipient first name", "type": "text"},
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "discussionPoints", "label": "Key discussion points (bullet points)", "type": "text"},
      {"name": "decisions", "label": "Decisions made", "type": "text"},
      {"name": "nextSteps", "label": "Next steps with owners and dates", "type": "text"},
      {"name": "nextMilestone", "label": "What comes next (e.g. speaking again next Thursday)", "type": "text"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/mtg-recap"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 3, '{
    "name": "Calendar Hold",
    "description": "Reserve time on someone''s calendar",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nI''m sending a calendar hold for:\n\n📅 Date: {{date}}\n🕐 Time: {{time}} {{timezone}}\n⏱ Duration: {{duration}}\n📍 Location/Link: {{location}}\n\nThis is a {{holdType}} at this stage. {{executiveName}} will confirm {{confirmationTimeline}}.\n\nPlease let me know if this conflicts with anything.\n\n{{yourName}}\nExecutive Assistant to {{executiveName}}",
    "variables": [
      {"name": "firstName", "label": "Recipient first name", "type": "text"},
      {"name": "date", "label": "Date", "type": "text"},
      {"name": "time", "label": "Time", "type": "text"},
      {"name": "timezone", "label": "Timezone", "type": "text", "defaultValue": "ET"},
      {"name": "duration", "label": "Duration", "type": "text"},
      {"name": "location", "label": "Location or video link", "type": "text"},
      {"name": "holdType", "label": "Hold type", "type": "select", "options": ["tentative hold", "confirmed hold", "placeholder"]},
      {"name": "confirmationTimeline", "label": "When confirmed (e.g. by end of week)", "type": "text"},
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/cal-hold"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 4, '{
    "name": "Professional Decline",
    "description": "Decline a meeting or request on behalf of an executive",
    "commandType": "variable",
    "template": "Hi {{firstName}},\n\nThank you so much for reaching out to {{executiveName}}.\n\nUnfortunately, due to {{reason}}, {{executiveName}} is unable to {{request}} at this time.\n\n{{alternativeOffer}}\n\nThank you for understanding, and we wish you all the best with {{theirInitiative}}.\n\n{{yourName}}\nExecutive Assistant to {{executiveName}}",
    "variables": [
      {"name": "firstName", "label": "Recipient first name", "type": "text"},
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "reason", "label": "Reason (e.g. prior commitments, limited bandwidth)", "type": "text", "defaultValue": "prior commitments"},
      {"name": "request", "label": "What''s being declined (e.g. participate in the panel, take the meeting)", "type": "text"},
      {"name": "alternativeOffer", "label": "Alternative offer (or leave blank)", "type": "text"},
      {"name": "theirInitiative", "label": "Their project or initiative", "type": "text"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/decline"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 5, '{
    "name": "Travel Confirmation",
    "description": "Confirm travel arrangements for an executive",
    "commandType": "variable",
    "template": "Hi {{executiveName}},\n\nHere''s your travel summary for {{trip}}:\n\n✈️ **Flight**\n{{flightDetails}}\n\n🏨 **Hotel**\n{{hotelDetails}}\n\n🚗 **Ground transport**\n{{transportDetails}}\n\n📋 **Important notes**\n{{notes}}\n\nAll confirmations and boarding passes are attached. Let me know if you need anything adjusted.\n\n{{yourName}}",
    "variables": [
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "trip", "label": "Trip description (e.g. NYC — Board Meeting, June 5–6)", "type": "text"},
      {"name": "flightDetails", "label": "Flight details (airline, flight #, times)", "type": "text"},
      {"name": "hotelDetails", "label": "Hotel name, address, check-in/out", "type": "text"},
      {"name": "transportDetails", "label": "Car service, rental, or N/A", "type": "text"},
      {"name": "notes", "label": "Important notes or reminders", "type": "text"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/travel"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb),

  (pack_id, 6, '{
    "name": "Expense Report Reminder",
    "description": "Remind an executive to submit expenses",
    "commandType": "variable",
    "template": "Hi {{executiveName}},\n\nJust a quick reminder that expense reports for {{period}} are due by {{dueDate}}.\n\nOutstanding items I''m aware of:\n{{outstandingItems}}\n\nPlease forward any receipts you haven''t sent me yet, and I''ll take care of the submission.\n\nThank you!\n\n{{yourName}}",
    "variables": [
      {"name": "executiveName", "label": "Executive name", "type": "text"},
      {"name": "period", "label": "Expense period (e.g. May 2026)", "type": "text"},
      {"name": "dueDate", "label": "Submission deadline", "type": "text"},
      {"name": "outstandingItems", "label": "Known outstanding items (or None)", "type": "text", "defaultValue": "None"},
      {"name": "yourName", "label": "Your name", "type": "text"}
    ],
    "triggers": [{"type": "slash", "value": "/expense-remind"}],
    "actions": [{"type": "insert_text"}]
  }'::jsonb);

  UPDATE template_packs SET command_count = 6 WHERE id = pack_id;
END $$;
