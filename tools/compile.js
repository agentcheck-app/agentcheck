// Compile AgentCheck.sol + MockRegistry.sol with solc-js and write artifacts.
// Run from ~/workspace/agentid-hackathon/tools:  node compile.js
const fs = require('fs');
const path = require('path');
const solc = require('solc');

const root = path.join(__dirname, '..');
const sources = {};
for (const f of ['AgentCheck.sol', 'MockRegistry.sol']) {
  sources[f] = { content: fs.readFileSync(path.join(root, 'contracts', f), 'utf8') };
}

const input = {
  language: 'Solidity',
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
let failed = false;
for (const e of output.errors || []) {
  console.log(`[${e.severity}] ${e.formattedMessage.trim()}`);
  if (e.severity === 'error') failed = true;
}
if (failed) { console.error('COMPILATION FAILED'); process.exit(1); }

const artifactsDir = path.join(root, 'artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

for (const name of ['AgentCheck', 'MockRegistry']) {
  const c = output.contracts[`${name}.sol`][name];
  fs.writeFileSync(path.join(artifactsDir, `${name}.abi.json`), JSON.stringify(c.abi, null, 2));
  fs.writeFileSync(path.join(artifactsDir, `${name}.bytecode.txt`), '0x' + c.evm.bytecode.object);
  const bytes = c.evm.bytecode.object.length / 2;
  const deployedBytes = c.evm.deployedBytecode.object.length / 2;
  // Rough size-based deployment gas estimate: 21000 (tx) + 32000 (create)
  // + 4/16 per calldata byte (zero/non-zero, averaged ~12) + 200 per deployed byte (code deposit).
  const est = 21000 + 32000 + bytes * 12 + deployedBytes * 200;
  console.log(`${name}: creation bytecode ${bytes} bytes, deployed ${deployedBytes} bytes, size-based deployment gas estimate ~${est}`);
  if (name === 'AgentCheck') {
    fs.writeFileSync(path.join(artifactsDir, 'AgentCheck.deploy-estimate.json'), JSON.stringify({
      creationBytecodeBytes: bytes,
      deployedBytecodeBytes: deployedBytes,
      estimatedDeploymentGas_sizeBased: est,
      method: 'size-based formula: 21000 + 32000 + 12/byte creation code + 200/byte deployed code. A measured local-EVM estimate from the test run is recorded separately in test results (test-output.txt) and supersedes this rough figure.',
      compiledWith: 'solc ' + solc.version(),
      optimizer: { enabled: true, runs: 200 },
    }, null, 2));
  }
}
console.log('Artifacts written to', artifactsDir);
