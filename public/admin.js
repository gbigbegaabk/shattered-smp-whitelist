const ADMIN_TOKEN = prompt('Enter admin token:');
if (!ADMIN_TOKEN) {
  document.body.innerHTML = '<h1 style="color:#ff003c;text-align:center;margin-top:20vh;">Access Denied</h1>';
  throw new Error('No token');
}

const refreshBtn = document.getElementById('refreshBtn');
const totalEl = document.getElementById('totalRequests');
const successEl = document.getElementById('successfulRequests');
const failedEl = document.getElementById('failedRequests');
const tbody = document.querySelector('#requestsTable tbody');

async function fetchData() {
  try {
    const res = await fetch(`/api/admin/requests?token=${encodeURIComponent(ADMIN_TOKEN)}`, {
      headers: { 'x-admin-token': ADMIN_TOKEN }
    });
    if (!res.ok) throw new Error('Forbidden');
    const data = await res.json();
    renderStats(data);
    renderTable(data);
  } catch (err) {
    alert('Failed to load data. Check token.');
  }
}

function renderStats(requests) {
  totalEl.textContent = requests.length;
  const success = requests.filter(r => r.status === 'success').length;
  const failed = requests.filter(r => r.status === 'failed').length;
  successEl.textContent = success;
  failedEl.textContent = failed;
}

function renderTable(requests) {
  const sorted = [...requests].reverse();
  tbody.innerHTML = sorted.map(r => `
    <tr>
      <td>${escapeHtml(r.username)}</td>
      <td>${new Date(r.timestamp).toLocaleString()}</td>
      <td class="${r.status === 'success' ? 'success' : 'failed'}">${r.status}</td>
      <td>${r.error || '-'}</td>
    </tr>
  `).join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

refreshBtn.addEventListener('click', fetchData);
fetchData();