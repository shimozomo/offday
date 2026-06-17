// app.js controller

// =================================================================
// アプリケーション状態 (State)
// =================================================================
let state = {
  user: null,
  view: 'auth', // 'auth' | 'driver' | 'admin'
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
  selectedDates: new Map(), // 申請作成中の日付Map: 'YYYY-MM-DD' => { reason: '理由' }
  monthlyRequests: [], // 取得した当月の申請リスト
  drivers: [], // 管理者用: ドライバーリスト
  allRequests: [], // 管理者用: 全員の申請リスト
};

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
  settingsBtn: document.getElementById('settings-btn'),

  // ダッシュボードビュー
  driverView: document.getElementById('driver-view'),
  adminView: document.getElementById('admin-view'),

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

  // 管理者画面要素
  adminCalendarMonth: document.getElementById('admin-calendar-month'),
  adminPrevMonthBtn: document.getElementById('admin-prev-month-btn'),
  adminNextMonthBtn: document.getElementById('admin-next-month-btn'),
  adminCalendarGrid: document.getElementById('admin-calendar-grid'),
  approvalQueueList: document.getElementById('approval-queue-list'),
  rosterList: document.getElementById('roster-list'),

  // モーダル関連
  settingsModal: document.getElementById('settings-modal'),
  settingsForm: document.getElementById('settings-form'),
  closeSettingsBtn: document.getElementById('close-settings-btn'),
  dbModeSelect: document.getElementById('db-mode-select'),
  dbCredentialsSection: document.getElementById('db-credentials-section'),
  switchToDemoBtn: document.getElementById('switch-to-demo-btn'),
  
  // 申請詳細ダイアログ (クリック時)
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
  toast.innerHTML = `
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // フェードインアニメーション
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
  
  // 画面遷移時にスクロールロックを確実に解除する
  document.body.style.overflow = '';
  
  // 全画面を非表示に
  elements.authScreen.classList.add('hidden');
  elements.driverView.classList.add('hidden');
  elements.adminView.classList.add('hidden');
  elements.appHeader.classList.add('hidden');

  if (viewName === 'auth') {
    elements.authScreen.classList.remove('hidden');
    elements.loginCard.classList.remove('hidden');
    elements.signupCard.classList.add('hidden');

    // 前回ログイン時の情報を復元
    const subtitleEl = document.querySelector('#login-card .auth-subtitle');
    const emailInput = document.getElementById('login-email');
    if (emailInput) {
      const savedEmail = localStorage.getItem('last_login_email');
      if (savedEmail) emailInput.value = savedEmail;
    }
    
    setTimeout(() => {
      const passwordInput = document.getElementById('login-password');
      if (passwordInput) passwordInput.focus();
    }, 50);
    
    if (subtitleEl) {
      subtitleEl.textContent = '申請期限毎月20日まで';
    }
  } else {
    elements.appHeader.classList.remove('hidden');
    updateHeaderUI();

    if (viewName === 'driver') {
      elements.driverView.classList.remove('hidden');
      loadDriverDashboard();
    } else if (viewName === 'admin') {
      elements.adminView.classList.remove('hidden');
      loadAdminDashboard();
    }
  }
}

// ヘッダーUIの同期
function updateHeaderUI() {
  if (!state.user) return;
  elements.userNameDisplay.textContent = state.user.name;
  
  if (state.user.role === 'admin') {
    elements.userRoleDisplay.textContent = '管理者';
    elements.userRoleDisplay.className = 'user-role-badge admin';
    // 管理者のみ設定ボタンを表示する
    elements.settingsBtn.classList.remove('hidden');
  } else {
    elements.userRoleDisplay.textContent = `ドライバー (${state.user.driver_license_type || '普通'}免許)`;
    elements.userRoleDisplay.className = 'user-role-badge';
    // ドライバーの場合は設定ボタンを非表示にする
    elements.settingsBtn.classList.add('hidden');
  }

  // 接続状態の表示
  const mode = db.getMode();
  elements.connectionBadge.className = `connection-badge ${mode}`;
  const dot = elements.connectionBadge.querySelector('.dot');
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
  
  const isDriverTab = !document.getElementById('login-driver-inputs').classList.contains('hidden');
  let email, password;
  
  if (isDriverTab) {
    password = document.getElementById('login-password').value;
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
      email = profile.email;
    } catch (err) {
      showToast("ログインエラー: " + err.message, "error");
      return;
    }
  } else {
    password = document.getElementById('login-admin-password').value;
    
    // デモモードかつパスワードが空の場合、デフォルト管理者でログインを許可
    if (!password && db.getMode() === 'demo') {
      email = getAdminEmail("管理者");
      password = "1010";
    } else {
      if (!password) {
        showToast("管理者パスワードを入力してください。", "warning");
        return;
      }
      
      try {
        const passcodeHash = await hashPassword(password);
        const profile = await db.getProfileByPasscode(passcodeHash);
        if (!profile || profile.role !== 'admin') {
          // 管理者が1人も存在しないか、登録されている管理者全員のパスコードが未設定の場合
          const admins = await db.getAllAdmins();
          const hasActiveAdmin = admins.some(a => a.admin_passcode);
          if (!hasActiveAdmin) {
            if (confirm("データベースに有効な管理者パスコードが設定されていません。\n入力したパスワードで最初の管理者「管理者」を作成しますか？\n(※すでにアカウントが存在する場合は登録エラーになるため、その場合は指示されたSQLを実行してください)")) {
              const email = getAdminEmail("管理者");
              await db.signUp(email, password, "管理者", 'admin', null);
              showToast("最初の管理者アカウント「管理者」を作成しました！再度同じパスワードでログインしてください。");
              return;
            }
          }
          showToast("パスワードが正しくありません。", "error");
          return;
        }
        email = profile.email;
      } catch (err) {
        showToast("管理者認証エラー: " + err.message, "error");
        return;
      }
    }
  }
  
  try {
    const user = await db.signIn(email, password);
    state.user = user;
    
    if (user.role === 'admin') {
      localStorage.removeItem('last_login_email');
      localStorage.setItem('last_login_name', user.name);
    } else {
      localStorage.setItem('last_login_email', user.email);
      localStorage.setItem('last_login_name', user.name);
    }
    
    showToast(`${user.name}としてログインしました。`);
    
    if (user.role === 'admin') {
      showView('admin');
    } else {
      showView('driver');
    }
    elements.loginForm.reset();
    const adminPwdInput = document.getElementById('login-admin-password');
    if (adminPwdInput) adminPwdInput.value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const name = document.getElementById('signup-name').value.trim();
  const licenseType = null;
  const role = 'driver';

  try {
    // パスワード/パスコードが重複していないか事前に検証
    const passcodeHash = await hashPassword(password);
    const exists = await db.checkPasscodeExists(passcodeHash);
    if (exists) {
      showToast("このパスワードはすでに使用されています。異なるパスワードを設定してください。", "error");
      return;
    }

    const user = await db.signUp(email, password, name, role, licenseType);
    localStorage.setItem('last_login_email', email);
    localStorage.setItem('last_login_name', name);
    showToast('登録が完了しました。');
    
    // 登録ユーザーが即時ログインされた場合
    const currentUser = db.getCurrentUser();
    if (currentUser) {
      state.user = currentUser;
      if (currentUser.role === 'admin') {
        showView('admin');
      } else {
        showView('driver');
      }
    } else {
      // メール確認待ち等の場合
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

// デモログイン用のショートカットキー
function quickLogin(role) {
  const password = 'password';
  
  if (role === 'admin') {
    const pwdInput = document.getElementById('login-admin-password');
    if (pwdInput) pwdInput.value = '';
  } else {
    const email = 'driver1@example.com';
    const emailInput = document.getElementById('login-email');
    const pwdInput = document.getElementById('login-password');
    if (emailInput) emailInput.value = email;
    if (pwdInput) pwdInput.value = password;
  }
  
  elements.loginForm.dispatchEvent(new Event('submit'));
}

// =================================================================
// ドライバー画面制御ロジック (Driver Actions)
// =================================================================
async function loadDriverDashboard() {
  if (!state.user) return;
  
  try {
    // 0. 提出期限お知らせバナーの表示チェック
    checkDeadlineBanner();

    // 1. 指定月の申請をDBから取得
    state.monthlyRequests = await db.getOffDayRequests(state.user.id, state.currentYear, state.currentMonth);
    
    // 2. カレンダーをレンダリング
    renderDriverCalendar();
    
    // 3. 申請履歴と作成中の下書きリストの同期
    updateDriverSidePanel();
    
    // 4. スタッツの同期
    updateDriverStats();
  } catch (err) {
    showToast("データロード失敗: " + err.message, 'error');
  }
}

// 毎月15日〜20日の間、希望休の提出期限バナーを表示する制御
function checkDeadlineBanner() {
  const banner = document.getElementById('deadline-banner');
  if (!banner) return;

  const today = new Date();
  const currentDay = today.getDate(); // 1-31

  // 15日から20日の間のみ表示する
  if (currentDay >= 15 && currentDay <= 20) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ドライバー用カレンダーレンダリング
function renderDriverCalendar() {
  elements.driverCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  elements.driverCalendarGrid.innerHTML = '';

  // 曜日のヘッダーを描画
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = day;
    elements.driverCalendarGrid.appendChild(el);
  });

  const firstDay = new Date(state.currentYear, state.currentMonth - 1, 1);
  const startDayOfWeek = firstDay.getDay(); // 0: 日曜日, 6: 土曜日
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  
  const prevMonthLastDay = new Date(state.currentYear, state.currentMonth - 1, 0).getDate();

  // 1. 前月の余白を描画
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cell other-month';
    cell.innerHTML = `<span class="day-number">${prevMonthLastDay - i}</span>`;
    elements.driverCalendarGrid.appendChild(cell);
  }

  // 今日の日付を取得 (過去日判定のため)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 2. 今月の日付を描画
  for (let day = 1; day <= lastDay; day++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cellDate = new Date(state.currentYear, state.currentMonth - 1, day);
    
    cell.innerHTML = `<span class="day-number">${day}</span>`;
    
    // 過去日の判定
    const isPast = cellDate < today;
    if (isPast) {
      cell.classList.add('past-date');
    }

    // 既に申請があるかチェック
    const req = state.monthlyRequests.find(r => r.request_date === dateStr);
    const draft = state.selectedDates.get(dateStr);

    if (req) {
      cell.classList.add(`status-${req.status}`);
    } else if (draft) {
      cell.classList.add('status-selected');
    }

    // クリック時のイベント
    if (!isPast) {
      cell.addEventListener('click', () => handleDateClick(dateStr, req, draft));
    } else if (req) {
      // 過去日であっても申請があったら詳細ポップアップは開く
      cell.addEventListener('click', () => showDetailModal(req));
    }

    elements.driverCalendarGrid.appendChild(cell);
  }
}

// カレンダーセルがクリックされた際の処理
function handleDateClick(dateStr, existingRequest, draftRequest) {
  if (existingRequest) {
    // すでに申請が存在する場合、詳細＆キャンセルモーダルを開く
    showDetailModal(existingRequest);
  } else {
    // 申請が存在しない場合、トグルで選択/解除
    if (draftRequest) {
      state.selectedDates.delete(dateStr);
    } else {
      state.selectedDates.set(dateStr, { reason: '' });
    }
    loadDriverDashboard();
  }
}

// 既存申請の詳細モーダルを開く
function showDetailModal(req) {
  const adminArea = document.getElementById('admin-modal-actions');
  if (adminArea) adminArea.remove();

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

  // 保留中の場合のみ「申請を取り消す」ボタンを表示
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

// ドライバー画面のサイドパネル更新（作成中の下書き）
function updateDriverSidePanel() {
  elements.draftRequestsList.innerHTML = '';
  
  if (state.selectedDates.size === 0) {
    elements.draftRequestsList.innerHTML = `
      <div class="empty-state">
        カレンダーの日付をクリックして、希望休（終日）を追加してください。<br>希望休日数の制限はありません。
      </div>
    `;
    elements.submitRequestsBtn.disabled = true;
    return;
  }

  elements.submitRequestsBtn.disabled = false;
  
  // 選択日の並び替え
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
    
    // 下書き削除ボタンのバインド
    card.querySelector('.req-delete').addEventListener('click', () => {
      state.selectedDates.delete(dateStr);
      loadDriverDashboard();
    });

    elements.draftRequestsList.appendChild(card);
  });
}

// 希望休の一括送信
async function submitAllRequests() {
  if (state.selectedDates.size === 0) return;
  
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

    // GAS自動メール通知が設定されている場合は、バックグラウンドでメール送信を実行
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

// GAS通知用メール送信処理
async function sendGasEmailNotification(gasUrl, user, submittedDetails) {
  try {
    const payload = {
      driverName: user.name,
      driverEmail: user.email || "不明",
      requests: submittedDetails
    };

    // ブラウザのCORS制限（事前フライトリクエストエラー）を回避するため、
    // プレーンテキスト（Simple Request形式）でPOST送信します。
    await fetch(gasUrl, {
      method: "POST",
      mode: "no-cors", // これによりレスポンスの読込は遮断されますが、GASへのデータ到達は保証されます
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

// 簡易スタッツの更新
function updateDriverStats() {
  const allCount = state.monthlyRequests.length;
  const approvedCount = state.monthlyRequests.filter(r => r.status === 'approved').length;
  const pendingCount = state.monthlyRequests.filter(r => r.status === 'pending').length;
  
  elements.statTotal.textContent = allCount + "日";
  elements.statApproved.textContent = approvedCount + "日";
  elements.statPending.textContent = pendingCount + "日";
}

// =================================================================
// 管理者画面制御ロジック (Admin Actions)
// =================================================================
async function loadAdminDashboard() {
  try {
    // 1. 全ドライバープロフィールのロード
    state.drivers = await db.getAllDrivers(state.currentYear, state.currentMonth);
    
    // 2. 全ドライバーの指定月希望休一覧の取得 (カレンダー用)
    state.allRequests = await db.getOffDayRequests(null, state.currentYear, state.currentMonth);
    
    // 3. 全期間のすべての希望休一覧の取得 (承認待ちリスト用、月制限なし)
    state.allPendingRequests = await db.getOffDayRequests(null, null, null);
    
    // 4. 管理者運行管理カレンダーのレンダリング
    renderAdminCalendar();
    
    // 5. 承認待ち申請リスト(キュー)の更新
    renderApprovalQueue();

    // 6. ドライバー稼働率 roster の描画
    renderRosterList();
  } catch (err) {
    showToast("管理者データロード失敗: " + err.message, 'error');
  }
}

// 管理者カレンダーの描画 (誰がいつ休むか可視化)
function renderAdminCalendar() {
  elements.adminCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  elements.adminCalendarGrid.innerHTML = '';

  // 曜日のヘッダーを描画
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  weekdays.forEach(day => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = day;
    elements.adminCalendarGrid.appendChild(el);
  });

  const firstDay = new Date(state.currentYear, state.currentMonth - 1, 1);
  const startDayOfWeek = firstDay.getDay();
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const prevMonthLastDay = new Date(state.currentYear, state.currentMonth - 1, 0).getDate();

  // 1. 前月の余白を描画
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cell admin-cell other-month';
    cell.innerHTML = `<div class="admin-cell-header"><span class="admin-day-number">${prevMonthLastDay - i}</span></div>`;
    elements.adminCalendarGrid.appendChild(cell);
  }

  // 2. 今月の日付を描画
  for (let day = 1; day <= lastDay; day++) {
    const cell = document.createElement('div');
    cell.className = 'cell admin-cell';
    
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // その日にお休み希望を出している全ドライバーの申請を取得
    const dayReqs = state.allRequests.filter(r => r.request_date === dateStr);
    
    // 申請ステータスに応じて枠（ボーダー）の色を変えるクラスを追加
    const pendingReqs = dayReqs.filter(r => r.status === 'pending');
    const approvedReqs = dayReqs.filter(r => r.status === 'approved');
    const rejectedReqs = dayReqs.filter(r => r.status === 'rejected');

    if (pendingReqs.length > 0) {
      cell.classList.add('status-pending');
    } else if (approvedReqs.length > 0) {
      cell.classList.add('status-approved');
    } else if (rejectedReqs.length > 0 && dayReqs.length === rejectedReqs.length) {
      cell.classList.add('status-rejected');
    }
    
    cell.innerHTML = `
      <div class="admin-cell-header">
        <span class="admin-day-number">${day}</span>
      </div>
      <div class="drivers-list-on-day"></div>
    `;

    const listContainer = cell.querySelector('.drivers-list-on-day');
    
    dayReqs.forEach(req => {
      const badge = document.createElement('div');
      badge.className = `driver-mini-badge ${req.status}`;
      badge.title = `${req.driver_name} (${req.driver_license_type || '普通'}): ${req.reason || '理由記入なし'}`;
      badge.textContent = req.driver_name;
      
      // クリックしたら管理者も詳細ダイアログから内容を確認＆更新できるようにする
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openApprovalModal(req);
      });
      listContainer.appendChild(badge);
    });

    elements.adminCalendarGrid.appendChild(cell);
  }
}

// 承認待ち申請リスト(キュー)の描画
function renderApprovalQueue() {
  elements.approvalQueueList.innerHTML = '';
  
  // 指定月のみでなく、すべての月で保留中（pending）の希望休申請を表示する
  const pendingRequests = (state.allPendingRequests || []).filter(r => r.status === 'pending');
  
  if (pendingRequests.length === 0) {
    elements.approvalQueueList.innerHTML = `
      <div class="empty-state">
        現在、承認待ちの希望休申請はありません。
      </div>
    `;
    return;
  }

  pendingRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'queue-card';
    card.innerHTML = `
      <div class="queue-header">
        <div class="driver-meta">
          <span class="driver-name-title">${req.driver_name}</span>
          <span class="driver-license-sub">${req.driver_license_type || '普通'}免許</span>
        </div>
        <span class="queue-date">${formatDateJapanese(req.request_date)}</span>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <input type="text" class="admin-action-input" placeholder="ドライバーへのコメント (オプション)" id="comment-${req.id}">
      </div>
      <div class="queue-actions">
        <button class="btn-action reject" data-id="${req.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> 却下
        </button>
        <button class="btn-action approve" data-id="${req.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> 承認
        </button>
      </div>
    `;

    // 承認・却下イベントのアタッチ
    card.querySelector('.btn-action.approve').addEventListener('click', () => handleApproveReject(req.id, 'approved'));
    card.querySelector('.btn-action.reject').addEventListener('click', () => handleApproveReject(req.id, 'rejected'));

    elements.approvalQueueList.appendChild(card);
  });
}

// 個別承認または却下のハンドラ
async function handleApproveReject(id, status) {
  const commentInput = document.getElementById(`comment-${id}`);
  const comment = commentInput ? commentInput.value.trim() : '';

  try {
    await db.updateRequestStatus(id, status, comment);
    showToast(status === 'approved' ? '申請を承認しました。' : '申請を却下しました。');
    await loadAdminDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// 詳細モーダルから管理者が承認・却下できるようにするダイアログ
function openApprovalModal(req) {
  elements.detailDateLabel.textContent = formatDateJapanese(req.request_date) + ` (${req.driver_name})`;
  
  const statusTexts = { pending: '保留中', approved: '承認済み', rejected: '却下' };
  elements.detailStatusBadge.textContent = statusTexts[req.status];
  elements.detailStatusBadge.className = `badge ${req.status}`;
  
  // 管理者用コメントの表示
  elements.detailAdminComment.parentElement.classList.add('hidden'); // 管理者はテキスト入力を見せるので隠す
  
  // キャンセルボタンを乗っ取って「承認」「却下」フォームに差し替える
  elements.detailCancelBtn.classList.add('hidden');
  
  // 管理者用承認アクションエリアを挿入または表示
  let adminArea = document.getElementById('admin-modal-actions');
  if (!adminArea) {
    adminArea = document.createElement('div');
    adminArea.id = 'admin-modal-actions';
    adminArea.style.marginTop = '1.5rem';
    adminArea.style.display = 'flex';
    adminArea.style.flexDirection = 'column';
    adminArea.style.gap = '0.75rem';
    elements.detailCancelBtn.parentNode.appendChild(adminArea);
  }
  
  adminArea.innerHTML = `
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label" style="font-size:0.75rem">管理者コメント:</label>
      <input type="text" class="form-input" id="detail-comment-input" value="${req.admin_comment || ''}">
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem">
      <button class="btn btn-secondary" id="detail-reject-btn" style="padding:0.5rem; font-size:0.85rem">却下する</button>
      <button class="btn" id="detail-approve-btn" style="padding:0.5rem; font-size:0.85rem">承認する</button>
    </div>
  `;

  document.getElementById('detail-approve-btn').onclick = async () => {
    const comment = document.getElementById('detail-comment-input').value.trim();
    try {
      await db.updateRequestStatus(req.id, 'approved', comment);
      showToast('希望休を承認しました。');
      closeModal(elements.detailModal);
      loadAdminDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  document.getElementById('detail-reject-btn').onclick = async () => {
    const comment = document.getElementById('detail-comment-input').value.trim();
    try {
      await db.updateRequestStatus(req.id, 'rejected', comment);
      showToast('希望休を却下しました。');
      closeModal(elements.detailModal);
      loadAdminDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  elements.closeDetailBtn.onclick = () => {
    closeModal(elements.detailModal);
    if (adminArea) adminArea.remove();
  };

  openModal(elements.detailModal);
}

// ドライバー一覧・取得日数の描画
function renderRosterList() {
  elements.rosterList.innerHTML = '';
  
  if (state.drivers.length === 0) {
    elements.rosterList.innerHTML = `
      <div class="empty-state">ドライバーが登録されていません。</div>
    `;
    return;
  }

  state.drivers.forEach(drv => {
    const item = document.createElement('div');
    item.className = 'roster-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    
    // 自分以外のドライバーのみ削除可能
    const canDelete = drv.id !== state.user.id;
    const deleteBtnHtml = canDelete 
      ? `<button class="btn-icon delete-driver-btn" data-id="${drv.id}" title="ドライバーを削除" style="color:var(--rejected); width:28px; height:28px; margin-left:0.5rem">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
         </button>` 
      : '';

    item.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px">
        <span class="roster-driver-name" style="font-weight:600">${drv.name}</span>
        <span class="roster-driver-email" style="font-size:0.75rem; color:var(--text-muted)">
          ${drv.email || 'メールアドレス未登録'}${drv.plain_password ? ` | パスワード: <span style="color:var(--pending); font-weight:600">${drv.plain_password}</span>` : ''}
        </span>
      </div>
      <div style="display:flex; align-items:center">
        ${deleteBtnHtml}
      </div>
    `;

    // 削除ボタンのクリック処理
    const delBtn = item.querySelector('.delete-driver-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (confirm(`本当にドライバー「${drv.name}」を削除しますか？\n（このドライバーの希望休データもすべて削除されます）`)) {
          try {
            await db.deleteDriver(drv.id);
            showToast(`ドライバー「${drv.name}」を削除しました。`);
            await loadAdminDashboard();
          } catch (err) {
            showToast("削除エラー: " + err.message, 'error');
          }
        }
      });
    }

    elements.rosterList.appendChild(item);
  });
}

// =================================================================
// 設定モーダルの制御
// =================================================================
function openSettingsModal() {
  // すでに保存されているURLとAnonキーがあれば挿入
  document.getElementById('setting-url').value = localStorage.getItem('supabase_url') || '';
  document.getElementById('setting-key').value = localStorage.getItem('supabase_anon_key') || '';
  document.getElementById('setting-gas-url').value = localStorage.getItem('gas_notification_url') || '';
  
  // モードトグル
  elements.dbModeSelect.value = db.getMode();
  toggleCredentialsVisibility(db.getMode());

  openModal(elements.settingsModal);
}

function toggleCredentialsVisibility(mode) {
  if (mode === 'live') {
    elements.dbCredentialsSection.classList.remove('hidden');
    elements.switchToDemoBtn.classList.remove('hidden');
  } else {
    elements.dbCredentialsSection.classList.add('hidden');
    elements.switchToDemoBtn.classList.add('hidden');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const mode = elements.dbModeSelect.value;
  
  // GAS通知用URLの保存
  const gasUrl = document.getElementById('setting-gas-url').value.trim();
  localStorage.setItem('gas_notification_url', gasUrl);
  
  if (mode === 'demo') {
    db.switchToDemo();
    showToast('設定を保存し、デモモードに変更しました。');
    closeModal(elements.settingsModal);
    handleLogout(); // ログアウトさせてサインイン画面に戻す
  } else {
    const url = document.getElementById('setting-url').value.trim();
    const key = document.getElementById('setting-key').value.trim();
    
    const submitBtn = elements.settingsForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> 接続テスト中...`;
    
    try {
      await db.setCredentials(url, key);
      showToast('Supabase データベースに接続しました！');
      closeModal(elements.settingsModal);
      handleLogout(); // 新しい認証情報用にログアウト
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }
}

// =================================================================
// ヘルパー・モーダル・初期化処理
// =================================================================

// 日付文字列を日本語表記にフォーマット (YYYY-MM-DD => M月D日(曜日))
function formatDateJapanese(dateStr) {
  const date = new Date(dateStr);
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = dayNames[date.getDay()];
  return `${m}月${d}日 (${dayOfWeek})`;
}

// モーダルを開く
function openModal(modalEl) {
  modalEl.classList.add('active');
  document.body.style.overflow = 'hidden'; // 背面のスクロール防止
}

// モーダルを閉じる
function closeModal(modalEl) {
  modalEl.classList.remove('active');
  document.body.style.overflow = '';
}

// 初期化処理
async function initApp() {
  // 1. データベースの初期化と認証状態の復元
  const { mode, user } = await db.init();
  state.user = user;
  
  
  // 2. ログイン状態に応じた画面遷移
  if (user) {
    if (user.role === 'admin') {
      showView('admin');
    } else {
      showView('driver');
    }
  } else {
    showView('auth');
  }

  // =================================================================
  // イベントリスナーの登録
  // =================================================================
  
  // ログイン画面のタブ切り替え
  const tabDriver = document.getElementById('tab-driver');
  const tabAdmin = document.getElementById('tab-admin');
  const driverInputs = document.getElementById('login-driver-inputs');
  const adminInputs = document.getElementById('login-admin-inputs');
  
  if (tabDriver && tabAdmin) {
    tabDriver.addEventListener('click', () => {
      tabDriver.className = 'btn';
      tabAdmin.className = 'btn btn-secondary';
      driverInputs.classList.remove('hidden');
      adminInputs.classList.add('hidden');
      const emailInput = document.getElementById('login-email');
      if (emailInput) emailInput.focus();
    });
    
    tabAdmin.addEventListener('click', async () => {
      tabAdmin.className = 'btn';
      tabDriver.className = 'btn btn-secondary';
      adminInputs.classList.remove('hidden');
      driverInputs.classList.add('hidden');
      const pwdInput = document.getElementById('login-admin-password');
      if (pwdInput) pwdInput.focus();
    });
  }
  
  // 認証画面関連
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

  // カレンダー月変更 (ドライバー画面)
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

  // カレンダー月変更 (管理者画面)
  elements.adminPrevMonthBtn.addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 1) {
      state.currentMonth = 12;
      state.currentYear--;
    }
    loadAdminDashboard();
  });
  elements.adminNextMonthBtn.addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 12) {
      state.currentMonth = 1;
      state.currentYear++;
    }
    loadAdminDashboard();
  });

  // 申請一括送信
  elements.submitRequestsBtn.addEventListener('click', submitAllRequests);

  // 設定関連
  elements.settingsBtn.addEventListener('click', openSettingsModal);
  elements.closeSettingsBtn.addEventListener('click', () => closeModal(elements.settingsModal));
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.dbModeSelect.addEventListener('change', (e) => toggleCredentialsVisibility(e.target.value));
  
  elements.switchToDemoBtn.addEventListener('click', () => {
    db.switchToDemo();
    showToast('デモモードに切り替えました。');
    closeModal(elements.settingsModal);
    handleLogout();
  });



  // 管理者パスワード変更フォームのバインド
  const changeAdminPasswordForm = document.getElementById('change-admin-password-form');
  if (changeAdminPasswordForm) {
    changeAdminPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPwd = document.getElementById('admin-current-password').value;
      const newPwd = document.getElementById('admin-new-password').value;

      const submitBtn = changeAdminPasswordForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner"></span> 変更中...`;

      try {
        await db.changeAdminPassword(state.user.id, currentPwd, newPwd);
        showToast("パスワードを変更しました。次回より新しいパスワードをご使用ください。");
        changeAdminPasswordForm.reset();
      } catch (err) {
        showToast("エラー: " + err.message, "error");
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // 各種モーダル閉じるボタンのバインド
  elements.closeDetailBtn.addEventListener('click', () => closeModal(elements.detailModal));
  
  // モーダル外クリックで閉じる処理
  window.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeModal(elements.settingsModal);
    if (e.target === elements.detailModal) {
      closeModal(elements.detailModal);
      const adminArea = document.getElementById('admin-modal-actions');
      if (adminArea) adminArea.remove();
    }
  });
}

// ドキュメント読み込み完了時に起動
document.addEventListener('DOMContentLoaded', initApp);
