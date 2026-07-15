#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const POLICY_PATH = path.resolve('.license-policy.json');
const NODE_MODULES = path.resolve('node_modules');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLicense(raw) {
  if (!raw) return 'UNKNOWN';
  if (typeof raw === 'string') return raw.trim() || 'UNKNOWN';
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object' && entry.type) return entry.type;
        return JSON.stringify(entry);
      })
      .join(' OR ');
  }
  if (typeof raw === 'object' && raw.type) return raw.type;
  return JSON.stringify(raw);
}

function findLicenseFile(pkgDir) {
  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'COPYING.md'];
  for (const candidate of candidates) {
    const fullPath = path.join(pkgDir, candidate);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      return fullPath;
    }
  }
  return null;
}

function inferFromLicenseText(pkgDir) {
  const licenseFile = findLicenseFile(pkgDir);
  if (!licenseFile) return null;

  const text = fs.readFileSync(licenseFile, 'utf8').slice(0, 10000);
  if (/Business Source License|BUSL-1\.1/i.test(text)) return 'BUSL-1.1';
  if (/This is free and unencumbered software released into the public domain\./i.test(text)) {
    return 'Unlicense';
  }
  if (/solely for Non-Commercial Use|“Non-Commercial Use” means/i.test(text)) {
    return 'NON_COMMERCIAL_CUSTOM';
  }
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(text)) return 'LGPL';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(text)) return 'GPL';
  if (/Affero General Public License|AGPL/i.test(text)) return 'AGPL';
  if (/Apache License/i.test(text)) return 'Apache-2.0';
  if (/MIT License/i.test(text)) return 'MIT';
  if (/BSD/i.test(text)) return 'BSD';
  if (/ISC License/i.test(text)) return 'ISC';
  if (/unlicense/i.test(text)) return 'Unlicense';
  return null;
}

function walkNodeModules(rootDir) {
  const packages = [];
  const seen = new Set();

  function walk(dir) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;
      const entryPath = path.join(dir, entry.name);

      if (entry.name.startsWith('@')) {
        walk(entryPath);
        continue;
      }

      const pkgJsonPath = path.join(entryPath, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = readJson(pkgJsonPath);
          const id = `${pkg.name}@${pkg.version}`;
          if (!seen.has(id)) {
            seen.add(id);
            const licenseField = normalizeLicense(pkg.license || pkg.licenses);
            const inferred = inferFromLicenseText(entryPath);
            packages.push({
              id,
              name: pkg.name || entry.name,
              version: pkg.version || '0.0.0',
              licenseField,
              inferredLicense: inferred,
              effectiveLicense:
                licenseField === 'UNKNOWN' || /SEE LICENSE IN/i.test(licenseField)
                  ? inferred || licenseField
                  : licenseField,
            });
          }
        } catch {
          // Ignore malformed package manifests.
        }
      }

      const nested = path.join(entryPath, 'node_modules');
      if (fs.existsSync(nested)) walk(nested);
    }
  }

  walk(rootDir);
  return packages;
}

function matchesPackage(pattern, packageName) {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return packageName.startsWith(prefix);
  }
  return pattern === packageName;
}

function isException(pkg, policy) {
  return (policy.approvedExceptions || []).some(
    (exception) =>
      matchesPackage(exception.package, pkg.name) &&
      (exception.license === pkg.effectiveLicense || exception.license === '*'),
  );
}

function classify(pkg, policy) {
  const license = pkg.effectiveLicense;
  if (isException(pkg, policy)) return 'exception';
  if ((policy.allowedLicenses || []).includes(license)) return 'allowed';
  if ((policy.reviewLicenses || []).includes(license)) return 'review';

  const denyMatch = (policy.deniedLicensePatterns || []).find((pattern) =>
    new RegExp(pattern, 'i').test(license),
  );
  if (denyMatch) return 'denied';

  return 'review';
}

function main() {
  if (!fs.existsSync(POLICY_PATH)) {
    console.error(`Missing policy file: ${POLICY_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(NODE_MODULES)) {
    console.error('Missing node_modules. Run `yarn install` first.');
    process.exit(1);
  }

  const policy = readJson(POLICY_PATH);
  const packages = walkNodeModules(NODE_MODULES);

  const denied = [];
  const review = [];
  const exceptions = [];
  const counts = new Map();

  for (const pkg of packages) {
    counts.set(pkg.effectiveLicense, (counts.get(pkg.effectiveLicense) || 0) + 1);
    const status = classify(pkg, policy);
    if (status === 'denied') denied.push(pkg);
    if (status === 'review') review.push(pkg);
    if (status === 'exception') exceptions.push(pkg);
  }

  console.log(`Scanned packages: ${packages.length}`);
  console.log('Top licenses:');
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([license, count]) => {
      console.log(`  ${license}: ${count}`);
    });

  if (exceptions.length) {
    console.log('\nApproved exceptions:');
    for (const pkg of exceptions.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${pkg.name}@${pkg.version} -> ${pkg.effectiveLicense}`);
    }
  }

  if (review.length) {
    console.log('\nReview-required packages:');
    for (const pkg of review.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${pkg.name}@${pkg.version} -> ${pkg.effectiveLicense}`);
    }
  }

  if (denied.length) {
    console.log('\nDenied-license packages:');
    for (const pkg of denied.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${pkg.name}@${pkg.version} -> ${pkg.effectiveLicense}`);
    }
  }

  const failOnReview = Boolean(policy.failOnReview);
  if (denied.length || (failOnReview && review.length)) {
    console.error(
      `\nLicense policy check failed: ${review.length} review items, ${denied.length} denied items.`,
    );
    process.exit(1);
  }

  console.log('\nLicense policy check passed.');
}

main();
