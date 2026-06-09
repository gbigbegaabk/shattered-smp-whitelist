document.addEventListener('DOMContentLoaded', () => {
  const whitelistForm = document.getElementById('whitelistForm');
  const usernameInput = document.getElementById('username');
  const submitBtn = document.getElementById('submitBtn');
  const messageContainer = document.getElementById('messageContainer');
  const totalWhitelistedSpan = document.getElementById('totalWhitelisted');
  const activityList = document.getElementById('activityList');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const copyIpBtn = document.getElementById('copyIpBtn');
  const copyFeedback = document.getElementById('copyFeedback');
  const discordBtn = document.getElementById('discordBtn');
  const yearSpan = document.querySelector('.year');

  // Set current year
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Fetch public config (IP and Discord)
  async function loadConfig() {
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      if (config.minecraft_ip) {
        copyIpBtn.dataset.ip = config.minecraft_ip;
      }
      if (config.discord_url) {
        discordBtn.href = config.discord_url;
      }
    } catch (err) {
      console.error('Failed to load config', err);
    }
  }

  // Update server status
  async function updateServerStatus() {
    try {
      const res = await fetch('/api/server-status');
      const data = await res.json();
      if (data.online) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'SERVER ONLINE';
      } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'SERVER OFFLINE';
      }
    } catch {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'CANNOT CONNECT';
    }
  }

  // Fetch total whitelisted count
  async function updateTotalWhitelisted() {
    try {
      const res = await fetch('/api/total-whitelisted');
      const data = await res.json();
      totalWhitelistedSpan.textContent = data.total || 0;
    } catch {
      totalWhitelistedSpan.textContent = '?';
    }
  }

  // Fetch recent activity
  async function updateRecentActivity() {
    try {
      const res = await fetch('/api/recent-activity');
      const activities = await res.json();
      if (activities.length === 0) {
        activityList.innerHTML = '<div class="activity-item placeholder"><span class="activity-user">---</span><span class="activity-time">No activity yet</span></div>';
        return;
      }
      activityList.innerHTML = activities.map(a => {
        const time = new Date(a.time).toLocaleTimeString();
        return `<div class="activity-item">
          <span class="activity-user">${escapeHtml(a.username)}</span>
          <span class="activity-time">${time} (${a.status})</span>
        </div>`;
      }).join('');
    } catch {
      activityList.innerHTML = '<div class="activity-item placeholder"><span class="activity-user">---</span><span class="activity-time">Failed to load</span></div>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showMessage(text, type) {
    messageContainer.innerHTML = `<div class="message ${type}">${escapeHtml(text)}</div>`;
  }

  // Handle form submission
  whitelistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) return;

    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'PROCESSING...';

    try {
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();

      if (data.success) {
        showMessage(data.message || 'Whitelisted!', 'success');
        usernameInput.value = '';
      } else {
        showMessage(data.error || 'Unknown error', 'error');
      }
    } catch (err) {
      showMessage('Network error. Please try again.', 'error');
    }

    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = 'GET WHITELISTED';

    // Refresh stats and activity
    updateTotalWhitelisted();
    updateRecentActivity();
  });

  // Copy IP button
  copyIpBtn.addEventListener('click', () => {
    const ip = copyIpBtn.dataset.ip || 'shattered.mcserver.com';
    navigator.clipboard.writeText(ip).then(() => {
      copyFeedback.classList.add('show');
      setTimeout(() => copyFeedback.classList.remove('show'), 1500);
    });
  });

  // Initial load and periodic refresh
  loadConfig();
  updateServerStatus();
  updateTotalWhitelisted();
  updateRecentActivity();

  setInterval(updateServerStatus, 30000);
  setInterval(updateRecentActivity, 15000);
  setInterval(updateTotalWhitelisted, 15000);
});