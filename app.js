// ============================================
// STATE
// ============================================
let AUTH_TOKEN = '';
let ADMIN_USER_ID = '';
let ADMIN_PASSWORD = '';
let dashboardData = null;

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved session
  const savedToken = localStorage.getItem('admin_auth_token');
  const savedUserId = localStorage.getItem('admin_user_id');
  const savedPassword = localStorage.getItem('admin_password');
  if (savedToken && savedUserId && savedPassword) {
    AUTH_TOKEN = savedToken;
    ADMIN_USER_ID = savedUserId;
    ADMIN_PASSWORD = savedPassword;
    showDashboard();
    loadDashboard();
  }

  // Login
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Topbar buttons
  document.getElementById('btn-refresh').addEventListener('click', loadDashboard);
  document.getElementById('btn-logout').addEventListener('click', handleLogout);

  // Tabs
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Modal close
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});

// ============================================
// AUTH
// ============================================
async function handleLogin() {
  const userId = document.getElementById('login-userid').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  if (!userId || !password) {
    errorEl.textContent = 'Both fields are required.';
    return;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    AUTH_TOKEN = data.access_token;
    ADMIN_USER_ID = userId;
    ADMIN_PASSWORD = password;
    localStorage.setItem('admin_auth_token', AUTH_TOKEN);
    localStorage.setItem('admin_user_id', ADMIN_USER_ID);
    localStorage.setItem('admin_password', ADMIN_PASSWORD);

    showDashboard();
    loadDashboard();
  } catch (err) {
    errorEl.textContent = `Login failed: ${err.message}`;
  }
}

async function reAuthenticate() {
  if (!ADMIN_USER_ID || !ADMIN_PASSWORD) {
    handleLogout();
    return false;
  }

  try {
    const res = await fetch(`${CONFIG.API_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ADMIN_USER_ID, password: ADMIN_PASSWORD }),
    });

    const data = await res.json();

    if (!res.ok) {
      handleLogout();
      return false;
    }

    AUTH_TOKEN = data.access_token;
    localStorage.setItem('admin_auth_token', AUTH_TOKEN);
    console.log('Token refreshed successfully');
    return true;
  } catch (err) {
    console.error('Re-authentication failed:', err);
    handleLogout();
    return false;
  }
}

function handleLogout() {
  localStorage.removeItem('admin_auth_token');
  localStorage.removeItem('admin_user_id');
  localStorage.removeItem('admin_password');
  AUTH_TOKEN = '';
  ADMIN_USER_ID = '';
  ADMIN_PASSWORD = '';
  dashboardData = null;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('login-password').value = '';
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
}

// ============================================
// API (with auto-reauth on 401)
// ============================================
async function apiFetch(path, options = {}) {
  let res = await fetch(`${CONFIG.API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  // Auto re-authenticate on 401
  if (res.status === 401) {
    console.log('Token expired, re-authenticating...');
    const reauthed = await reAuthenticate();
    if (reauthed) {
      // Retry the original request with new token
      res = await fetch(`${CONFIG.API_URL}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          ...(options.headers || {}),
        },
      });
    }
  }

  return res;
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard() {
  try {
    const res = await apiFetch('/api/reports/admin/dashboard');
    if (res.status === 401) {
      handleLogout();
      document.getElementById('login-error').textContent = 'Session expired. Please login again.';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dashboardData = await res.json();
    renderDashboard();

    // Also load tab-specific data
    loadActiveTabData();
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function renderDashboard() {
  if (!dashboardData) return;

  // Stats
  document.getElementById('stat-pending').textContent = dashboardData.stats.totalPending;
  document.getElementById('stat-appealed').textContent = dashboardData.stats.totalAppealed;
  document.getElementById('stat-resolved').textContent = dashboardData.stats.totalResolvedToday;
  document.getElementById('stat-banned').textContent = dashboardData.stats.totalBannedUsers;

  // Pending reports
  renderReportList('pending-list', dashboardData.pendingReports, 'pending');
}

function loadActiveTabData() {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;

  const tabName = activeTab.dataset.tab;
  if (tabName === 'appeals') loadAppeals();
  else if (tabName === 'resolved') loadResolved();
  else if (tabName === 'banned') loadBannedUsers();
}

// ============================================
// REPORT LIST RENDERING
// ============================================
function renderReportList(containerId, reports, type) {
  const container = document.getElementById(containerId);

  if (!reports || reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${type === 'appeals' ? '🎉' : type === 'resolved' ? '📋' : '✅'}</div>
        <div class="empty-state-text">No ${type === 'appeals' ? 'appeals' : type === 'resolved' ? 'resolved reports' : 'pending reports'}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = reports.map((report) => `
    <div class="report-card" onclick="openReportDetail('${report.id}')">
      <div class="report-card-header">
        <div class="report-card-reason">
          <span class="reason-badge reason-${report.reason}">${formatReason(report.reason)}</span>
          <span class="status-badge status-${report.status}">${formatStatus(report.status)}</span>
        </div>
        <span class="report-card-type">${report.contentType}</span>
      </div>
      <div class="report-card-users">
        <span>Reporter: <strong>${escapeHtml(report.reporterUserName || report.reporterUserId)}</strong></span>
        <span>Reported: <strong>${escapeHtml(report.reportedUserName || report.reportedUserId)}</strong></span>
      </div>
      ${report.contentPreview ? `
        <div class="report-card-preview">${escapeHtml(report.contentPreview)}</div>
      ` : ''}
      ${report.description ? `
        <div class="report-card-meta" style="margin-top: 8px;">
          <span>📝 ${escapeHtml(report.description)}</span>
        </div>
      ` : ''}
      <div class="report-card-meta">
        <span>${formatDate(report.createdAt)}</span>
        <span>${report.contentAuthorName ? 'by ' + escapeHtml(report.contentAuthorName) : ''}</span>
      </div>
    </div>
  `).join('');
}

// ============================================
// APPEALS TAB
// ============================================
async function loadAppeals() {
  const container = document.getElementById('appeals-list');
  container.innerHTML = '<div class="loading">Loading appeals...</div>';

  try {
    const res = await apiFetch('/api/reports/admin/appeals');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const appeals = await res.json();
    renderAppealsList(appeals);
  } catch (err) {
    console.error('Failed to load appeals:', err);
    container.innerHTML = `<div class="error-text">Failed to load: ${err.message}</div>`;
  }
}

function renderAppealsList(appeals) {
  const container = document.getElementById('appeals-list');

  if (!appeals || appeals.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-text">No appeals</div>
      </div>
    `;
    return;
  }

  container.innerHTML = appeals.map((appeal) => `
    <div class="report-card ${appeal.status === 'pending' ? 'appeal-pending' : 'appeal-resolved'}" onclick="openReportDetail('${appeal.reportId}')">
      <div class="report-card-header">
        <div class="report-card-reason">
          <span class="reason-badge reason-${appeal.reportReason}">${formatReason(appeal.reportReason)}</span>
          <span class="appeal-status-badge appeal-status-${appeal.status}">
            ${appeal.status === 'pending' ? '⏳ Pending Review' : appeal.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
          </span>
        </div>
        <span class="report-card-type">${appeal.contentType}</span>
      </div>
      <div class="report-card-users">
        <span>Appealed by: <strong>${escapeHtml(appeal.reportedUserName)}</strong></span>
        <span>Reporter: <strong>${escapeHtml(appeal.reporterUserName)}</strong></span>
      </div>
      <div class="report-card-preview">${escapeHtml(appeal.appealReason)}</div>
      ${appeal.adminResponse ? `
        <div class="admin-response-preview">
          <span class="admin-label">Admin:</span> ${escapeHtml(appeal.adminResponse)}
        </div>
      ` : ''}
      <div class="report-card-meta">
        <span>Appealed: ${formatDate(appeal.createdAt)}</span>
        ${appeal.resolvedAt ? `<span>Resolved: ${formatDate(appeal.resolvedAt)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ============================================
// RESOLVED TAB
// ============================================
async function loadResolved() {
  const container = document.getElementById('resolved-list');
  container.innerHTML = '<div class="loading">Loading resolved reports...</div>';

  try {
    const res = await apiFetch('/api/reports/admin/resolved');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reports = await res.json();
    renderReportList('resolved-list', reports, 'resolved');
  } catch (err) {
    console.error('Failed to load resolved reports:', err);
    container.innerHTML = `<div class="error-text">Failed to load: ${err.message}</div>`;
  }
}

// ============================================
// BANNED USERS TAB
// ============================================
async function loadBannedUsers() {
  const container = document.getElementById('banned-list');
  container.innerHTML = '<div class="loading">Loading banned users...</div>';

  try {
    const res = await apiFetch('/api/reports/admin/banned-users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bannedUsers = await res.json();
    renderBannedUsers(bannedUsers);
  } catch (err) {
    console.error('Failed to load banned users:', err);
    container.innerHTML = `<div class="error-text">Failed to load: ${err.message}</div>`;
  }
}

function renderBannedUsers(users) {
  const container = document.getElementById('banned-list');

  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎉</div>
        <div class="empty-state-text">No banned users</div>
      </div>
    `;
    return;
  }

  container.innerHTML = users.map((user) => `
    <div class="banned-user-card" id="banned-${user.userId}">
      <div class="banned-user-header" onclick="toggleBannedUser('${user.userId}')">
        <div class="banned-user-info">
          <div class="detail-avatar">
            ${user.avatarUrl
              ? `<img src="${escapeHtml(user.avatarUrl)}" alt="">`
              : (user.userName || 'U').charAt(0).toUpperCase()
            }
          </div>
          <div>
            <div class="banned-user-name">${escapeHtml(user.userName)}</div>
            <div class="banned-user-meta">ID: ${user.userId} &middot; Strikes: ${user.strikeCount} &middot; Banned: ${formatDate(user.bannedAt * 1000)}</div>
          </div>
        </div>
        <div class="banned-user-toggle">
          <span class="toggle-icon" id="toggle-icon-${user.userId}">▶</span>
        </div>
      </div>
      <div class="banned-user-details hidden" id="details-${user.userId}">
        <div class="banned-user-reason">
          <strong>Ban reason:</strong> ${escapeHtml(user.reason)}
        </div>
        ${user.strikes && user.strikes.length > 0 ? `
          <div class="strikes-list">
            <h4>Strike History</h4>
            ${user.strikes.map((strike, i) => `
              <div class="strike-item">
                <span class="strike-number">#${i + 1}</span>
                <span class="strike-reason">${escapeHtml(strike.reason)}</span>
                <span class="strike-date">${formatDate(strike.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="reset-strikes-form">
          <h4>Reset Strikes & Unban</h4>
          <div class="form-group">
            <label>Admin Message (visible to user)</label>
            <textarea id="reset-message-${user.userId}" placeholder="Explain why strikes are being reset..."></textarea>
          </div>
          <button class="btn btn-success" onclick="resetStrikes('${user.userId}')">
            🔓 Reset Strikes & Unban User
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleBannedUser(userId) {
  const details = document.getElementById(`details-${userId}`);
  const icon = document.getElementById(`toggle-icon-${userId}`);
  if (details.classList.contains('hidden')) {
    details.classList.remove('hidden');
    icon.textContent = '▼';
  } else {
    details.classList.add('hidden');
    icon.textContent = '▶';
  }
}

async function resetStrikes(userId) {
  const messageEl = document.getElementById(`reset-message-${userId}`);
  const message = messageEl ? messageEl.value.trim() : '';

  if (!message) {
    alert('Please provide a message for the user explaining the reset.');
    return;
  }

  if (!confirm(`Are you sure you want to reset all strikes and unban user ${userId}?`)) {
    return;
  }

  try {
    const res = await apiFetch(`/api/reports/admin/reset-strikes/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    alert('Strikes reset and user unbanned successfully!');
    loadDashboard();
    loadBannedUsers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ============================================
// TABS
// ============================================
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));

  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.remove('hidden');

  // Load data for the active tab
  if (tabName === 'appeals') loadAppeals();
  else if (tabName === 'resolved') loadResolved();
  else if (tabName === 'banned') loadBannedUsers();
}

// ============================================
// DETAIL MODAL
// ============================================
async function openReportDetail(reportId) {
  const modal = document.getElementById('detail-modal');
  const body = document.getElementById('modal-body');

  modal.classList.remove('hidden');
  body.innerHTML = '<div class="loading">Loading report details...</div>';

  try {
    const res = await apiFetch(`/api/reports/${reportId}/content`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    renderDetailView(body, data);
  } catch (err) {
    body.innerHTML = `<div class="error-text">Failed to load: ${err.message}</div>`;
  }
}

function renderDetailView(container, data) {
  const { report, content, appeal } = data;
  const isPost = report.contentType === 'post';
  const isAppeal = report.status === 'appealed';

  // Parse AI decision if exists
  let aiDecision = null;
  if (report.ai_decision || report.aiDecision) {
    try {
      aiDecision = JSON.parse(report.ai_decision || report.aiDecision);
    } catch (e) { /* ignore */ }
  }

  container.innerHTML = `
    <!-- HEADER -->
    <div class="detail-header">
      <h2>Report: ${formatReason(report.reason)}</h2>
      <div class="detail-meta">
        <span class="reason-badge reason-${report.reason}">${formatReason(report.reason)}</span>
        <span class="status-badge status-${report.status}">${formatStatus(report.status)}</span>
        <span class="report-card-type">${report.contentType}</span>
      </div>
    </div>

    <!-- USERS -->
    <div class="detail-section">
      <h3>People involved</h3>
      <div class="detail-users">
        <div class="detail-user">
          <div class="detail-avatar">
            ${content.user_avatar_url
              ? `<img src="${escapeHtml(content.user_avatar_url)}" alt="">`
              : (content.user_name || 'U').charAt(0).toUpperCase()
            }
          </div>
          <div class="detail-user-info">
            <div class="detail-user-name">${escapeHtml(content.user_name || report.reported_user_id || report.reportedUserId)}</div>
            <div class="detail-user-role">Reported user (author)</div>
          </div>
        </div>
        <div class="detail-user">
          <div class="detail-avatar">R</div>
          <div class="detail-user-info">
            <div class="detail-user-name">User ${escapeHtml(report.reporter_user_id || report.reporterUserId)}</div>
            <div class="detail-user-role">Reporter</div>
          </div>
        </div>
      </div>
    </div>

    <!-- REPORTED CONTENT -->
    <div class="detail-section">
      <h3>${isPost ? 'Reported Post' : 'Reported Comment'}</h3>
      <div class="detail-content-box">
        <div class="detail-content-text">${escapeHtml(content.content || '')}</div>
        ${isPost && content.media_url ? `
          <div class="detail-content-image">
            <img src="${escapeHtml(content.media_url)}" alt="Post image" onerror="this.parentElement.innerHTML='<p style=\\'color:#8b8fa3; padding:12px;\\'>Image failed to load</p>'">
          </div>
        ` : ''}
        ${isPost && content.category ? `
          <div style="margin-top: 12px; font-size: 12px; color: #8b8fa3;">
            Category: <strong>${escapeHtml(content.category)}</strong>
            ${content.hashtags && content.hashtags !== '[]' ? ` &middot; Tags: ${escapeHtml(content.hashtags)}` : ''}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- REPORTER DESCRIPTION -->
    ${report.description ? `
      <div class="detail-section">
        <h3>Reporter's Description</h3>
        <div class="detail-description">"${escapeHtml(report.description)}"</div>
      </div>
    ` : ''}

    <!-- AI DECISION -->
    ${aiDecision ? `
      <div class="detail-section">
        <h3>AI Analysis</h3>
        <div class="ai-decision">
          <div class="ai-decision-result">
            ${aiDecision.isViolation || aiDecision.isValid ? '🚩 AI found violation' : '✅ AI found no violation'}
            ${aiDecision.confidence ? ` (${Math.round(aiDecision.confidence * 100)}% confidence)` : ''}
          </div>
          <div class="ai-decision-reasoning">${escapeHtml(aiDecision.reasoning || '')}</div>
          ${aiDecision.suggestedAction ? `<div style="margin-top:8px; font-size:12px; color:#8b8fa3;">Suggested: <strong>${aiDecision.suggestedAction}</strong></div>` : ''}
        </div>
      </div>
    ` : ''}

    <!-- APPEAL -->
    ${appeal ? `
      <div class="detail-section">
        <h3>User Appeal</h3>
        <div class="appeal-box">
          <div class="appeal-reason">${escapeHtml(appeal.appealReason || appeal.appeal_reason || '')}</div>
          <div class="appeal-meta">
            Submitted: ${formatDate(appeal.createdAt || appeal.created_at)}
            &middot; Status: <strong>${appeal.status}</strong>
          </div>
          ${appeal.adminResponse || appeal.admin_response ? `
            <div class="admin-response-box">
              <strong>Admin Response:</strong> ${escapeHtml(appeal.adminResponse || appeal.admin_response)}
            </div>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <!-- ADMIN NOTES -->
    ${report.admin_notes || report.adminNotes ? `
      <div class="detail-section">
        <h3>Previous Admin Notes</h3>
        <div class="detail-description">${escapeHtml(report.admin_notes || report.adminNotes)}</div>
      </div>
    ` : ''}

    <!-- ACTION FORMS -->
    ${isAppeal && appeal && appeal.status === 'pending' ? renderAppealActionForm(report.id) : ''}
    ${!isAppeal && (report.status === 'pending' || report.status === 'reviewing') ? renderReviewActionForm(report.id) : ''}
  `;
}

function renderReviewActionForm(reportId) {
  return `
    <div class="detail-section">
      <div class="action-form">
        <h3>Admin Review</h3>
        <div class="form-group">
          <label>Admin Notes</label>
          <textarea id="admin-notes" placeholder="Optional notes about your decision..."></textarea>
        </div>
        <div class="btn-group">
          <button class="btn btn-success" onclick="reviewReport('${reportId}', 'resolved_valid', true)">
            ✅ Valid Report (Strike User)
          </button>
          <button class="btn btn-warning" onclick="reviewReport('${reportId}', 'resolved_valid', false)">
            ⚠️ Valid (No Strike)
          </button>
          <button class="btn" onclick="reviewReport('${reportId}', 'resolved_invalid', false)">
            ❌ Invalid Report
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderAppealActionForm(reportId) {
  return `
    <div class="detail-section">
      <div class="action-form">
        <h3>Review Appeal</h3>
        <div class="form-group">
          <label>Response to User</label>
          <textarea id="appeal-response" placeholder="Explain your decision to the user..."></textarea>
        </div>
        <div class="btn-group">
          <button class="btn btn-success" onclick="reviewAppeal('${reportId}', true)">
            ✅ Approve Appeal (Remove Strike)
          </button>
          <button class="btn btn-danger" onclick="reviewAppeal('${reportId}', false)">
            ❌ Reject Appeal
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// ADMIN ACTIONS
// ============================================
async function reviewReport(reportId, status, shouldStrike) {
  const notes = document.getElementById('admin-notes')?.value || '';

  try {
    const res = await apiFetch(`/api/reports/${reportId}/admin-review`, {
      method: 'POST',
      body: JSON.stringify({ status, notes, shouldStrike }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    closeModal();
    loadDashboard();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function reviewAppeal(reportId, approved) {
  const adminResponse = document.getElementById('appeal-response')?.value || '';

  if (!adminResponse.trim()) {
    alert('Please provide a response to the user.');
    return;
  }

  try {
    const res = await apiFetch(`/api/reports/${reportId}/appeal-review`, {
      method: 'POST',
      body: JSON.stringify({ approved, adminResponse }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    closeModal();
    loadDashboard();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ============================================
// AI PROCESSING
// ============================================
async function processNextReport() {
  try {
    const res = await apiFetch('/api/reports/process-next', {
      method: 'POST',
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    const result = await res.json();
    alert(result.message);
    loadDashboard();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ============================================
// MODAL
// ============================================
function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// ============================================
// HELPERS
// ============================================
function formatReason(reason) {
  const map = {
    spam: 'Spam',
    harassment: 'Harassment',
    inappropriate: 'Inappropriate',
    fake: 'Fake / Misleading',
    impersonation: 'Impersonation',
    other: 'Other',
  };
  return map[reason] || reason;
}

function formatStatus(status) {
  const map = {
    pending: 'Pending',
    reviewing: 'Reviewing',
    resolved_valid: 'Valid',
    resolved_invalid: 'Invalid',
    appealed: 'Appealed',
  };
  return map[status] || status;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const ts = parseInt(dateStr);
    if (!isNaN(ts)) {
      const dd = new Date(ts > 1e12 ? ts : ts * 1000);
      return dd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
    return '';
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
