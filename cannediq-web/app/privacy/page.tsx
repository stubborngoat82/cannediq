import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'cannedIQ Privacy Policy — how we collect, use, and protect your information.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">

      {/* Hero */}
      <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">Legal</p>
      <h1 className="text-4xl font-extrabold tracking-tight mb-4">
        Privacy <span className="grad-text-blue">Policy</span>
      </h1>
      <p className="text-[#94A3B8] text-base mb-8">
        Effective date: <strong className="text-[#CBD5E1]">May 20, 2025</strong> &nbsp;·&nbsp;
        Last updated: <strong className="text-[#CBD5E1]">May 20, 2025</strong>
      </p>

      {/* Content */}
      <main className="prose-dark">

        <div className="info-box">
          <p>cannedIQ is operated by <strong className="text-slate-200">AH Push It LLC</strong> ("we", "us", "our"). This policy explains what data we collect when you use the cannedIQ Chrome Extension and website (<a href="https://cannediq.com">cannediq.com</a>), how we use it, and your rights regarding it. We do not sell your personal data.</p>
        </div>

        <h2>1. Information We Collect</h2>

        <h3>Account &amp; Profile Information</h3>
        <p>When you create an account or complete onboarding, we collect:</p>
        <ul>
          <li>Email address (required for authentication)</li>
          <li>Full name (optional, provided by you)</li>
          <li>Job title, company name, and company size (optional, collected at signup)</li>
          <li>Use case and referral source (optional, collected at signup)</li>
          <li>Phone number and billing address (collected by Stripe at checkout)</li>
        </ul>

        <h3>Payment &amp; Billing Information</h3>
        <p>Payment details — including credit card numbers, billing address, and bank account information — are collected and processed directly by <strong className="text-slate-200">Stripe, Inc.</strong> We never see or store your raw payment credentials. We do store your Stripe Customer ID and subscription status so we can manage your plan.</p>

        <h3>Usage Data</h3>
        <p>We collect limited usage data to operate the service:</p>
        <ul>
          <li>Number of AI commands used per month (for quota enforcement)</li>
          <li>Last sign-in timestamp (for team management features)</li>
          <li>The commands, stacks, and categories you create and store in cannedIQ</li>
        </ul>
        <p>We do not log the content of web pages you visit, the text fields you type into, or the specific responses you insert. Your canned responses are stored in your account to sync across devices, but are not read or analyzed by us.</p>

        <h3>Extension Permissions</h3>
        <p>The cannedIQ Chrome Extension requests the following permissions:</p>
        <ul>
          <li><strong className="text-slate-300">activeTab</strong> — to detect the active text field and insert your selected response</li>
          <li><strong className="text-slate-300">storage</strong> — to cache your commands locally for instant access</li>
          <li><strong className="text-slate-300">contextMenus</strong> — to offer right-click shortcuts for inserting responses</li>
        </ul>
        <p>The extension does not read the content of pages you browse, capture screenshots, or transmit browsing history.</p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To create and maintain your account</li>
          <li>To process payments and manage your subscription</li>
          <li>To enforce plan limits (free vs. Pro vs. Team)</li>
          <li>To provide team management features (if you are a team owner or member)</li>
          <li>To send transactional emails — account provisioning, password resets, billing receipts</li>
          <li>To improve the service through aggregated, anonymized analytics</li>
          <li>To respond to support requests</li>
        </ul>
        <p>We do not use your data for advertising, and we do not share your data with third parties for their marketing purposes.</p>

        <h2>3. Third-Party Service Providers</h2>
        <p>We use the following sub-processors to operate cannedIQ. Each is bound by their own data processing agreements and privacy policies.</p>

        <div className="provider-grid">
          <div className="provider-card">
            <h4>Stripe</h4>
            <p>Payment processing, subscription billing, invoicing, and the customer portal. Stripe stores your payment method and billing address.</p>
            <p style={{ marginTop: '0.5rem' }}><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a></p>
          </div>
          <div className="provider-card">
            <h4>Supabase</h4>
            <p>Database, authentication, and backend infrastructure. Your account data, commands, and stacks are stored in Supabase (hosted on AWS us-east-1).</p>
            <p style={{ marginTop: '0.5rem' }}><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a></p>
          </div>
          <div className="provider-card">
            <h4>Resend</h4>
            <p>Transactional email delivery. Used to send account provisioning emails, password resets, and other service notifications.</p>
            <p style={{ marginTop: '0.5rem' }}><a href="https://resend.com/privacy" target="_blank" rel="noopener noreferrer">resend.com/privacy</a></p>
          </div>
        </div>

        <p>We may also use Google OAuth as an optional sign-in method, subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s Privacy Policy</a>.</p>

        <h2>4. Data Retention</h2>
        <p>We retain your account data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where we are required to retain it for legal or financial record-keeping purposes (e.g., billing records are retained for 7 years as required by law).</p>
        <p>Your Stripe billing records are retained by Stripe according to their policies and applicable financial regulations.</p>

        <h2>5. Data Security</h2>
        <p>We take reasonable technical and organizational measures to protect your data:</p>
        <ul>
          <li>All data is transmitted over TLS/HTTPS</li>
          <li>Passwords are hashed and never stored in plaintext</li>
          <li>Database access is governed by Row-Level Security policies so users can only access their own data</li>
          <li>Payment data never touches our servers — it goes directly to Stripe</li>
        </ul>
        <p>No method of transmission or storage is 100% secure. If you discover a security issue, please contact us at <a href="mailto:security@cannediq.com">security@cannediq.com</a>.</p>

        <h2>6. Team Accounts</h2>
        <p>If you use cannedIQ as part of a team, your team owner has the ability to:</p>
        <ul>
          <li>Provision your account (create it on your behalf)</li>
          <li>See your name, email, and last active date within the team dashboard</li>
          <li>Remove you from the team</li>
          <li>Reset your temporary password (if your account was provisioned by them)</li>
        </ul>
        <p>Team owners cannot see your personal canned responses, only responses shared to the team library.</p>

        <h2>7. Cookies &amp; Local Storage</h2>
        <p>The cannedIQ website uses minimal cookies — only those necessary for authentication sessions. We do not use tracking or advertising cookies. The Chrome Extension uses <code className="bg-[#1E293B] px-1.5 py-0.5 rounded text-sm text-slate-300">chrome.storage.local</code> to cache your commands and session data on your device; this data does not leave your device except to sync with your account.</p>

        <h2>8. Your Rights</h2>
        <p>Depending on your location, you may have the following rights regarding your personal data:</p>
        <ul>
          <li><strong className="text-slate-300">Access</strong> — request a copy of the data we hold about you</li>
          <li><strong className="text-slate-300">Correction</strong> — request correction of inaccurate data</li>
          <li><strong className="text-slate-300">Deletion</strong> — request deletion of your account and associated data</li>
          <li><strong className="text-slate-300">Portability</strong> — export your commands and stacks as a JSON file at any time from the Settings tab</li>
          <li><strong className="text-slate-300">Objection</strong> — object to certain processing of your data</li>
        </ul>
        <p>To exercise these rights, contact us at <a href="mailto:privacy@cannediq.com">privacy@cannediq.com</a>. We will respond within 30 days.</p>

        <h2>9. Children&apos;s Privacy</h2>
        <p>cannedIQ is not directed at children under the age of 13. We do not knowingly collect personal information from children. If you believe a child has provided us personal information, please contact us and we will delete it.</p>

        <h2>10. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time. When we make material changes, we will update the effective date at the top of this page and, where appropriate, notify you by email. Continued use of the service after changes constitutes acceptance of the updated policy.</p>

        <h2>11. Contact</h2>
        <p>If you have questions about this policy or your data:</p>
        <div className="info-box">
          <p>
            <strong className="text-slate-200">AH Push It LLC</strong><br />
            Email: <a href="mailto:privacy@cannediq.com">privacy@cannediq.com</a><br />
            Website: <a href="https://cannediq.com">cannediq.com</a>
          </p>
        </div>

      </main>
    </div>
  );
}
