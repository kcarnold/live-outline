#!/usr/bin/env node

/**
 * Script to run end-to-end tests for translation
 */
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

try {
  console.log('Running end-to-end translation tests...');
  execSync('node --loader=ts-node/esm --test ./tests/e2e-test.ts', {
    stdio: 'inherit',
    cwd: rootDir
  });
  console.log('Tests completed successfully!');
} catch (error) {
  console.error('Tests failed:', error.message);
  process.exit(1);
}