// Minimal Keccak-256 implementation (Keccak-f[1600], rate 136 bytes,
// capacity 512, original Keccak padding suffix 0x01 — NOT SHA3-256).
// Pure JS with BigInt lanes, no dependencies. Exposes:
//   keccak256Hex(utf8String) -> "0x..." 64-hex-char digest
// Verified against the standard test vectors:
//   keccak256("")    = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
//   keccak256("abc") = 4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45
(function () {
  const MASK = (1n << 64n) - 1n;
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
  ];
  // Rotation offsets r[x][y]
  const RHO = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14],
  ];
  const rotl = (v, n) => (n === 0 ? v : (((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK));

  function keccakF(state) {
    // state: array of 25 BigInt lanes, lane index = x + 5*y
    for (let round = 0; round < 24; round++) {
      // Theta
      const C = [], D = [];
      for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
      for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] ^= D[x];
      // Rho + Pi
      const B = new Array(25).fill(0n);
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], RHO[x][y]);
        }
      }
      // Chi
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          state[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK) & B[((x + 2) % 5) + 5 * y]);
        }
      }
      // Iota
      state[0] ^= RC[round];
    }
  }

  function keccak256(bytes) {
    const RATE = 136;
    const state = new Array(25).fill(0n);
    // Padding: pad10*1 with Keccak suffix 0x01
    const padded = Array.from(bytes);
    padded.push(0x01);
    while (padded.length % RATE !== 0) padded.push(0x00);
    padded[padded.length - 1] |= 0x80;
    // Absorb
    for (let block = 0; block < padded.length; block += RATE) {
      for (let i = 0; i < RATE; i++) {
        const lane = Math.floor(i / 8);
        state[lane] ^= BigInt(padded[block + i]) << BigInt(8 * (i % 8));
      }
      keccakF(state);
    }
    // Squeeze 32 bytes
    const out = [];
    for (let i = 0; i < 32; i++) {
      const lane = Math.floor(i / 8);
      out.push(Number((state[lane] >> BigInt(8 * (i % 8))) & 0xffn));
    }
    return out;
  }

  function keccak256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    return '0x' + keccak256(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  window.keccak256Hex = keccak256Hex;
})();
