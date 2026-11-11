import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'cannedIQ Terms of Service — your rights and responsibilities when using cannedIQ.',
};

export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">

      {/* Hero */}
      <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">Legal</p>
      <h1 className="text-4xl font-extrabold tracking-tight mb-4">
        Terms of <span className="grad-text-blue">Service</span>
      </h1>
      <p className="text-[#94A3B8] text-base mb-8">
        Effective date: <strong className="text-[#CBD5E1]">May 20, 2025</strong> &nbsp;·&nbsp;
        Last updated: <strong className="text-[#CBD5E1]">May 20, 2025</strong>
      </p>

      <main className="prose-dark">

        <div className="info-box">
          <p>These Terms of Service ("Terms") form a legal agreement between you and <strong className="text-slate-200">AH Push It LLC</strong> ("cannedIQ", "we", "us") governing your use of the cannedIQ Chrome Extension and website at <a href="https://cannediq.com">cannediq.com</a>. By creating an account or using the service, you agree to these Terms.</p>
        </div>

        <h2>1. The Service</h2>
        <p>cannedIQ is a Chrome Extension and web application that lets you store, organize, and instantly insert canned text responses, templates, and AI-generated content into text fields on any webpage. Features available to you depend on your subscription plan.</p>

        <h2>2. Eligibility</h2>
        <p>You must be at least 13 years old to use cannedIQ. By using the service, you represent that you meet this requirement. If you are using cannedIQ on behalf of a business or organization, you represent that you have the authority to bind that entity to these Terms.</p>

        <h2>3. Accounts</h2>
        <h3>Account Creation</h3>
        <p>You may sign up using your email address or a supported OAuth provider (Google). You are responsible for keeping your credentials secure and for all activity that occurs under your account.</p>

        <h3>Team-Provisioned Accounts</h3>
        <p>If a team owner creates an account on your behalf, you will receive a temporary password by email. You are required to change it upon first login. The team owner has limited administrative access to your account as described in our <a href="/privacy">Privacy Policy</a>.</p>

        <h3>Account Termination</h3>
        <p>We may suspend or terminate your account if you violate these Terms. You may delete your account at any time by contacting us at <a href="mailto:support@cannediq.com">support@cannediq.com</a>.</p>

        <h2>4. Subscriptions &amp; Billing</h2>

        <div className="highlight-box">
          <p>📋 <strong>Plain English summary:</strong> Subscriptions are month-to-month. You can cancel any time. When you cancel, you keep access until the end of the billing period you already paid for — we don&apos;t pro-rate or give refunds for unused time.</p>
        </div>

        <h3>Plans</h3>
        <p>cannedIQ offers a free tier and paid subscription plans (Pro, Pro + AI, and Team). Paid plans are billed monthly. A full description of each plan&apos;s features and pricing is available at <a href="/pricing">cannediq.com/pricing</a>.</p>

        <h3>Billing Cycle</h3>
        <p>Paid subscriptions are billed on a monthly basis, starting on the date you first subscribe. Your subscription renews automatically each month unless you cancel before the renewal date.</p>

        <h3>Cancellation</h3>
        <p>You may cancel your subscription at any time through the Billing tab in the extension or via the Stripe Customer Portal. Cancellation takes effect at the end of your current billing period. You will retain full access to your paid plan features until that date, after which your account will revert to the free tier. We do not offer refunds or credits for partial months.</p>

        <h3>Team Seats</h3>
        <p>The Team plan is priced per seat. When you purchase a Team plan, you select the number of seats. The total charge is the per-seat price multiplied by the number of seats for each billing period. You may increase your seat count at any time; the change will be reflected in your next invoice. Reducing seats below the number of active members is not permitted until you remove the corresponding members from your team.</p>

        <h3>Price Changes</h3>
        <p>We may change subscription prices with at least 30 days&apos; notice. If you do not cancel before the price change takes effect, you agree to the new price.</p>

        <h3>Payment</h3>
        <p>All payments are processed by <a href="https://stripe.com" target="_blank" rel="noopener noreferrer">Stripe, Inc.</a> You agree to provide accurate billing information. If a payment fails, we may suspend your account until the balance is resolved.</p>

        <h3>Taxes</h3>
        <p>Prices are exclusive of taxes. You are responsible for any applicable sales tax, VAT, GST, or similar charges based on your location.</p>

        <h2>5. Free Tier Limitations</h2>
        <p>Free accounts are subject to the following limits, which may change at our discretion:</p>
        <ul>
          <li>Up to 25 personal commands</li>
          <li>Up to 3 stacks</li>
          <li>No AI command generation</li>
          <li>No context-aware triggers</li>
          <li>No team features</li>
        </ul>

        <h2>6. Acceptable Use</h2>
        <p>You agree not to use cannedIQ to:</p>
        <ul>
          <li>Violate any applicable law or regulation</li>
          <li>Send spam, phishing messages, or other unsolicited communications</li>
          <li>Harass, abuse, or harm any person</li>
          <li>Store or distribute illegal content, including content that exploits minors</li>
          <li>Attempt to reverse-engineer, decompile, or tamper with the service</li>
          <li>Circumvent any usage limits, paywalls, or access controls</li>
          <li>Use the service in any way that could damage, disable, or impair it</li>
        </ul>
        <p>We reserve the right to remove content or terminate accounts that violate these rules without notice.</p>

        <h2>7. Your Content</h2>
        <p>You own the commands, stacks, and templates you create in cannedIQ. By storing content in the service, you grant us a limited license to store and transmit that content solely to provide the service to you. We do not claim ownership of your content, and we do not use it for any purpose other than operating the service.</p>
        <p>You can export your commands and stacks at any time as a JSON file from the Settings tab. We recommend doing so before closing your account.</p>

        <h2>8. AI Features</h2>
        <p>Pro + AI and Team plan subscribers have access to AI-powered command generation. AI-generated content is provided as-is and may not always be accurate, appropriate, or free from errors. You are responsible for reviewing and taking responsibility for any AI-generated content before using it. We are not liable for any outcomes resulting from your use of AI-generated responses.</p>
        <p>AI usage is subject to monthly quotas as stated on the pricing page. Unused AI credits do not roll over to the next billing period.</p>

        <h2>9. Intellectual Property</h2>
        <p>cannedIQ, its logo, and all original content, features, and functionality of the service are owned by AH Push It LLC and are protected by copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, or create derivative works of the service without our written permission.</p>

        <h2>10. Disclaimers</h2>
        <p>THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.</p>

        <h2>11. Limitation of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, AH PUSH IT LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR IN CONNECTION WITH THESE TERMS OR YOUR USE OF THE SERVICE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
        <p>OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING UNDER THESE TERMS SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) $50.</p>

        <h2>12. Indemnification</h2>
        <p>You agree to indemnify and hold harmless AH Push It LLC and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorneys&apos; fees) arising from your use of the service, your content, or your violation of these Terms.</p>

        <h2>13. Governing Law &amp; Disputes</h2>
        <p>These Terms are governed by the laws of the State of Arizona, United States, without regard to conflict of law principles. Any disputes arising under these Terms shall be resolved in the state or federal courts located in Arizona, and you consent to personal jurisdiction in those courts.</p>
        <p>Before initiating any legal action, you agree to contact us at <a href="mailto:legal@cannediq.com">legal@cannediq.com</a> and give us 30 days to attempt to resolve the dispute informally.</p>

        <h2>14. Changes to These Terms</h2>
        <p>We may update these Terms from time to time. When we make material changes, we will update the effective date at the top of this page and notify you by email. If you continue using the service after the updated Terms take effect, you agree to the revised Terms. If you do not agree, you must stop using the service and may cancel your subscription.</p>

        <h2>15. Miscellaneous</h2>
        <p><strong className="text-slate-300">Entire Agreement.</strong> These Terms, together with our Privacy Policy, constitute the entire agreement between you and AH Push It LLC regarding the service.</p>
        <p><strong className="text-slate-300">Severability.</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force.</p>
        <p><strong className="text-slate-300">No Waiver.</strong> Our failure to enforce any right under these Terms does not constitute a waiver of that right.</p>
        <p><strong className="text-slate-300">Assignment.</strong> You may not assign your rights under these Terms without our written consent. We may assign our rights in connection with a merger, acquisition, or sale of assets.</p>

        <h2>16. Contact</h2>
        <div className="info-box">
          <p>
            <strong className="text-slate-200">AH Push It LLC</strong><br />
            General: <a href="mailto:support@cannediq.com">support@cannediq.com</a><br />
            Legal: <a href="mailto:legal@cannediq.com">legal@cannediq.com</a><br />
            Privacy: <a href="mailto:privacy@cannediq.com">privacy@cannediq.com</a><br />
            Website: <a href="https://cannediq.com">cannediq.com</a>
          </p>
        </div>

      </main>
    </div>
  );
}
