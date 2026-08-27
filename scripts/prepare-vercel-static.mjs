import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'client', 'dist');
const destination = path.join(projectRoot, 'public');

if (!fs.existsSync(source)) {
  throw new Error(`Client build output was not found at ${source}`);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`Prepared Vercel static output in ${destination}`);

