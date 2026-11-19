# AgentCheck — Daily Check-In for Agent ID Holders

A simple daily check-in dApp on **BNB Chain**, built for the Binance Wallet
**Agent ID Hackathon** (submission period 2026-11-18 08:00 UTC – 2026-12-09
08:00 UTC). Only wallets that hold an **Agent ID** can check in. Checking in
builds a daily streak, earns points, and — on the very first check-in — mints
a **soulbound (non-transferable) ERC-721 badge** as proof of participation.

> Status: foundation build. The contract compiles and is fully tested on a
> local EVM; it has **not been deployed yet** (see "Deployment" below).

## How Agent ID is used (core flow)

Agent ID is not a cosmetic integration — it is the access key for the only
state-changing function in the system:

1. The Agent ID registry is the SPACE ID HandleRegistry on BNB Chain:
   `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`. An address holds an Agent ID
   iff `balanceOf(address) > 0` on that ERC-721 contract.
2. Every `checkIn()` call verifies the caller **on-chain, at call time**:
   the AgentCheck contract calls `balanceOf(msg.sender)` on the registry and
   reverts with `NotAgentIdHolder` if it is 0. No allowlist, no signatures,
   no off-chain gatekeeper.
3. The frontend additionally reads the wallet's Agent ID **handle** via the
   registry's `handleOf(address)` and cross-checks ownership the way the
   Agent ID ecosystem does:
   `ownerOf(uint256(keccak256(bytes(handle)))) == wallet`
   (the Agent ID tokenId is the keccak256 hash of the handle string).

## Contract design

Single self-contained file: [`contracts/AgentCheck.sol`](contracts/AgentCheck.sol)
(Solidity `^0.8.20`, MIT, **no imports / no external dependencies**).

- `checkIn()` — once per UTC day per address (day = `block.timestamp / 86400`).
  Tracks per address: total check-ins, current streak, points, last
  check-in day.
  - **Streak:** +1 if the previous check-in was yesterday; resets to 1 if a
    day was skipped; a second check-in on the same day reverts with
    `AlreadyCheckedInToday`.
  - **Points (exact formula):** `pointsAwarded = 10 + min(newStreak, 20)`,
    i.e. 11–30 points per check-in.
- **Soulbound badge** — on the first check-in, a minimal hand-rolled ERC-721
  ("AgentCheck Badge", `ACHKB`) is minted to the caller. It is
  non-transferable **by design**: `transferFrom`, `safeTransferFrom`,
  `approve` and `setApprovalForAll` are implemented as stubs that always
  revert with the `Soulbound` error (documented in the contract source).
  `tokenURI` returns on-chain `data:application/json;base64` metadata with
  the badge id and the holder's first check-in day as attributes.
- **Views:** `isAgentIdHolder(address)`, `statsOf(address)` →
  `(totalCheckIns, currentStreak, points, lastCheckInDay, hasBadge,
  badgeTokenId)`, `totalAgents()`, `totalCheckIns()`.
- **Events:** `CheckedIn(agent, day, streak, pointsAwarded, totalPoints)`,
  `BadgeMinted(agent, tokenId)`, plus the ERC-721 `Transfer` event on mint.

### Owner permissions

**None.** AgentCheck has no owner, no admin role, and no privileged
functions. Nobody — including the deployer — can change any user's stats,
points or badge after the fact, pause the contract, or withdraw anything
(the contract never holds funds). The only constructor argument is the
immutable Agent ID registry address.

## Build, compile & test (all local)

Tooling lives in `tools/` (Node.js, `solc` 0.8.26 via npm, `@ethereumjs/vm`
for the local EVM tests). Nothing here talks to a live network.

```bash
cd tools
npm install

# Compile → artifacts/AgentCheck.abi.json + AgentCheck.bytecode.txt
node compile.js

# Local EVM test suite (deploys a mock registry + AgentCheck in-memory)
NODE_PATH=$PWD/node_modules node ../test/test.js
```

Latest verified results (2026-11-18):

- Compilation: clean, 0 errors / 0 warnings.
- Creation bytecode: **4,762 bytes**; deployed bytecode: **4,587 bytes**.
- Deployment gas: **940,728 measured** by executing the CREATE on a local
  in-memory EVM (@ethereumjs/vm, Cancun). A size-based cross-check estimate
  is ~1,027,544. Real BNB Chain deployment gas will be close to the
  measured figure.
- Tests: **22/22 checks pass** — non-holder reverts; holder check-in
  succeeds with badge mint and correct points (11); same-day re-check-in
  reverts; next-day streak increments (points 23 cumulative); skipping a
  day resets the streak (34 cumulative); badge transfer and approve revert
  as soulbound; `tokenURI` decodes to valid JSON. Raw output:
  [`test/test-output.txt`](test/test-output.txt).

`contracts/MockRegistry.sol` is a **test-only** stand-in for the
HandleRegistry (it exposes the same `balanceOf` surface AgentCheck uses).
It is never deployed to a live network.

## Frontend

Static page in [`web/`](web/) — no build step, no libraries. Open
`web/index.html` in a wallet browser:

- Connect Wallet (requests BNB Chain, chainId 56).
- Shows the connected address, Agent ID holder status, and the wallet's
  Agent ID handle with the on-chain `ownerOf(keccak256(handle))`
  cross-check (`web/keccak.js` is a small dependency-free Keccak-256,
  verified against the standard test vectors).
- Check-In button → `checkIn()`; stats panel reads `statsOf(address)`.
- The contract address is a clearly marked constant in `web/app.js`
  (`CONTRACT_ADDRESS`, "FILL AFTER DEPLOYMENT"). Until it is filled in,
  the page runs in registry-only mode: holder status and handle work,
  check-in stays hidden.
- Gas note: check-in is an on-chain transaction and costs a small amount
  of BNB gas, paid to the network. Points and badges have no monetary
  value and cannot be transferred or sold.

## Deployment

Deployed to BNB Chain mainnet on 2026-11-18.

1. `AgentCheck` deployed with constructor argument
   `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (the HandleRegistry).
   Deploy tx `0xce0ea5808b256b5d96db48840b2f2bd9f76b0d2efacb0201a075a7362a55bb03`,
   gas used 1,069,532. Deployer: `0xb1f2dcab07dec6c691ee5da565593018b44e9333`
   (a dedicated project EOA; the contract itself has no owner or admin).
2. Source verified on Sourcify with an **exact match** (creation + runtime),
   match ID 59474778, 2026-11-18 — publicly visible at
   https://sourcify.dev/#/lookup/0x3bce1dabf3a78041c0b37d7e28e448bdf6bd5192
3. `CONTRACT_ADDRESS` in `web/app.js` filled in (see below).
4. Remaining: host `web/` as a static site and submit the project (name,
   website, contract address, Agent ID usage description) before
   **2026-12-09 08:00 UTC**.

Deployed address: `0x3bce1dabf3a78041c0b37d7e28e448bdf6bd5192`
BscScan: https://bscscan.com/address/0x3bce1dabf3a78041c0b37d7e28e448bdf6bd5192
First live check-in: tx `0x460fa7a7dd35401f355380cab69ea5c88bbb6a847416ae135b58fe3ed38f3deb`
by Agent ID holder kucing2.ai — badge #1 minted, 11 points, streak 1.

## Project layout

```
contracts/AgentCheck.sol     the dApp contract (single file, no imports)
contracts/MockRegistry.sol   test-only registry stand-in
tools/                       compile script + local dev dependencies
test/test.js                 local EVM test suite
test/test-output.txt         raw output of the latest test run
artifacts/                   ABI, bytecode, gas estimates
web/                         static frontend (index.html, app.js, keccak.js)
```

## License

MIT — see [`LICENSE`](LICENSE).
