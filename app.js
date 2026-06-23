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
  shifts: [], // 当月の確定/下書きシフトデータ
  shiftPublishStatus: 'draft', // 当月の公開ステータス 'draft' | 'published'
  filterCenterStation: 'all', // 管理者画面用: 所属フィルター値
  centers: [], // 管理者画面用: 所属センター・局マスタ一覧
  isShiftEditing: false, // シフト編集モード中か
  originalShifts: [], // 編集開始前のシフトデータのバックアップ
  shiftTypes: [], // シフト表示区分マスタ一覧
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

  // 管理者画面要素
  adminCalendarMonth: document.getElementById('admin-calendar-month'),
  adminPrevMonthBtn: document.getElementById('admin-prev-month-btn'),
  adminNextMonthBtn: document.getElementById('admin-next-month-btn'),
  adminCalendarGrid: document.getElementById('admin-calendar-grid'),
  approvalQueueList: document.getElementById('approval-queue-list'),
  rosterList: document.getElementById('roster-list'),

  // 管理者サブタブとパネル要素
  tabBtnApprove: document.getElementById('tab-btn-approve'),
  tabBtnShift: document.getElementById('tab-btn-shift'),
  adminApprovePane: document.getElementById('admin-approve-pane'),
  adminShiftPane: document.getElementById('admin-shift-pane'),
  btnSaveDraft: document.getElementById('btn-save-draft'),
  btnPublishShift: document.getElementById('btn-publish-shift'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  shiftGridContainer: document.getElementById('shift-grid-container'),
  btnEditShift: document.getElementById('btn-edit-shift'),
  btnConfirmShift: document.getElementById('btn-confirm-shift'),
  btnCancelEditShift: document.getElementById('btn-cancel-edit-shift'),

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
      subtitleEl.textContent = '申請期間：毎月1日〜20日まで';
    }
  } else {
    elements.appHeader.classList.remove('hidden');
    updateHeaderUI();

    if (viewName === 'driver') {
      elements.driverView.classList.remove('hidden');
      
      // タブの初期状態を希望休提出にリセット
      if (elements.tabBtnDriverRequest && elements.tabBtnDriverShift) {
        elements.tabBtnDriverRequest.classList.add('active');
        elements.tabBtnDriverShift.classList.remove('active');
        elements.tabBtnDriverRequest.style.color = 'var(--text-main)';
        elements.tabBtnDriverShift.style.color = 'var(--text-muted)';
        elements.driverRequestPane.classList.remove('hidden');
        elements.driverShiftPane.classList.add('hidden');
      }

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
    const stationSuffix = state.user.center_station ? ` (${state.user.center_station})` : '';
    elements.userRoleDisplay.textContent = `ドライバー${stationSuffix}`;
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
  const centerStation = null;
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

    const user = await db.signUp(email, password, name, role, licenseType, centerStation);
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
    
    // 2. 当月のシフトデータおよび公開ステータスをDBから取得
    state.shifts = await db.getShifts(state.currentYear, state.currentMonth);
    state.shiftPublishStatus = await db.getShiftPublishStatus(state.currentYear, state.currentMonth);
    
    // 2.5. 全ドライバーと所属マスタの取得 (シフト表閲覧用)
    state.drivers = await db.getAllDrivers(state.currentYear, state.currentMonth);
    
    // ログイン中のドライバーの所属情報を最新データに同期
    const myProfile = state.drivers.find(d => d.id === state.user.id);
    if (myProfile) {
      state.user.center_station = myProfile.center_station;
      // セッション情報を更新
      if (db.getMode() === 'demo') {
        localStorage.setItem('driver_demo_session', JSON.stringify(state.user));
      }
      updateHeaderUI();
    }

    state.centers = await db.getCenters();
    state.shiftTypes = await db.getShiftTypes();

    // 3. シフト公開ステータスバナーを更新
    updateShiftStatusBanner();



    // 4. カレンダーをレンダリング
    renderDriverCalendar();
    
    // 5. 申請履歴と作成中の下書きリストの同期
    updateDriverSidePanel();
    
    // 6. スタッツの同期
    updateDriverStats();

    // 6.5. 確定シフト表のレンダリング
    renderDriverShiftGrid();
  } catch (err) {
    showToast("データロード失敗: " + err.message, 'error');
  }
}

// シフト状況バナーの更新表示
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

    // シフトが公開されている場合は、確定した勤務/休日を表示
    if (state.shiftPublishStatus === 'published') {
      const dayShift = state.shifts.find(s => s.driver_id === state.user.id && s.shift_date === dateStr);
      if (dayShift) {
        if (dayShift.shift_type === 'work') {
          cell.classList.add('shift-work');
        } else if (dayShift.shift_type === 'hope_off') {
          const isHopeOff = state.monthlyRequests.some(r => r.request_date === dateStr && r.status === 'approved');
          if (isHopeOff) {
            cell.classList.add('shift-hope-off');
          } else {
            cell.classList.add('shift-off');
          }
        }
      }
    } else {
      // シフトが未公開の場合は、自分の申請状況のみ表示
      if (req) {
        cell.classList.add(`status-${req.status}`);
      } else if (draft) {
        cell.classList.add('status-selected');
      }
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
  if (state.shiftPublishStatus === 'published') {
    if (existingRequest) {
      showDetailModal(existingRequest);
    } else {
      showToast("この月のシフトは既に確定・公開されているため、新規の希望休選択・変更はできません。", "warning");
    }
    return;
  }

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
  
  const today = new Date();
  const currentDay = today.getDate();
  const isSubmissionBlocked = currentDay >= 21; // 21日〜月末は送信不可
  
  // 提出パネルの案内文（イントロ）を動的に書き換える
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

  // 21日以降なら送信ボタンを無効化
  if (isSubmissionBlocked) {
    elements.submitRequestsBtn.disabled = true;
    elements.submitRequestsBtn.title = "毎月21日〜月末は申請期間外のため、送信できません。";
  } else {
    elements.submitRequestsBtn.disabled = false;
    elements.submitRequestsBtn.title = "";
  }
  
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
  
  // 21日以降の送信制限チェック
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
  state.isShiftEditing = false;
  try {
    // 1. 全ドライバープロフィールのロード
    state.drivers = await db.getAllDrivers(state.currentYear, state.currentMonth);
    
    // 2. 全ドライバーの指定月希望休一覧の取得 (カレンダー用)
    state.allRequests = await db.getOffDayRequests(null, state.currentYear, state.currentMonth);
    
    // 3. 全期間のすべての希望休一覧の取得 (承認待ちリスト用、月制限なし)
    state.allPendingRequests = await db.getOffDayRequests(null, null, null);
    
    // 4. 当月のシフトデータおよび公開ステータスを取得
    state.shifts = await db.getShifts(state.currentYear, state.currentMonth);
    state.shiftPublishStatus = await db.getShiftPublishStatus(state.currentYear, state.currentMonth);

    // 4.5. センター・局名マスターのロード
    state.centers = await db.getCenters();
    state.shiftTypes = await db.getShiftTypes();

    // 5. 管理者運行管理カレンダーのレンダリング
    renderAdminCalendar();
    
    // 6. 承認待ち申請リスト(キュー)の更新
    renderApprovalQueue();

    // 7. ドライバー稼働率 roster の描画
    renderRosterList();

    // 7.5. センター・局名マスター管理の描画
    renderCentersManagement();
    renderShiftTypesManagement();

    // 8. シフト表グリッドの描画
    renderShiftGrid();
  } catch (err) {
    showToast("管理者データロード失敗: " + err.message, 'error');
  }
}

// -----------------------------------------------------------------
// シフト表グリッドの描画 (出勤 / 希望休)
// -----------------------------------------------------------------
function renderShiftGrid() {
  if (!elements.shiftGridContainer) return;

  // シフト表上部のカレンダー月表示を更新
  const shiftCalendarMonth = document.getElementById('shift-calendar-month');
  if (shiftCalendarMonth) {
    shiftCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  }

  // 所属フィルターの選択肢を動的に更新
  const filterSelect = document.getElementById('filter-center-station');
  if (filterSelect) {
    const currentVal = state.filterCenterStation || 'all';
    const centers = state.centers || [];
    
    filterSelect.innerHTML = `<option value="all">すべてのセンター・局</option>`;
    centers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filterSelect.appendChild(opt);
    });

    if (centers.includes(currentVal)) {
      filterSelect.value = currentVal;
      state.filterCenterStation = currentVal;
    } else {
      filterSelect.value = 'all';
      state.filterCenterStation = 'all';
    }
  }



  // フィルターに合致するドライバーのみを抽出
  const filteredDrivers = state.filterCenterStation === 'all'
    ? state.drivers
    : state.drivers.filter(d => {
        if (!d.center_station) return false;
        const stations = d.center_station.split(',').map(s => s.trim());
        return stations.includes(state.filterCenterStation);
      });

  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  
  let html = `<div class="shift-table-wrapper"><table class="shift-table${state.isShiftEditing ? ' editing' : ''}"><thead><tr>`;
  html += `<th class="driver-name-col">ドライバー名</th>`;
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(state.currentYear, state.currentMonth - 1, day);
    const dayOfWeek = date.getDay();
    const dayOfWeekStr = dayNames[dayOfWeek];
    
    let colorStyle = "";
    if (dayOfWeek === 0) { // 日曜日
      colorStyle = "color: var(--rejected);";
    } else if (dayOfWeek === 6) { // 土曜日
      colorStyle = "color: var(--accent-color);";
    }
    
    html += `<th>${day}<br><span style="font-size: 0.65rem; font-weight: normal; opacity: 0.85; ${colorStyle}">(${dayOfWeekStr})</span></th>`;
  }
  html += `<th class="shift-stat-col">出勤日数</th>`;
  html += `</tr></thead><tbody>`;

  // 各ドライバーの行を描画
  filteredDrivers.forEach(drv => {
    html += `<tr>`;
    
    let nameCellHtml = `<td class="driver-name-col">`;
    nameCellHtml += `<div style="display: flex; flex-direction: column; gap: 2px; min-height: 38px; justify-content: center; padding: 4px 0;">`;
    
    if (state.filterCenterStation !== 'all') {
      nameCellHtml += `
        <div style="display: flex; align-items: center; width: 100%;">
          <span style="font-weight: 600;">${drv.name}</span>
          <span class="remove-from-center-btn" data-driver-id="${drv.id}" data-station="${state.filterCenterStation}" style="cursor: pointer; color: var(--rejected); font-weight: bold; font-size: 0.85rem; margin-left: auto; padding: 2px 6px; border-radius: 4px; transition: background 0.15s;" title="${state.filterCenterStation}から解除">✖</span>
        </div>
      `;
    } else {
      nameCellHtml += `<span style="font-weight: 600;">${drv.name}</span>`;
    }
    
    nameCellHtml += `</div></td>`;
    html += nameCellHtml;
    
    let workCount = 0;
    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // 承認済希望休があるかチェック
      const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
      const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
      const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
      const assignedCenter = dayShift ? dayShift.assigned_center : null;

      const myStations = drv.center_station ? drv.center_station.split(',').map(s => s.trim()) : [];
      const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
      const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');

      if (state.isShiftEditing) {
        // 編集モードの場合はすべてのセルでドロップダウンを表示
        let cellClass = "shift-cell editing-select";
        if (isWork) {
          cellClass += " work";
          workCount++;
        } else {
          cellClass += " hope_off";
        }
        
        const titleText = assignedCenter ? assignedCenter : (typeMatch ? typeMatch.name : '出勤');
        
        html += `<td class="${cellClass}" data-driver-id="${drv.id}" data-date="${dateStr}" title="${titleText}">`;
        html += `<select class="shift-cell-select" data-driver-id="${drv.id}" data-date="${dateStr}">`;
        
        // カスタマイズされた区分を表示
        state.shiftTypes.forEach(t => {
          const isSelected = (shiftType === t.id && !assignedCenter);
          html += `<option value="${t.id}" ${isSelected ? 'selected' : ''}>${t.name}</option>`;
        });
        
        html += `</select></td>`;
      } else {
        // 通常の非編集モードの表示
        if (isWork) {
          const displayText = assignedCenter ? assignedCenter.substring(0, 2) : (typeMatch ? typeMatch.name : '○');
          const titleText = assignedCenter ? assignedCenter : (typeMatch ? typeMatch.name : '出勤');
          html += `<td class="shift-cell work" data-driver-id="${drv.id}" data-date="${dateStr}" title="${titleText}">${displayText}</td>`;
          workCount++;
        } else {
          const displayText = typeMatch ? typeMatch.name : (req ? '希望' : '休');
          html += `<td class="shift-cell hope_off" data-driver-id="${drv.id}" data-date="${dateStr}" title="${displayText}">${displayText}</td>`;
        }
      }
    }

    html += `<td class="shift-stat-col">${workCount}日</td>`;
    html += `</tr>`;
  });

  // 特定のセンターが選択されている場合のみ、最下部に新規配置用の行を描画
  if (state.filterCenterStation !== 'all') {
    const unallocatedDrivers = state.drivers.filter(d => {
      if (!d.center_station) return true;
      const stations = d.center_station.split(',').map(s => s.trim());
      return !stations.includes(state.filterCenterStation);
    });
    html += `<tr class="allocate-row" style="background: rgba(255,255,255,0.01);">`;
    html += `<td class="driver-name-col">`;
    html += `<select class="allocate-driver-select form-input form-select" style="width: 100%; padding: 2px 1.5rem 2px 6px; font-size: 0.75rem; height: 24px; margin: 0; background: transparent; border: 1px dashed var(--border-color); color: var(--text-muted); border-radius: 4px;">`;
    html += `<option value="">➕ ドライバーを配置</option>`;
    unallocatedDrivers.forEach(d => {
      html += `<option value="${d.id}">${d.name} (${d.center_station || '未設定'})</option>`;
    });
    html += `</select></td>`;
    for (let day = 1; day <= lastDay; day++) {
      html += `<td style="background: rgba(255,255,255,0.01); border-top: 1px dashed var(--border-color); border-bottom: 1px dashed var(--border-color);"></td>`;
    }
    html += `<td></td>`; // 出勤日数カラム
    html += `</tr>`;
  }

  // 日次出勤人数過不足行を描画
  html += `<tr class="sufficiency-row">`;
  html += `<td class="driver-name-col">稼働状況</td>`;
  
  const reqCount = parseInt(document.getElementById('config-required-drivers').value) || 2;

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let scheduledCount = 0;
    filteredDrivers.forEach(drv => {
      const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
      const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
      const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
      const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
      const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');
      if (isWork) scheduledCount++;
    });

    const isSufficient = scheduledCount >= reqCount;
    const cellClass = isSufficient ? 'sufficient' : 'insufficient';
    html += `<td class="${cellClass}" title="${isSufficient ? '基準達成' : '要員不足'}">${scheduledCount}/${reqCount}</td>`;
  }

  html += `<td></td></tr></tbody></table></div>`;
  elements.shiftGridContainer.innerHTML = html;

  // フィルター中センターからの所属解除ボタンイベント
  elements.shiftGridContainer.querySelectorAll('.remove-from-center-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const driverId = btn.getAttribute('data-driver-id');
      const station = btn.getAttribute('data-station');
      const drv = state.drivers.find(d => d.id === driverId);
      if (!drv) return;
      
      if (confirm(`本当にドライバー「${drv.name}」の所属から「${station}」を解除しますか？\n（※ドライバーアカウント自体は削除されません）`)) {
        try {
          let stations = drv.center_station ? drv.center_station.split(',').map(s => s.trim()) : [];
          stations = stations.filter(s => s !== station);
          const nextVal = stations.length > 0 ? stations.join(',') : null;
          
          await db.updateDriverCenterStation(driverId, nextVal);
          showToast(`「${drv.name}」の所属から「${station}」を解除しました。`);
          await loadAdminDashboard();
        } catch (err) {
          showToast("解除エラー: " + err.message, 'error');
        }
      }
    });
    // ホバーエフェクト
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(255, 23, 68, 0.15)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
  });


  // セルクリックで手動シフト調整 (出勤 ⇔ 希望休)
  elements.shiftGridContainer.querySelectorAll('.shift-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      // ドロップダウンセルの場合はクリックトグルを無効化
      if (e.target.tagName === 'SELECT' || cell.classList.contains('editing-select')) {
        return;
      }

      if (!state.isShiftEditing) {
        showToast("シフトを変更するには「シフト編集」ボタンを押してください。", "info");
        return;
      }
      const driverId = cell.getAttribute('data-driver-id');
      const dateStr = cell.getAttribute('data-date');

      let dayShiftIdx = state.shifts.findIndex(s => s.driver_id === driverId && s.shift_date === dateStr);
      
      if (dayShiftIdx === -1) {
        const req = state.allRequests.find(r => r.driver_id === driverId && r.request_date === dateStr && r.status === 'approved');
        const defaultType = req ? 'hope_off' : 'work';
        const nextType = (defaultType === 'work') ? 'hope_off' : 'work';
        state.shifts.push({ driver_id: driverId, shift_date: dateStr, shift_type: nextType });
      } else {
        state.shifts[dayShiftIdx].shift_type = (state.shifts[dayShiftIdx].shift_type === 'work') ? 'hope_off' : 'work';
      }

      renderShiftGrid();
    });
  });

  // セル内の所属先選択ドロップダウンの変更監視
  elements.shiftGridContainer.querySelectorAll('.shift-cell-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const driverId = select.getAttribute('data-driver-id');
      const dateStr = select.getAttribute('data-date');
      const value = select.value;

      let dayShiftIdx = state.shifts.findIndex(s => s.driver_id === driverId && s.shift_date === dateStr);

      const typeMatch = state.shiftTypes.find(t => t.id === value);

      if (typeMatch) {
        // 設定された区分（出・休・有給など）を選択した場合
        if (dayShiftIdx === -1) {
          state.shifts.push({ driver_id: driverId, shift_date: dateStr, shift_type: typeMatch.id, assigned_center: null });
        } else {
          state.shifts[dayShiftIdx].shift_type = typeMatch.id;
          state.shifts[dayShiftIdx].assigned_center = null;
        }
      }

      renderShiftGrid();
    });
  });

  // シフト編集コントロールボタンの表示切り替え
  if (elements.btnEditShift && elements.btnConfirmShift && elements.btnCancelEditShift) {
    if (state.isShiftEditing) {
      elements.btnEditShift.classList.add('hidden');
      elements.btnConfirmShift.classList.remove('hidden');
      elements.btnCancelEditShift.classList.remove('hidden');
    } else {
      elements.btnEditShift.classList.remove('hidden');
      elements.btnConfirmShift.classList.add('hidden');
      elements.btnCancelEditShift.classList.add('hidden');
    }
  }

  // 編集モード中は他のボタン操作を無効化
  const otherActionButtons = [
    elements.btnSaveDraft,
    elements.btnPublishShift,
    elements.btnExportCsv
  ];
  otherActionButtons.forEach(btn => {
    if (btn) {
      btn.disabled = state.isShiftEditing;
      btn.style.opacity = state.isShiftEditing ? '0.5' : '1';
      btn.style.pointerEvents = state.isShiftEditing ? 'none' : 'auto';
    }
  });

  // 新規配置用セレクトボックスのイベント紐付け
  const allocateSelect = elements.shiftGridContainer.querySelector('.allocate-driver-select');
  if (allocateSelect) {
    allocateSelect.addEventListener('change', async () => {
      const driverId = allocateSelect.value;
      if (!driverId) return;
      const drv = state.drivers.find(d => d.id === driverId);
      if (!drv) return;
      try {
        let stations = drv.center_station ? drv.center_station.split(',').map(s => s.trim()) : [];
        if (!stations.includes(state.filterCenterStation)) {
          stations.push(state.filterCenterStation);
        }
        const nextVal = stations.join(',');
        await db.updateDriverCenterStation(driverId, nextVal);
        showToast(`「${drv.name}」を「${state.filterCenterStation}」に配置しました。`);
        await loadAdminDashboard();
      } catch (err) {
        showToast("配置エラー: " + err.message, 'error');
        await loadAdminDashboard();
      }
    });
  }


}



// -----------------------------------------------------------------
// シフトの下書き保存
// -----------------------------------------------------------------
async function saveShiftDraft() {
  try {
    await db.saveShifts(state.currentYear, state.currentMonth, state.shifts, 'draft');
    state.shiftPublishStatus = 'draft';
    showToast("シフトを下書きとして保存しました。");
  } catch (err) {
    if (err.code === 'DB_MIGRATION_REQUIRED') {
      state.shiftPublishStatus = 'draft';
      alert("【注意】シフトは下書き保存されましたが、データベースの更新（マイグレーション）が必要です。\n\n完全に動作させるには、SupabaseのSQL Editor等で以下のSQLを実行してください：\n\nALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS assigned_center TEXT;\nALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;\nCREATE TABLE IF NOT EXISTS public.shift_types (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  is_work BOOLEAN NOT NULL DEFAULT false,\n  color TEXT\n);");
    } else {
      showToast(err.message, 'error');
    }
  }
}

// -----------------------------------------------------------------
// シフトの確定公開
// -----------------------------------------------------------------
async function publishShift() {
  try {
    await db.saveShifts(state.currentYear, state.currentMonth, state.shifts, 'published');
    state.shiftPublishStatus = 'published';
    showToast("シフトを確定公開しました！ドライバー画面に即時反映されます。");
  } catch (err) {
    if (err.code === 'DB_MIGRATION_REQUIRED') {
      state.shiftPublishStatus = 'published';
      alert("【注意】シフトは確定公開されましたが、データベースの更新（マイグレーション）が必要です。\n\n完全に動作させるには、SupabaseのSQL Editor等で以下のSQLを実行してください：\n\nALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS assigned_center TEXT;\nALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;\nCREATE TABLE IF NOT EXISTS public.shift_types (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  is_work BOOLEAN NOT NULL DEFAULT false,\n  color TEXT\n);");
    } else {
      showToast(err.message, 'error');
    }
  }
}



// -----------------------------------------------------------------
// CSVファイルのエクスポート
// -----------------------------------------------------------------
function exportShiftCsv() {
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  let csvContent = "\ufeff"; // Excelでの日本語文字化けを防ぐためのBOM追加
  const gridData = [];
  
  // フィルターに合致するドライバーのみを抽出
  const filteredDrivers = state.filterCenterStation === 'all'
    ? state.drivers
    : state.drivers.filter(d => {
        const stations = d.center_station ? d.center_station.split(',').map(s => s.trim()) : [];
        return stations.includes(state.filterCenterStation);
      });

  // ヘッダー行作成
  const header = ["ドライバー名"];
  for (let d = 1; d <= lastDay; d++) {
    header.push(`${d}日`);
  }
  header.push("出勤日数");
  csvContent += header.join(",") + "\n";
  gridData.push(header);

  // 各ドライバーのシフト行作成
  filteredDrivers.forEach(drv => {
    const row = [drv.name];
    let workCount = 0;

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
      const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
      const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');

      const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
      const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');

      if (isWork) {
        const assignedCenter = dayShift ? dayShift.assigned_center : null;
        row.push(assignedCenter ? assignedCenter : (typeMatch ? typeMatch.name : "出勤"));
        workCount++;
      } else {
        row.push(typeMatch ? typeMatch.name : (req ? "希望休" : "休日"));
      }
    }
    row.push(`${workCount}日`);
    csvContent += row.join(",") + "\n";
    gridData.push(row);
  });

  // 日次過不足情報の行作成
  const suffRow = ["稼働状況"];
  const reqCount = parseInt(document.getElementById('config-required-drivers').value) || 2;
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    let scheduled = 0;
    filteredDrivers.forEach(drv => {
      const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
      const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
      const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
      const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
      const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');
      if (isWork) scheduled++;
    });
    
    suffRow.push(`${scheduled}/${reqCount}`);
  }
  suffRow.push("");
  csvContent += suffRow.join(",") + "\n";
  gridData.push(suffRow);

  // ブラウザによるダウンロード実行
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `shift_${state.currentYear}_${state.currentMonth}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("CSVファイルを出力しました。");

  // GAS Web Appと連携してGoogleスプレッドシートを同期
  const gasUrl = localStorage.getItem('gas_notification_url');
  if (gasUrl) {
    const spreadsheetUrl = localStorage.getItem('spreadsheet_url') || 'https://docs.google.com/spreadsheets/d/1BZl3Gao_gRLGy_qzUYbSyjrUPPDvY7M683OR17-yA5o/edit';
    const match = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = match ? match[1] : "1BZl3Gao_gRLGy_qzUYbSyjrUPPDvY7M683OR17-yA5o";

    fetch(gasUrl, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({
        action: "exportShift",
        year: state.currentYear,
        month: state.currentMonth,
        spreadsheetId: spreadsheetId,
        gridData: gridData
      })
    }).then(() => {
      showToast("Google スプレッドシートも自動更新しました！");
    }).catch(err => {
      console.error("Failed to sync spreadsheet:", err);
      showToast("スプレッドシート同期に失敗しました: " + err.message, "error");
    });
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
      badge.title = `${req.driver_name}: ${req.reason || '理由記入なし'}`;
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
      <div style="display:flex; flex-direction:column; gap:2px; flex:1">
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

// センター・局名マスターの描画
function renderCentersManagement() {
  const container = document.getElementById('centers-management-list');
  if (!container) return;

  container.innerHTML = '';

  const centers = state.centers || [];

  if (centers.length === 0) {
    container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted)">登録されたセンター・局はありません。</span>`;
    return;
  }

  centers.forEach(c => {
    const badge = document.createElement('div');
    badge.className = 'driver-mini-badge';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '6px';
    badge.style.padding = '4px 10px';
    badge.style.fontSize = '0.75rem';
    badge.style.background = 'rgba(255, 255, 255, 0.05)';
    badge.style.border = '1px solid var(--border-color)';
    badge.style.borderRadius = '20px';
    badge.style.color = 'var(--text-main)';

    badge.innerHTML = `
      <span>${c}</span>
      <span class="delete-center-btn" style="cursor:pointer; color:var(--rejected); font-weight:bold" title="このセンター・局名を削除">✖</span>
    `;

    // 削除イベントの紐付け
    badge.querySelector('.delete-center-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`本当に「${c}」を削除しますか？\n（※所属しているドライバーのデータはそのまま残りますが、選択肢から除外されます）`)) {
        try {
          await db.deleteCenter(c);
          showToast(`「${c}」を削除しました。`);
          await loadAdminDashboard();
        } catch (err) {
          showToast("削除エラー: " + err.message, 'error');
        }
      }
    });

    container.appendChild(badge);
  });
}

// シフト表示区分の管理描画
function renderShiftTypesManagement() {
  const container = document.getElementById('shift-types-management-list');
  if (!container) return;

  container.innerHTML = '';

  const types = state.shiftTypes || [];

  if (types.length === 0) {
    container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted)">登録された区分はありません。</span>`;
    return;
  }

  types.forEach(t => {
    const badge = document.createElement('div');
    badge.className = 'driver-mini-badge';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '8px';
    badge.style.padding = '4px 10px';
    badge.style.fontSize = '0.75rem';
    badge.style.background = 'rgba(255, 255, 255, 0.05)';
    badge.style.border = '1px solid var(--border-color)';
    badge.style.borderRadius = '20px';
    badge.style.color = 'var(--text-main)';

    const isSystemType = (t.id === 'work' || t.id === 'off' || t.id === 'hope_off');
    
    badge.innerHTML = `
      <span><strong>${t.name}</strong> (${t.is_work ? '出勤' : '休日'})</span>
      <span class="edit-shift-type-btn" style="cursor:pointer; color:var(--accent-color)" title="名前を変更">✏️</span>
      ${isSystemType ? '' : '<span class="delete-shift-type-btn" style="cursor:pointer; color:var(--rejected); font-weight:bold" title="区分を削除">✖</span>'}
    `;

    // 編集（名前変更）イベント
    badge.querySelector('.edit-shift-type-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = prompt(`「${t.name}」の新しい表示記号/名前を入力してください（全角・半角2文字以内を推奨します）：`, t.name);
      if (newName === null) return;
      
      const cleanName = newName.trim();
      if (!cleanName) {
        showToast("名前を入力してください。", "warning");
        return;
      }

      t.name = cleanName;
      try {
        await db.saveShiftTypes(state.shiftTypes);
        showToast(`シフト区分名を「${cleanName}」に変更しました。`);
        await loadAdminDashboard();
      } catch (err) {
        showToast("編集エラー: " + err.message, 'error');
      }
    });

    // 削除イベント（システム既定以外のみ）
    if (!isSystemType) {
      badge.querySelector('.delete-shift-type-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`本当にシフト区分「${t.name}」を削除しますか？\n（※シフト表に配置されている該当区分は選択肢から除外されます）`)) {
          state.shiftTypes = state.shiftTypes.filter(x => x.id !== t.id);
          try {
            await db.saveShiftTypes(state.shiftTypes);
            showToast(`シフト区分「${t.name}」を削除しました。`);
            await loadAdminDashboard();
          } catch (err) {
            showToast("削除エラー: " + err.message, 'error');
          }
        }
      });
    }

    container.appendChild(badge);
  });
}

// =================================================================
// 設定モーダルの制御
// =================================================================
function openSettingsModal() {
  // すでに保存されているURLとAnonキーがあれば挿入、無ければデフォルトの値を挿入
  document.getElementById('setting-url').value = localStorage.getItem('supabase_url') || 'https://byugsueqscfxobxrfuno.supabase.co';
  document.getElementById('setting-key').value = localStorage.getItem('supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5dWdzdWVxc2NmeG9ieHJmdW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTQ5ODAsImV4cCI6MjA5NzEzMDk4MH0.tLxM1wr5cAkpoz9_Va38a9fHXJTdUU5tVwHDp7s-3tU';
  document.getElementById('setting-gas-url').value = localStorage.getItem('gas_notification_url') || '';
  document.getElementById('setting-spreadsheet-url').value = localStorage.getItem('spreadsheet_url') || 'https://docs.google.com/spreadsheets/d/1BZl3Gao_gRLGy_qzUYbSyjrUPPDvY7M683OR17-yA5o/edit';
  
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
  
  // GAS通知用URLとスプレッドシートURLの保存
  const gasUrl = document.getElementById('setting-gas-url').value.trim();
  localStorage.setItem('gas_notification_url', gasUrl);
  const spreadsheetUrl = document.getElementById('setting-spreadsheet-url').value.trim();
  localStorage.setItem('spreadsheet_url', spreadsheetUrl);
  
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

  // シフト表の月変更 (管理者画面 - シフト管理)
  const shiftPrevMonthBtn = document.getElementById('shift-prev-month-btn');
  const shiftNextMonthBtn = document.getElementById('shift-next-month-btn');
  if (shiftPrevMonthBtn) {
    shiftPrevMonthBtn.addEventListener('click', () => {
      state.currentMonth--;
      if (state.currentMonth < 1) {
        state.currentMonth = 12;
        state.currentYear--;
      }
      loadAdminDashboard();
    });
  }
  if (shiftNextMonthBtn) {
    shiftNextMonthBtn.addEventListener('click', () => {
      state.currentMonth++;
      if (state.currentMonth > 12) {
        state.currentMonth = 1;
        state.currentYear++;
      }
      loadAdminDashboard();
    });
  }

  // 所属フィルター変更イベント
  const filterSelect = document.getElementById('filter-center-station');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.filterCenterStation = e.target.value;
      renderShiftGrid();
    });
  }

  // センター追加フォームの送信イベント
  const addCenterForm = document.getElementById('add-center-form');
  if (addCenterForm) {
    addCenterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('new-center-name');
      const val = input ? input.value.trim() : '';
      if (!val) return;
      try {
        await db.addCenter(val);
        showToast(`「${val}」を追加しました。`);
        if (input) input.value = '';
        await loadAdminDashboard();
      } catch (err) {
        showToast("追加エラー: " + err.message, 'error');
      }
    });
  }

  // シフト区分追加フォームの送信イベント
  const addShiftTypeForm = document.getElementById('add-shift-type-form');
  if (addShiftTypeForm) {
    addShiftTypeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('new-shift-type-name');
      const selectIsWork = document.getElementById('new-shift-type-is-work');
      
      const name = input ? input.value.trim() : '';
      const isWork = selectIsWork ? selectIsWork.value === 'true' : false;
      
      if (!name) return;
      
      // 同一名の重複チェック
      if (state.shiftTypes.some(t => t.name === name)) {
        showToast("同じ名前のシフト区分が既に存在します。", "warning");
        return;
      }
      
      const newId = 'st_' + Date.now();
      const newType = { id: newId, name: name, is_work: isWork };
      
      state.shiftTypes.push(newType);
      
      try {
        await db.saveShiftTypes(state.shiftTypes);
        showToast(`シフト区分「${name}」を追加しました。`);
        if (input) input.value = '';
        await loadAdminDashboard();
      } catch (err) {
        showToast("追加エラー: " + err.message, 'error');
      }
    });
  }

  // 申請一括送信
  elements.submitRequestsBtn.addEventListener('click', submitAllRequests);

  // 管理者サブタブの切り替えイベント
  if (elements.tabBtnApprove && elements.tabBtnShift) {
    elements.tabBtnApprove.addEventListener('click', () => {
      elements.tabBtnApprove.classList.add('active');
      elements.tabBtnShift.classList.remove('active');
      elements.tabBtnApprove.style.color = 'var(--text-main)';
      elements.tabBtnShift.style.color = 'var(--text-muted)';
      elements.adminApprovePane.classList.remove('hidden');
      elements.adminShiftPane.classList.add('hidden');
    });

    elements.tabBtnShift.addEventListener('click', () => {
      elements.tabBtnShift.classList.add('active');
      elements.tabBtnApprove.classList.remove('active');
      elements.tabBtnShift.style.color = 'var(--text-main)';
      elements.tabBtnApprove.style.color = 'var(--text-muted)';
      elements.adminShiftPane.classList.remove('hidden');
      elements.adminApprovePane.classList.add('hidden');
      renderShiftGrid();
    });
  }

  // ドライバーサブタブの切り替えイベント
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

  // ドライバー用シフト月切り替えイベント
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



  // シフト操作ボタンのイベントバインド
  if (elements.btnSaveDraft) elements.btnSaveDraft.addEventListener('click', saveShiftDraft);
  if (elements.btnPublishShift) elements.btnPublishShift.addEventListener('click', publishShift);
  if (elements.btnExportCsv) elements.btnExportCsv.addEventListener('click', exportShiftCsv);

  // シフト編集モード用ボタンのバインド
  if (elements.btnEditShift) {
    elements.btnEditShift.addEventListener('click', () => {
      state.isShiftEditing = true;
      state.originalShifts = JSON.parse(JSON.stringify(state.shifts)); // バックアップ
      showToast("シフトの編集を開始しました。セルをクリックして「出」と「休・希望」を切り替えてください。", "info");
      renderShiftGrid();
    });
  }
  if (elements.btnConfirmShift) {
    elements.btnConfirmShift.addEventListener('click', async () => {
      state.isShiftEditing = false;
      try {
        await db.saveShifts(state.currentYear, state.currentMonth, state.shifts, 'draft');
        state.shiftPublishStatus = 'draft';
        showToast("シフトの変更を確定して下書き保存しました！");
      } catch (err) {
        if (err.code === 'DB_MIGRATION_REQUIRED') {
          state.shiftPublishStatus = 'draft';
          alert("【注意】シフトは保存されましたが、データベースの更新（マイグレーション）が必要です。\n\n完全に動作させるには、SupabaseのSQL Editor等で以下のSQLを実行してください：\n\nALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS assigned_center TEXT;\nALTER TABLE public.shifts DROP CONSTRAINT IF EXISTS shifts_shift_type_check;\nCREATE TABLE IF NOT EXISTS public.shift_types (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  is_work BOOLEAN NOT NULL DEFAULT false,\n  color TEXT\n);");
        } else {
          showToast("変更確定エラー: " + err.message, 'error');
        }
      }
      renderShiftGrid();
    });
  }
  if (elements.btnCancelEditShift) {
    elements.btnCancelEditShift.addEventListener('click', () => {
      state.isShiftEditing = false;
      state.shifts = JSON.parse(JSON.stringify(state.originalShifts)); // バックアップから復元
      showToast("編集をキャンセルし、変更前の状態に戻しました。");
      renderShiftGrid();
    });
  }

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



// ドライバー画面用の確定シフト表テーブル描画
function renderDriverShiftGrid() {
  if (!elements.driverShiftGridContainer) return;

  // 月表示の更新
  const monthTitle = document.getElementById('driver-shift-calendar-month');
  if (monthTitle) {
    monthTitle.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  }

  // 所属先名称の表示更新
  const paneTitle = document.getElementById('driver-shift-pane-title');
  if (paneTitle) {
    paneTitle.textContent = `確定シフト表`;
  }

  // シフトが未公開の場合
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

  // ログインしたドライバーの所属先一覧を取得
  const myStations = state.user && state.user.center_station 
    ? state.user.center_station.split(',').map(s => s.trim()) 
    : [];

  const stationsToRender = myStations.length === 0 ? ['all'] : myStations;
  let html = '';

  stationsToRender.forEach((stationName, idx) => {
    // 各所属先に所属するドライバーのみを抽出
    const filteredDrivers = state.drivers.filter(d => {
      if (stationName === 'all') return true;
      const dStations = d.center_station ? d.center_station.split(',').map(s => s.trim()) : [];
      return dStations.includes(stationName);
    });

    // 該当する所属先のドライバーが一人もいない場合はテーブルを描画しない
    if (filteredDrivers.length === 0 && stationName !== 'all') {
      return;
    }

    const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
    
    // 所属先カード風のコンテナ
    html += `<div class="station-shift-section" style="margin: 1.25rem; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255,255,255,0.01); overflow: hidden;">`;
    
    // 所属先名ヘッダーの描画（所属ありの場合のみ）
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

    // 各ドライバーの行を描画 (閲覧用のため、バッジの削除ボタンや追加プルダウンは一切描画しない)
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

        // 閲覧用のため、クリックイベントのない静的セルとして描画
        if (isWork) {
          const displayText = assignedCenter ? assignedCenter.substring(0, 2) : (typeMatch ? typeMatch.name : '○');
          const titleText = assignedCenter ? assignedCenter : (typeMatch ? typeMatch.name : '出勤');
          html += `<td class="shift-cell work" style="cursor: default;" title="${titleText}">${displayText}</td>`;
          workCount++;
        } else {
          const displayText = typeMatch ? typeMatch.name : (req ? '希望' : '休');
          html += `<td class="shift-cell hope_off" style="cursor: default;" title="${displayText}">${displayText}</td>`;
        }
      }

      html += `<td class="shift-stat-col">${workCount}日</td>`;
      html += `</tr>`;
    });

    // 日次出勤人数過不足行
    html += `<tr class="sufficiency-row">`;
    html += `<td class="driver-name-col">稼働状況</td>`;
    
    const reqCount = parseInt(document.getElementById('config-required-drivers').value) || 2;

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

// ドキュメント読み込み完了時に起動
document.addEventListener('DOMContentLoaded', initApp);
