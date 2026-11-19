# Agent ID Hackathon — Submission Route Research

Researched: 2026-11-18 (public web only, no logins, no submissions made)
Event: Binance Wallet + BNB Chain "Agent ID Hackathon", 60,000 USDC total rewards,
submission period 2026-11-18 08:00 UTC – 2026-12-09 08:00 UTC.
Primary source: https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf
Fuller mirror of the same announcement (includes a "Developer Resources" section the support page drops):
https://www.binance.com/en/square/post/389517345917641

## 1. Submission route — BOTTOM LINE

**No public project-submission form URL is linked anywhere in the official announcement, and none could be found on BNB Chain's blog/hackathon pages, DoraHacks, or Binance Wallet's / BNB Chain's official X posts as of 2026-11-18.**

- The announcement's "How to Participate" step 3 says only: "Submit your project name, website, contract address(es), Agent ID usage description, and other required materials during the Submission Period. No registration needed." — with **no hyperlink attached** in either the support-announcement version or the Binance Square version.
- The Square version ends with a "### For More Information:" heading whose content renders empty in text form — if links exist there, they are not exposed as text/URLs.
- The **only form actually linked** in the entire announcement is the survey for the *separate* Agent Ecosystem Promotion Award (the X-post contest), NOT for project submission:
  - **https://app.binance.com/uni-qr/user-survey/ff6832f8d2984af289068c9450a3c98c**
  - Its own text confirms its purpose: "Focusing on projects participating in the Agent ID Hackathon, you can publish original content on X to share your views…" with hashtags #BinanceWalletHackathon and #AgenticWallet.
  - It states: **"Please log into your Binance account to begin the survey."** — the actual survey fields are NOT visible without a Binance login.
- Binance Wallet's official X announcement post (via X viewer) says "Bring your build:" followed by a link that the viewer does not expose; its card points back to the Binance announcement. BNB Chain's X timeline shows no hackathon post in the fetched window. Searches of bnbchain.org and DoraHacks return no dedicated hackathon/submission page for this event (DoraHacks' October 2026 newsletter lists a *different* event, "Beyond the Benchmark: The Binance Agentic AI Challenge").
- Practical implication: the project-submission form is most likely distributed via the Binance Wallet app campaign page / Binance's survey system (same `app.binance.com/uni-qr/user-survey/…` pattern) and may only be reachable in-app or via a link Binance publishes later. **It cannot be completed or even inspected from the public web without a Binance account login.** Closest official page = the announcement itself (URLs above).

## 2. Fields the submission requires

From the announcement text (verbatim list, step 3 of "How to Participate"):

1. Project name
2. Website
3. Contract address(es)
4. Agent ID usage description
5. "…and other required materials" (unspecified)

Plus, from the Terms & Conditions: rewards "will be sent to the **reward receiving address provided during project submission**" — so a reward/payout address is also collected at submission.

The exact field list of the real form cannot be listed verbatim because the form itself is not publicly visible (see §1). For the promotion-award survey, no fields are visible pre-login either.

## 3. Login / signature / fee requirements

- Announcement: "**No registration needed**" for submission; no submission fee is mentioned anywhere, and no wallet signature is mentioned.
- Campaign T&Cs: "**Only users who maintain an active Binance Account on the Binance Platform are eligible to participate in this Campaign.** Tokens will not be distributed to users who delete or deactivate their Binance Wallets and/or their Binance Accounts."
- The one linked form (promotion survey) explicitly requires logging into a Binance account before it can be filled in. It is reasonable to expect the project-submission form (same Binance survey system) to also require a Binance login — but this is **not confirmed** for the project form itself.
- Separate real costs of participating (not submission fees): deploying + verifying contracts on BNB Chain costs BNB gas; an Agent ID itself is claimed in-app (free apart from a small BNB network fee, per Binance's own guide).

## 4. Developer resources for Agent ID integration

All from the announcement's "Developer Resources" section (Square version) unless noted:

**Agent ID (the identity layer)**
- Agent ID Contract (BNB Chain): **0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F** — contract name "SPACE ID Agent ID", symbol AI, ERC-721, non-transferable (soulbound).
- Holder check (the only integration method Binance documents): "Call balanceOf(address) on the contract; a return value greater than 0 indicates the address holds an Agent ID."
- Claim path: Binance App → Wallet → homepage banner → Agent ID (in-app only).

**Reverse lookup (address → handle name)**
- Binance's announcement documents **no** reverse-resolution method — only the balanceOf holder check.
- On-chain pattern used by live ecosystem projects against this exact registry (documented by a third-party project brief, https://binancedog.netlify.app/agent-brief.txt): the registry exposes `handleOf(wallet)` returning the handle string, and the binding is verified as `ownerOf(keccak256(bytes(handle))) == wallet` — i.e. the NFT tokenId is `uint256(keccak256(handle))`, so forward resolution = ownerOf(keccak256(handle)) and reverse = handleOf(address). Treat as ecosystem-documented, not Binance-documented.
- Generic SPACE ID tooling: the **Web3 Name SDK** (`@web3-name-sdk/core`, npm) supports forward resolution `getAddress(name)` and reverse resolution `getDomainName({ address, queryChainIdList / queryTldList })` returning the address's primary name (docs mirrored at https://docs.gnosischain.com/tools/web3-name-sdk and https://docs.manta.network/docs/manta-pacific/Space%20ID ; official docs home is docs.space.id). Note: SDK docs cover SPACE ID TLDs such as .bnb/.arb; explicit support for the Binance ".ai" Agent ID TLD is not stated in the fetched docs — the registry-specific `handleOf` route above is the reliable path for this contract.

**Agentic Wallet / Agent OS / BNB Chain (official links from the announcement)**
- Agentic Wallet product intro: https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction
- Installation & login: https://web3.binance.com/en/dev-docs/products/agentic-wallet/install
- Skills repo: https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet
- Binance Web3 Developer Docs: https://web3.binance.com/en/dev-docs
- Agent OS homepage: https://www.binance.com/en/agent-os
- Binance MCP integration docs: https://developers.binance.com/en/docs/agent-native/mcp-server/agentic
- BNB Agent Studio docs: https://docs.bnbchain.org/developer-kit/bnbchain-studio/ and quickstart https://docs.bnbchain.org/developer-kit/bnbchain-studio/quickstart/
- No hackathon-specific integration guide from Binance/BNB Chain was found beyond the announcement's resource table.

## 5. Winner announcement & extra fine print

- Timeline: Internal Review 2026-12-09 08:00 UTC → 2026-12-17 08:00 UTC; **Public Review Period 2026-12-17 08:00 UTC → 2026-12-20 08:00 UTC**. Innovation Award process states: "Result Announcement: Binance Wallet team officially announces the winning projects and final results" — i.e. winners are announced by Binance Wallet during/after the public review period (no separate results page URL is given).
- Rewards distributed **within 14 business days after the public announcement period ends**, to the reward address given at submission.
- Fine print beyond the headline rules:
  - **Each team may submit one project only**; each project may receive only **one award** (across both award categories).
  - Innovation Award eligibility: product must be live **and ≥30 Agent ID addresses** must have interacted with the submitted contract(s) during the Submission Period.
  - Pioneer Award counts **only the contract addresses submitted** (token contracts included), and only interactions from addresses that hold an Agent ID; for existing projects, only data generated during the Submission Period counts.
  - The 20 winning projects (both categories) each also get one eligibility spot to claim a **two-digit Agent ID** (X post says "two-character Agent ID"), higher ranks choose first.
  - Safety red lines (any violation = immediate disqualification): no web QR-code/pairing-code login for Agentic Wallet on third-party sites and no storing user sessions server-side; no prompts that bypass user confirmation for asset operations; no unauthorized/scheduled/bundled transfers or unlimited approvals without user knowledge; contracts must be open-source with owner permissions (mint, tax, pause, freeze, withdraw) disclosed; no Binance/BNB brand impersonation in project/token/domain names; no collecting seed phrases, private keys, API secrets or pairing codes; no promising returns ("passive income", "automatic money-making" banned); trading products must show risk warnings; Agent ID must not be packaged as a tool for looking up other people's wallets by name.
  - Binance may disqualify for abnormal behaviour (volume manipulation, mass illegitimate account registration, market manipulation); cheating can be reported to audit@binance.com.
  - The announcement header carries the standard disclaimer: "Products and services referred to here may not be available in your region." No explicit country/region exclusion list appears in the announcement itself; the incorporated Binance Terms and Conditions for Prize Promotions / Binance Wallet Terms govern beyond it.
  - Binance reserves the right to modify/cancel the event and to make final determinations on winners and rankings.

## Sources

- https://www.binance.com/en/support/announcement/detail/95f5dbe0ea674a48a739b59e046648bf (official announcement)
- https://www.binance.com/en/square/post/389517345917641 (same announcement, Square version with Developer Resources)
- https://app.binance.com/uni-qr/user-survey/ff6832f8d2984af289068c9450a3c98c (linked promotion-award survey; Binance login wall)
- https://twiscan.com/en/x/BinanceWallet (Binance Wallet X announcement post)
- https://web3.binance.com/en/dev-docs/products/agentic-wallet/introduction (Agentic Wallet dev docs)
- https://docs.gnosischain.com/tools/web3-name-sdk and https://docs.manta.network/docs/manta-pacific/Space%20ID (SPACE ID Web3 Name SDK docs mirrors)
- https://binancedog.netlify.app/agent-brief.txt (third-party ecosystem doc showing handleOf / ownerOf(keccak256(handle)) usage against the registry)
