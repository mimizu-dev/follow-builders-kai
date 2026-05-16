import assert from 'assert';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// These exports don't exist yet — import will fail until Task 3 Step 3 is done.
import { readMailingList, resolveRecipients, updateLastDelivered } from './deliver.js';

const TMP = join(tmpdir(), 'fb-test-' + Date.now());
await mkdir(TMP, { recursive: true });

// Test 1: readMailingList reads addresses, ignores comments and blank lines
{
  const file = join(TMP, 'list1.txt');
  await writeFile(file, 'alice@example.com\n# comment\nbob@example.com\n\n  \n');
  const result = await readMailingList(file);
  assert.deepStrictEqual(result, ['alice@example.com', 'bob@example.com']);
  console.log('✓ readMailingList: reads addresses, ignores comments and blanks');
}

// Test 2: readMailingList returns [] for missing file
{
  const result = await readMailingList(join(TMP, 'nonexistent.txt'));
  assert.deepStrictEqual(result, []);
  console.log('✓ readMailingList: returns [] for missing file');
}

// Test 3: resolveRecipients uses mailing list when it has entries
{
  const file = join(TMP, 'list2.txt');
  await writeFile(file, 'alice@example.com\nbob@example.com\n');
  const result = await resolveRecipients(file, 'fallback@example.com');
  assert.deepStrictEqual(result, ['alice@example.com', 'bob@example.com']);
  console.log('✓ resolveRecipients: uses mailing list when populated');
}

// Test 4: resolveRecipients falls back to configEmail when list is empty
{
  const file = join(TMP, 'list3.txt');
  await writeFile(file, '# only comments\n\n');
  const result = await resolveRecipients(file, 'fallback@example.com');
  assert.deepStrictEqual(result, ['fallback@example.com']);
  console.log('✓ resolveRecipients: falls back to configEmail when list is empty');
}

// Test 5: resolveRecipients returns [] when both sources are empty
{
  const result = await resolveRecipients(join(TMP, 'nonexistent.txt'), null);
  assert.deepStrictEqual(result, []);
  console.log('✓ resolveRecipients: returns [] when both empty');
}

// Test 6: updateLastDelivered writes lastDeliveredAt to config
{
  const configFile = join(TMP, 'config.json');
  await writeFile(configFile, JSON.stringify({ language: 'en', delivery: { method: 'email' } }));
  await updateLastDelivered(configFile);
  const updated = JSON.parse(await (await import('fs/promises')).readFile(configFile, 'utf-8'));
  assert.ok(updated.lastDeliveredAt, 'lastDeliveredAt should be set');
  assert.ok(!isNaN(new Date(updated.lastDeliveredAt).getTime()), 'lastDeliveredAt should be a valid ISO date');
  assert.strictEqual(updated.language, 'en', 'existing fields should be preserved');
  console.log('✓ updateLastDelivered: writes timestamp, preserves existing fields');
}

// Test 7: updateLastDelivered is non-fatal on bad config path
{
  await updateLastDelivered(join(TMP, 'no-such-dir', 'config.json'));
  console.log('✓ updateLastDelivered: non-fatal on write failure');
}

// Cleanup
await rm(TMP, { recursive: true });

console.log('\nAll deliver-helpers tests passed!');
