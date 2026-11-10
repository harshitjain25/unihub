// Syntax-check every JavaScript file in the project (skips node_modules).
// Run with: npm run check
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKIP = ['node_modules', '.git', '.local-backups'];
let checked = 0;

function checkFolder(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (SKIP.includes(entry.name)) continue;
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            checkFolder(file);
        } else if (file.endsWith('.js')) {
            checked += 1;
            const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
            if (result.status !== 0) {
                process.stderr.write(result.stderr);
                process.exitCode = 1;
            }
        }
    }
}

checkFolder(path.join(__dirname, '..'));
if (!process.exitCode) console.log(`Syntax check passed for ${checked} JavaScript files.`);
