const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CANVAS_FILE = 'canvas.json';
const SONG_DIR = 'Song';
const ALBUM_DIR = 'Album';
const MAX_SIZE_MB = 5;

const LEGACY_ALLOWED_FILES = new Set([
  'Song/12palpal.mp4',
  'Song/13-findingher.mp4',
  'Song/14-themachine.mp4'
]);

function getModifiedFiles() {
  if (fs.existsSync('/tmp/changed-files.txt')) {
    try {
      return fs.readFileSync('/tmp/changed-files.txt', 'utf8')
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean);
    } catch (e) {
      console.warn('Warning: Failed to read /tmp/changed-files.txt:', e.message);
    }
  }
  try {
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-only main...HEAD').toString();
    } catch (e) {
      try {
        diffOutput = execSync('git diff --name-only origin/main...HEAD').toString();
      } catch (e2) {
        diffOutput = execSync('git status --porcelain').toString();
        return diffOutput.split('\n')
          .map(line => line.substring(3).trim())
          .filter(Boolean);
      }
    }
    
    try {
      const localDiff = execSync('git diff --name-only').toString();
      const stagedDiff = execSync('git diff --cached --name-only').toString();
      diffOutput += '\n' + localDiff + '\n' + stagedDiff;
    } catch (err) {}
    
    return diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
  } catch (err) {
    console.warn('Warning: Git is not available or main branch not found. Skipping strict sequential checking.');
    return null;
  }
}

function getBaselineCanvas() {
  if (fs.existsSync('/tmp/baseline-canvas.json')) {
    try {
      return JSON.parse(fs.readFileSync('/tmp/baseline-canvas.json', 'utf8'));
    } catch (err) {
      console.warn('Warning: Failed to parse /tmp/baseline-canvas.json:', err.message);
    }
  }
  try {
    let baselineContent = '';
    try {
      baselineContent = execSync('git show main:canvas.json', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      try {
        baselineContent = execSync('git show origin/main:canvas.json', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      } catch (e2) {
        console.warn('Warning: Could not get baseline canvas.json from git.');
        return null;
      }
    }
    return JSON.parse(baselineContent);
  } catch (err) {
    console.warn('Warning: Error parsing baseline canvas.json:', err.message);
    return null;
  }
}

function getItemTypeAndName(item) {
  const songName = (item.song || '').trim().toLowerCase();
  const artistName = (item.artist || '').trim().toLowerCase();
  const url = item.url || '';
  let isSong = false;
  let isAlbum = false;
  
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    if (/\/Song\//i.test(pathname)) isSong = true;
    else if (/\/Album\//i.test(pathname)) isAlbum = true;
  } catch (e) {
    if (/\/Song\//i.test(url)) isSong = true;
    else if (/\/Album\//i.test(url)) isAlbum = true;
  }
  
  return { songName, artistName, isSong, isAlbum, url };
}

function checkFileDeletionsOrModifications() {
  try {
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-status main...HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    } catch (e) {
      try {
        diffOutput = execSync('git diff --name-status origin/main...HEAD', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      } catch (e2) {
        diffOutput = execSync('git status --porcelain', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      }
    }
    
    const lines = diffOutput.split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const status = parts[0];
        const filePath = parts[1].replace(/\\/g, '/');
        
        if (filePath.startsWith('Song/') || filePath.startsWith('Album/')) {
          if (status.includes('D') || status.includes('M') || status.includes('R')) {
            return {
              hasRemoval: true,
              reason: `File '${filePath}' was modified, deleted, or renamed (status: ${status}).`
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Warning: Error checking file deletions/modifications:', err.message);
  }
  return { hasRemoval: false };
}

function verifyFileSignature(localPath, ext) {
  try {
    const stats = fs.statSync(localPath);
    if (stats.size === 0) {
      return 'File is empty (0 bytes).';
    }
    
    if (ext === 'mp4') {
      const buffer = Buffer.alloc(12);
      const fd = fs.openSync(localPath, 'r');
      fs.readSync(fd, buffer, 0, 12, 0);
      fs.closeSync(fd);
      
      const headerStr = buffer.toString('binary');
      if (!headerStr.includes('ftyp')) {
        return 'File does not have a valid MP4 signature (missing ftyp header).';
      }
    } else if (ext === 'm3u8') {
      const buffer = Buffer.alloc(7);
      const fd = fs.openSync(localPath, 'r');
      fs.readSync(fd, buffer, 0, 7, 0);
      fs.closeSync(fd);
      
      const headerStr = buffer.toString('utf8');
      if (headerStr !== '#EXTM3U') {
        return 'File does not have a valid M3U8 signature (must start with #EXTM3U).';
      }
    }
  } catch (err) {
    return `Could not verify file signature: ${err.message}`;
  }
  return null;
}

function validate() {
  console.log('--- Starting canvas.json validation ---');

  if (!fs.existsSync(CANVAS_FILE)) {
    const errorMsg = `Error: ${CANVAS_FILE} not found!`;
    console.error(errorMsg);
    fs.writeFileSync('validation_report.md', `### ❌ Validation Failed\n\n${errorMsg}`);
    process.exit(1);
  }

  let data;
  try {
    const content = fs.readFileSync(CANVAS_FILE, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    const errorMsg = `Error Parsing JSON: ${err.message}`;
    console.error(errorMsg);
    fs.writeFileSync('validation_report.md', `### ❌ Validation Failed\n\n**JSON Parse Error:** ${err.message}`);
    process.exit(1);
  }

  if (!data.items || !Array.isArray(data.items)) {
    const errorMsg = `Error: 'items' array missing or invalid in ${CANVAS_FILE}`;
    console.error(errorMsg);
    fs.writeFileSync('validation_report.md', `### ❌ Validation Failed\n\n${errorMsg}`);
    process.exit(1);
  }

  const items = data.items;
  const errors = [];
  const seen = new Set();
  const modifiedFiles = getModifiedFiles();

  const baselineData = getBaselineCanvas();
  const baselineItems = baselineData && baselineData.items ? baselineData.items : [];
  const baselineItemKeys = new Set(
    baselineItems.map(item => `${item.song || ''}|${item.artist || ''}|${item.url || ''}`)
  );

  items.forEach((item, index) => {
    const { song, artist, url } = item;

    if (!song || !artist || !url) {
      errors.push({ index, song: song || 'N/A', artist: artist || 'N/A', error: 'Missing required fields' });
      return;
    }

    const itemKey = `${song || ''}|${artist || ''}|${url || ''}`;
    const isNewOrModified = !baselineItemKeys.has(itemKey);

    if (isNewOrModified) {
      const cleanSong = song.trim();
      const cleanArtist = artist.trim();
      
      if (!cleanSong || !cleanArtist) {
        errors.push({ index, song, artist, error: 'Song title and artist name cannot be empty or whitespace-only' });
      } else {
        if (cleanSong.length > 100 || cleanArtist.length > 100) {
          errors.push({ index, song, artist, error: 'Song title and artist name must be under 100 characters' });
        }
        if (/<[^>]*>/g.test(cleanSong) || /<[^>]*>/g.test(cleanArtist)) {
          errors.push({ index, song, artist, error: 'HTML/Script tags are prohibited in song title and artist fields' });
        }
        const placeholders = ['test', 'temp', 'placeholder', 'undefined', 'null', 'unknown'];
        if (placeholders.includes(cleanSong.toLowerCase()) || placeholders.includes(cleanArtist.toLowerCase())) {
          errors.push({ index, song, artist, error: 'Generic placeholder text detected in song title or artist' });
        }
      }
    }

    const key = `${song.toLowerCase()}|${artist.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ index, song, artist, error: 'Duplicate song/artist entry' });
    } else {
      seen.add(key);
    }

    const urlLower = url.toLowerCase();
    if (!urlLower.endsWith('.m3u8') && !urlLower.endsWith('.mp4')) {
      errors.push({ index, song, artist, error: `Invalid file extension (must be .m3u8 or .mp4)` });
    }

    let normalizedUrl = url;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    try {
      const urlObj = new URL(normalizedUrl);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\/(Song|Album)\/(.+)$/i);
      
      if (isNewOrModified) {
        if (urlObj.hostname !== 'canvas.echomusic.fun') {
          errors.push({ index, song, artist, error: `URL domain must be canvas.echomusic.fun (found: ${urlObj.hostname})` });
        }
        if (urlObj.search || urlObj.hash) {
          errors.push({ index, song, artist, error: `URL cannot contain query parameters or fragment hashes` });
        }
        if (match) {
          const filename = match[2];
          const prAuthor = process.env.PR_AUTHOR;
          if (prAuthor) {
            const lowerAuthor = prAuthor.toLowerCase();
            const lowerFilename = filename.toLowerCase();
            if (!lowerFilename.startsWith(lowerAuthor + '-') && !lowerFilename.startsWith(lowerAuthor + '_')) {
              errors.push({ index, song, artist, error: `The referenced filename '${filename}' in the URL must start with your GitHub username (e.g. '${lowerAuthor}-<filename>.<ext>') to verify ownership.` });
            }
          }
        }
      }

      if (match) {
        const directory = match[1];
        const filename = match[2];
        
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || 
            /%2f/i.test(filename) || /%5c/i.test(filename) || /%2e/i.test(filename)) {
          errors.push({ index, song, artist, error: `Filename contains invalid path segments or traversal characters: '${filename}'` });
          return;
        }
        
        const localPath = path.join(directory, filename);
        
        if (!fs.existsSync(localPath)) {
          errors.push({ index, song, artist, error: `Referenced file does not exist: '${localPath}'` });
        } else {
          const normalizedPath = localPath.replace(/\\/g, '/');
          const isNewFile = !modifiedFiles || modifiedFiles.map(f => f.replace(/\\/g, '/')).includes(normalizedPath);
          
          if (isNewFile) {
            const stats = fs.statSync(localPath);
            const fileSizeMB = stats.size / (1024 * 1024);
            if (fileSizeMB > MAX_SIZE_MB) {
              errors.push({ 
                index, 
                song, 
                artist, 
                error: `File size of '${localPath}' is ${fileSizeMB.toFixed(2)}MB. Newly added files must be equal to or less than ${MAX_SIZE_MB}MB.` 
              });
            }
            if (stats.size === 0) {
              errors.push({ index, song, artist, error: `File '${localPath}' is empty (0 bytes)` });
            }
            
            const ext = filename.split('.').pop().toLowerCase();
            const sigError = verifyFileSignature(localPath, ext);
            if (sigError) {
              errors.push({ index, song, artist, error: sigError });
            }
          }
        }
      } else {
        errors.push({ index, song, artist, error: `URL does not follow repository structure (/Song/ or /Album/)` });
      }
    } catch (err) {
      errors.push({ index, song, artist, error: `Invalid URL format: ${err.message}` });
    }
  });

  if (modifiedFiles) {
    const isNewFileInDirectory = (file) => {
      const normalized = file.replace(/\\/g, '/');
      return (normalized.startsWith('Song/') || normalized.startsWith('Album/')) &&
             normalized !== 'Album/for album canvas.txt';
    };

    const newFiles = modifiedFiles.filter(isNewFileInDirectory);

    newFiles.forEach(file => {
      const filename = path.basename(file);
      const relativePath = file.replace(/\\/g, '/');

      if (LEGACY_ALLOWED_FILES.has(relativePath)) {
        return;
      }

      const ext = filename.split('.').pop().toLowerCase();
      if (ext !== 'mp4' && ext !== 'm3u8') {
        errors.push({
          index: 'N/A',
          song: 'N/A',
          artist: 'N/A',
          error: `File '${file}' has an invalid extension. Only .mp4 and .m3u8 files are allowed.`
        });
      }

      const prAuthor = process.env.PR_AUTHOR;
      if (prAuthor) {
        const lowerAuthor = prAuthor.toLowerCase();
        const lowerFilename = filename.toLowerCase();
        if (!lowerFilename.startsWith(lowerAuthor + '-') && !lowerFilename.startsWith(lowerAuthor + '_')) {
          errors.push({
            index: 'N/A',
            song: 'N/A',
            artist: 'N/A',
            error: `Filename '${filename}' must start with the PR author's username followed by a hyphen or underscore (e.g. '${lowerAuthor}-<filename>.<ext>') to verify ownership.`
          });
        }
      }
    });
  }

  let reportContent = '';
  if (errors.length > 0) {
    console.error('\n--- Validation FAILED! ---');
    reportContent = `### ❌ Validation Failed\n\nFound **${errors.length}** issues in this Pull Request. Please correct them to enable auto-merge:\n\n`;
    reportContent += '| Target / Item Index | Error Description |\n';
    reportContent += '|---|---|\n';
    errors.forEach(err => {
      const identifier = err.index === 'N/A' ? 'System / Naming' : `Index ${err.index} (${err.song} by ${err.artist})`;
      reportContent += `| ${identifier} | ${err.error} |\n`;
      console.error(`- [${identifier}] ${err.error}`);
    });
    
    fs.writeFileSync('validation_report.md', reportContent);
    
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `auto_merge=false\n`);
    }
    process.exit(1);
  } else {
    console.log('\n--- Validation PASSED! ---');
    
    let shouldDisableAutoMerge = false;
    let removalDetected = false;
    let removalReason = '';
    const matchedExistingNames = [];
    const baselineData = getBaselineCanvas();
    
    const fileCheck = checkFileDeletionsOrModifications();
    if (fileCheck.hasRemoval) {
      shouldDisableAutoMerge = true;
      removalDetected = true;
      removalReason = fileCheck.reason;
    }
    
    if (baselineData && baselineData.items) {
      const baselineItems = baselineData.items;
      
      if (!removalDetected) {
        for (const baselineItem of baselineItems) {
          const exists = items.some(prItem => 
            (prItem.song || '').trim() === (baselineItem.song || '').trim() &&
            (prItem.artist || '').trim() === (baselineItem.artist || '').trim() &&
            (prItem.url || '').trim() === (baselineItem.url || '').trim()
          );
          if (!exists) {
            shouldDisableAutoMerge = true;
            removalDetected = true;
            removalReason = `An existing database entry was modified or removed: "${baselineItem.song}" by ${baselineItem.artist}.`;
            break;
          }
        }
      }
      
      const baselineSongs = new Set();
      const baselineAlbums = new Set();
      const baselineAlbumUrls = new Set();
      
      baselineItems.forEach(item => {
        const { songName, isSong, isAlbum, url } = getItemTypeAndName(item);
        if (isSong && songName) {
          baselineSongs.add(songName);
        }
        if (isAlbum) {
          if (songName) {
            baselineAlbums.add(songName);
          }
          const match = url.match(/\/Album\/(.+)$/i);
          if (match) {
            baselineAlbumUrls.add(match[1].toLowerCase());
          }
        }
      });

      const baselineItemKeys = new Set(
        baselineItems.map(item => `${item.song || ''}|${item.artist || ''}|${item.url || ''}`)
      );

      const newOrModifiedItems = items.filter(item => {
        const key = `${item.song || ''}|${item.artist || ''}|${item.url || ''}`;
        return !baselineItemKeys.has(key);
      });

      newOrModifiedItems.forEach(item => {
        const { songName, isSong, isAlbum, url } = getItemTypeAndName(item);
        if (isSong && songName && baselineSongs.has(songName)) {
          shouldDisableAutoMerge = true;
          matchedExistingNames.push(`Song: "${item.song}"`);
        }
        if (isAlbum) {
          let isDup = false;
          if (songName && baselineAlbums.has(songName)) {
            isDup = true;
            shouldDisableAutoMerge = true;
            matchedExistingNames.push(`Album Track: "${item.song}"`);
          }
          const match = url.match(/\/Album\/(.+)$/i);
          if (match && baselineAlbumUrls.has(match[1].toLowerCase())) {
            if (!isDup) {
              shouldDisableAutoMerge = true;
              matchedExistingNames.push(`Album File: "${match[1]}"`);
            }
          }
        }
      });
    }

    const autoMerge = !shouldDisableAutoMerge;
    
    if (shouldDisableAutoMerge) {
      reportContent = `### ✅ Validation Passed (Manual Review Required)\n\nAll conditions met (file sizes <= 5MB, correct ownership prefix, no internal duplicates).\n\n⚠️ **Auto-merge is disabled** for manual review:\n`;
      if (removalDetected) {
        reportContent += `- **Modification/Removal detected:** ${removalReason}\n`;
      }
      matchedExistingNames.forEach(name => {
        reportContent += `- **Already exists in database:** ${name}\n`;
      });
      reportContent += `\nA maintainer must manually review and merge this pull request.`;
    } else {
      reportContent = `### ✅ Validation Passed!\n\nAll conditions met (file sizes <= 5MB, correct ownership prefix, no duplicates). Auto-merging...`;
    }
    
    fs.writeFileSync('validation_report.md', reportContent);
    
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `auto_merge=${autoMerge ? 'true' : 'false'}\n`);
    }
    console.log(`Verification completed successfully. Auto-merge: ${autoMerge}`);
  }
}

validate();
