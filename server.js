require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Rcon } = require('minecraft-rcon');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuration ---
const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = parseInt(process.env.RCON_PORT, 10) || 25575;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const MINECRAFT_IP = process.env.MINECRAFT_IP || 'shattered.mcserver.com';
const DISCORD_URL = process.env.DISCORD_URL || '#';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';

// --- In‑memory storage with file persistence ---
const DATA_FILE = path.join(__dirname, 'whitelist_data.json');
let whitelistRequests = []; // array of { username, timestamp, status, error? }

// Load existing data
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    whitelistRequests = JSON.parse(raw);
    console.log(`Loaded ${whitelistRequests.length} previous whitelist requests.`);
  }
} catch (err) {
  console.error('Failed to load existing data, starting fresh.', err.message);
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(whitelistRequests, null, 2));
  } catch (err) {
    console.error('Failed to save whitelist data.', err.message);
  }
}

// --- Middleware ---
app.use(helmet({ contentSecurityPolicy: false })); // allows inline styles/scripts
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // serve static files

// Rate limiting for whitelist endpoint
const whitelistLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per IP
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Validation ---
function isValidUsername(username) {
  return /^\.?[a-zA-Z0-9_]{3,16}$/.test(username);
}

// --- Helper: execute RCON command ---
async function executeRcon(command) {
  const rcon = new Rcon(RCON_HOST, RCON_PORT, RCON_PASSWORD);
  try {
    await rcon.connect();
    const response = await rcon.send(command);
    await rcon.disconnect();
    return response.trim();
  } catch (err) {
    await rcon.disconnect().catch(() => {});
    throw err;
  }
}

// --- API Routes ---
// Server status (lightweight RCON ping)
app.get('/api/server-status', async (req, res) => {
  try {
    await executeRcon('list'); // any command that doesn't change state
    res.json({ online: true });
  } catch (err) {
    res.json({ online: false });
  }
});

// Total whitelisted players (unique successful usernames)
app.get('/api/total-whitelisted', (req, res) => {
  const uniquePlayers = new Set(
    whitelistRequests
      .filter(r => r.status === 'success')
      .map(r => r.username.toLowerCase())
  );
  res.json({ total: uniquePlayers.size });
});

// Recent activity (last 10 requests)
app.get('/api/recent-activity', (req, res) => {
  const recent = [...whitelistRequests]
    .reverse()
    .slice(0, 10)
    .map(r => ({ username: r.username, time: r.timestamp, status: r.status }));
  res.json(recent);
});

// Whitelist a player
app.post('/api/whitelist', whitelistLimiter, async (req, res) => {
  const { username } = req.body;
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Invalid Minecraft username (3-16 alphanumeric characters or underscores).' });
  }

  const cleanUsername = username.trim();

  // Check for duplicate (exact match, case‑insensitive)
  const alreadyWhitelisted = whitelistRequests.some(
    r => r.username.toLowerCase() === cleanUsername.toLowerCase() && r.status === 'success'
  );
  if (alreadyWhitelisted) {
    return res.json({ success: false, error: 'This player is already whitelisted.' });
  }

  const timestamp = new Date().toISOString();
  let status = 'failed';
  let errorMessage = '';

  try {
    const commandResponse = await executeRcon(`whitelist add ${cleanUsername}`);
    // Minecraft RCON response for whitelist add: "Added <name> to the whitelist" or "Player is already whitelisted"
    if (commandResponse.toLowerCase().includes('added')) {
      status = 'success';
    } else if (commandResponse.toLowerCase().includes('already')) {
      status = 'success'; // treat as success for the dashboard (they are whitelisted)
      errorMessage = 'Player was already whitelisted on the server.';
    } else {
      errorMessage = `Unexpected server response: ${commandResponse}`;
    }
  } catch (err) {
    console.error('RCON error:', err.message);
    errorMessage = 'Failed to connect to the server. Please try again later.';
  }

  // Save request
  const requestEntry = {
    username: cleanUsername,
    timestamp,
    status,
    error: status === 'failed' ? (errorMessage || 'RCON command failed.') : undefined
  };
  whitelistRequests.push(requestEntry);
  saveData();

  if (status === 'success') {
    res.json({ success: true, message: `${cleanUsername} has been whitelisted!` });
  } else {
    res.status(502).json({ success: false, error: errorMessage });
  }
});

// --- Admin API (protected) ---
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_TOKEN) {
    next();
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
}

app.get('/api/admin/requests', adminAuth, (req, res) => {
  res.json(whitelistRequests);
});

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Provide environment variables to frontend (only public ones)
app.get('/api/config', (req, res) => {
  res.json({
    minecraft_ip: MINECRAFT_IP,
    discord_url: DISCORD_URL
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Shattered SMP Whitelist running on port ${PORT}`);
});
