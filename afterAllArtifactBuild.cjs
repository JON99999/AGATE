const fs = require('fs');
const path = require('path');

module.exports = async function (context) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const version = pkg.version;
  const productName = pkg.productName;
  
  console.log(`[afterAllArtifactBuild] Starting rename hook for ${productName} v${version}`);

  const renameMap = new Map();
  const finalPaths = [];

  // Phase 1: Identify and physically rename DMG files, staging their mapping
  for (const artifactPath of context.artifactPaths) {
    const ext = path.extname(artifactPath);
    const basename = path.basename(artifactPath);

    if (ext === '.dmg') {
      let suffix = '';
      if (basename.includes('arm64')) {
        suffix = 'Mac-Silicon-new';
      } else {
        suffix = 'Mac-Intel-legacy';
      }

      const newBasename = `${productName}-${version}-${suffix}.dmg`;
      const parentDir = path.dirname(artifactPath);
      const newPath = path.join(parentDir, newBasename);

      if (fs.existsSync(artifactPath)) {
        console.log(`[afterAllArtifactBuild] Renaming DMG: ${basename} -> ${newBasename}`);
        fs.renameSync(artifactPath, newPath);
        renameMap.set(basename, newBasename);
        finalPaths.push(newPath);

        // If blockmap exists in the same folder, rename it as well
        const blockmapPath = artifactPath + '.blockmap';
        const newBlockmapPath = newPath + '.blockmap';
        if (fs.existsSync(blockmapPath)) {
          console.log(`[afterAllArtifactBuild] Renaming companion blockmap: ${path.basename(blockmapPath)} -> ${path.basename(newBlockmapPath)}`);
          fs.renameSync(blockmapPath, newBlockmapPath);
          renameMap.set(path.basename(blockmapPath), path.basename(newBlockmapPath));
        }
      } else {
        finalPaths.push(artifactPath);
      }
    } else {
      finalPaths.push(artifactPath);
    }
  }

  // Phase 2: Update outstanding blockmap paths and handle outstanding files
  const updatedPaths = [];
  for (const p of finalPaths) {
    const basename = path.basename(p);
    const ext = path.extname(p);

    if (basename.endsWith('.dmg.blockmap')) {
      let mappedName = renameMap.get(basename);
      if (!mappedName) {
        let suffix = '';
        if (basename.includes('arm64')) {
          suffix = 'Mac-Silicon-new';
        } else {
          suffix = 'Mac-Intel-legacy';
        }

        mappedName = `${productName}-${version}-${suffix}.dmg.blockmap`;
      }

      if (mappedName) {
        const parentDir = path.dirname(p);
        const newPath = path.join(parentDir, mappedName);
        updatedPaths.push(newPath);
      } else {
        updatedPaths.push(p);
      }
    } else if (ext === '.yml' || ext === '.yaml') {
      if (fs.existsSync(p)) {
        let content = fs.readFileSync(p, 'utf8');
        let modified = false;

        // Replace all occurrences of old names with new names
        for (const [oldName, newName] of renameMap.entries()) {
          if (content.includes(oldName)) {
            console.log(`[afterAllArtifactBuild] Updating metadata ref inside ${basename}: ${oldName} -> ${newName}`);
            content = content.split(oldName).join(newName);
            modified = true;
          }
        }

        if (modified) {
          fs.writeFileSync(p, content, 'utf8');
        }
      }
      updatedPaths.push(p);
    } else {
      updatedPaths.push(p);
    }
  }

  // Mutate context.artifactPaths in-place to ensure downstream systems see the changes
  if (context.artifactPaths) {
    context.artifactPaths.splice(0, context.artifactPaths.length, ...updatedPaths);
  }

  console.log(`[afterAllArtifactBuild] Completed. Final published artifact paths:`, context.artifactPaths);
  return context.artifactPaths;
};
