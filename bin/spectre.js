#!/usr/bin/env node
import { main } from '../src/main.js';

main(process.argv.slice(2)).catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes('--json') && error?.code) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      code: error.code,
      message
    })}\n`);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exit(1);
});
