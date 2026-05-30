/**
 * EulaModal — EULA acceptance gate for cannedIQ
 *
 * Shows a full-page blocking modal with the complete EULA text the first time
 * a user logs in (or after a EULA version bump).  The Accept button is locked
 * until the user scrolls to the bottom of the agreement.
 *
 * Acceptance is recorded in the `eula_acceptances` DB table and cached in
 * chrome.storage.local so subsequent logins skip the DB check.
 *
 * Usage (in options.js after auth):
 *   const accepted = await EulaModal.checkAndShow();
 *
 * Dependencies: config.js, auth.js, api-client.js must be loaded first.
 */

const EulaModal = (() => {

  const EULA_VERSION = '1.0';
  const STORAGE_KEY  = `eula_accepted_v${EULA_VERSION}`;

  // ── EULA content ─────────────────────────────────────────────────────────────

  const EULA_SECTIONS = [
    {
      title: '1. Parties and Definitions',
      body: 'This End User License Agreement ("Agreement") is a legal agreement between you ("User," "you," or "your") and Ah Push It LLC ("Company," "we," "us," or "our"), the developer and publisher of the cannedIQ browser extension ("Extension").\n\n"Extension" refers to the cannedIQ Chrome browser extension, including all associated software, AI features, templates, and updates distributed through the Chrome Web Store or otherwise.',
    },
    {
      title: '2. Grant of License',
      body: 'Subject to your compliance with this Agreement, the Company grants you a limited, non-exclusive, non-transferable, revocable license to:\n\n• Install and use the Extension on devices you own or control for personal or internal business purposes;\n• Access and use the AI-powered response and template features included in the Extension;\n• Store and manage canned response templates for your personal use.\n\nThis license does not include the right to sublicense, sell, resell, distribute, or commercially exploit the Extension or its components.',
    },
    {
      title: '3. Restrictions',
      body: 'You agree NOT to:\n\n• Copy, modify, adapt, translate, reverse engineer, decompile, disassemble, or create derivative works based on the Extension;\n• Use the Extension to transmit spam, malicious content, or content that violates applicable law;\n• Circumvent any technical limitations, usage controls, or security features;\n• Use the Extension in connection with automated systems, bots, or other non-human actors in ways that violate third-party platforms\' terms of service;\n• Remove or alter any proprietary notices, labels, or marks on the Extension;\n• Attempt to access or derive the source code of AI models or systems underlying the Extension.',
    },
    {
      title: '4. AI-Powered Features and Third-Party Services',
      body: 'cannedIQ may use third-party AI providers (including but not limited to Anthropic, OpenAI, or similar services) to power intelligent response features. By using AI features within the Extension, you acknowledge:\n\n• AI-generated content is not guaranteed to be accurate, appropriate, or suitable for any particular purpose;\n• You are solely responsible for reviewing, editing, and approving any AI-generated content before use;\n• The Company is not liable for errors, inaccuracies, or unintended consequences arising from AI-generated output;\n• Your use of AI features is subject to the terms and policies of applicable third-party AI providers.',
    },
    {
      title: '5. User Content and Templates',
      body: 'You retain ownership of the canned responses, templates, and other content you create or input within the Extension ("User Content"). By using the Extension, you grant the Company a limited license to process, store, and transmit your User Content solely as necessary to provide the Extension\'s features.\n\nYou represent and warrant that your User Content does not infringe any third-party rights and complies with all applicable laws. You are solely responsible for your User Content.',
    },
    {
      title: '6. Privacy and Data',
      body: 'The Company\'s collection and use of data in connection with the Extension is described in the cannedIQ Privacy Policy, which is incorporated into this Agreement by reference. By using the Extension, you consent to data practices described in the Privacy Policy.\n\ncannedIQ does not sell your personal data to third parties. Data may be processed by third-party infrastructure and AI providers as necessary to operate the Extension.',
    },
    {
      title: '7. Updates and Modifications',
      body: 'The Company may, in its sole discretion, release updates, upgrades, bug fixes, or modified versions of the Extension. Such updates may be provided automatically. This Agreement applies to all updates unless a separate agreement accompanies the update.\n\nThe Company reserves the right to modify, suspend, or discontinue the Extension (or any feature thereof) at any time, with or without notice. We are not liable to you or any third party for any modification, suspension, or discontinuation.',
    },
    {
      title: '8. Intellectual Property',
      body: 'The Extension, including all software, designs, graphics, AI models, and documentation, is the exclusive property of the Company and its licensors. All rights not expressly granted to you in this Agreement are reserved by the Company.\n\nThe cannedIQ name, logo, and branding are trademarks of the Company. You may not use any Company trademarks without prior written consent.',
    },
    {
      title: '9. Disclaimer of Warranties',
      body: 'THE EXTENSION IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED AVAILABILITY.\n\nTHE COMPANY DOES NOT WARRANT THAT THE EXTENSION WILL BE ERROR-FREE, SECURE, OR FREE OF HARMFUL COMPONENTS, OR THAT DEFECTS WILL BE CORRECTED.',
    },
    {
      title: '10. Limitation of Liability',
      body: 'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE EXTENSION, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.\n\nTHE COMPANY\'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING UNDER THIS AGREEMENT SHALL NOT EXCEED THE GREATER OF: (A) THE AMOUNT YOU PAID FOR THE EXTENSION IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM; OR (B) TWENTY-FIVE U.S. DOLLARS ($25.00).',
    },
    {
      title: '11. Indemnification',
      body: 'You agree to defend, indemnify, and hold harmless the Company and its officers, directors, employees, and agents from and against any claims, damages, liabilities, costs, and expenses (including reasonable attorneys\' fees) arising from: (a) your use of the Extension; (b) your User Content; (c) your violation of this Agreement; or (d) your violation of any applicable law or third-party rights.',
    },
    {
      title: '12. Term and Termination',
      body: 'This Agreement is effective upon your first use of the Extension and continues until terminated. The Company may terminate this Agreement immediately, without notice, if you breach any provision. Upon termination, your license to use the Extension ceases immediately and you must uninstall the Extension from all your devices.\n\nSections 8 (Intellectual Property), 9 (Disclaimer), 10 (Limitation of Liability), 11 (Indemnification), and 14 (Governing Law) survive termination.',
    },
    {
      title: '13. Changes to This Agreement',
      body: 'The Company may update this Agreement from time to time. Material changes will be communicated through the Extension, the Chrome Web Store listing, or by email (if you have provided one). Your continued use of the Extension after the effective date of a revised Agreement constitutes your acceptance of the changes.',
    },
    {
      title: '14. Governing Law and Dispute Resolution',
      body: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Arizona, without regard to its conflict of law provisions. Any disputes arising under this Agreement shall be resolved in the state or federal courts located in Maricopa County, Arizona, and you consent to personal jurisdiction in such courts.\n\nFor any dispute where the amount at issue is $10,000 or less, either party may elect to resolve the dispute through binding, non-appearance-based arbitration conducted by a recognized arbitration provider.',
    },
    {
      title: '15. General Provisions',
      body: '• Entire Agreement: This Agreement (together with the Privacy Policy) constitutes the entire agreement between you and the Company regarding the Extension.\n• Severability: If any provision of this Agreement is found unenforceable, the remaining provisions will continue in full force and effect.\n• Waiver: Failure to enforce any provision of this Agreement does not constitute a waiver of future enforcement.\n• Assignment: You may not assign this Agreement or any rights hereunder without prior written consent. The Company may assign this Agreement freely.\n• Contact: Questions about this Agreement may be directed to: hello@cannediq.com\n\nAh Push It LLC · cannedIQ · hello@cannediq.com · cannediq.com\n© 2026 Ah Push It LLC. All rights reserved.',
    },
  ];

  // ── Cache helpers ─────────────────────────────────────────────────────────────

  function getCached() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(!!result[STORAGE_KEY]);
      });
    });
  }

  function setCached() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: true }, resolve);
    });
  }

  // ── Render EULA text into #eula-body ──────────────────────────────────────────

  function renderEulaText() {
    const body = document.getElementById('eula-body');
    if (!body) return;

    const html = EULA_SECTIONS.map(({ title, body: text }) => {
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
      return `<div class="eula-section">
        <h4 class="eula-section-title">${title}</h4>
        <p>${escaped}</p>
      </div>`;
    }).join('');

    body.innerHTML = html;
  }

  // ── Modal display ─────────────────────────────────────────────────────────────

  function showModal(onAccept) {
    const modal     = document.getElementById('modal-eula');
    if (!modal) { onAccept(); return; }   // safety fallback if HTML missing

    renderEulaText();
    modal.hidden = false;

    const scrollBody  = document.getElementById('eula-body');
    const acceptBtn   = document.getElementById('eula-accept-btn');
    const declineMsg  = document.getElementById('eula-decline-msg');
    const declineLink = document.getElementById('eula-decline-link');
    const acceptLabel = document.getElementById('eula-accept-label');

    // Lock accept until scrolled to (near) bottom
    function checkScroll() {
      const atBottom = scrollBody.scrollTop + scrollBody.clientHeight >= scrollBody.scrollHeight - 60;
      acceptBtn.disabled = !atBottom;
      if (atBottom) {
        acceptBtn.textContent = 'I Accept & Continue →';
        acceptBtn.classList.add('eula-btn-ready');
        if (acceptLabel) acceptLabel.hidden = true;
        scrollBody.removeEventListener('scroll', checkScroll);
      }
    }
    scrollBody.addEventListener('scroll', checkScroll);
    // Run once in case content is short enough to not need scrolling
    checkScroll();

    acceptBtn.addEventListener('click', async () => {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Recording…';
      onAccept();
    }, { once: true });

    if (declineLink) {
      declineLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (declineMsg) declineMsg.hidden = false;
        declineLink.style.display = 'none';
      });
    }
  }

  // ── Public: checkAndShow ──────────────────────────────────────────────────────

  /**
   * Checks whether the current user has accepted the EULA.
   * Shows the modal if they haven't.
   * Returns a Promise<true> once accepted (or already accepted).
   */
  async function checkAndShow() {
    // 1. Local cache — fastest path
    const cached = await getCached();
    if (cached) return true;

    // 2. Database — in case the user is on a new device
    try {
      const accepted = await Api.checkEulaAcceptance(EULA_VERSION);
      if (accepted) {
        await setCached();
        return true;
      }
    } catch (e) {
      console.warn('[EulaModal] DB check failed, showing modal anyway:', e.message);
    }

    // 3. Show modal — returns when user clicks Accept
    return new Promise((resolve) => {
      showModal(async () => {
        try {
          await Api.recordEulaAcceptance(EULA_VERSION);
          await setCached();
        } catch (e) {
          // DB write failed — still let the user in; they'll be asked again next login
          console.error('[EulaModal] Failed to record acceptance:', e.message);
        }
        modal_cleanup();
        resolve(true);
      });
    });
  }

  function modal_cleanup() {
    const modal = document.getElementById('modal-eula');
    if (modal) modal.hidden = true;
  }

  return { checkAndShow, EULA_VERSION };

})();
