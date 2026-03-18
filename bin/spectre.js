#!/usr/bin/env node
import { main } from '../src/main.js';

main(process.argv.slice(2)).catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
