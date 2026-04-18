#!/usr/bin/env node
/**
 * Post-install script: sets up default config files in ~/.synapse/
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const SYNAPSE_DIR = join(HOME, '.synapse');
const CC_IM_DIR = join(HOME, '.cc-im');

// Determine data directory (prefer existing ~/.cc-im for compatibility)
const DATA_DIR = existsSync(CC_IM_DIR) ? CC_IM_DIR : SYNAPSE_DIR;

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function copyIfNotExists(src, dest) {
  if (!existsSync(dest)) {
    try {
      copyFileSync(src, dest);
      console.log(`Created default config: ${dest}`);
    } catch (err) {
      console.error(`Failed to copy ${src} to ${dest}:`, err.message);
    }
  }
}

async function main() {
  // Ensure data directory exists
  ensureDir(DATA_DIR);

  // Get the package root (where this script is located)
  const pkgRoot = dirname(new URL(import.meta.url).pathname).replace(/\\/g, '/').replace(/\/scripts$/, '');

  // Copy config.example.json to config.json if config doesn't exist
  const configSrc = join(pkgRoot, 'config.example.json');
  const configDest = join(DATA_DIR, 'config.json');
  copyIfNotExists(configSrc, configDest);

  // Copy .mcp.json to .mcp.json if it doesn't exist
  const mcpSrc = join(pkgRoot, '.mcp.json');
  const mcpDest = join(DATA_DIR, '.mcp.json');
  copyIfNotExists(mcpSrc, mcpDest);
}

main().catch(console.error);
