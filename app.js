/* ========== IntelliTask — App Logic ========== */
(() => {
  'use strict';

  // ── Storage keys ──
  const TASKS_KEY = 'intellitask_tasks';
  const USERS_KEY = 'intellitask_users';
  const SESSION_KEY = 'intellitask_session';
  const THEME_KEY = 'intellitask_theme';

  // ── DOM shortcuts ──
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // Auth DOM
  const authContainer = $('#auth-container');
  const appContainer = $('#app-container');
  const loginWrapper = $('#login-form-wrapper');
  const signupWrapper = $('#signup-form-wrapper');
  const forgotWrapper = $('#forgot-form-wrapper');
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  const forgotForm = $('#forgot-form');
  const resetForm = $('#reset-form');
  const forgotSuccess = $('#forgot-success');

  // App DOM
  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebar-overlay');
  const hamburger = $('#hamburger');
  const sidebarClose = $('#sidebar-close');
  const pageTitle = $('#page-title');
  const searchInput = $('#search-input');
  const taskListEl = $('#task-list');
  const emptyStateEl = $('#empty-state');
  const modalOverlay = $('#modal-overlay');
  const deleteOverlay = $('#delete-modal-overlay');
  const taskForm = $('#task-form');
  const modalTitle = $('#modal-title');
  const toastContainer = $('#toast-container');
  const statsRow = $('#stats-row');

  // Views
  const viewTasks = $('#view-tasks');
  const viewCalendar = $('#view-calendar');
  const calCells = $('#cal-cells');
  const calMonthLabel = $('#cal-month-label');

  // Form fields
  const fieldTitle = $('#task-title');
  const fieldDesc = $('#task-desc');
  const fieldDate = $('#task-date');
  const fieldPriority = $('#task-priority');

  // ── State ──
  let tasks = [];
  let currentView = 'dashboard';
  let editingId = null;
  let deletingId = null;
  let reminderShown = new Set();
  let calYear, calMonth; // for calendar navigation
  let resetEmail = null; // email for password reset flow

  // ── Helpers ──
  function uuid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function saveTasks() {
    const session = getSession();
    if (!session) return;
    localStorage.setItem(TASKS_KEY + '_' + session.email, JSON.stringify(tasks));
  }

  function loadTasks() {
    const session = getSession();
    if (!session) { tasks = []; return; }
    try {
      const d = localStorage.getItem(TASKS_KEY + '_' + session.email);
      tasks = d ? JSON.parse(d) : [];
    } catch { tasks = []; }
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function daysUntilDue(dateStr) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dateStr + 'T00:00:00');
    return Math.ceil((due - now) / (86400000));
  }

  function deadlineClass(dateStr, completed) {
    if (completed) return '';
    const d = daysUntilDue(dateStr);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 3) return 'soon';
    if (d <= 7) return 'week';
    return 'later';
  }

  function dueBadgeHTML(dateStr, completed) {
    if (completed) return `<span class="task-badge badge-date">${formatDate(dateStr)}</span>`;
    const d = daysUntilDue(dateStr);
    const cls = deadlineClass(dateStr, false);
    if (d < 0) return `<span class="task-badge badge-overdue">Overdue by ${Math.abs(d)}d</span>`;
    if (d === 0) return `<span class="task-badge badge-today">Due Today</span>`;
    if (d === 1) return `<span class="task-badge badge-soon">Due Tomorrow</span>`;
    if (d <= 3) return `<span class="task-badge badge-soon">${d} days left</span>`;
    if (d <= 7) return `<span class="task-badge badge-week">${d} days left</span>`;
    return `<span class="task-badge badge-later">${formatDate(dateStr)}</span>`;
  }

  function priorityBadgeHTML(p) {
    const map = { high: 'High', medium: 'Medium', low: 'Low' };
    return `<span class="task-badge badge-priority-${p}">${map[p] || 'Medium'}</span>`;
  }

  // ═══════════════════════════════════════════
  //  AUTH SYSTEM (localStorage-based)
  // ═══════════════════════════════════════════

  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; }
  }
  function saveUsers(u) { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function setSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function showAuthForm(which) {
    loginWrapper.classList.toggle('hidden', which !== 'login');
    signupWrapper.classList.toggle('hidden', which !== 'signup');
    forgotWrapper.classList.toggle('hidden', which !== 'forgot');
    // Reset forgot flow
    if (which === 'forgot') {
      forgotSuccess.classList.add('hidden');
      forgotForm.classList.remove('hidden');
      resetForm.classList.add('hidden');
      resetEmail = null;
    }
    clearAuthErrors();
  }

  function showAuthError(form, msg) {
    let el = form.querySelector('.auth-error');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-error';
      form.prepend(el);
    }
    el.textContent = msg;
    el.classList.add('show');
  }

  function clearAuthErrors() {
    $$('.auth-error').forEach(e => { e.classList.remove('show'); });
  }

  // Auth event wiring
  $('#show-signup').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('signup'); });
  $('#show-login-from-signup').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
  $('#show-forgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('forgot'); });
  $('#show-login-from-forgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
  $('#back-to-login-after-forgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
  $('#back-to-login-from-reset').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const email = $('#login-email').value.trim().toLowerCase();
    const pass = $('#login-password').value;
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) { showAuthError(loginForm, 'No account found with that email.'); return; }
    if (user.password !== pass) { showAuthError(loginForm, 'Incorrect password.'); return; }
    setSession({ email: user.email, name: user.name });
    enterApp();
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const name = $('#signup-name').value.trim();
    const email = $('#signup-email').value.trim().toLowerCase();
    const pass = $('#signup-password').value;
    const confirm = $('#signup-confirm').value;
    if (pass !== confirm) { showAuthError(signupForm, 'Passwords do not match.'); return; }
    if (pass.length < 6) { showAuthError(signupForm, 'Password must be at least 6 characters.'); return; }
    const users = getUsers();
    if (users.find(u => u.email === email)) { showAuthError(signupForm, 'An account with that email already exists.'); return; }
    users.push({ name, email, password: pass });
    saveUsers(users);
    setSession({ email, name });
    enterApp();
  });

  // Forgot password — Step 1: find account by email
  forgotForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const email = $('#forgot-email').value.trim().toLowerCase();
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) {
      showAuthError(forgotForm, 'No account found with that email address.');
      return;
    }
    // Account found — show the reset password form
    resetEmail = email;
    forgotForm.classList.add('hidden');
    resetForm.classList.remove('hidden');
  });

  // Forgot password — Step 2: set new password
  resetForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAuthErrors();
    const newPass = $('#reset-new-password').value;
    const confirmPass = $('#reset-confirm-password').value;
    if (newPass.length < 6) { showAuthError(resetForm, 'Password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { showAuthError(resetForm, 'Passwords do not match.'); return; }
    // Update the password in localStorage
    const users = getUsers();
    const userIdx = users.findIndex(u => u.email === resetEmail);
    if (userIdx === -1) { showAuthError(resetForm, 'Something went wrong. Please try again.'); return; }
    users[userIdx].password = newPass;
    saveUsers(users);
    // Show success
    resetForm.classList.add('hidden');
    forgotSuccess.classList.remove('hidden');
    resetEmail = null;
  });

  // ═══════════════════════════════════════════
  //  THEME TOGGLE
  // ═══════════════════════════════════════════

  function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    const sunIcon = $('#theme-icon-sun');
    const moonIcon = $('#theme-icon-moon');
    const label = $('#theme-label');
    if (t === 'dark') {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
      label.textContent = 'Light Mode';
    } else {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
      label.textContent = 'Dark Mode';
    }
  }

  $('#nav-theme-toggle').addEventListener('click', () => {
    const next = getTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });

  // ═══════════════════════════════════════════
  //  SIDEBAR
  // ═══════════════════════════════════════════

  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('open');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('open');
  }

  hamburger.addEventListener('click', openSidebar);
  sidebarClose.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // Nav items
  $$('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
      closeSidebar();
    });
  });

  $('#nav-logout').addEventListener('click', () => {
    clearSession();
    closeSidebar();
    exitApp();
  });

  function switchView(view) {
    currentView = view;
    // Highlight active nav
    $$('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
    const activeNav = $(`.nav-item[data-view="${view}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Show/hide panels
    const isCalendar = view === 'calendar';
    viewTasks.classList.toggle('hidden', isCalendar);
    viewCalendar.classList.toggle('hidden', !isCalendar);
    statsRow.classList.toggle('hidden', isCalendar);

    // Titles
    const titles = {
      dashboard: 'Dashboard',
      active: 'Active Tasks',
      completed: 'Completed Tasks',
      overdue: 'Overdue Tasks',
      calendar: 'Calendar'
    };
    pageTitle.textContent = titles[view] || 'Dashboard';

    if (isCalendar) {
      renderCalendar();
    } else {
      renderTasks();
    }
  }

  // ═══════════════════════════════════════════
  //  TASK RENDERING
  // ═══════════════════════════════════════════

  function getFilteredTasks() {
    const q = searchInput.value.trim().toLowerCase();
    return tasks.filter(t => {
      if (currentView === 'active' && t.completed) return false;
      if (currentView === 'completed' && !t.completed) return false;
      if (currentView === 'overdue' && (t.completed || daysUntilDue(t.dueDate) >= 0)) return false;
      if (currentView === 'dashboard') { /* show all */ }
      if (q) {
        return t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
      }
      return true;
    });
  }

  function renderTasks() {
    const filtered = getFilteredTasks();
    taskListEl.innerHTML = '';

    if (filtered.length === 0) {
      emptyStateEl.classList.add('visible');
    } else {
      emptyStateEl.classList.remove('visible');
      filtered.forEach((task, i) => {
        const dlClass = deadlineClass(task.dueDate, task.completed);
        const card = document.createElement('div');
        card.className = `task-card${task.completed ? ' completed' : ''}${dlClass ? ' deadline-' + dlClass : ''}`;
        card.style.animationDelay = `${i * 0.04}s`;
        card.dataset.id = task.id;
        card.innerHTML = `
          <label class="task-checkbox">
            <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark ${escapeHTML(task.title)} as ${task.completed ? 'incomplete' : 'complete'}" />
            <span class="checkmark">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </span>
          </label>
          <div class="task-body">
            <div class="task-title">${escapeHTML(task.title)}</div>
            ${task.description ? `<div class="task-description">${escapeHTML(task.description)}</div>` : ''}
            <div class="task-meta">
              ${dueBadgeHTML(task.dueDate, task.completed)}
              ${priorityBadgeHTML(task.priority)}
            </div>
          </div>
          <div class="task-actions">
            <button class="task-action-btn edit" aria-label="Edit task" data-id="${task.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="task-action-btn delete" aria-label="Delete task" data-id="${task.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>`;
        taskListEl.appendChild(card);
      });
    }
    updateStats();
  }

  function updateStats() {
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const active = total - done;
    const overdue = tasks.filter(t => !t.completed && daysUntilDue(t.dueDate) < 0).length;
    $('#stat-total').textContent = total;
    $('#stat-active').textContent = active;
    $('#stat-done').textContent = done;
    $('#stat-overdue').textContent = overdue;
  }

  // ═══════════════════════════════════════════
  //  CALENDAR
  // ═══════════════════════════════════════════

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }

  function renderCalendar() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    calMonthLabel.textContent = `${monthNames[calMonth]} ${calYear}`;

    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build cells
    let html = '';
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      let day, dateStr, isOther = false;
      if (i < firstDay) {
        // Prev month
        day = daysInPrev - firstDay + i + 1;
        const pm = calMonth === 0 ? 11 : calMonth - 1;
        const py = calMonth === 0 ? calYear - 1 : calYear;
        dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        isOther = true;
      } else if (i - firstDay >= daysInMonth) {
        // Next month
        day = i - firstDay - daysInMonth + 1;
        const nm = calMonth === 11 ? 0 : calMonth + 1;
        const ny = calMonth === 11 ? calYear + 1 : calYear;
        dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        isOther = true;
      } else {
        day = i - firstDay + 1;
        dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }

      const cellDate = new Date(dateStr + 'T00:00:00');
      const isToday = cellDate.getTime() === today.getTime();

      // Tasks for this day
      const dayTasks = tasks.filter(t => t.dueDate === dateStr);

      html += `<div class="cal-cell${isOther ? ' other-month' : ''}${isToday ? ' today' : ''}">`;
      html += `<div class="cal-day-num">${day}</div>`;

      const maxShow = 3;
      dayTasks.slice(0, maxShow).forEach(t => {
        let dotCls = t.completed ? 'dot-completed' : 'dot-' + deadlineClass(t.dueDate, false);
        html += `<div class="cal-task-dot ${dotCls}" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</div>`;
      });
      if (dayTasks.length > maxShow) {
        html += `<div class="cal-more">+${dayTasks.length - maxShow} more</div>`;
      }

      html += '</div>';
    }

    calCells.innerHTML = html;
    // Make cal-cells span full grid
    calCells.style.display = 'contents';
  }

  $('#cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });

  $('#cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  $('#cal-today').addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    renderCalendar();
  });

  // ═══════════════════════════════════════════
  //  TASK CRUD
  // ═══════════════════════════════════════════

  function addTask(title, description, dueDate, priority) {
    tasks.unshift({ id: uuid(), title, description, dueDate, priority, completed: false, createdAt: Date.now() });
    saveTasks();
    renderTasks();
  }

  function updateTask(id, title, description, dueDate, priority) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.title = title;
    t.description = description;
    t.dueDate = dueDate;
    t.priority = priority;
    saveTasks();
    renderTasks();
  }

  function deleteTask(id) {
    const card = taskListEl.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.add('removing');
      setTimeout(() => { tasks = tasks.filter(x => x.id !== id); saveTasks(); renderTasks(); }, 300);
    } else {
      tasks = tasks.filter(x => x.id !== id);
      saveTasks();
      renderTasks();
    }
  }

  function toggleComplete(id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    saveTasks();
    renderTasks();
  }

  // ═══════════════════════════════════════════
  //  MODAL
  // ═══════════════════════════════════════════

  function openModal(editing = false) {
    modalTitle.textContent = editing ? 'Edit Task' : 'New Task';
    const saveSpan = $('#btn-save span');
    if (saveSpan) saveSpan.textContent = editing ? 'Update Task' : 'Save Task';
    modalOverlay.classList.add('open');
    setTimeout(() => fieldTitle.focus(), 100);
  }

  function closeModal() {
    modalOverlay.classList.remove('open');
    taskForm.reset();
    editingId = null;
  }

  function openDeleteModal(id) {
    deletingId = id;
    deleteOverlay.classList.add('open');
  }

  function closeDeleteModal() {
    deleteOverlay.classList.remove('open');
    deletingId = null;
  }

  // Modal events
  $('#btn-add-task').addEventListener('click', () => {
    editingId = null;
    taskForm.reset();
    fieldDate.value = new Date().toISOString().split('T')[0];
    openModal(false);
  });

  $('#btn-close-modal').addEventListener('click', closeModal);
  $('#btn-cancel').addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

  $('#btn-close-delete').addEventListener('click', closeDeleteModal);
  $('#btn-cancel-delete').addEventListener('click', closeDeleteModal);
  deleteOverlay.addEventListener('click', e => { if (e.target === deleteOverlay) closeDeleteModal(); });
  $('#btn-confirm-delete').addEventListener('click', () => { if (deletingId) { deleteTask(deletingId); closeDeleteModal(); } });

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = fieldTitle.value.trim();
    const desc = fieldDesc.value.trim();
    const date = fieldDate.value;
    const prio = fieldPriority.value;
    if (!title || !date) return;
    if (editingId) updateTask(editingId, title, desc, date, prio);
    else addTask(title, desc, date, prio);
    closeModal();
    // If on calendar, refresh
    if (currentView === 'calendar') renderCalendar();
  });

  // Task list delegation
  taskListEl.addEventListener('click', (e) => {
    const cb = e.target.closest('.task-checkbox input');
    if (cb) { toggleComplete(cb.closest('.task-card').dataset.id); return; }

    const editBtn = e.target.closest('.task-action-btn.edit');
    if (editBtn) {
      const t = tasks.find(x => x.id === editBtn.dataset.id);
      if (!t) return;
      editingId = t.id;
      fieldTitle.value = t.title;
      fieldDesc.value = t.description || '';
      fieldDate.value = t.dueDate;
      fieldPriority.value = t.priority;
      openModal(true);
      return;
    }

    const delBtn = e.target.closest('.task-action-btn.delete');
    if (delBtn) openDeleteModal(delBtn.dataset.id);
  });

  // Search
  searchInput.addEventListener('input', () => {
    if (currentView === 'calendar') return;
    renderTasks();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (deleteOverlay.classList.contains('open')) closeDeleteModal();
      else if (modalOverlay.classList.contains('open')) closeModal();
      else if (sidebar.classList.contains('open')) closeSidebar();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      if (!appContainer.classList.contains('hidden')) $('#btn-add-task').click();
    }
  });

  // ═══════════════════════════════════════════
  //  REMINDERS
  // ═══════════════════════════════════════════

  function checkReminders() {
    tasks.forEach(t => {
      if (t.completed || reminderShown.has(t.id)) return;
      const d = daysUntilDue(t.dueDate);
      if (d >= 0 && d <= 1) {
        reminderShown.add(t.id);
        showToast(t.title, d === 0 ? 'This task is due today!' : 'This task is due tomorrow!');
      } else if (d < 0) {
        reminderShown.add(t.id);
        showToast(t.title, `This task is overdue by ${Math.abs(d)} day${Math.abs(d) > 1 ? 's' : ''}!`);
      }
    });
  }

  function showToast(title, message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `
      <div class="toast-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="toast-content">
        <div class="toast-title">${escapeHTML(title)}</div>
        <div class="toast-msg">${escapeHTML(message)}</div>
      </div>
      <button class="toast-close" aria-label="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    toastContainer.appendChild(el);
    const dismiss = () => { el.classList.add('removing'); setTimeout(() => el.remove(), 300); };
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    setTimeout(dismiss, 6000);
  }

  // ═══════════════════════════════════════════
  //  APP ENTER / EXIT
  // ═══════════════════════════════════════════

  function enterApp() {
    const session = getSession();
    if (!session) return;
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    // Set user initial
    const initial = (session.name || session.email || 'U').charAt(0).toUpperCase();
    $('#user-initial').textContent = initial;
    $('#user-avatar').title = session.name || session.email;
    loadTasks();
    initCalendar();
    switchView('dashboard');
    setTimeout(checkReminders, 800);
    setInterval(checkReminders, 60000);
  }

  function exitApp() {
    appContainer.classList.add('hidden');
    authContainer.classList.remove('hidden');
    tasks = [];
    reminderShown.clear();
    showAuthForm('login');
    // Clear form inputs
    loginForm.reset();
    signupForm.reset();
    forgotForm.reset();
    resetForm.reset();
  }

  // ═══════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════

  function init() {
    applyTheme(getTheme());
    const session = getSession();
    if (session) {
      enterApp();
    } else {
      authContainer.classList.remove('hidden');
      appContainer.classList.add('hidden');
    }
  }

  init();
})();
