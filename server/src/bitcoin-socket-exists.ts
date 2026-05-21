export const bitcoinSocketExistsScript = `const fs = require('fs');
const { execSync } = require('child_process');

const socketPath = process.argv[1];
const dir = require('path').dirname(socketPath);

try {
  console.log('DEBUG: Checking path:', socketPath);
  console.log('DEBUG: Directory contents:', execSync('ls -la ' + dir).toString());
  console.log('DEBUG: exists:', fs.existsSync(socketPath));
} catch(e) {
  console.log('DEBUG ERROR:', e.message);
}

process.exit(fs.existsSync(socketPath) ? 0 : 1);`;
