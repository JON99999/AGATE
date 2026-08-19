import fs from 'fs';

async function download(filePath) {
  const url = `https://raw.githubusercontent.com/JON99999/RemixedInterstitial-er/main/${filePath}`;
  const res = await fetch(url);
  if (res.ok) {
    const text = await res.text();
    fs.writeFileSync(`remote_${pathName(filePath)}`, text);
    console.log(`Successfully downloaded ${filePath} as remote_${pathName(filePath)}`);
  } else {
    console.log(`Failed to download ${filePath}: ${res.status}`);
  }
}

function pathName(filePath) {
  return filePath.replace(/\//g, '_');
}

async function run() {
  await download('src/components/LocalHelpModal.tsx');
  await download('server.ts');
}

run();
