require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

const app = express();

// --- Fix for proxy warnings (Render, Heroku, etc.) ---
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// --- Configuration ---
const RCON_HOST = process.env.RCON_HOST;
const RCON_PORT = parseInt(process.env.RCON_PORT, 10) || 25575;
const RCON_PASSWORD = process.env.RCON_PASSWORD;
const MINECRAFT_IP = process.env.MINECRAFT_IP || 'shattered.mcserver.com';
const DISCORD_URL = process.env.DISCORD_URL || '#'; // button link, not OAuth
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';

// Discord OAuth credentials
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_CALLBACK_URL = process.env.DISCORD_CALLBACK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'default-insecure-secret';

// --- Session & Passport setup ---
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set secure: true if using HTTPS (Render uses HTTPS)
}));
app.use(passport.initialize());
app.use(passport.session());

// Serialize/deserialize user (store just Discord ID and username)
passport.serializeUser((user, done) => {
  done(null, { id: user.id, username: user.username });
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// Discord OAuth Strategy
passport.use(new DiscordStrategy({
  clientID: DISCORD_CLIENT_ID,
  clientSecret: DISCORD_CLIENT_SECRET,
  callbackURL: DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  // profile contains id, username, discriminator, avatar, etc.
  return done(null, {
    id: profile.id,
    username: profile.username,
    discriminator: profile.discriminator
  });
}));

// --- In‑memory storage with file persistence ---
const DATA_FILE = path.join(__dirname, 'whitelist_data.json');
let whitelistRequests = [];

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
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for whitelist endpoint
const whitelistLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
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
  let rcon;
  try {
    rcon = await Rcon.connect({
      host: RCON_HOST,
      port: RCON_PORT,
      password: RCON_PASSWORD
    });
    const response = await rcon.send(command);
    return response;
  } catch (err) {
    console.error("RCON ERROR:", err);
    throw err;
  } finally {
    if (rcon) {
      try { await rcon.end(); } catch {}
    }
  }
}

// ========================
// DISCORD AUTH ROUTES
// ========================
app.get('/auth/discord',
  passport.authenticate('discord', { scope: ['identify'] })
);

app.get('/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication – redirect to dashboard or homepage
    res.redirect('/');
  }
);

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Simple endpoint to check if user is logged in (for frontend)
app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

// ========================
// EXISTING API ROUTES (unchanged)
// ========================
app.get('/api/server-status', async (req, res) => {
  try {
    await executeRcon('list');
    res.json({ online: true });
  } catch (err) {
    res.json({ online: false });
  }
});

app.get('/api/total-whitelisted', (req, res) => {
  const uniquePlayers = new Set(
    whitelistRequests
      .filter(r => r.status === 'success')
      .map(r => r.username.toLowerCase())
  );
  res.json({ total: uniquePlayers.size });
});

app.get('/api/recent-activity', (req, res) => {
  const recent = [...whitelistRequests]
    .reverse()
    .slice(0, 10)
    .map(r => ({ username: r.username, time: r.timestamp, status: r.status }));
  res.json(recent);
});

app.post('/api/whitelist', whitelistLimiter, async (req, res) => {
  const { username } = req.body;
  if (!username || !isValidUsername(username)) {
    return res.status(400).json({ success: false, error: 'Invalid Minecraft username (3-16 alphanumeric characters or underscores).' });
  }

  const cleanUsername = username.trim();

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
    if (commandResponse.toLowerCase().includes('added')) {
      status = 'success';
    } else if (commandResponse.toLowerCase().includes('already')) {
      status = 'success';
      errorMessage = 'Player was already whitelisted on the server.';
    } else {
      errorMessage = `Unexpected server response: ${commandResponse}`;
    }
  } catch (err) {
    console.error('RCON error:', err.message);
    errorMessage = 'Failed to connect to the server. Please try again later.';
  }

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
