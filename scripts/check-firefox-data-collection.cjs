#!/usr/bin/env node
// Phase 1 PRIV-01 assertion: Firefox manifest data_collection_permissions
// declares the correct taxonomy (websiteContent is optional, not required).
const path = require('path');
const manifest = require(path.resolve(__dirname, '..', 'src', 'manifest.firefox.json'));
const d = manifest.browser_specific_settings.gecko.data_collection_permissions;
const failures = [];
if (!d.required.includes('technicalAndInteraction')) failures.push('required missing technicalAndInteraction');
if (!d.required.includes('websiteActivity')) failures.push('required missing websiteActivity');
if (!d.optional.includes('websiteContent')) failures.push('optional missing websiteContent');
if (d.required.includes('none')) failures.push('required still contains "none"');
if (failures.length > 0) {
  console.error('PRIV-01 FAIL:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('PRIV-01 OK: data_collection_permissions taxonomy correct');
