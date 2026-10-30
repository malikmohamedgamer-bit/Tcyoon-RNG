// Draws the social-preview image (assets/og.png, 1200x630) from code with the browser already used for the tests.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const html = `<body style="margin:0;width:1200px;height:630px;background:linear-gradient(135deg,#14171b 0%,#23282e 60%,#14171b 100%);font-family:'Arial Narrow',Arial,sans-serif;color:#eef1f4;position:relative;overflow:hidden">
<div style="position:absolute;inset:0;background:repeating-linear-gradient(-45deg,rgba(255,138,31,.10) 0 24px,transparent 24px 48px)"></div>
<div style="position:absolute;left:80px;top:90px;width:300px;height:300px;border-radius:44px;background:#ff8a1f;box-shadow:0 20px 60px #0008"></div>
<div style="position:absolute;left:116px;top:126px;width:228px;height:228px;border-radius:24px;background:#14171b"></div>
${[[170,180],[290,180],[230,240],[170,300],[290,300]].map(([x, y]) => `<div style="position:absolute;left:${x}px;top:${y}px;width:36px;height:36px;border-radius:50%;background:#ff8a1f"></div>`).join('')}
<div style="position:absolute;left:440px;top:120px;font-size:120px;font-weight:800;letter-spacing:4px;text-transform:uppercase">Tcyoon RNG</div>
<div style="position:absolute;left:444px;top:270px;font-size:44px;color:#ffb877;line-height:1.25;width:680px">Roll. Build. Defend. Rebirth.<br>An endless 3D tycoon in your browser.</div>
<div style="position:absolute;left:444px;top:470px;font-size:34px;color:#a9b3bf">Free - no install - five themes - never ends</div></body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
mkdirSync('assets', { recursive: true });
writeFileSync('assets/og.png', await p.screenshot({ type: 'png' }));
await b.close();
console.log('wrote assets/og.png');
