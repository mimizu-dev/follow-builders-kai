import assert from 'assert';

import { buildHtmlEmail } from './email-template.js';

// Test 1: subject extracted from first line
{
  const { subject } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.strictEqual(subject, 'AI Builders Digest — Monday, May 5, 2026', 'subject from first line');
  console.log('✓ subject extracted from first line');
}

// Test 2: all-caps line → <h2>
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nX / TWITTER\n');
  assert.ok(html.includes('<h2'), 'all-caps line should produce h2');
  assert.ok(html.includes('X / TWITTER'), 'section label present in output');
  console.log('✓ all-caps line → h2');
}

// Test 3: URL line → <a> anchor with coral color
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nhttps://x.com/karpathy/status/123\n');
  assert.ok(html.includes('href="https://x.com/karpathy/status/123"'), 'URL becomes anchor href');
  assert.ok(html.includes('#D97757'), 'coral color applied to link');
  console.log('✓ URL line → coral anchor');
}

// Test 4: short non-URL non-caps line → <h3>
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\nAndrej Karpathy\n');
  assert.ok(html.includes('<h3'), 'short line produces h3');
  assert.ok(html.includes('Andrej Karpathy'), 'name present in output');
  console.log('✓ short line → h3');
}

// Test 5: long body text → <p>
{
  const longLine = 'This is a long body text line that well exceeds the eighty character threshold set for name detection in the parser.';
  const { html } = buildHtmlEmail(`AI Builders Digest — Monday, May 5, 2026\n\n${longLine}\n`);
  assert.ok(html.includes(`<p style=`), 'long line produces p');
  assert.ok(html.includes(longLine.replace(/</g, '&lt;').replace(/>/g, '&gt;')), 'body text present');
  console.log('✓ long line → p');
}

// Test 6: HTML entities escaped (XSS prevention)
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n\n<script>alert("xss")</script>\n');
  assert.ok(!html.includes('<script>'), 'raw script tag must not appear');
  assert.ok(html.includes('&lt;script&gt;'), 'angle brackets must be escaped');
  console.log('✓ HTML entities escaped');
}

// Test 7: coral top bar present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#D97757'), 'coral color bar present');
  console.log('✓ coral top bar present');
}

// Test 8: dark header background present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#1A1A1A'), 'dark header color present');
  console.log('✓ dark header present');
}

// Test 9: off-white body background present
{
  const { html } = buildHtmlEmail('AI Builders Digest — Monday, May 5, 2026\n');
  assert.ok(html.includes('#F9F8F6'), 'off-white body background present');
  console.log('✓ off-white body background present');
}

// Test 10: catch-up subject line passes through correctly
{
  const { subject } = buildHtmlEmail('AI Builders Digest — Catch-Up (since May 2, 2026)\n');
  assert.strictEqual(subject, 'AI Builders Digest — Catch-Up (since May 2, 2026)');
  console.log('✓ catch-up subject line handled');
}

console.log('\nAll email-template tests passed!');
