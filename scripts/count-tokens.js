#!/usr/bin/env node

import { countTokens } from '@anthropic-ai/tokenizer';
import { readFileSync, statSync } from 'fs';
import { basename } from 'path';

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: npm run tokens <path-to-file.md>');
  console.error('       npm run tokens commands/execute.md');
  process.exit(1);
}

try {
  const stats = statSync(filePath);
  const content = readFileSync(filePath, 'utf-8');
  const tokens = countTokens(content);
  const chars = content.length;
  const lines = content.split('\n').length;

  console.log(`File: ${basename(filePath)}`);
  console.log(`Path: ${filePath}`);
  console.log(`---`);
  console.log(`Tokens: ${tokens.toLocaleString()}`);
  console.log(`Characters: ${chars.toLocaleString()}`);
  console.log(`Lines: ${lines.toLocaleString()}`);
  console.log(`Bytes: ${stats.size.toLocaleString()}`);
  console.log(`Ratio: ${(chars / tokens).toFixed(2)} chars/token`);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`File not found: ${filePath}`);
  } else {
    console.error(`Error: ${err.message}`);
  }
  process.exit(1);
}
