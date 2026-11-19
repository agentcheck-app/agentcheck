// Local in-memory EVM test for AgentCheck using @ethereumjs/vm.
// Deploys MockRegistry + AgentCheck, then exercises the check-in flow.
// Run from ~/workspace/agentid-hackathon/tools:  node ../test/test.js
const fs = require('fs');
const path = require('path');
const { VM } = require('@ethereumjs/vm');
const { Common, Chain, Hardfork } = require('@ethereumjs/common');
const { Block } = require('@ethereumjs/block');
const {
  Account, Address, bytesToHex, hexToBytes, utf8ToBytes, setLengthLeft,
} = require('@ethereumjs/util');
const { keccak256 } = require('ethereum-cryptography/keccak');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const agentCheckBytecode = read('artifacts/AgentCheck.bytecode.txt').trim();
const mockBytecode = read('artifacts/MockRegistry.bytecode.txt').trim();

const selector = (sig) => bytesToHex(keccak256(utf8ToBytes(sig)).slice(0, 4));
const eventTopic = (sig) => bytesToHex(keccak256(utf8ToBytes(sig))); // full 32-byte topic0
const encAddr = (addrHex) => bytesToHex(setLengthLeft(hexToBytes(addrHex), 32)).slice(2);
const encUint = (n) => BigInt(n).toString(16).padStart(64, '0');
const callData = (sig, ...argsHex) => selector(sig) + argsHex.join('');

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
}

async function main() {
  const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Cancun });
  const vm = await VM.create({ common });

  const deployer = Address.fromString('0x1000000000000000000000000000000000000001');
  const holder = Address.fromString('0x2000000000000000000000000000000000000002');
  const stranger = Address.fromString('0x3000000000000000000000000000000000000003');
  for (const a of [deployer, holder, stranger]) {
    await vm.stateManager.putAccount(a, new Account(0n, 10n ** 20n));
  }

  const DAY = 86400n;
  const D = 20000n; // arbitrary UTC day number used as "today" in the test
  const blockAt = (ts) => Block.fromBlockData(
    { header: { number: 1n, timestamp: ts, gasLimit: 30000000n, baseFeePerGas: 7n } },
    { common },
  );

  async function run({ from, to, data, ts }) {
    return vm.evm.runCall({
      caller: from, to, data: hexToBytes(data), value: 0n,
      gasLimit: 5000000n, block: blockAt(ts),
    });
  }
  const reverted = (res) => !!res.execResult.exceptionError;
  const revertSelector = (res) => bytesToHex(res.execResult.returnValue.slice(0, 4));
  const word = (res, i) => BigInt('0x' + bytesToHex(res.execResult.returnValue.slice(i * 32, i * 32 + 32)).slice(2) || '0');

  const now = D * DAY + 3600n;

  // ---- Deploy MockRegistry ----
  let res = await vm.evm.runCall({
    caller: deployer, data: hexToBytes(mockBytecode), value: 0n, gasLimit: 5000000n, block: blockAt(now),
  });
  if (reverted(res)) throw new Error('MockRegistry deploy failed: ' + res.execResult.exceptionError?.error);
  const registry = res.createdAddress;
  console.log('MockRegistry deployed at', registry.toString());

  // ---- Deploy AgentCheck(registry) ----
  const ctorArgs = encAddr(registry.toString());
  res = await vm.evm.runCall({
    caller: deployer, data: hexToBytes(agentCheckBytecode + ctorArgs), value: 0n, gasLimit: 10000000n, block: blockAt(now),
  });
  if (reverted(res)) throw new Error('AgentCheck deploy failed: ' + res.execResult.exceptionError?.error);
  const agentCheck = res.createdAddress;
  const deployGas = res.gasUsed ?? res.execResult.executionGasUsed;
  console.log('AgentCheck deployed at', agentCheck.toString());
  console.log(`AgentCheck measured deployment gas (local @ethereumjs/vm, Cancun): ${deployGas}`);
  fs.writeFileSync(path.join(root, 'artifacts', 'AgentCheck.measured-gas.json'), JSON.stringify({
    measuredDeploymentGas_localEVM: deployGas.toString(),
    method: 'Measured by actually executing the CREATE (constructor + code deposit) on a local in-memory @ethereumjs/vm (Cancun hardfork). This is a local measurement, not a BSC mainnet quote; real deployment gas will be close but can differ slightly with network conditions.',
  }, null, 2));

  // ---- Seed the mock registry: holder holds an Agent ID, stranger does not ----
  res = await run({ from: deployer, to: registry, data: callData('setBalance(address,uint256)', encAddr(holder.toString()), encUint(1)), ts: now });
  if (reverted(res)) throw new Error('setBalance failed');

  // ---- isAgentIdHolder ----
  res = await run({ from: deployer, to: agentCheck, data: callData('isAgentIdHolder(address)', encAddr(holder.toString())), ts: now });
  check('isAgentIdHolder(holder) == true', word(res, 0) === 1n);
  res = await run({ from: deployer, to: agentCheck, data: callData('isAgentIdHolder(address)', encAddr(stranger.toString())), ts: now });
  check('isAgentIdHolder(stranger) == false', word(res, 0) === 0n);

  // ---- 1. Non-holder checkIn reverts ----
  res = await run({ from: stranger, to: agentCheck, data: selector('checkIn()'), ts: now });
  check('non-holder checkIn() reverts', reverted(res));
  check('  revert is NotAgentIdHolder', reverted(res) && revertSelector(res) === selector('NotAgentIdHolder(address)'),
    reverted(res) ? revertSelector(res) : 'no revert');

  // ---- 2. Holder checkIn succeeds; badge minted; points = 10 + streak(1) = 11 ----
  res = await run({ from: holder, to: agentCheck, data: selector('checkIn()'), ts: now });
  check('holder checkIn() succeeds (day D)', !reverted(res), reverted(res) ? res.execResult.exceptionError.error : '');
  const topics = (res.execResult.logs || []).map((l) => bytesToHex(l[1][0]));
  check('  CheckedIn event emitted', topics.includes(eventTopic('CheckedIn(address,uint256,uint256,uint256,uint256)')));
  check('  BadgeMinted event emitted', topics.includes(eventTopic('BadgeMinted(address,uint256)')));

  async function stats(who, ts) {
    const r = await run({ from: deployer, to: agentCheck, data: callData('statsOf(address)', encAddr(who.toString())), ts });
    return { total: word(r, 0), streak: word(r, 1), points: word(r, 2), lastDay: word(r, 3), hasBadge: word(r, 4) === 1n, badgeId: word(r, 5) };
  }
  let s = await stats(holder, now);
  check('stats after 1st check-in: total=1, streak=1, points=11, lastDay=D, badge #1',
    s.total === 1n && s.streak === 1n && s.points === 11n && s.lastDay === D && s.hasBadge && s.badgeId === 1n,
    JSON.stringify(s, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  res = await run({ from: deployer, to: agentCheck, data: callData('ownerOf(uint256)', encUint(1)), ts: now });
  check('badge ownerOf(1) == holder',
    !reverted(res) && bytesToHex(res.execResult.returnValue.slice(12)) === bytesToHex(holder.bytes));
  res = await run({ from: deployer, to: agentCheck, data: selector('totalAgents()'), ts: now });
  check('totalAgents() == 1', word(res, 0) === 1n);
  res = await run({ from: deployer, to: agentCheck, data: selector('totalCheckIns()'), ts: now });
  check('totalCheckIns() == 1', word(res, 0) === 1n);

  // ---- tokenURI is a valid base64 JSON data URI ----
  res = await run({ from: deployer, to: agentCheck, data: callData('tokenURI(uint256)', encUint(1)), ts: now });
  let uriOk = false, uriInfo = '';
  if (!reverted(res)) {
    const rv = res.execResult.returnValue;
    const len = Number(BigInt(bytesToHex(rv.slice(32, 64))));
    const uri = Buffer.from(rv.slice(64, 64 + len)).toString('utf8');
    uriInfo = uri.slice(0, 60) + '...';
    if (uri.startsWith('data:application/json;base64,')) {
      try {
        const meta = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
        uriOk = meta.name === 'AgentCheck Badge #1' && Array.isArray(meta.attributes);
      } catch { uriOk = false; }
    }
  }
  check('tokenURI(1) decodes to valid JSON metadata', uriOk, uriInfo);

  // ---- 3. Second checkIn same day reverts ----
  res = await run({ from: holder, to: agentCheck, data: selector('checkIn()'), ts: now + 60n });
  check('second checkIn same day reverts', reverted(res));
  check('  revert is AlreadyCheckedInToday', reverted(res) && revertSelector(res) === selector('AlreadyCheckedInToday(address,uint256)'),
    reverted(res) ? revertSelector(res) : 'no revert');

  // ---- 4. Next-day checkIn increments streak; points 11 + 12 = 23 ----
  const nextDay = (D + 1n) * DAY + 3600n;
  res = await run({ from: holder, to: agentCheck, data: selector('checkIn()'), ts: nextDay });
  check('next-day checkIn() succeeds', !reverted(res));
  s = await stats(holder, nextDay);
  check('stats after day D+1: total=2, streak=2, points=23',
    s.total === 2n && s.streak === 2n && s.points === 23n,
    `total=${s.total} streak=${s.streak} points=${s.points}`);

  // ---- 5. Skipping a day resets the streak; points 23 + 11 = 34 ----
  const dayPlus3 = (D + 3n) * DAY + 3600n;
  res = await run({ from: holder, to: agentCheck, data: selector('checkIn()'), ts: dayPlus3 });
  check('checkIn after skipping a day succeeds', !reverted(res));
  s = await stats(holder, dayPlus3);
  check('stats after skip: total=3, streak reset to 1, points=34',
    s.total === 3n && s.streak === 1n && s.points === 34n,
    `total=${s.total} streak=${s.streak} points=${s.points}`);

  // ---- 6. Badge is soulbound: transfer and approve revert ----
  res = await run({
    from: holder, to: agentCheck,
    data: callData('transferFrom(address,address,uint256)', encAddr(holder.toString()), encAddr(stranger.toString()), encUint(1)),
    ts: dayPlus3,
  });
  check('badge transferFrom reverts', reverted(res));
  check('  revert is Soulbound', reverted(res) && revertSelector(res) === selector('Soulbound()'),
    reverted(res) ? revertSelector(res) : 'no revert');
  res = await run({
    from: holder, to: agentCheck,
    data: callData('approve(address,uint256)', encAddr(stranger.toString()), encUint(1)),
    ts: dayPlus3,
  });
  check('badge approve reverts with Soulbound', reverted(res) && revertSelector(res) === selector('Soulbound()'));

  res = await run({ from: deployer, to: agentCheck, data: callData('balanceOf(address)', encAddr(holder.toString())), ts: dayPlus3 });
  check('badge balanceOf(holder) == 1', word(res, 0) === 1n);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error('TEST HARNESS ERROR:', e); process.exit(2); });
