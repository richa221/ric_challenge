const { spawn } = require('node:child_process');
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { config } = require('./config.js');
const { loadAssets } = require('./registry.js');
const { valuePortfolio } = require('./valuation.js');

const app = express();
app.disable('x-powered-by');
app.use(express.static(join(config.root, 'public'), {
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

function route(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/assets', route(async (_req, res) => {
  res.json({ assets: await loadAssets() });
}));

app.get('/api/valuation', route(async (_req, res) => {
  res.json(await valuePortfolio());
}));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 502).json({ error: error.message });
});

function openBrowser(url) {
  const child = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true })
    : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
  child.on('error', () => {
    console.error(`Open ${url} in a browser.`);
  });
  child.unref();
}

const MAX_PORT_ATTEMPTS = 20;
const HIGHEST_PORT = 65535;

function listenFrom(startPort) {
  let port = startPort;
  const lastPort = Math.min(startPort + MAX_PORT_ATTEMPTS - 1, HIGHEST_PORT);
  const server = createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && port < lastPort) {
      console.error(`Port ${port} is already in use. Trying ${port + 1}.`);
      port += 1;
      server.listen(port);
      return;
    }
    console.error(error.code === 'EADDRINUSE'
      ? `Ports ${startPort} through ${port} are already in use.`
      : error.message);
    process.exit(1);
  });

  server.listen(port, () => {
    const address = `http://localhost:${server.address().port}`;
    console.log(`RWA ledger listening on ${address}`);
    openBrowser(address);
  });
}

listenFrom(config.port);
