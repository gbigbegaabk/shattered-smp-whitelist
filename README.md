# Shattered SMP Whitelist Dashboard

A dark cyberpunk dashboard that automatically whitelists players on your Minecraft server via RCON.

## Features
- **GET WHITELISTED** form with Minecraft username validation
- Real‑time server status indicator
- Live recent whitelist activity feed
- Copy server IP and Discord link
- Admin panel to view all requests
- Rate limiting and input sanitization
- Fully responsive, retro pixel/neon aesthetic

## Prerequisites
- Node.js 18+
- A Minecraft server with RCON enabled (`enable-rcon=true` in `server.properties`)
- RCON password and port configured

## Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your values:
   ```
   RCON_HOST=your.server.ip
   RCON_PORT=25575
   RCON_PASSWORD=your_rcon_password
   PORT=3000
   MINECRAFT_IP=play.yourserver.com
   DISCORD_URL=https://discord.gg/yourinvite
   ADMIN_TOKEN=strong-random-string
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000` for the whitelist page.
6. Admin panel at `http://localhost:3000/admin` (token required).

## Render Deployment
1. Push this project to a Git repository.
2. On Render, create a new **Web Service**.
3. Set the **Build Command**: `npm install`
4. Set the **Start Command**: `node server.js`
5. Add all environment variables from `.env.example`.
6. Deploy. Your dashboard will be live at the provided `*.onrender.com` URL.

**Important:** The free Render instance may spin down after inactivity. The first request may be slow.

## Security Notes
- Never commit `.env` to version control.
- Use a strong, unique `ADMIN_TOKEN`.
- RCON traffic is unencrypted; consider using a VPN if connecting over the internet.
- The admin page is protected by a simple token; for production, add proper authentication.

## File Structure