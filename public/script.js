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
  const editionRadios = document.querySelectorAll('input[name="edition"]');
  const prefixHint = document.getElementById('prefixHint');

  // Set current year
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Update placeholder and hint based on selected edition
  function updateEditionUI() {
    const selected = document.querySelector('input[name="edition"]:checked').value;
    if (selected === 'bedrock') {
      usernameInput.placeholder = 'Enter Bedrock username...';
      if (prefixHint) prefixHint.style.opacity = '1';
      // Optional: live preview of final username with dot
      updateBedrockPreview();
    } else {
      usernameInput.placeholder = 'Enter Java username...';
      if (prefixHint) prefixHint.style.opacity = '0.5';
    }
  }

  function updateBedrockPreview() {
    const raw = usernameInput.value.trim();
    if (raw && document.querySelector('input[name="edition"]:checked').value === 'bedrock') {
      usernameInput.setAttribute('data-preview', `will be sent as: .${raw}`);
    } else {
      usernameInput.removeAttribute('data-preview');
    }
  }

  // Add event listeners for edition change
  editionRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateEditionUI();
      // Clear any previous error message related to prefix
      const msgDiv = messageContainer.querySelector('.message');
      if (msgDiv && msgDiv.innerText.includes('dot')) msgDiv.remove();
    });
  });

  // Listen to username input for Bedrock preview
  usernameInput.addEventListener('input', updateBedrockPreview);

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

  // Handle form submission with edition support
  whitelistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    let rawUsername = usernameInput.value.trim();
    if (!rawUsername) return;

    const selectedEdition = document.querySelector('input[name="edition"]:checked').value;
    let finalUsername = rawUsername;

    // Bedrock edition: add dot prefix (if not already present)
    if (selectedEdition === 'bedrock') {
      if (!rawUsername.startsWith('.')) {
        finalUsername = '.' + rawUsername;
      } else {
        finalUsername = rawUsername; // already has dot
      }
    }

    // Optional: Validate that Java usernames follow standard rules (3-16 alphanumeric/underscore)
    if (selectedEdition === 'java') {
      const javaRegex = /^[a-zA-Z0-9_]{3,16}$/;
      if (!javaRegex.test(rawUsername)) {
        showMessage('Invalid Java username. Use 3-16 letters, numbers, or underscores.', 'error');
        return;
      }
    } else if (selectedEdition === 'bedrock') {
      // Bedrock allows more characters, but we keep simple check: non-empty, max 16 (without dot)
      if (rawUsername.length < 1 || rawUsername.length > 16) {
        showMessage('Bedrock username must be 1-16 characters (excluding the dot).', 'error');
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'PROCESSING...';

    try {
      // Send the final username (with dot for bedrock) to backend
      const res = await fetch('/api/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: finalUsername })
      });
      const data = await res.json();

      if (data.success) {
        let successMsg = data.message || `${finalUsername} has been whitelisted!`;
        if (selectedEdition === 'bedrock') {
          successMsg = `✓ Bedrock user ${rawUsername} (whitelisted as ${finalUsername})`;
        } else {
          successMsg = `✓ Java user ${finalUsername} whitelisted!`;
        }
        showMessage(successMsg, 'success');
        usernameInput.value = '';
        updateBedrockPreview(); // clear preview
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
  updateEditionUI(); // set correct placeholder based on default (Java)

  setInterval(updateServerStatus, 30000);
  setInterval(updateRecentActivity, 15000);
  setInterval(updateTotalWhitelisted, 15000);
});
