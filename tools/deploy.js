// Deploy AgentCheck to BSC mainnet from the project deployer EOA.
// Reads the private key from ../deployer-key.json (chmod 600, never printed).
// Usage: node deploy.js
const fs = require('fs');
const path = require('path');
const { secp256k1 } = require('ethereum-cryptography/secp256k1.js');
const { keccak256 } = require('ethereum-cryptography/keccak.js');
const { encode } = require('@ethereumjs/rlp');

const RPCS = ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed2.binance.org', 'https://bsc.publicnode.com'];
const CHAIN_ID = 56;
const REGISTRY = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

const keyData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployer-key.json'), 'utf8'));
const priv = Buffer.from(keyData.privateKey, 'hex');
const from = keyData.address.toLowerCase();

async function rpc(method, params) {
  let lastErr;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
const intToBuf = (n) => { if (n === 0n) return Buffer.alloc(0); let h = n.toString(16); if (h.length % 2) h = '0' + h; return Buffer.from(h, 'hex'); };

(async () => {
  const bytecode = fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'AgentCheck.bytecode.txt'), 'utf8').trim();
  const ctorArg = REGISTRY.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = Buffer.from(bytecode.replace('0x', '') + ctorArg, 'hex');

  const nonce = BigInt(await rpc('eth_getTransactionCount', [from, 'latest']));
  const bal = BigInt(await rpc('eth_getBalance', [from, 'latest']));
  const gpNow = BigInt(await rpc('eth_gasPrice', []));
  const gasPrice = gpNow + gpNow / 10n; // +10% buffer over network-reported price
  const gasLimit = 1100000n;
  const cost = gasLimit * gasPrice;
  console.log('from', from, 'nonce', nonce.toString(), 'balance(wei)', bal.toString());
  console.log('gasPrice(wei)', gasPrice.toString(), 'worst-case cost(wei)', cost.toString());
  if (bal < cost) { console.error('INSUFFICIENT BALANCE for worst-case cost'); process.exit(1); }

  const fields = [intToBuf(nonce), intToBuf(gasPrice), intToBuf(gasLimit), Buffer.alloc(0), intToBuf(0n), data, intToBuf(BigInt(CHAIN_ID)), Buffer.alloc(0), Buffer.alloc(0)];
  const sighash = keccak256(encode(fields));
  const sig = secp256k1.sign(sighash, priv);
  const v = BigInt(CHAIN_ID) * 2n + 35n + BigInt(sig.recovery);
  const sigRS = (x) => Buffer.from(x.toString(16).padStart(64, '0'), 'hex');
  const signed = encode([intToBuf(nonce), intToBuf(gasPrice), intToBuf(gasLimit), Buffer.alloc(0), intToBuf(0n), data, intToBuf(v), sigRS(sig.r), sigRS(sig.s)]);
  const raw = '0x' + Buffer.from(signed).toString('hex');
  const txHash = await rpc('eth_sendRawTransaction', [raw]);
  console.log('txHash', txHash);
  fs.writeFileSync(path.join(__dirname, '..', 'artifacts', 'deployment.json'), JSON.stringify({ txHash, from, nonce: nonce.toString(), gasPrice: gasPrice.toString(), gasLimit: gasLimit.toString(), sentAt: new Date().toISOString() }, null, 2));

  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const rcpt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (rcpt) {
      console.log('status', rcpt.status, 'contractAddress', rcpt.contractAddress, 'gasUsed', BigInt(rcpt.gasUsed).toString(), 'block', BigInt(rcpt.blockNumber).toString());
      const dep = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'artifacts', 'deployment.json'), 'utf8'));
      dep.contractAddress = rcpt.contractAddress; dep.status = rcpt.status; dep.gasUsed = BigInt(rcpt.gasUsed).toString(); dep.blockNumber = BigInt(rcpt.blockNumber).toString();
      fs.writeFileSync(path.join(__dirname, '..', 'artifacts', 'deployment.json'), JSON.stringify(dep, null, 2));
      process.exit(rcpt.status === '0x1' ? 0 : 2);
    }
  }
  console.error('receipt timeout');
  process.exit(3);
})().catch(e => { console.error('DEPLOY ERROR', e.message || e); process.exit(1); });
