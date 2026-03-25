import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const PORT = 3000;
const ROOT_DIR = process.cwd();

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function resolvePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const candidatePath = path.resolve(ROOT_DIR, `.${decodedPath}`);
  const relativePath = path.relative(ROOT_DIR, candidatePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  let filePath = candidatePath;
  const fileStats = await stat(filePath);

  if (fileStats.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    await stat(filePath);
  }

  return filePath;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

  try {
    const filePath = await resolvePath(requestUrl.pathname);

    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    const statusCode = error?.code === 'ENOENT' ? 404 : 500;
    const message = statusCode === 404 ? 'Not Found' : 'Internal Server Error';

    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
  }
});

server.listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
  console.log(`Serving files from ${ROOT_DIR}`);
});
