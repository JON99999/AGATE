import fs from 'fs';

const schedulerText = fs.readFileSync('remote_SchedulerTab.tsx', 'utf8');

// Find occurrences of viewMode and read surrounding blocks
const lines = schedulerText.split('\n');

console.log('=== Calendar Integration Elements ===');
const calendarLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.toUpperCase().includes('CALENDAR') && (l.includes('{') || l.includes('button') || l.includes('div') || l.includes('span')));
console.log(`Total lines mentioning calendar: ${calendarLines.length}`);
console.log('Sample blocks with Calendar keywords:');
calendarLines.slice(0, 30).forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));

console.log('\n=== viewMode toggling markup ===');
const viewModeMarkup = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('setViewMode') || l.includes('viewMode ==='));
viewModeMarkup.forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));

console.log('\n=== calendarLayoutMode toggled markup ===');
const calLayoutLines = lines.map((l, idx) => ({l, idx})).filter(({l}) => l.includes('calendarLayoutMode'));
calLayoutLines.forEach(({l, idx}) => console.log(`${idx + 1}: ${l.trim()}`));
