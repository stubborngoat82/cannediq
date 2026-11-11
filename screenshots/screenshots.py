"""
cannedIQ — Chrome Web Store screenshot + promo tile generator
Outputs: 5 x 1280x800 PNG screenshots + 1 x 440x280 promo tile
"""

import cairosvg, os

OUT = '/sessions/elegant-confident-hypatia/mnt/Launch/store-assets'
os.makedirs(OUT, exist_ok=True)

def render(svg_str, filename, w, h):
    cairosvg.svg2png(
        bytestring=svg_str.encode(),
        write_to=OUT + '/' + filename,
        output_width=w,
        output_height=h,
    )
    print('  ok ' + filename)

# ── Shared SVG snippets ──────────────────────────────────────────────────────

DEFS = """<defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <linearGradient id="gradH" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3B82F6"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="28" flood-color="#000" flood-opacity="0.75"/>
    </filter>
    <filter id="shadow-sm" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.55"/>
    </filter>
  </defs>"""


def chrome_bar(url, tab_title="Gmail - Inbox"):
    return (
      '<rect x="0" y="0" width="1280" height="88" fill="#1C1C1E"/>'
      '<rect x="0" y="0" width="1280" height="36" fill="#2A2A2C"/>'
      '<rect x="8" y="6" width="220" height="30" rx="6" fill="#1C1C1E"/>'
      '<circle cx="24" cy="21" r="7" fill="url(#grad)"/>'
      '<text x="36" y="25" font-family="Lato,sans-serif" font-size="12" fill="#D1D5DB">' + tab_title + '</text>'
      '<text x="234" y="25" font-family="Lato,sans-serif" font-size="16" fill="#555">+</text>'
      '<rect x="180" y="42" width="760" height="30" rx="15" fill="#2D2D2F"/>'
      '<text x="200" y="62" font-family="Lato,sans-serif" font-size="12" fill="#6B7280">&#x1F512;</text>'
      '<text x="218" y="62" font-family="Lato,sans-serif" font-size="12" fill="#9CA3AF">' + url + '</text>'
      '<text x="20" y="62" font-family="Lato,sans-serif" font-size="18" fill="#555">&#8592;</text>'
      '<text x="52" y="62" font-family="Lato,sans-serif" font-size="18" fill="#555">&#8594;</text>'
      '<text x="84" y="62" font-family="Lato,sans-serif" font-size="15" fill="#555">&#8634;</text>'
      '<circle cx="1240" cy="57" r="12" fill="#2D2D2F"/>'
      '<text x="1234" y="62" font-family="Lato,sans-serif" font-size="14" fill="#FFD700">&#9889;</text>'
    )


# ── Screenshot 1: Command Palette ─────────────────────────────────────────────

def email_rows():
    letters = 'ASMCBDEJK'
    widths1 = [180, 180, 180, 140, 140, 140, 140, 140, 140]
    widths2 = [320, 320, 260, 260, 260, 260, 260, 260, 260]
    rows = ''
    for i in range(9):
        y0 = 88 + i * 68
        bg = '#111827' if i % 2 == 0 else '#0F172A'
        av_fill = '#1E3A5F' if i == 0 else '#1F2937'
        letter_fill = '#60A5FA' if i == 0 else '#374151'
        rows += (
            '<rect x="256" y="' + str(y0) + '" width="1024" height="67" fill="' + bg + '" opacity="0.6"/>'
            '<rect x="276" y="' + str(100 + i*68) + '" width="40" height="40" rx="20" fill="' + av_fill + '"/>'
            '<text x="291" y="' + str(125 + i*68) + '" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="' + letter_fill + '">' + letters[i] + '</text>'
            '<rect x="332" y="' + str(108 + i*68) + '" width="' + str(widths1[i]) + '" height="12" rx="4" fill="#1E293B" opacity="0.8"/>'
            '<rect x="332" y="' + str(126 + i*68) + '" width="' + str(widths2[i]) + '" height="10" rx="4" fill="#1E293B" opacity="0.5"/>'
        )
    return rows


def ss1():
    rows = email_rows()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">'
        + DEFS +
        # Page background
        '<rect width="1280" height="800" fill="#0F172A"/>'
        # Sidebar
        '<rect x="0" y="88" width="256" height="712" fill="#0D1525" opacity="0.9"/>'
        # Sidebar items
        '<rect x="12" y="104" width="232" height="36" rx="8" fill="#1E3A5F" opacity="0.5"/>'
        '<text x="40" y="127" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="#60A5FA">Inbox</text>'
        '<text x="40" y="165" font-family="Lato,sans-serif" font-size="13" fill="#374151">Starred</text>'
        '<text x="40" y="195" font-family="Lato,sans-serif" font-size="13" fill="#374151">Sent</text>'
        '<text x="40" y="225" font-family="Lato,sans-serif" font-size="13" fill="#374151">Drafts</text>'
        '<text x="40" y="255" font-family="Lato,sans-serif" font-size="13" fill="#374151">Spam</text>'
        '<text x="40" y="285" font-family="Lato,sans-serif" font-size="13" fill="#374151">All Mail</text>'
        # Compose button
        '<rect x="12" y="300" width="180" height="40" rx="20" fill="#1D4ED8" opacity="0.8"/>'
        '<text x="60" y="325" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="white">+ Compose</text>'
        # Email list
        '<rect x="256" y="88" width="1024" height="712" fill="#0F172A"/>'
        + rows +
        # Dark overlay for palette
        '<rect width="1280" height="800" fill="#000" opacity="0.65"/>'
        # Palette panel
        '<rect x="380" y="158" width="520" height="406" rx="16" fill="#111827" filter="url(#shadow)"/>'
        '<rect x="380" y="158" width="520" height="3" rx="2" fill="url(#gradH)"/>'
        '<rect x="380" y="158" width="520" height="406" rx="16" fill="none" stroke="#1E293B" stroke-width="1"/>'
        # Search bar
        '<rect x="396" y="174" width="488" height="48" rx="10" fill="#0D1525"/>'
        '<rect x="396" y="174" width="488" height="48" rx="10" fill="none" stroke="#3B82F6" stroke-width="1.5" opacity="0.7"/>'
        '<circle cx="424" cy="198" r="9" fill="none" stroke="#4B5563" stroke-width="2"/>'
        '<line x1="430" y1="205" x2="436" y2="211" stroke="#4B5563" stroke-width="2" stroke-linecap="round"/>'
        '<text x="448" y="204" font-family="Lato,sans-serif" font-size="16" fill="#E2E8F0">thank</text>'
        '<rect x="501" y="185" width="2" height="26" fill="#3B82F6" opacity="0.9"/>'
        # Escape hint
        '<rect x="834" y="185" width="34" height="22" rx="5" fill="#1E293B"/>'
        '<text x="840" y="200" font-family="Lato,sans-serif" font-size="11" fill="#6B7280">Esc</text>'
        # Section label
        '<text x="408" y="248" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">SUPPORT</text>'
        # Row 1 — selected
        '<rect x="396" y="256" width="488" height="52" rx="8" fill="#1E3A5F"/>'
        '<rect x="396" y="256" width="3" height="52" rx="2" fill="url(#grad)"/>'
        '<text x="418" y="278" font-family="Lato,sans-serif" font-size="15" font-weight="700" fill="#F8FAFC">Thank You &#8212; Order Delay</text>'
        '<text x="418" y="296" font-family="Lato,sans-serif" font-size="12" fill="#60A5FA">Support  /ty-delay</text>'
        '<rect x="836" y="266" width="36" height="20" rx="5" fill="#1E3A5F" stroke="#3B82F6" stroke-width="1"/>'
        '<text x="845" y="280" font-family="Lato,sans-serif" font-size="12" fill="#93C5FD">&#8629;</text>'
        # Row 2
        '<text x="418" y="330" font-family="Lato,sans-serif" font-size="15" fill="#CBD5E1">Thank You &#8212; Quick Reply</text>'
        '<text x="418" y="348" font-family="Lato,sans-serif" font-size="12" fill="#374151">Support  /ty</text>'
        # Row 3
        '<text x="418" y="384" font-family="Lato,sans-serif" font-size="15" fill="#CBD5E1">Thank You &#8212; Feedback Received</text>'
        '<text x="418" y="402" font-family="Lato,sans-serif" font-size="12" fill="#374151">Support  /ty-fb</text>'
        # Section label 2
        '<text x="408" y="434" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">SALES</text>'
        # Row 4
        '<text x="418" y="460" font-family="Lato,sans-serif" font-size="15" fill="#CBD5E1">AI: Thank + Next Steps</text>'
        '<text x="418" y="478" font-family="Lato,sans-serif" font-size="12" fill="#374151">Sales  /ai-thanks</text>'
        '<rect x="556" y="448" width="30" height="16" rx="8" fill="rgba(59,130,246,0.25)"/>'
        '<text x="562" y="460" font-family="Lato,sans-serif" font-size="9" font-weight="700" fill="#60A5FA">AI</text>'
        # Footer
        '<rect x="380" y="534" width="520" height="1" fill="#1E293B"/>'
        '<text x="408" y="554" font-family="Lato,sans-serif" font-size="11" fill="#374151">&#8593;&#8595; navigate</text>'
        '<text x="492" y="554" font-family="Lato,sans-serif" font-size="11" fill="#374151">&#8629; insert</text>'
        '<text x="550" y="554" font-family="Lato,sans-serif" font-size="11" fill="#374151">Esc close</text>'
        '<text x="726" y="554" font-family="Lato,sans-serif" font-size="11" fill="#374151">cannedIQ &#9889;</text>'
        # Browser chrome
        + chrome_bar('https://mail.google.com/mail/u/0/#inbox') +
        # Shortcut callout
        '<rect x="48" y="740" width="210" height="36" rx="10" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<text x="66" y="762" font-family="Lato,sans-serif" font-size="12" fill="#94A3B8">Press Ctrl+Space anywhere</text>'
        '</svg>'
    )
    render(svg, 'screenshot-1-palette.png', 1280, 800)


# ── Screenshot 2: Variable Modal ──────────────────────────────────────────────

def ss2():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">'
        + DEFS +
        '<rect width="1280" height="800" fill="#0F172A"/>'
        # Left sidebar
        '<rect x="0" y="88" width="220" height="712" fill="#111827"/>'
        '<text x="20" y="130" font-family="Lato,sans-serif" font-size="12" font-weight="700" fill="#6B7280">HELPDESK</text>'
        '<rect x="12" y="144" width="196" height="36" rx="8" fill="#1E3A5F" opacity="0.6"/>'
        '<text x="32" y="167" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#60A5FA">Open Tickets</text>'
        '<text x="32" y="208" font-family="Lato,sans-serif" font-size="13" fill="#374151">My Tickets</text>'
        '<text x="32" y="238" font-family="Lato,sans-serif" font-size="13" fill="#374151">Resolved</text>'
        '<text x="32" y="268" font-family="Lato,sans-serif" font-size="13" fill="#374151">All Tickets</text>'
        # Ticket content area
        '<rect x="220" y="88" width="1060" height="712" fill="#0F172A"/>'
        '<rect x="220" y="88" width="1060" height="64" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<text x="248" y="116" font-family="Lato,sans-serif" font-size="17" font-weight="700" fill="#F8FAFC">#4821 &#8212; Order not received after 2 weeks</text>'
        '<rect x="248" y="128" width="60" height="18" rx="9" fill="rgba(239,68,68,0.25)"/>'
        '<text x="261" y="140" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#F87171">URGENT</text>'
        '<rect x="318" y="128" width="50" height="18" rx="9" fill="#1E293B"/>'
        '<text x="330" y="140" font-family="Lato,sans-serif" font-size="10" fill="#94A3B8">Open</text>'
        # Dimmed composer
        '<rect x="240" y="560" width="1020" height="200" rx="12" fill="#111827" opacity="0.35"/>'
        '<text x="268" y="598" font-family="Lato,sans-serif" font-size="13" fill="#374151" opacity="0.5">Hi Sarah,</text>'
        '<text x="268" y="622" font-family="Lato,sans-serif" font-size="13" fill="#374151" opacity="0.5">Thank you for reaching out. I\'m sorry to hear about the delay with order #...</text>'
        # Dark overlay
        '<rect width="1280" height="800" fill="#000" opacity="0.62"/>'
        # Variable modal
        '<rect x="440" y="174" width="400" height="430" rx="16" fill="#111827" filter="url(#shadow)"/>'
        '<rect x="440" y="174" width="400" height="3" rx="2" fill="url(#gradH)"/>'
        '<rect x="440" y="174" width="400" height="430" rx="16" fill="none" stroke="#1E293B" stroke-width="1"/>'
        # Modal title
        '<text x="460" y="216" font-family="Lato,sans-serif" font-size="18" font-weight="700" fill="#F8FAFC">Fill in variables</text>'
        '<text x="460" y="237" font-family="Lato,sans-serif" font-size="12" fill="#374151">Refund Approved</text>'
        # Field 1
        '<text x="460" y="272" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="#6B7280">CUSTOMER FIRST NAME *</text>'
        '<rect x="460" y="278" width="360" height="40" rx="8" fill="#0D1525" stroke="#3B82F6" stroke-width="1.5"/>'
        '<text x="478" y="303" font-family="Lato,sans-serif" font-size="14" fill="#F8FAFC">Sarah</text>'
        # Field 2
        '<text x="460" y="342" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="#6B7280">REFUND AMOUNT *</text>'
        '<rect x="460" y="348" width="360" height="40" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="478" y="373" font-family="Lato,sans-serif" font-size="14" fill="#4B5563">e.g. $49.99</text>'
        # Field 3 — dropdown
        '<text x="460" y="412" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="#6B7280">PAYMENT METHOD</text>'
        '<rect x="460" y="418" width="360" height="40" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="478" y="443" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">Credit Card</text>'
        '<text x="796" y="443" font-family="Lato,sans-serif" font-size="12" fill="#4B5563">&#9660;</text>'
        # Field 4
        '<text x="460" y="482" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="#6B7280">YOUR NAME *</text>'
        '<rect x="460" y="488" width="360" height="40" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="478" y="513" font-family="Lato,sans-serif" font-size="14" fill="#4B5563">Agent name</text>'
        # Buttons
        '<rect x="460" y="546" width="108" height="38" rx="8" fill="#1E293B"/>'
        '<text x="495" y="570" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Cancel</text>'
        '<rect x="580" y="546" width="240" height="38" rx="8" fill="url(#gradH)"/>'
        '<text x="659" y="570" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="white">Launch &#8629;</text>'
        + chrome_bar('https://support.zendesk.com/tickets/4821', 'Ticket #4821 - Zendesk') +
        # Feature callout
        '<rect x="908" y="726" width="328" height="50" rx="10" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<text x="928" y="746" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#F8FAFC">Dynamic templates</text>'
        '<text x="928" y="766" font-family="Lato,sans-serif" font-size="12" fill="#60A5FA">Ask only what they need, insert instantly</text>'
        '</svg>'
    )
    render(svg, 'screenshot-2-variables.png', 1280, 800)


# ── Screenshot 3: Options Page ────────────────────────────────────────────────

def cmd_rows_3():
    names = [
        'star Thank You - Order Delay',
        'Refund Approved',
        'Escalation Notice',
        'Follow-Up - No Response',
        'Ticket Closed - Survey',
        'Out of Office',
        'Cannot Reproduce',
        'Request Screenshot',
    ]
    triggers = ['/ty-delay', '/refund-ok', '/escalate', '/followup', '/closed', '/ooo', '/cantrepro', '/screenshot']
    rows = ''
    for i, (name, trig) in enumerate(zip(names, triggers)):
        y = 200 + i * 64
        is_sel = i == 1
        bg = '#111827' if is_sel else '#0D1525'
        stroke = '#3B82F6' if is_sel else '#1E293B'
        sw = '1.5' if is_sel else '1'
        nf = '#F8FAFC' if is_sel else '#D1D5DB'
        fw = '700' if is_sel else '400'
        tf = '#60A5FA' if is_sel else '#374151'
        rows += (
            '<rect x="232" y="' + str(y) + '" width="456" height="56" rx="8" fill="' + bg + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>'
            '<text x="256" y="' + str(y+22) + '" font-family="Lato,sans-serif" font-size="14" font-weight="' + fw + '" fill="' + nf + '">' + name + '</text>'
            '<text x="256" y="' + str(y+40) + '" font-family="Lato,sans-serif" font-size="11" fill="' + tf + '">' + trig + '</text>'
        )
    return rows

def ss3():
    rows = cmd_rows_3()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">'
        + DEFS +
        '<rect width="1280" height="800" fill="#0F172A"/>'
        '<rect x="0" y="88" width="1280" height="712" fill="#0F172A"/>'
        # Top options nav
        '<rect x="0" y="88" width="1280" height="56" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<rect x="24" y="100" width="30" height="30" rx="8" fill="url(#grad)"/>'
        '<text x="33" y="120" font-family="Lato,sans-serif" font-size="16" fill="white">&#9889;</text>'
        '<text x="62" y="122" font-family="Lato,sans-serif" font-size="17" font-weight="700" fill="#F8FAFC">cannedIQ</text>'
        # Nav tabs
        '<text x="200" y="122" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="#3B82F6">Commands</text>'
        '<rect x="196" y="140" width="80" height="2" rx="1" fill="#3B82F6"/>'
        '<text x="310" y="122" font-family="Lato,sans-serif" font-size="14" fill="#4B5563">Settings</text>'
        '<text x="390" y="122" font-family="Lato,sans-serif" font-size="14" fill="#4B5563">Teams</text>'
        '<text x="458" y="122" font-family="Lato,sans-serif" font-size="14" fill="#4B5563">Billing</text>'
        # New command button
        '<rect x="1110" y="100" width="148" height="32" rx="8" fill="url(#gradH)"/>'
        '<text x="1140" y="121" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="white">+ New Command</text>'
        # Stack sidebar
        '<rect x="0" y="144" width="220" height="656" fill="#0D1525"/>'
        '<rect x="220" y="144" width="1" height="656" fill="#1E293B"/>'
        # Stack search
        '<rect x="12" y="160" width="196" height="34" rx="8" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<text x="32" y="181" font-family="Lato,sans-serif" font-size="12" fill="#374151">Search commands...</text>'
        # All commands
        '<rect x="12" y="204" width="196" height="34" rx="8" fill="#1E293B"/>'
        '<text x="32" y="226" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#E2E8F0">All Commands</text>'
        '<rect x="188" y="211" width="18" height="18" rx="9" fill="#374151"/>'
        '<text x="192" y="224" font-family="Lato,sans-serif" font-size="10" fill="#94A3B8">24</text>'
        # Stacks label
        '<text x="20" y="262" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">STACKS</text>'
        # Support stack
        '<rect x="12" y="270" width="196" height="34" rx="8" fill="#1E3A5F" opacity="0.55"/>'
        '<text x="32" y="292" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#60A5FA">Support</text>'
        '<rect x="188" y="277" width="18" height="18" rx="9" fill="#1E3A5F"/>'
        '<text x="192" y="290" font-family="Lato,sans-serif" font-size="10" fill="#60A5FA">11</text>'
        # Sales stack
        '<text x="32" y="330" font-family="Lato,sans-serif" font-size="13" fill="#6B7280">Sales</text>'
        '<rect x="188" y="315" width="18" height="18" rx="9" fill="#1E293B"/>'
        '<text x="193" y="328" font-family="Lato,sans-serif" font-size="10" fill="#6B7280">7</text>'
        # Personal stack
        '<text x="32" y="368" font-family="Lato,sans-serif" font-size="13" fill="#6B7280">Personal</text>'
        '<rect x="188" y="353" width="18" height="18" rx="9" fill="#1E293B"/>'
        '<text x="193" y="366" font-family="Lato,sans-serif" font-size="10" fill="#6B7280">6</text>'
        # HR stack
        '<text x="32" y="406" font-family="Lato,sans-serif" font-size="13" fill="#6B7280">HR Templates</text>'
        # Add stack
        '<rect x="12" y="432" width="196" height="32" rx="8" fill="none" stroke="#1E293B" stroke-width="1" stroke-dasharray="4"/>'
        '<text x="80" y="452" font-family="Lato,sans-serif" font-size="12" fill="#374151">+ Add Stack</text>'
        # Command list
        '<rect x="220" y="144" width="480" height="656" fill="#0F172A"/>'
        '<rect x="700" y="144" width="1" height="656" fill="#1E293B"/>'
        '<rect x="220" y="144" width="480" height="44" fill="#0D1525" opacity="0.6"/>'
        '<text x="240" y="170" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#6B7280">Support  11 commands</text>'
        + rows +
        # Editor panel
        '<rect x="700" y="144" width="580" height="656" fill="#111827"/>'
        '<rect x="700" y="144" width="580" height="56" fill="#0D1525"/>'
        '<text x="724" y="178" font-family="Lato,sans-serif" font-size="16" font-weight="700" fill="#F8FAFC">Refund Approved</text>'
        # Name field
        '<text x="724" y="230" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">COMMAND NAME</text>'
        '<rect x="724" y="236" width="516" height="36" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="740" y="259" font-family="Lato,sans-serif" font-size="14" fill="#F8FAFC">Refund Approved</text>'
        # Slash trigger
        '<text x="724" y="298" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">SLASH TRIGGER</text>'
        '<rect x="724" y="304" width="240" height="36" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="740" y="327" font-family="Lato,sans-serif" font-size="14" fill="#3B82F6">/</text>'
        '<text x="754" y="327" font-family="Lato,sans-serif" font-size="14" fill="#F8FAFC">refund-ok</text>'
        # Type toggle
        '<text x="990" y="298" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">TYPE</text>'
        '<rect x="990" y="304" width="90" height="36" rx="8" fill="#1E293B"/>'
        '<rect x="992" y="306" width="44" height="32" rx="6" fill="#3B82F6"/>'
        '<text x="1001" y="327" font-family="Lato,sans-serif" font-size="12" font-weight="700" fill="white">Static</text>'
        '<text x="1043" y="327" font-family="Lato,sans-serif" font-size="12" fill="#374151">AI</text>'
        # Template label
        '<text x="724" y="368" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">TEMPLATE</text>'
        '<rect x="724" y="374" width="516" height="200" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="740" y="400" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Hi </text>'
        '<text x="760" y="400" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{firstName}}</text>'
        '<text x="828" y="400" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">,</text>'
        '<text x="740" y="424" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Great news &#8212; your refund of </text>'
        '<text x="924" y="424" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{amount}}</text>'
        '<text x="982" y="424" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8"> has been approved</text>'
        '<text x="740" y="448" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">on your </text>'
        '<text x="793" y="448" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{paymentMethod}}</text>'
        '<text x="905" y="448" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8"> within 5-10 business days.</text>'
        '<text x="740" y="484" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">&#8212; </text>'
        '<text x="754" y="484" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{agentName}}</text>'
        # Save button
        '<rect x="1110" y="736" width="148" height="38" rx="8" fill="url(#gradH)"/>'
        '<text x="1143" y="759" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="white">Save Command</text>'
        + chrome_bar('chrome-extension://options.html', 'cannedIQ Options') +
        '</svg>'
    )
    render(svg, 'screenshot-3-options.png', 1280, 800)


# ── Screenshot 4: AI Command ──────────────────────────────────────────────────

def ss4():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">'
        + DEFS +
        '<rect width="1280" height="800" fill="#0F172A"/>'
        '<rect x="0" y="88" width="1280" height="712" fill="#101010"/>'
        # LinkedIn-style navbar (dimmed)
        '<rect x="0" y="88" width="1280" height="52" fill="#141414" opacity="0.7"/>'
        '<rect x="24" y="102" width="88" height="24" rx="4" fill="#0077B5" opacity="0.5"/>'
        '<text x="36" y="119" font-family="Lato,sans-serif" font-size="16" font-weight="700" fill="#fff" opacity="0.5">in</text>'
        # Feed area dimmed
        '<rect x="180" y="152" width="640" height="600" rx="8" fill="#1A1A1A" opacity="0.4"/>'
        # Compose window dimmed
        '<rect x="300" y="360" width="540" height="380" rx="12" fill="#1E1E1E" opacity="0.25"/>'
        # Dark overlay
        '<rect width="1280" height="800" fill="#000" opacity="0.7"/>'
        # AI Panel
        '<rect x="320" y="134" width="640" height="528" rx="16" fill="#111827" filter="url(#shadow)"/>'
        '<rect x="320" y="134" width="640" height="3" rx="2" fill="url(#gradH)"/>'
        '<rect x="320" y="134" width="640" height="528" rx="16" fill="none" stroke="#1E293B" stroke-width="1"/>'
        # Panel header
        '<rect x="320" y="137" width="640" height="56" rx="12" fill="#0D1525"/>'
        '<rect x="320" y="169" width="640" height="24" fill="#0D1525"/>'
        '<rect x="344" y="151" width="28" height="28" rx="8" fill="url(#grad)"/>'
        '<text x="351" y="169" font-family="Lato,sans-serif" font-size="14" fill="white">&#10022;</text>'
        '<text x="382" y="166" font-family="Lato,sans-serif" font-size="16" font-weight="700" fill="#F8FAFC">AI: Cold Outreach &#8212; LinkedIn</text>'
        '<rect x="695" y="149" width="40" height="20" rx="10" fill="rgba(139,92,246,0.25)"/>'
        '<text x="703" y="163" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#A78BFA">PRO</text>'
        # AI Prompt
        '<text x="344" y="218" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">AI PROMPT</text>'
        '<rect x="344" y="224" width="592" height="156" rx="8" fill="#0D1525" stroke="#1E293B" stroke-width="1"/>'
        '<text x="362" y="250" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Write a short, personalized LinkedIn connection request for</text>'
        '<text x="362" y="272" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">someone who works as </text>'
        '<text x="505" y="272" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{role}}</text>'
        '<text x="545" y="272" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8"> at </text>'
        '<text x="567" y="272" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{company}}</text>'
        '<text x="647" y="272" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">.</text>'
        '<text x="362" y="294" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">My goal: </text>'
        '<text x="418" y="294" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{goal}}</text>'
        '<text x="458" y="294" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">. Tone: warm, direct. Max 2 sentences.</text>'
        '<text x="362" y="350" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Context from page: </text>'
        '<text x="480" y="350" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA">{{inputText}}</text>'
        # Divider
        '<rect x="344" y="396" width="592" height="1" fill="#1E293B"/>'
        # Generated result
        '<text x="344" y="418" font-family="Lato,sans-serif" font-size="10" font-weight="700" fill="#374151" letter-spacing="1">GENERATED RESPONSE</text>'
        '<rect x="344" y="424" width="592" height="136" rx="8" fill="#0A1628" stroke="#3B82F6" stroke-width="1" opacity="0.8"/>'
        '<text x="362" y="452" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">Hi Marcus, I came across your work on scaling infrastructure at</text>'
        '<text x="362" y="474" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">TechCorp &#8212; really impressive how your team handled that migration.</text>'
        '<text x="362" y="496" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">I\'d love to connect and explore whether our developer tooling</text>'
        '<text x="362" y="518" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">could save your eng team meaningful time.</text>'
        '<rect x="614" y="504" width="2" height="22" fill="#3B82F6"/>'
        # Buttons
        '<rect x="344" y="578" width="160" height="38" rx="8" fill="#1E293B"/>'
        '<text x="370" y="601" font-family="Lato,sans-serif" font-size="13" fill="#94A3B8">Regenerate</text>'
        '<rect x="516" y="578" width="200" height="38" rx="8" fill="url(#gradH)"/>'
        '<text x="562" y="601" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="white">Insert Response &#8629;</text>'
        # Condition badge
        '<rect x="344" y="630" width="180" height="24" rx="5" fill="rgba(139,92,246,0.12)" stroke="rgba(139,92,246,0.3)" stroke-width="1"/>'
        '<text x="362" y="646" font-family="Lato,sans-serif" font-size="11" fill="#A78BFA">Only on LinkedIn</text>'
        # AI credits bar
        '<text x="756" y="590" font-family="Lato,sans-serif" font-size="10" fill="#374151">AI credits remaining</text>'
        '<rect x="756" y="598" width="148" height="6" rx="3" fill="#1E293B"/>'
        '<rect x="756" y="598" width="96" height="6" rx="3" fill="url(#gradH)"/>'
        '<text x="908" y="608" font-family="Lato,sans-serif" font-size="10" fill="#4B5563">65/100</text>'
        + chrome_bar('https://www.linkedin.com/in/marcus-chen/', 'Marcus Chen | LinkedIn') +
        '</svg>'
    )
    render(svg, 'screenshot-4-ai.png', 1280, 800)


# ── Screenshot 5: Slash Trigger ───────────────────────────────────────────────

def convo_items():
    names = ['Sarah L.', 'Marcus K.', 'Alice R.', 'Kevin T.', 'Jordan P.', 'Beth S.']
    previews = [
        "Order hasn't arrived yet...",
        'How do I cancel?',
        'Refund still pending',
        'Can I upgrade my plan?',
        'Login not working',
        'Wrong item received',
    ]
    letters = 'SMAKJB'
    rows = ''
    for i in range(6):
        y = 148 + i * 74
        bg = '#1E293B' if i == 1 else 'transparent'
        av = '#1E3A5F' if i % 2 == 0 else '#1F2937'
        nf = '#F8FAFC' if i == 1 else '#D1D5DB'
        rows += (
            '<rect x="12" y="' + str(y) + '" width="256" height="66" rx="8" fill="' + bg + '"/>'
            '<circle cx="38" cy="' + str(y+33) + '" r="18" fill="' + av + '"/>'
            '<text x="31" y="' + str(y+38) + '" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#94A3B8">' + letters[i] + '</text>'
            '<text x="64" y="' + str(y+22) + '" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="' + nf + '">' + names[i] + '</text>'
            '<text x="64" y="' + str(y+42) + '" font-family="Lato,sans-serif" font-size="11" fill="#374151">' + previews[i] + '</text>'
        )
    return rows

def ss5():
    items = convo_items()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 800" width="1280" height="800">'
        + DEFS +
        '<rect width="1280" height="800" fill="#0F172A"/>'
        '<rect x="0" y="88" width="1280" height="712" fill="#0C111D"/>'
        # Sidebar
        '<rect x="0" y="88" width="280" height="712" fill="#111827"/>'
        '<text x="24" y="130" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="#374151" letter-spacing="1">CONVERSATIONS</text>'
        + items +
        # Main area
        '<rect x="280" y="88" width="1000" height="712" fill="#0C111D"/>'
        # Header
        '<rect x="280" y="88" width="1000" height="56" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<circle cx="316" cy="116" r="16" fill="#1E3A5F"/>'
        '<text x="309" y="121" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#60A5FA">M</text>'
        '<text x="340" y="112" font-family="Lato,sans-serif" font-size="15" font-weight="700" fill="#F8FAFC">Marcus K.</text>'
        '<text x="340" y="130" font-family="Lato,sans-serif" font-size="11" fill="#374151">marcus@example.com  Open</text>'
        # Customer message
        '<rect x="320" y="172" width="480" height="52" rx="10" fill="#1E293B"/>'
        '<text x="344" y="196" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">Hi, how do I cancel my subscription?</text>'
        '<text x="344" y="214" font-family="Lato,sans-serif" font-size="11" fill="#374151">2:14 PM</text>'
        # Agent message
        '<rect x="520" y="244" width="500" height="68" rx="10" fill="#1E3A5F"/>'
        '<text x="544" y="268" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">Hi Marcus! Happy to help with that.</text>'
        '<text x="544" y="290" font-family="Lato,sans-serif" font-size="14" fill="#E2E8F0">Let me pull up your account...</text>'
        '<text x="958" y="304" font-family="Lato,sans-serif" font-size="11" fill="#374151">2:15 PM</text>'
        # Reply composer
        '<rect x="296" y="576" width="968" height="176" rx="12" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<rect x="296" y="712" width="968" height="40" rx="12" fill="#0D1525"/>'
        '<rect x="296" y="712" width="968" height="20" fill="#0D1525"/>'
        '<text x="320" y="740" font-family="Lato,sans-serif" font-size="12" fill="#374151">B  I  U  Link  Emoji  Attach</text>'
        # Typed text in composer
        '<text x="316" y="622" font-family="Lato,sans-serif" font-size="15" fill="#6B7280">Hi Marcus, no problem! </text>'
        # Slash trigger text
        '<text x="470" y="622" font-family="Lato,sans-serif" font-size="15" fill="#3B82F6" font-weight="700">/cancel</text>'
        '<rect x="551" y="606" width="2" height="22" fill="#3B82F6"/>'
        # Slash suggestion popup
        '<rect x="462" y="490" width="390" height="74" rx="10" fill="#1E293B" filter="url(#shadow-sm)"/>'
        '<rect x="462" y="490" width="390" height="74" rx="10" fill="none" stroke="#3B82F6" stroke-width="1.5" opacity="0.7"/>'
        '<rect x="462" y="490" width="390" height="3" rx="2" fill="url(#gradH)"/>'
        '<polygon points="562,564 578,564 570,576" fill="#1E293B"/>'
        '<text x="482" y="516" font-family="Lato,sans-serif" font-size="14" font-weight="700" fill="#F8FAFC">Cancellation &#8212; Policy &amp; Steps</text>'
        '<text x="482" y="538" font-family="Lato,sans-serif" font-size="12" fill="#4B5563">Support  /cancel</text>'
        '<rect x="756" y="502" width="80" height="22" rx="5" fill="#111827" stroke="#374151" stroke-width="1"/>'
        '<text x="771" y="517" font-family="Lato,sans-serif" font-size="11" fill="#6B7280">Tab &#8629;</text>'
        # CIQ badge in composer
        '<rect x="1200" y="718" width="52" height="22" rx="8" fill="url(#gradH)" opacity="0.9"/>'
        '<text x="1209" y="733" font-family="Lato,sans-serif" font-size="11" font-weight="700" fill="white">CIQ &#9889;</text>'
        + chrome_bar('https://app.intercom.com/conversations', 'Conversations - Intercom') +
        # Feature callout
        '<rect x="300" y="728" width="360" height="48" rx="10" fill="#111827" stroke="#1E293B" stroke-width="1"/>'
        '<text x="322" y="748" font-family="Lato,sans-serif" font-size="13" font-weight="700" fill="#F8FAFC">Slash triggers</text>'
        '<text x="322" y="766" font-family="Lato,sans-serif" font-size="12" fill="#60A5FA">Type /keyword in any field, expand instantly</text>'
        '</svg>'
    )
    render(svg, 'screenshot-5-slash.png', 1280, 800)


# ── Promo Tile 440x280 ────────────────────────────────────────────────────────

def promo_tile():
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280" width="440" height="280">'
        '<defs>'
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#0F172A"/>'
        '<stop offset="100%" stop-color="#0A1121"/>'
        '</linearGradient>'
        '<linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0%" stop-color="#3B82F6"/>'
        '<stop offset="100%" stop-color="#8B5CF6"/>'
        '</linearGradient>'
        '<linearGradient id="gradH" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0%" stop-color="#3B82F6"/>'
        '<stop offset="100%" stop-color="#8B5CF6"/>'
        '</linearGradient>'
        '</defs>'
        # Background
        '<rect width="440" height="280" fill="url(#bg)"/>'
        # Grid lines
        '<line x1="0" y1="56" x2="440" y2="56" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="0" y1="112" x2="440" y2="112" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="0" y1="168" x2="440" y2="168" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="0" y1="224" x2="440" y2="224" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="88" y1="0" x2="88" y2="280" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="176" y1="0" x2="176" y2="280" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="264" y1="0" x2="264" y2="280" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        '<line x1="352" y1="0" x2="352" y2="280" stroke="#1E293B" stroke-width="0.5" opacity="0.5"/>'
        # Glow orbs
        '<circle cx="220" cy="130" r="100" fill="#3B82F6" opacity="0.04"/>'
        '<circle cx="80" cy="50" r="60" fill="#8B5CF6" opacity="0.05"/>'
        # Logo icon
        '<rect x="184" y="36" width="72" height="72" rx="20" fill="url(#grad)"/>'
        '<text x="207" y="88" font-family="Lato,sans-serif" font-size="40" fill="white">&#9889;</text>'
        # Brand name
        '<text x="220" y="142" font-family="Lato,sans-serif" font-size="30" font-weight="900" fill="#F8FAFC" text-anchor="middle" letter-spacing="-1">cannedIQ</text>'
        # Tagline
        '<text x="220" y="170" font-family="Lato,sans-serif" font-size="13" fill="#60A5FA" text-anchor="middle">Instant responses. Any site. One keystroke.</text>'
        # Feature pills
        '<rect x="50" y="196" width="96" height="26" rx="13" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.3)" stroke-width="1"/>'
        '<text x="98" y="213" font-family="Lato,sans-serif" font-size="11" fill="#93C5FD" text-anchor="middle">Templates</text>'
        '<rect x="162" y="196" width="116" height="26" rx="13" fill="rgba(139,92,246,0.15)" stroke="rgba(139,92,246,0.3)" stroke-width="1"/>'
        '<text x="220" y="213" font-family="Lato,sans-serif" font-size="11" fill="#C4B5FD" text-anchor="middle">AI Responses</text>'
        '<rect x="294" y="196" width="96" height="26" rx="13" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.3)" stroke-width="1"/>'
        '<text x="342" y="213" font-family="Lato,sans-serif" font-size="11" fill="#93C5FD" text-anchor="middle">Any Website</text>'
        # Bottom shortcut
        '<text x="155" y="255" font-family="Lato,sans-serif" font-size="11" fill="#374151">Launch with</text>'
        '<rect x="222" y="241" width="64" height="20" rx="5" fill="#1E293B" stroke="#374151" stroke-width="1"/>'
        '<text x="231" y="255" font-family="Lato,sans-serif" font-size="10" fill="#94A3B8">Ctrl+Space</text>'
        '</svg>'
    )
    render(svg, 'promo-tile-440x280.png', 440, 280)


# ── Run ───────────────────────────────────────────────────────────────────────
print('\nGenerating cannedIQ store assets...\n')
ss1()
ss2()
ss3()
ss4()
ss5()
promo_tile()
print('\nAll assets saved to: ' + OUT)