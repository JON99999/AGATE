import fs from 'fs';
import path from 'path';

function findFunctions(content) {
  const lines = content.split('\n');
  const funcs = [];
  for (const line of lines) {
    // Look for const xxx = ... => or function xxx(
    const match = line.match(/(?:const|let)\s+([a-zA-Z0-9_\$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/);
    if (match) {
      funcs.push(match[1]);
    } else {
      const match2 = line.match(/async\s+function\s+([a-zA-Z0-9_\$]+)/) || line.match(/function\s+([a-zA-Z0-9_\$]+)/);
      if (match2) funcs.push(match2[1]);
    }
  }
  return [...new Set(funcs)];
}

function compareFiles(localName, remoteName, label) {
  const localContent = fs.readFileSync(localName, 'utf8');
  const remoteContent = fs.readFileSync(remoteName, 'utf8');
  
  const localFuncs = findFunctions(localContent);
  const remoteFuncs = findFunctions(remoteContent);
  
  const onlyLocalFuncs = localFuncs.filter(f => !remoteFuncs.includes(f));
  const onlyRemoteFuncs = remoteFuncs.filter(f => !localFuncs.includes(f));
  
  console.log(`=== ${label} FUNCTIONS ===`);
  if (onlyLocalFuncs.length > 0) console.log(`  - Local-only functions: ${onlyLocalFuncs.join(', ')}`);
  if (onlyRemoteFuncs.length > 0) console.log(`  - Remote-only functions: ${onlyRemoteFuncs.join(', ')}`);
  console.log('');
  
  // Look for text patterns, headers, cards, buttons or dialog mentions in both files
  // Let's print out remote lines that mention dialogs, modals, tabs or specific UI titles
  // We can also extract custom comments which often document new features
}

compareFiles('src/App.tsx', 'remote_App.tsx', 'App.tsx');
compareFiles('src/components/PlayerTab.tsx', 'remote_PlayerTab.tsx', 'PlayerTab.tsx');
compareFiles('src/components/SchedulerTab.tsx', 'remote_SchedulerTab.tsx', 'SchedulerTab.tsx');
compareFiles('src/components/LogTab.tsx', 'remote_LogTab.tsx', 'LogTab.tsx');
compareFiles('src/components/GoogleAuthSection.tsx', 'remote_GoogleAuthSection.tsx', 'GoogleAuthSection.tsx');

// Let's also search for new API endpoints called in remote files
const remoteFiles = ['remote_App.tsx', 'remote_PlayerTab.tsx', 'remote_SchedulerTab.tsx', 'remote_LogTab.tsx', 'remote_GoogleAuthSection.tsx'];
const endpoints = new Set();
for (const file of remoteFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/\/api\/[a-zA-Z0-9\-_]+/g);
  if (matches) {
    matches.forEach(m => endpoints.add(m));
  }
}
const localFiles = ['src/App.tsx', 'src/components/PlayerTab.tsx', 'src/components/SchedulerTab.tsx', 'src/components/LogTab.tsx', 'src/components/GoogleAuthSection.tsx'];
const localEndpoints = new Set();
for (const file of localFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const matches = content.match(/\/api\/[a-zA-Z0-9\-_]+/g);
  if (matches) {
    matches.forEach(m => localEndpoints.add(m));
  }
}
console.log('=== API ENDPOINTS ===');
console.log('Local endpoints used:', Array.from(localEndpoints));
console.log('Remote endpoints used:', Array.from(endpoints));
const onlyRemoteEndpoints = Array.from(endpoints).filter(e => !localEndpoints.has(e));
if (onlyRemoteEndpoints.length > 0) {
  console.log('Only in remote:', onlyRemoteEndpoints);
}
console.log('');
