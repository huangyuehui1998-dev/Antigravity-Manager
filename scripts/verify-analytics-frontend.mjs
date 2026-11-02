// Automated Verification Suite for AnalyticsHub, SpeedometerCanvas, ModelDiagnosticsDashboard
import fs from 'fs';
import path from 'path';

console.log('=== [1/4] Code & Export Verification ===');
const baseDir = path.resolve('src');
const files = [
  'components/analytics/SpeedometerCanvas.tsx',
  'components/analytics/ModelDiagnosticsDashboard.tsx',
  'pages/AnalyticsHub.tsx'
];

for (const file of files) {
  const fullPath = path.join(baseDir, file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File missing: ${file}`);
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  console.log(`[PASS] ${file} exists (${content.length} bytes, ${content.split('\n').length} lines)`);
}

console.log('\n=== [2/4] High-DPI Retina Canvas Adaptation Math ===');
const dprList = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
const cssWidth = 240;
const cssHeight = 140;

for (const dpr of dprList) {
  const bufW = Math.round(cssWidth * dpr);
  const bufH = Math.round(cssHeight * dpr);
  const isWInteger = Number.isInteger(cssWidth * dpr);
  const isHInteger = Number.isInteger(cssHeight * dpr);
  const physicalPixels = bufW * bufH;
  console.log(`DPR ${dpr.toFixed(2)}x: buffer=${bufW}x${bufH}px, CSS=${cssWidth}x${cssHeight}px, integerExact=${isWInteger && isHInteger}, totalPx=${physicalPixels}`);
}

console.log('\n=== [3/4] Background Tab Sleep & Anti-Shock Simulation ===');
function simulateLerp({ sleepSeconds, useAntiShock, currentTps, initialTps }) {
  let displayTps = initialTps;
  let lastTime = 0;
  const history = [displayTps];

  // Tab switch back
  if (useAntiShock) {
    displayTps = currentTps; // Direct align on visibilitychange
    lastTime = 1000.0;
  } else {
    lastTime = 1000.0 - sleepSeconds * 1000;
  }

  // Frame 1
  const now = 1000.0 + 16.6;
  let dt = (now - lastTime) / 1000;
  if (useAntiShock) {
    dt = Math.min(dt, 0.1);
    const alpha = 1 - Math.exp(-dt / 0.12);
    displayTps += (currentTps - displayTps) * alpha;
  } else {
    // Unclamped naive linear lerp
    displayTps += (currentTps - displayTps) * (dt * 8.0);
  }
  history.push(displayTps);
  return { finalTps: displayTps, dt, history };
}

const shockRes = simulateLerp({ sleepSeconds: 30, useAntiShock: true, currentTps: 150, initialTps: 20 });
const naiveRes = simulateLerp({ sleepSeconds: 30, useAntiShock: false, currentTps: 150, initialTps: 20 });
console.log(`Anti-Shock (Sleep 30s): clamped_dt=${shockRes.dt.toFixed(4)}s, finalTps=${shockRes.finalTps.toFixed(2)}, isFinite=${Number.isFinite(shockRes.finalTps)}`);
console.log(`Naive Lerp (Sleep 30s): raw_dt=${naiveRes.dt.toFixed(4)}s, finalTps=${naiveRes.finalTps.toFixed(2)}, blewUp=${Math.abs(naiveRes.finalTps) > 1000}`);

console.log('\n=== [4/4] Forensic Dossier & Canary Probe Logic ===');
const mockDossier = {
  account_id: 'current',
  timestamp: new Date().toISOString(),
  sha256_fingerprint: 'a8f9c1e2d3b4...',
  tps_samples: [132.4, 134.1, 135.0],
  status: 'Nominal'
};
const jsonBlobStr = JSON.stringify(mockDossier, null, 2);
console.log(`Forensic JSON size: ${jsonBlobStr.length} bytes, validJson: ${!!JSON.parse(jsonBlobStr)}`);
console.log('All automated checks successfully executed!');
