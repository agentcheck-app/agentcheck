// AgentCheck frontend — plain JS + window.ethereum, no build step, no libraries.
// All contract reads/writes are hand-encoded eth_call / eth_sendTransaction.

'use strict';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// SPACE ID HandleRegistry (Agent ID) on BNB Chain — the Agent ID registry.
const REGISTRY_ADDRESS = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

// AgentCheck contract, deployed on BNB Chain on 2026-11-18.
// Deploy tx: 0xce0ea5808b256b5d96db48840b2f2bd9f76b0d2efacb0201a075a7362a55bb03
const CONTRACT_ADDRESS = '0x3bce1dabf3a78041c0b37d7e28e448bdf6bd5192';

const BSC_CHAIN_ID = '0x38'; // 56

// Function selectors (first 4 bytes of keccak256 of the signature).
const SEL = {
  balanceOf: '0x70a08231',        // balanceOf(address)        — registry & badge
  handleOf: '0xc50a1514',         // handleOf(address)         — registry
  ownerOf: '0x6352211e',          // ownerOf(uint256)          — registry
  checkIn: '0x183ff085',          // checkIn()                 — AgentCheck
  statsOf: '0x15cfc405',          // statsOf(address)          — AgentCheck
  isAgentIdHolder: '0xda0c34b0',  // isAgentIdHolder(address)  — AgentCheck
};

const contractDeployed = () =>
  CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

// ---------------------------------------------------------------------------
// Small ABI helpers (only address / uint256 / string are needed here)
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const padAddress = (addr) => addr.toLowerCase().replace('0x', '').padStart(64, '0');
const wordToBigInt = (hex, i) => BigInt('0x' + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
const wordToAddress = (hex, i) => '0x' + hex.slice(2 + i * 64 + 24, 2 + (i + 1) * 64);

function decodeString(hex) {
  const len = Number(wordToBigInt(hex, 1));
  const dataHex = hex.slice(2 + 128, 2 + 128 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

async function ethCall(to, data) {
  return window.ethereum.request({ method: 'eth_call', params: [{ to, data }, 'latest'] });
}

function setStatus(msg) { $('status').textContent = msg; }

// ---------------------------------------------------------------------------
// App state + flow
// ---------------------------------------------------------------------------

let account = null;

async function connect() {
  if (!window.ethereum) {
    setStatus('No wallet found. Please open this page in a wallet browser (e.g. Binance Wallet) or install a Web3 wallet.');
    return;
  }
  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId !== BSC_CHAIN_ID) {
      setStatus('Switching to BNB Chain…');
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_CHAIN_ID }],
      });
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    $('address').textContent = account;
    $('connectBtn').textContent = 'Connected';
    $('connectBtn').disabled = true;
    setStatus('');
    await refresh();
  } catch (e) {
    setStatus('Connection failed: ' + (e.message || e));
  }
}

async function refresh() {
  if (!account) return;
  $('agentCard').classList.remove('hidden');

  // 1) Agent ID holder check: balanceOf(account) on the registry.
  const balHex = await ethCall(REGISTRY_ADDRESS, SEL.balanceOf + padAddress(account));
  const isHolder = wordToBigInt(balHex, 0) > 0n;
  $('holderStatus').innerHTML = isHolder
    ? '<span class="badge-ok">✓ Agent ID holder</span> — you can check in.'
    : '<span class="badge-no">No Agent ID found</span> — check-in is only for Agent ID holders. You can claim an Agent ID in the Binance app (Wallet → Agent ID).';

  // 2) Display the handle via handleOf(account), cross-checked the way the
  //    Agent ID ecosystem verifies ownership:
  //    ownerOf(uint256(keccak256(bytes(handle)))) == account
  $('handle').textContent = '—';
  $('verifyNote').textContent = '';
  if (isHolder) {
    try {
      const handleHex = await ethCall(REGISTRY_ADDRESS, SEL.handleOf + padAddress(account));
      const handle = decodeString(handleHex);
      if (handle) {
        const tokenId = window.keccak256Hex(handle); // uint256 as 0x-hex
        const ownerHex = await ethCall(REGISTRY_ADDRESS, SEL.ownerOf + tokenId.slice(2));
        const owner = wordToAddress(ownerHex, 0);
        const verified = owner.toLowerCase() === account.toLowerCase();
        $('handle').textContent = handle;
        $('verifyNote').textContent = verified
          ? 'Ownership cross-checked on-chain: ownerOf(keccak256(handle)) matches your wallet.'
          : 'Handle found, but the ownerOf cross-check did not match — treat with caution.';
      }
    } catch (e) {
      $('verifyNote').textContent = 'Could not load your Agent ID handle right now.';
    }
  }

  // 3) AgentCheck stats (only once the contract is deployed).
  if (!contractDeployed()) {
    $('statsCard').classList.add('hidden');
    return;
  }
  $('statsCard').classList.remove('hidden');
  const statsHex = await ethCall(CONTRACT_ADDRESS, SEL.statsOf + padAddress(account));
  $('statTotal').textContent = wordToBigInt(statsHex, 0).toString();
  $('statStreak').textContent = wordToBigInt(statsHex, 1).toString();
  $('statPoints').textContent = wordToBigInt(statsHex, 2).toString();
  const hasBadge = wordToBigInt(statsHex, 4) === 1n;
  const badgeId = wordToBigInt(statsHex, 5);
  $('statBadge').textContent = hasBadge ? '#' + badgeId.toString() : 'Not yet';
  $('checkInBtn').disabled = !isHolder;
}

async function checkIn() {
  if (!account || !contractDeployed()) return;
  try {
    setStatus('Confirm the check-in transaction in your wallet…');
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONTRACT_ADDRESS, data: SEL.checkIn }],
    });
    setStatus('Check-in sent: ' + txHash + ' — refreshing stats…');
    // Give the network a moment, then refresh (a production version would
    // poll for the transaction receipt instead).
    setTimeout(refresh, 4000);
  } catch (e) {
    setStatus('Check-in failed: ' + (e.message || e));
  }
}

$('connectBtn').addEventListener('click', connect);
$('checkInBtn').addEventListener('click', checkIn);
$('refreshBtn').addEventListener('click', refresh);

if (window.ethereum && window.ethereum.on) {
  window.ethereum.on('accountsChanged', () => window.location.reload());
  window.ethereum.on('chainChanged', () => window.location.reload());
}
