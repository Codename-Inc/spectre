// Minimum useful prose verified by the real-host boundary protocol.
const PROSE_CORE_CHARS = 6_000;
// Minimum useful code verified separately because punctuation raises token density.
const CODE_CORE_CHARS = 4_000;
// Dense 9,000-character fixtures must be rejected rather than use host fallback.
const PUNCTUATION_UNSAFE_CHARS = 9_000;
// Non-ASCII byte density makes this 9,000-character fixture intentionally unsafe.
const UNICODE_UNSAFE_CHARS = 9_000;
// Prompt framing always reserves the complete secondary-match allowance.
const SECONDARY_METADATA_RESERVE_CHARS = 750;
// Claude's documented 10,000-character cap retains a 1,000-character safety reserve.
const CLAUDE_SAFE_OUTPUT_CHARS = 9_000;
const CLAUDE_RESERVE_CHARS = 1_000;
// Codex documents roughly 2,500 tokens; retain 250 estimated tokens for host variance.
const CODEX_ESTIMATED_TOKEN_LIMIT = 2_250;
const CODEX_TOKEN_RESERVE = 250;

export const PAYLOAD_BOUNDARIES = Object.freeze({
  proseCoreChars: PROSE_CORE_CHARS,
  codeCoreChars: CODE_CORE_CHARS,
  punctuationUnsafeChars: PUNCTUATION_UNSAFE_CHARS,
  unicodeUnsafeChars: UNICODE_UNSAFE_CHARS,
  secondaryMetadataReserveChars: SECONDARY_METADATA_RESERVE_CHARS,
  claudeSafeOutputChars: CLAUDE_SAFE_OUTPUT_CHARS,
  claudeReserveChars: CLAUDE_RESERVE_CHARS,
  codexEstimatedTokenLimit: CODEX_ESTIMATED_TOKEN_LIMIT,
  codexTokenReserve: CODEX_TOKEN_RESERVE,
});

function estimateCodexTokens(content) {
  let punctuation = 0;
  let nonAscii = 0;
  for (const character of content) {
    const codePoint = character.codePointAt(0);
    if (codePoint > 0x7f) nonAscii += 1;
    else if (!/[A-Za-z0-9\s]/.test(character)) punctuation += 1;
  }

  const byteBaseline = Buffer.byteLength(content, 'utf8') / 4;
  return Math.ceil(byteBaseline + punctuation * 0.22 + nonAscii * 0.35);
}

export function measurePayload(host, framedContent) {
  if (typeof framedContent !== 'string') {
    throw new TypeError('framedContent must be a string');
  }
  if (host === 'claude') {
    return {
      ok: framedContent.length <= CLAUDE_SAFE_OUTPUT_CHARS,
      measured: framedContent.length,
      limit: CLAUDE_SAFE_OUTPUT_CHARS,
      reserve: CLAUDE_RESERVE_CHARS,
    };
  }
  if (host === 'codex') {
    const measured = estimateCodexTokens(framedContent);
    return {
      ok: measured <= CODEX_ESTIMATED_TOKEN_LIMIT,
      measured,
      limit: CODEX_ESTIMATED_TOKEN_LIMIT,
      reserve: CODEX_TOKEN_RESERVE,
    };
  }
  throw new RangeError(`Unsupported payload host: ${host}`);
}
