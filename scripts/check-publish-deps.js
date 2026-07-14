#!/usr/bin/env node
/**
 * Pre-publish Dependency Check Script
 *
 * Validates that all @functionFBTC internal dependencies are published
 * to npm before allowing a package to be published.
 *
 * This prevents publishing a package that depends on an unpublished
 * version of another workspace package.
 *
 * Usage: node scripts/check-publish-deps.js <package-name>
 * Example: node scripts/check-publish-deps.js sdk-agent
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const PACKAGE_SCOPE = '@functionFBTC/';

/**
 * Allowed package names (whitelist for security)
 * These must match the options in publish.yml workflow
 */
const ALLOWED_PACKAGES = [
  'sdk-agent',
  'sdk-agentkit',
];

/**
 * Validate package name against whitelist to prevent command injection
 */
function validatePackageName(packageName) {
  if (!packageName || typeof packageName !== 'string') {
    return false;
  }
  return ALLOWED_PACKAGES.includes(packageName);
}

/**
 * Get published versions of a package from npm
 * Uses execFileSync with array arguments to prevent command injection
 */
function getPublishedVersions(packageName) {
  try {
    // Using execFileSync with arguments as array prevents shell injection
    const result = execFileSync(
      'npm',
      ['view', packageName, 'versions', '--json'],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const versions = JSON.parse(result);
    return Array.isArray(versions) ? versions : [versions];
  } catch {
    return [];
  }
}

/**
 * Check if a version satisfies a semver range
 * Simple implementation for common cases
 */
function versionSatisfies(versions, range) {
  // Handle Yarn workspace protocol: workspace:* means "any version"
  if (range.startsWith('workspace:')) {
    const inner = range.slice('workspace:'.length); // e.g. "*", "^1.0.0", "~2.3.0"
    if (inner === '*') {
      // workspace:* — any published version is fine
      return versions.length > 0;
    }
    // workspace:^x.y.z or workspace:~x.y.z — strip prefix and check normally
    return versionSatisfies(versions, inner);
  }

  // Remove ^ or ~ prefix
  const cleanRange = range.replace(/^[\^~]/, '');
  const [major, minor, patch] = cleanRange.split('.').map(Number);

  return versions.some((v) => {
    const [vMajor, vMinor, vPatch] = v.split('.').map(Number);

    if (range.startsWith('^')) {
      // ^x.y.z means >=x.y.z and <(x+1).0.0
      return (
        vMajor === major &&
        (vMinor > minor || (vMinor === minor && vPatch >= patch))
      );
    } else if (range.startsWith('~')) {
      // ~x.y.z means >=x.y.z and <x.(y+1).0
      return vMajor === major && vMinor === minor && vPatch >= patch;
    } else {
      // Exact match
      return v === cleanRange;
    }
  });
}

/**
 * Main function
 */
async function main() {
  const packageName = process.argv[2];

  if (!packageName) {
    console.error(
      '❌ Usage: node scripts/check-publish-deps.js <package-name>',
    );
    console.error('   Example: node scripts/check-publish-deps.js sdk');
    process.exit(1);
  }

  // Validate package name against whitelist to prevent path traversal/injection
  if (!validatePackageName(packageName)) {
    console.error(`❌ Invalid package name: ${packageName}`);
    console.error(`   Allowed packages: ${ALLOWED_PACKAGES.join(', ')}`);
    process.exit(1);
  }

  // Construct and validate path using validated package name
  const packagesDir = resolve(process.cwd(), 'packages');
  const packagePath = resolve(packagesDir, packageName, 'package.json');

  // Defense-in-depth: verify resolved path stays within the packages directory
  if (!packagePath.startsWith(packagesDir + '/')) {
    console.error('❌ Invalid package path: path traversal detected');
    process.exit(1);
  }

  // Verify path exists before reading (path is validated against ALLOWED_PACKAGES whitelist above)
  // nosemgrep: javascript.lang.security.detect-non-literal-fs-filename.detect-non-literal-fs-filename
  if (!existsSync(packagePath)) {
    console.error(`❌ Could not find package.json at ${packagePath}`);
    process.exit(1);
  }

  let packageJson;
  try {
    // nosemgrep: javascript.lang.security.detect-non-literal-fs-filename.detect-non-literal-fs-filename
    const contents = readFileSync(packagePath, 'utf-8');
    packageJson = JSON.parse(contents);
  } catch {
    console.error(`❌ Could not parse package.json at ${packagePath}`);
    process.exit(1);
  }

  console.log(
    `\n📦 Checking publish dependencies for ${packageJson.name}@${packageJson.version}\n`,
  );

  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
  };

  const scopedDeps = Object.entries(dependencies).filter(([name]) =>
    name.startsWith(PACKAGE_SCOPE),
  );

  if (scopedDeps.length === 0) {
    console.log('✅ No internal @functionFBTC dependencies found.\n');
    process.exit(0);
  }

  console.log(`Found ${scopedDeps.length} internal dependencies to check:\n`);

  let hasErrors = false;

  for (const [depName, depRange] of scopedDeps) {
    process.stdout.write(`  Checking ${depName}@${depRange}... `);

    const publishedVersions = getPublishedVersions(depName);

    if (publishedVersions.length === 0) {
      console.log('❌ NOT PUBLISHED');
      hasErrors = true;
      continue;
    }

    const latestVersion = publishedVersions[publishedVersions.length - 1];

    if (versionSatisfies(publishedVersions, depRange)) {
      console.log(`✅ OK (latest: ${latestVersion})`);
    } else {
      console.log(`❌ MISSING VERSION`);
      console.log(`     Required: ${depRange}`);
      console.log(`     Available: ${publishedVersions.join(', ')}`);
      hasErrors = true;
    }
  }

  console.log('');

  if (hasErrors) {
    console.error('❌ Pre-publish check FAILED!');
    console.error('');
    console.error('   Some internal dependencies are not published to npm.');
    console.error('   Please publish them first using the publish workflow:');
    console.error('   .github/workflows/publish.yml');
    console.error('');
    process.exit(1);
  }

  console.log('✅ All internal dependencies are published. Safe to proceed.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
