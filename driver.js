// driver.js controller for Driver Interface

// =================================================================
// アプリケーション状態 (State)
// =================================================================
let state = {
  user: null,
  view: 'auth', // 'auth' | 'driver'
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
  selectedDates: new Map(), // 申請作成中の日付Map: 'YYYY-MM-DD' => { reason: '理由' }
  monthlyRequests: [], // 取得した当月の申請リスト
  drivers: [], // ドライバーリスト
  allRequests: [], // 全員の申請リスト
  shifts: [], // 当月の確定/下書きシフトデータ
  shiftPublishStatus: 'draft', // 当月の公開ステータス 'draft' | 'published'
  centers: [], // 所属センター・局マスタ一覧
  shiftTypes: [], // シフト表示区分マスタ一覧
};

// HSLカラー生成関数 (センター名から一意の色相を生成して直感的に色分け)
function getCenterColor(name) {
  if (!name) return 'var(--accent-color)';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 65%, 40%)`;
}

// =================================================================
// DOM要素の取得
// =================================================================
const elements = {
  // 認証関連
  authScreen: document.getElementById('auth-screen'),
  loginCard: document.getElementById('login-card'),
  signupCard: document.getElementById('signup-card'),
  loginForm: document.getElementById('login-form'),
  signupForm: document.getElementById('signup-form'),
  toSignup: document.getElementById('to-signup'),
  toLogin: document.getElementById('to-login'),

  // メインレイアウト
  appHeader: document.getElementById('app-header'),
  userNameDisplay: document.getElementById('user-name-display'),
  userRoleDisplay: document.getElementById('user-role-display'),
  connectionBadge: document.getElementById('connection-badge'),
  logoutBtn: document.getElementById('logout-btn'),

  // ダッシュボードビュー
  driverView: document.getElementById('driver-view'),

  // ドライバー画面要素
  driverCalendarMonth: document.getElementById('driver-calendar-month'),
  prevMonthBtn: document.getElementById('prev-month-btn'),
  nextMonthBtn: document.getElementById('next-month-btn'),
  driverCalendarGrid: document.getElementById('driver-calendar-grid'),
  draftRequestsList: document.getElementById('draft-requests-list'),
  submitRequestsBtn: document.getElementById('submit-requests-btn'),
  statTotal: document.getElementById('stat-total'),
  statApproved: document.getElementById('stat-approved'),
  statPending: document.getElementById('stat-pending'),
  shiftStatusBanner: document.getElementById('shift-status-banner'),
  shiftStatusText: document.getElementById('shift-status-text'),
  tabBtnDriverRequest: document.getElementById('tab-btn-driver-request'),
  tabBtnDriverShift: document.getElementById('tab-btn-driver-shift'),
  driverRequestPane: document.getElementById('driver-request-pane'),
  driverShiftPane: document.getElementById('driver-shift-pane'),
  driverShiftPrevMonthBtn: document.getElementById('driver-shift-prev-month-btn'),
  driverShiftCalendarMonth: document.getElementById('driver-shift-calendar-month'),
  driverShiftNextMonthBtn: document.getElementById('driver-shift-next-month-btn'),
  driverShiftGridContainer: document.getElementById('driver-shift-grid-container'),
  btnDriverDownloadPdf: document.getElementById('btn-driver-download-pdf'),

  // モーダル関連
  detailModal: document.getElementById('detail-modal'),
  detailDateLabel: document.getElementById('detail-date-label'),
  detailStatusBadge: document.getElementById('detail-status-badge'),
  detailAdminComment: document.getElementById('detail-admin-comment'),
  detailCancelBtn: document.getElementById('detail-cancel-btn'),
  closeDetailBtn: document.getElementById('close-detail-btn'),
};

// =================================================================
// トースト通知システム (Toast System)
// =================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  
  // フェードイン
  setTimeout(() => toast.classList.add('active'), 50);
  
  // 3秒後に削除
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =================================================================
// 画面ルーティング表示切り替え
// =================================================================
function showView(viewName) {
  state.view = viewName;
  document.body.style.overflow = '';
  
  elements.authScreen.classList.add('hidden');
  elements.driverView.classList.add('hidden');
  elements.appHeader.classList.add('hidden');

  if (viewName === 'auth') {
    elements.authScreen.classList.remove('hidden');
    elements.loginCard.classList.remove('hidden');
    elements.signupCard.classList.add('hidden');

    const passwordInput = document.getElementById('login-password');
    if (passwordInput) {
      setTimeout(() => passwordInput.focus(), 50);
    }
  } else {
    elements.appHeader.classList.remove('hidden');
    updateHeaderUI();

    if (viewName === 'driver') {
      elements.driverView.classList.remove('hidden');
      
      // タブ初期リセット
      if (elements.tabBtnDriverRequest && elements.tabBtnDriverShift) {
        elements.tabBtnDriverRequest.classList.add('active');
        elements.tabBtnDriverShift.classList.remove('active');
        elements.tabBtnDriverRequest.style.color = 'var(--text-main)';
        elements.tabBtnDriverShift.style.color = 'var(--text-muted)';
        elements.driverRequestPane.classList.remove('hidden');
        elements.driverShiftPane.classList.add('hidden');
      }

      loadDriverDashboard();
    }
  }
}

// ヘッダーUIの同期
function updateHeaderUI() {
  if (!state.user) return;
  elements.userNameDisplay.textContent = state.user.name;
  
  const stationSuffix = state.user.center_station ? ` (${state.user.center_station})` : '';
  elements.userRoleDisplay.textContent = `ドライバー${stationSuffix}`;
  elements.userRoleDisplay.className = 'user-role-badge';

  const mode = db.getMode();
  elements.connectionBadge.className = `connection-badge ${mode}`;
  const text = elements.connectionBadge.querySelector('span');
  if (mode === 'live') {
    text.textContent = 'Supabase 接続中';
  } else {
    text.textContent = 'デモモード運転中';
  }
}

// =================================================================
// 認証フロー (Auth Actions)
// =================================================================
async function handleLogin(e) {
  e.preventDefault();
  
  const password = document.getElementById('login-password').value;
  if (!password) {
    showToast("パスワードを入力してください。", "warning");
    return;
  }

  try {
    const passcodeHash = await hashPassword(password);
    const profile = await db.getProfileByPasscode(passcodeHash);
    if (!profile || profile.role !== 'driver') {
      showToast("パスワードが正しくありません、またはドライバーとして登録されていません。", "error");
      return;
    }
    const email = profile.email;
    const user = await db.signIn(email, password);
    state.user = user;
    
    localStorage.setItem('last_login_email', user.email);
    localStorage.setItem('last_login_name', user.name);
    
    showToast(`${user.name}としてログインしました。`);
    showView('driver');
    elements.loginForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const name = document.getElementById('signup-name').value.trim();
  const centerStation = null;
  const licenseType = null;
  const role = 'driver';

  try {
    const passcodeHash = await hashPassword(password);
    const exists = await db.checkPasscodeExists(passcodeHash);
    if (exists) {
      showToast("このパスワードはすでに使用されています。異なるパスワードを設定してください。", "error");
      return;
    }

    const user = await db.signUp(email, password, name, role, licenseType, centerStation);
    localStorage.setItem('last_login_email', email);
    localStorage.setItem('last_login_name', name);
    showToast('登録が完了しました。');
    
    const currentUser = db.getCurrentUser();
    if (currentUser) {
      state.user = currentUser;
      showView('driver');
    } else {
      showToast('確認メールを送付しました。確認後にログインしてください。', 'warning');
      showView('auth');
    }
    elements.signupForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  await db.signOut();
  state.user = null;
  state.selectedDates.clear();
  showToast('ログアウトしました。');
  showView('auth');
}

// =================================================================
// ドライバー画面制御ロジック (Driver Actions)
// =================================================================
async function loadDriverDashboard() {
  if (!state.user) return;
  
  try {
    checkDeadlineBanner();

    state.monthlyRequests = await db.getOffDayRequests(state.user.id, state.currentYear, state.currentMonth);
    state.shifts = await db.getShifts(state.currentYear, state.currentMonth);
    state.shiftPublishStatus = await db.getShiftPublishStatus(state.currentYear, state.currentMonth);
    state.drivers = await db.getAllDrivers(state.currentYear, state.currentMonth);
    
    const myProfile = state.drivers.find(d => d.id === state.user.id);
    if (myProfile) {
      state.user.center_station = myProfile.center_station;
      if (db.getMode() === 'demo') {
        localStorage.setItem('driver_demo_session', JSON.stringify(state.user));
      }
      updateHeaderUI();
    }

    state.centers = await db.getCenters();
    state.shiftTypes = await db.getShiftTypes();

    updateShiftStatusBanner();
    renderDriverCalendar();
    updateDriverSidePanel();
    updateDriverStats();
    renderDriverShiftGrid();
  } catch (err) {
    showToast("データロード失敗: " + err.message, 'error');
  }
}

function updateShiftStatusBanner() {
  if (!elements.shiftStatusBanner || !elements.shiftStatusText) return;
  
  if (state.shiftPublishStatus === 'published') {
    elements.shiftStatusBanner.classList.add('published');
    elements.shiftStatusText.innerHTML = `<strong>${state.currentMonth}月シフトが確定公開されました！</strong> カレンダー上の出勤・公休予定をご確認ください。`;
  } else {
    elements.shiftStatusBanner.classList.remove('published');
    elements.shiftStatusText.innerHTML = `<strong>${state.currentMonth}月シフトは調整中（未確定）です。</strong> 確定までしばらくお待ちください。`;
  }
}

function checkDeadlineBanner() {
  const banner = document.getElementById('deadline-banner');
  if (!banner) return;

  const today = new Date();
  const currentDay = today.getDate();

  if (currentDay >= 15 && currentDay <= 20) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

function renderDriverCalendar() {
  elements.driverCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  elements.driverCalendarGrid.innerHTML = '';

  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = day;
    elements.driverCalendarGrid.appendChild(el);
  });

  const firstDay = new Date(state.currentYear, state.currentMonth - 1, 1);
  const startDayOfWeek = firstDay.getDay();
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const prevMonthLastDay = new Date(state.currentYear, state.currentMonth - 1, 0).getDate();

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cell other-month';
    cell.innerHTML = `<span class="day-number">${prevMonthLastDay - i}</span>`;
    elements.driverCalendarGrid.appendChild(cell);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= lastDay; day++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cellDate = new Date(state.currentYear, state.currentMonth - 1, day);
    
    cell.innerHTML = `<span class="day-number">${day}</span>`;
    
    const isPast = cellDate < today;
    if (isPast) {
      cell.classList.add('past-date');
    }

    const req = state.monthlyRequests.find(r => r.request_date === dateStr);
    const draft = state.selectedDates.get(dateStr);

    if (state.shiftPublishStatus === 'published') {
      const dayShift = state.shifts.find(s => s.driver_id === state.user.id && s.shift_date === dateStr);
      const isApprovedRequest = state.monthlyRequests.some(r => r.request_date === dateStr && r.status === 'approved');
      const shiftType = dayShift ? dayShift.shift_type : (isApprovedRequest ? 'hope_off' : 'work');
      const assignedCenter = dayShift ? dayShift.assigned_center : null;

      const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
      const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');

      if (isWork) {
        cell.classList.add('shift-work');
      } else {
        if (isApprovedRequest || shiftType === 'hope_off') {
          cell.classList.add('shift-hope-off');
        } else {
          cell.classList.add('shift-off');
        }
      }
    } else {
      if (req) {
        cell.classList.add(`status-${req.status}`);
      } else if (draft) {
        cell.classList.add('status-selected');
      }
    }

    if (!isPast) {
      cell.addEventListener('click', () => handleDateClick(dateStr, req, draft));
    } else if (req) {
      cell.addEventListener('click', () => showDetailModal(req));
    }

    elements.driverCalendarGrid.appendChild(cell);
  }
}

function handleDateClick(dateStr, existingRequest, draftRequest) {
  if (state.shiftPublishStatus === 'published') {
    if (existingRequest) {
      showDetailModal(existingRequest);
    } else {
      showToast("この月のシフトは既に確定・公開されているため、新規の希望休選択・変更はできません。", "warning");
    }
    return;
  }

  if (existingRequest) {
    showDetailModal(existingRequest);
  } else {
    if (draftRequest) {
      state.selectedDates.delete(dateStr);
    } else {
      state.selectedDates.set(dateStr, { reason: '' });
    }
    loadDriverDashboard();
  }
}

function showDetailModal(req) {
  elements.detailDateLabel.textContent = formatDateJapanese(req.request_date);
  
  const statusTexts = { pending: '保留中', approved: '承認済み', rejected: '却下' };
  elements.detailStatusBadge.textContent = statusTexts[req.status];
  elements.detailStatusBadge.className = `badge ${req.status}`;
  
  if (req.admin_comment) {
    elements.detailAdminComment.textContent = req.admin_comment;
    elements.detailAdminComment.parentElement.classList.remove('hidden');
    if (req.status === 'rejected') {
      elements.detailAdminComment.className = 'admin-comment-box rejected';
    } else {
      elements.detailAdminComment.className = 'admin-comment-box';
    }
  } else {
    elements.detailAdminComment.parentElement.classList.add('hidden');
  }

  if (req.status === 'pending') {
    elements.detailCancelBtn.classList.remove('hidden');
    elements.detailCancelBtn.onclick = async () => {
      if (confirm('この希望休申請を取り消しますか？')) {
        try {
          await db.deleteOffDayRequest(req.id);
          showToast('申請を取り消しました。');
          closeModal(elements.detailModal);
          loadDriverDashboard();
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    };
  } else {
    elements.detailCancelBtn.classList.add('hidden');
  }

  openModal(elements.detailModal);
}

function updateDriverSidePanel() {
  elements.draftRequestsList.innerHTML = '';
  
  const today = new Date();
  const currentDay = today.getDate();
  const isSubmissionBlocked = currentDay >= 21;
  
  const introEl = document.querySelector('.panel-intro');
  if (introEl) {
    if (isSubmissionBlocked) {
      introEl.innerHTML = `<span style="color:var(--rejected); font-weight:600">⚠️ 現在（21日〜月末）は申請期間外のため送信できません。<br>(申請受付期間：毎月1日〜20日)</span>`;
    } else {
      introEl.innerHTML = `カレンダーで日付を複数選択し、内容を確認して送信してください。終日単位のみ、日数の上限はありません。<br><span style="color:var(--pending); font-weight:600">※今月の提出期限は20日までです。</span>`;
    }
  }

  if (state.selectedDates.size === 0) {
    elements.draftRequestsList.innerHTML = `
      <div class="empty-state">
        カレンダーの日付をクリックして、希望休（終日）を追加してください。<br>希望休日数の制限はありません。
      </div>
    `;
    elements.submitRequestsBtn.disabled = true;
    return;
  }

  if (isSubmissionBlocked) {
    elements.submitRequestsBtn.disabled = true;
    elements.submitRequestsBtn.title = "毎月21日〜月末は申請期間外のため、送信できません。";
  } else {
    elements.submitRequestsBtn.disabled = false;
    elements.submitRequestsBtn.title = "";
  }
  
  const sortedDates = Array.from(state.selectedDates.keys()).sort();
  
  sortedDates.forEach(dateStr => {
    const item = state.selectedDates.get(dateStr);
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="req-header">
        <span class="req-date">${formatDateJapanese(dateStr)}</span>
        <span class="badge draft">選択中</span>
      </div>
      <button class="req-delete" title="削除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    `;
    
    card.querySelector('.req-delete').addEventListener('click', () => {
      state.selectedDates.delete(dateStr);
      loadDriverDashboard();
    });

    elements.draftRequestsList.appendChild(card);
  });
}

async function submitAllRequests() {
  if (state.selectedDates.size === 0) return;
  
  const today = new Date();
  if (today.getDate() >= 21) {
    showToast("申請期間外（毎月21日〜月末）のため、希望休を送信できません。", "error");
    return;
  }
  
  elements.submitRequestsBtn.disabled = true;
  const originalText = elements.submitRequestsBtn.innerHTML;
  elements.submitRequestsBtn.innerHTML = `<span class="spinner"></span> 送信中...`;

  try {
    let successCount = 0;
    const submittedDetails = [];
    for (const [dateStr, info] of state.selectedDates.entries()) {
      await db.submitOffDayRequest(state.user.id, dateStr, info.reason);
      submittedDetails.push({ date: dateStr, reason: info.reason || '（なし）' });
      successCount++;
    }
    showToast(`${successCount}件の希望休を送信しました！`);
    state.selectedDates.clear();
    await loadDriverDashboard();

    const gasUrl = localStorage.getItem('gas_notification_url');
    if (gasUrl && submittedDetails.length > 0) {
      sendGasEmailNotification(gasUrl, state.user, submittedDetails).catch(err => {
        console.error("メール通知の送信に失敗しました:", err);
      });
    }
  } catch (err) {
    showToast("送信エラー: " + err.message, 'error');
  } finally {
    elements.submitRequestsBtn.innerHTML = originalText;
    elements.submitRequestsBtn.disabled = false;
  }
}

async function sendGasEmailNotification(gasUrl, user, submittedDetails) {
  try {
    const payload = {
      driverName: user.name,
      driverEmail: user.email || "不明",
      requests: submittedDetails
    };

    await fetch(gasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });
    console.log("Notification request sent via GAS.");
  } catch (error) {
    console.error("Failed to send GAS notification:", error);
  }
}

function updateDriverStats() {
  const allCount = state.monthlyRequests.length;
  const approvedCount = state.monthlyRequests.filter(r => r.status === 'approved').length;
  const pendingCount = state.monthlyRequests.filter(r => r.status === 'pending').length;
  
  elements.statTotal.textContent = allCount + "日";
  elements.statApproved.textContent = approvedCount + "日";
  elements.statPending.textContent = pendingCount + "日";
}

function renderDriverShiftGrid() {
  if (!elements.driverShiftGridContainer) return;

  const monthTitle = document.getElementById('driver-shift-calendar-month');
  if (monthTitle) {
    monthTitle.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  }

  const paneTitle = document.getElementById('driver-shift-pane-title');
  if (paneTitle) {
    paneTitle.textContent = `確定シフト表`;
  }

  if (state.shiftPublishStatus !== 'published') {
    elements.driverShiftGridContainer.innerHTML = `
      <div class="empty-state" style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        🔒 当月のシフトは現在調整中（未確定）です。確定・公開までお待ちください。
      </div>
    `;
    return;
  }

  if (state.drivers.length === 0) {
    elements.driverShiftGridContainer.innerHTML = `
      <div class="empty-state" style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        ドライバーが登録されていません。
      </div>
    `;
    return;
  }

  const myStations = state.user && state.user.center_station 
    ? state.user.center_station.split(',').map(s => s.trim()) 
    : [];

  const stationsToRender = myStations.length === 0 ? ['all'] : myStations;
  let html = '';

  stationsToRender.forEach((stationName, idx) => {
    const filteredDrivers = state.drivers.filter(d => {
      if (stationName === 'all') return true;
      const dStations = d.center_station ? d.center_station.split(',').map(s => s.trim()) : [];
      return dStations.includes(stationName);
    });

    if (filteredDrivers.length === 0 && stationName !== 'all') {
      return;
    }

    const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
    
    html += `<div class="station-shift-section" style="margin: 1.25rem; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255,255,255,0.01); overflow: hidden;">`;
    
    if (stationName !== 'all') {
      html += `<h3 style="font-size: 1.05rem; padding: 0.75rem 1.25rem; background: rgba(255,255,255,0.02); margin: 0; border-bottom: 1px solid var(--border-color); font-weight: 700; color: var(--accent-color); display: flex; align-items: center; gap: 0.5rem;">🏢 ${stationName}</h3>`;
    }
    
    html += `<div class="shift-table-wrapper"><table class="shift-table"><thead><tr>`;
    html += `<th class="driver-name-col">ドライバー名</th>`;
    const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(state.currentYear, state.currentMonth - 1, day);
      const dayOfWeek = date.getDay();
      const dayOfWeekStr = dayNames[dayOfWeek];
      
      let colorStyle = "";
      if (dayOfWeek === 0) {
        colorStyle = "color: var(--rejected);";
      } else if (dayOfWeek === 6) {
        colorStyle = "color: var(--accent-color);";
      }
      
      html += `<th>${day}<br><span style="font-size: 0.65rem; font-weight: normal; opacity: 0.85; ${colorStyle}">(${dayOfWeekStr})</span></th>`;
    }
    html += `<th class="shift-stat-col">出勤日数</th>`;
    html += `</tr></thead><tbody>`;

    filteredDrivers.forEach(drv => {
      html += `<tr>`;
      const isMe = drv.id === state.user.id;
      const nameStyle = isMe ? 'font-weight: 700; color: var(--accent-color);' : '';
      
      html += `<td class="driver-name-col" style="${nameStyle}">${drv.name} ${isMe ? '(自分)' : ''}</td>`;
      
      let workCount = 0;

      for (let day = 1; day <= lastDay; day++) {
        const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
        const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
        const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
        const assignedCenter = dayShift ? dayShift.assigned_center : null;

        const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
        const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');

        if (isWork) {
          const displayText = typeMatch ? typeMatch.name : '出勤';
          html += `<td class="shift-cell work" style="cursor: default;" title="${displayText}">${displayText}</td>`;
          workCount++;
        } else {
          const displayText = typeMatch ? typeMatch.name : (req ? '希望' : '休');
          html += `<td class="shift-cell hope_off" style="cursor: default;" title="${displayText}">${displayText}</td>`;
        }
      }

      html += `<td class="shift-stat-col">${workCount}日</td>`;
      html += `</tr>`;
    });

    html += `<tr class="sufficiency-row">`;
    html += `<td class="driver-name-col">稼働状況</td>`;
    
    // ドライバー画面側は簡易表示用のため、2名固定または設定から取得
    const reqCount = 2; // ドライバー画面は表示のみ

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      let scheduledCount = 0;
      filteredDrivers.forEach(drv => {
        const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
        const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
        const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
        const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
        const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');
        if (isWork) scheduledCount++;
      });

      const isSufficient = scheduledCount >= reqCount;
      const cellClass = isSufficient ? 'sufficient' : 'insufficient';
      html += `<td class="${cellClass}" title="${isSufficient ? '基準達成' : '要員不足'}">${scheduledCount}/${reqCount}</td>`;
    }

    html += `<td></td></tr></tbody></table></div></div>`;
  });

  elements.driverShiftGridContainer.innerHTML = html || `
    <div class="empty-state" style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
      表示可能な所属先のシフト表がありません。
    </div>
  `;
}

function downloadDriverShiftPdf() {
  const printWindow = window.open('', '_blank');
  const displayTitle = `${state.currentYear}年 ${state.currentMonth}月 確定シフト表`;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${displayTitle}</title>
      <style>
        @page {
          size: A4 landscape;
          margin: 8mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans JP", sans-serif;
          color: #111;
          background: #fff;
          margin: 0;
          padding: 5px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          border-bottom: 2px solid #333;
          padding-bottom: 5px;
        }
        .logo {
          font-size: 1.1rem;
          font-weight: bold;
          color: #0056b3;
        }
        .title {
          font-size: 1.3rem;
          font-weight: bold;
          margin: 0;
        }
        .meta-info {
          font-size: 0.8rem;
          text-align: right;
          color: #555;
        }
        
        .station-shift-section {
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        .station-title {
          font-size: 1rem;
          font-weight: bold;
          margin: 0 0 8px 0;
          color: #0056b3;
        }
        
        .shift-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.7rem;
          text-align: center;
        }
        .shift-table th, .shift-table td {
          border: 1px solid #aaa;
          padding: 3px 1px;
          height: 24px;
          vertical-align: middle;
        }
        .shift-table th {
          background-color: #f0f0f0;
          font-weight: bold;
          color: #222;
        }
        .shift-table th.driver-name-col, .shift-table td.driver-name-col {
          width: 100px;
          text-align: left;
          font-weight: bold;
          background-color: #fbfbfb;
          padding-left: 4px;
        }
        
        .shift-cell.work {
          background-color: #fff;
        }
        .shift-cell.hope_off {
          background-color: #ffebee;
          color: #c62828;
          font-weight: bold;
        }
        
        .sufficiency-row {
          background-color: #f7f7f7;
          font-weight: bold;
        }
        .sufficiency-row td.sufficient {
          color: #2e7d32;
        }
        .sufficiency-row td.insufficient {
          color: #c62828;
          background-color: #ffebee;
        }
        
        .center-badge {
          display: inline-block;
          color: #fff;
          padding: 1px 4px;
          border-radius: 3px;
          font-size: 0.65rem;
          font-weight: bold;
          white-space: nowrap;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">株式会社enTrust 希望休管理 (ドライバー用)</div>
        <h1 class="title">${displayTitle}</h1>
        <div class="meta-info">出力日時: ${new Date().toLocaleString('ja-JP')}</div>
      </div>
  `;

  const gridContainer = document.getElementById('driver-shift-grid-container');
  if (gridContainer) {
    const cloned = gridContainer.cloneNode(true);
    
    cloned.querySelectorAll('.station-shift-section').forEach(sect => {
      const headerTitle = sect.querySelector('h3') ? sect.querySelector('h3').textContent.trim() : '';
      const tableWrapper = sect.querySelector('.shift-table-wrapper');
      if (tableWrapper) {
        html += `
          <div class="station-shift-section">
            ${headerTitle ? `<h2 class="station-title">${headerTitle}</h2>` : ''}
            ${tableWrapper.innerHTML}
          </div>
        `;
      }
    });
  }

  html += `
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
}

// =================================================================
// ヘルパー・モーダル・初期化処理
// =================================================================
function formatDateJapanese(dateStr) {
  const date = new Date(dateStr);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = dayNames[date.getDay()];
  return `${m}月${d}日 (${dayOfWeek})`;
}

function openModal(modalEl) {
  modalEl.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(modalEl) {
  modalEl.classList.remove('active');
  document.body.style.overflow = '';
}

async function initApp() {
  const { mode, user } = await db.init();
  state.user = user;
  
  if (user && user.role === 'driver') {
    showView('driver');
  } else {
    // 管理者がドライバー画面を開いた場合はログアウト
    if (user && user.role === 'admin') {
      await db.signOut();
      state.user = null;
    }
    showView('auth');
  }

  // イベントリスナーの登録
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.signupForm.addEventListener('submit', handleSignup);
  
  elements.toSignup.addEventListener('click', () => {
    elements.loginCard.classList.add('hidden');
    elements.signupCard.classList.remove('hidden');
  });
  
  elements.toLogin.addEventListener('click', () => {
    elements.signupCard.classList.add('hidden');
    elements.loginCard.classList.remove('hidden');
  });
  
  elements.logoutBtn.addEventListener('click', handleLogout);

  elements.prevMonthBtn.addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 1) {
      state.currentMonth = 12;
      state.currentYear--;
    }
    loadDriverDashboard();
  });
  
  elements.nextMonthBtn.addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 12) {
      state.currentMonth = 1;
      state.currentYear++;
    }
    loadDriverDashboard();
  });

  elements.submitRequestsBtn.addEventListener('click', submitAllRequests);

  if (elements.tabBtnDriverRequest && elements.tabBtnDriverShift) {
    elements.tabBtnDriverRequest.addEventListener('click', () => {
      elements.tabBtnDriverRequest.classList.add('active');
      elements.tabBtnDriverShift.classList.remove('active');
      elements.tabBtnDriverRequest.style.color = 'var(--text-main)';
      elements.tabBtnDriverShift.style.color = 'var(--text-muted)';
      elements.driverRequestPane.classList.remove('hidden');
      elements.driverShiftPane.classList.add('hidden');
    });

    elements.tabBtnDriverShift.addEventListener('click', () => {
      elements.tabBtnDriverShift.classList.add('active');
      elements.tabBtnDriverRequest.classList.remove('active');
      elements.tabBtnDriverShift.style.color = 'var(--text-main)';
      elements.tabBtnDriverRequest.style.color = 'var(--text-muted)';
      elements.driverShiftPane.classList.remove('hidden');
      elements.driverRequestPane.classList.add('hidden');
      renderDriverShiftGrid();
    });
  }

  if (elements.driverShiftPrevMonthBtn) {
    elements.driverShiftPrevMonthBtn.addEventListener('click', () => {
      state.currentMonth--;
      if (state.currentMonth < 1) {
        state.currentMonth = 12;
        state.currentYear--;
      }
      loadDriverDashboard();
    });
  }
  
  if (elements.driverShiftNextMonthBtn) {
    elements.driverShiftNextMonthBtn.addEventListener('click', () => {
      state.currentMonth++;
      if (state.currentMonth > 12) {
        state.currentMonth = 1;
        state.currentYear++;
      }
      loadDriverDashboard();
    });
  }

  if (elements.btnDriverDownloadPdf) {
    elements.btnDriverDownloadPdf.addEventListener('click', downloadDriverShiftPdf);
  }

  elements.closeDetailBtn.addEventListener('click', () => closeModal(elements.detailModal));
  
  window.addEventListener('click', (e) => {
    if (e.target === elements.detailModal) closeModal(elements.detailModal);
  });
}

document.addEventListener('DOMContentLoaded', initApp);
