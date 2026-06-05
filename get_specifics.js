import fs from 'fs';

// Let's inspect remote_App.tsx and extract the Export Modal JSX
const appText = fs.readFileSync('remote_App.tsx', 'utf8');

console.log('=== EXPORT MODAL IN remote_App.tsx ===');
const exportModalIndex = appText.indexOf('showExportModal');
if (exportModalIndex !== -1) {
  // Let's print the lines near showExportModal
  const lines = appText.split('\n');
  const matchingLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('showExportModal') || l.includes('exportState') || l.includes('handleExportPrerecord'));
  console.log('Key lines matching Export Modal in App.tsx:');
  matchingLines.slice(0, 15).forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));
}

console.log('\n=== LOCAL HELP IN remote_App.tsx ===');
const localHelpIndex = appText.indexOf('showLocalHelp');
if (localHelpIndex !== -1) {
  const lines = appText.split('\n');
  const matchingLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('showLocalHelp') || l.includes('local-help') || l.includes('LocalHelp'));
  console.log('Key lines matching Local Help in App.tsx:');
  matchingLines.slice(0, 15).forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));
}

// Let's inspect remote_SchedulerTab.tsx and extract the View Mode buttons
const schedulerText = fs.readFileSync('remote_SchedulerTab.tsx', 'utf8');
console.log('\n=== VIEW MODE IN remote_SchedulerTab.tsx ===');
const viewModeIndex = schedulerText.indexOf('viewMode');
if (viewModeIndex !== -1) {
  const lines = schedulerText.split('\n');
  const matchingLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('viewMode') || l.includes('Calendar') || l.includes('calendarLayoutMode'));
  console.log('Key lines matching View Mode in SchedulerTab.tsx:');
  matchingLines.slice(0, 15).forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));
}

console.log('\n=== INACTIVE SHIELD/FILTER IN remote_SchedulerTab.tsx ===');
const showInactiveIndex = schedulerText.indexOf('showInactive');
if (showInactiveIndex !== -1) {
  const lines = schedulerText.split('\n');
  const matchingLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('showInactive') || l.includes('Inactive'));
  console.log('Key lines matching Show Inactive in SchedulerTab.tsx:');
  matchingLines.slice(0, 15).forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));
}

// Let's inspect remote_LogTab.tsx
const logText = fs.readFileSync('remote_LogTab.tsx', 'utf8');
console.log('\n=== LOG TAB CHANGES ===');
// Let's find keywords in remote_LogTab.tsx not in src/components/LogTab.tsx
const localLogText = fs.readFileSync('src/components/LogTab.tsx', 'utf8');
console.log(`Remote Log Tab length: ${logText.length} vs Local: ${localLogText.length}`);
// Let's find any unique buttons/labels in remote LogTab.tsx
const logButtons = [...logText.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
const localLogButtons = [...localLogText.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
const onlyRemoteLogButtons = logButtons.filter(b => !localLogButtons.includes(b) && b.length > 0 && b.length < 50);
console.log('Only remote LogTab buttons/labels:', [...new Set(onlyRemoteLogButtons)]);

// Let's inspect remote_PlayerTab.tsx
const playerText = fs.readFileSync('remote_PlayerTab.tsx', 'utf8');
const localPlayerText = fs.readFileSync('src/components/PlayerTab.tsx', 'utf8');
console.log(`\n=== PLAYER TAB CHANGES ===`);
console.log(`Remote Player Tab length: ${playerText.length} vs Local: ${localPlayerText.length}`);
const playerButtons = [...playerText.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
const localPlayerButtons = [...localPlayerText.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
const onlyRemotePlayerButtons = playerButtons.filter(b => !localPlayerButtons.includes(b) && b.length > 0 && b.length < 50);
console.log('Only remote PlayerTab buttons/labels:', [...new Set(onlyRemotePlayerButtons)]);
