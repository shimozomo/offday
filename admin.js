// admin.js controller for Admin Interface

// =================================================================
// アプリケーション状態 (State)
// =================================================================
let state = {
  user: null,
  view: 'auth', // 'auth' | 'admin'
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-indexed (1-12)
  monthlyRequests: [], // 取得した当月の申請リスト
  drivers: [], // ドライバーリスト
  allRequests: [], // 全員の申請リスト
  allPendingRequests: [], // 全期間の保留中の申請
  shifts: [], // 当月の確定/下書きシフトデータ
  shiftPublishStatus: 'draft', // 当月の公開ステータス 'draft' | 'published'
  filterCenterStation: 'all', // 所属フィルター値
  centers: [], // 所属センター・局マスタ一覧
  isShiftEditing: false, // シフト編集モード中か
  originalShifts: [], // 編集開始前のシフトデータのバックアップ
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
  loginForm: document.getElementById('login-form'),

  // メインレイアウト
  appHeader: document.getElementById('app-header'),
  userNameDisplay: document.getElementById('user-name-display'),
  userRoleDisplay: document.getElementById('user-role-display'),
  connectionBadge: document.getElementById('connection-badge'),
  logoutBtn: document.getElementById('logout-btn'),
  settingsBtn: document.getElementById('settings-btn'),

  // ダッシュボードビュー
  adminView: document.getElementById('admin-view'),

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
  tabBtnDailyAllocation: document.getElementById('tab-btn-daily-allocation'),
  adminApprovePane: document.getElementById('admin-approve-pane'),
  adminShiftPane: document.getElementById('admin-shift-pane'),
  adminDailyAllocationPane: document.getElementById('admin-daily-allocation-pane'),
  allocationDatePicker: document.getElementById('allocation-date-picker'),
  dailyAllocationContainer: document.getElementById('daily-allocation-container'),
  btnSaveDraft: document.getElementById('btn-save-draft'),
  btnPublishShift: document.getElementById('btn-publish-shift'),
  btnDownloadPdf: document.getElementById('btn-download-pdf'),
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

  // PDFダウンロードモーダル
  printModal: document.getElementById('print-modal'),
  printCenterSelect: document.getElementById('print-center-select'),
  printConfigForm: document.getElementById('print-config-form'),
  closePrintBtn: document.getElementById('close-print-btn'),
  btnCancelPrint: document.getElementById('btn-cancel-print'),
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
  
  setTimeout(() => toast.classList.add('active'), 50);
  
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
  elements.adminView.classList.add('hidden');
  elements.appHeader.classList.add('hidden');

  if (viewName === 'auth') {
    elements.authScreen.classList.remove('hidden');
    elements.loginCard.classList.remove('hidden');

    const passwordInput = document.getElementById('login-admin-password');
    if (passwordInput) {
      setTimeout(() => passwordInput.focus(), 50);
    }
  } else {
    elements.appHeader.classList.remove('hidden');
    updateHeaderUI();

    if (viewName === 'admin') {
      elements.adminView.classList.remove('hidden');
      
      // タブ初期リセット
      if (elements.tabBtnApprove && elements.tabBtnShift) {
        elements.tabBtnApprove.classList.add('active');
        elements.tabBtnShift.classList.remove('active');
        elements.tabBtnApprove.style.color = 'var(--text-main)';
        elements.tabBtnShift.style.color = 'var(--text-muted)';
        elements.adminApprovePane.classList.remove('hidden');
        elements.adminShiftPane.classList.add('hidden');
      }

      loadAdminDashboard();
    }
  }
}

// ヘッダーUIの同期
function updateHeaderUI() {
  if (!state.user) return;
  elements.userNameDisplay.textContent = state.user.name;
  
  elements.userRoleDisplay.textContent = '管理者';
  elements.userRoleDisplay.className = 'user-role-badge admin';
  elements.settingsBtn.classList.remove('hidden');

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
  
  const password = document.getElementById('login-admin-password').value;
  let email;
  
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
        const admins = await db.getAllAdmins();
        const hasActiveAdmin = admins.some(a => a.admin_passcode);
        if (!hasActiveAdmin) {
          if (confirm("データベースに有効な管理者パスコードが設定されていません。\n入力したパスワードで最初の管理者「管理者」を作成しますか？")) {
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
  
  try {
    const user = await db.signIn(email, password);
    state.user = user;
    
    localStorage.setItem('last_login_name', user.name);
    showToast(`${user.name}としてログインしました。`);
    showView('admin');
    elements.loginForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleLogout() {
  await db.signOut();
  state.user = null;
  showToast('ログアウトしました。');
  showView('auth');
}

// =================================================================
// 管理者画面制御ロジック (Admin Actions)
// =================================================================
async function loadAdminDashboard() {
  state.isShiftEditing = false;
  try {
    state.drivers = await db.getAllDrivers(state.currentYear, state.currentMonth);
    state.allRequests = await db.getOffDayRequests(null, state.currentYear, state.currentMonth);
    state.allPendingRequests = await db.getOffDayRequests(null, null, null);
    state.shifts = await db.getShifts(state.currentYear, state.currentMonth);
    state.shiftPublishStatus = await db.getShiftPublishStatus(state.currentYear, state.currentMonth);
    state.centers = await db.getCenters();
    state.shiftTypes = await db.getShiftTypes();

    renderAdminCalendar();
    renderApprovalQueue();
    renderRosterList();
    renderCentersManagement();
    renderShiftTypesManagement();
    renderShiftGrid();
  } catch (err) {
    showToast("管理者データロード失敗: " + err.message, 'error');
  }
}

function renderShiftGrid() {
  if (!elements.shiftGridContainer) return;

  const shiftCalendarMonth = document.getElementById('shift-calendar-month');
  if (shiftCalendarMonth) {
    shiftCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  }

  const filterSelect = document.getElementById('filter-center-station');
  if (filterSelect) {
    const centers = state.centers || [];
    const currentVal = state.filterCenterStation || 'all';
    
    filterSelect.innerHTML = `<option value="all">すべてのセンター・局 (個別並列表示)</option>`;
    centers.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filterSelect.appendChild(opt);
    });

    if (centers.includes(currentVal) || currentVal === 'all') {
      filterSelect.value = currentVal;
      state.filterCenterStation = currentVal;
    } else {
      filterSelect.value = 'all';
      state.filterCenterStation = 'all';
    }
  }

  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const centers = state.centers || [];
  
  let centersToRender = [];
  if (!state.filterCenterStation || state.filterCenterStation === 'all') {
    centersToRender = [...centers];
    if (state.drivers.some(d => !d.center_station)) {
      centersToRender.push('未設定');
    }
  } else {
    centersToRender = [state.filterCenterStation];
  }

  let html = "";

  if (centersToRender.length === 0) {
    html = `
      <div class="empty-state" style="padding: 2.5rem; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
        センター・局が登録されていません。
      </div>
    `;
    elements.shiftGridContainer.innerHTML = html;
    return;
  }

  centersToRender.forEach(centerName => {
    const filteredDriversForCenter = state.drivers.filter(d => {
      if (centerName === '未設定') {
        return !d.center_station;
      }
      if (!d.center_station) return false;
      const stations = d.center_station.split(',').map(s => s.trim());
      return stations.includes(centerName);
    });

    html += `
      <div class="center-shift-section" style="margin-bottom: 2.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: rgba(255,255,255,0.01); overflow: hidden; box-shadow: var(--shadow-md);">
        <div class="center-section-header" style="background: rgba(255,255,255,0.02); padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between;">
          <h3 style="font-size: 1.05rem; font-weight: 700; color: ${centerName === '未設定' ? 'var(--text-muted)' : 'var(--accent-color)'}; display: flex; align-items: center; gap: 0.5rem; margin: 0;">
            ${centerName === '未設定' ? '❓' : '🏢'} ${centerName}
          </h3>
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">所属ドライバー: ${filteredDriversForCenter.length}名</span>
        </div>
        
        <div class="shift-table-wrapper" style="overflow-x: auto; width: 100%;">
          <table class="shift-table${state.isShiftEditing ? ' editing' : ''}" style="width: 100%; border-collapse: separate; border-spacing: 0;">
            <thead>
              <tr>
                <th class="driver-name-col">ドライバー名</th>
    `;
    
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
    html += `<th class="shift-stat-col">出勤日数</th></tr></thead><tbody>`;

    filteredDriversForCenter.forEach(drv => {
      html += `<tr>`;
      
      let nameCellHtml = `<td class="driver-name-col">`;
      nameCellHtml += `<div style="display: flex; flex-direction: column; gap: 2px; min-height: 38px; justify-content: center; padding: 4px 0;">`;
      
      if (centerName !== '未設定') {
        nameCellHtml += `
          <div style="display: flex; align-items: center; width: 100%;">
            <span style="font-weight: 600;">${drv.name}</span>
            <span class="remove-from-center-btn" data-driver-id="${drv.id}" data-station="${centerName}" style="cursor: pointer; color: var(--rejected); font-weight: bold; font-size: 0.85rem; margin-left: auto; padding: 2px 6px; border-radius: 4px; transition: background 0.15s;" title="${centerName}から解除">✖</span>
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
        
        const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
        const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
        const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
        const assignedCenter = dayShift ? dayShift.assigned_center : null;

        const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
        const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');

        if (state.isShiftEditing) {
          let cellClass = "shift-cell editing-select";
          if (isWork) {
            cellClass += " work";
            workCount++;
          } else {
            cellClass += " hope_off";
          }
          
          const titleText = typeMatch ? typeMatch.name : '出勤';
          
          html += `<td class="${cellClass}" data-driver-id="${drv.id}" data-date="${dateStr}" title="${titleText}">`;
          html += `<select class="shift-cell-select" data-driver-id="${drv.id}" data-date="${dateStr}" style="width: 100%; font-size: 0.75rem; background: transparent; border: none; color: inherit; padding: 0;">`;
          
          state.shiftTypes.forEach(t => {
            const isSelected = (shiftType === t.id);
            html += `<option value="type:${t.id}" ${isSelected ? 'selected' : ''}>${t.name}</option>`;
          });
          
          html += `</select></td>`;
        } else {
          if (isWork) {
            const displayText = typeMatch ? typeMatch.name : '出勤';
            html += `<td class="shift-cell work" data-driver-id="${drv.id}" data-date="${dateStr}" title="${displayText}">${displayText}</td>`;
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

    if (centerName !== '未設定') {
      const unallocatedDrivers = state.drivers.filter(d => {
        if (!d.center_station) return true;
        const stations = d.center_station.split(',').map(s => s.trim());
        return !stations.includes(centerName);
      });
      html += `<tr class="allocate-row" style="background: rgba(255,255,255,0.01);">`;
      html += `<td class="driver-name-col">`;
      html += `<select class="allocate-driver-select form-input form-select" data-station="${centerName}" style="width: 100%; padding: 2px 1.5rem 2px 6px; font-size: 0.75rem; height: 24px; margin: 0; background: transparent; border: 1px dashed var(--border-color); color: var(--text-muted); border-radius: 4px;">`;
      html += `<option value="">➕ ドライバーを配置</option>`;
      unallocatedDrivers.forEach(d => {
        html += `<option value="${d.id}">${d.name} (${d.center_station || '未設定'})</option>`;
      });
      html += `</select></td>`;
      for (let day = 1; day <= lastDay; day++) {
        html += `<td style="background: rgba(255,255,255,0.01); border-top: 1px dashed var(--border-color); border-bottom: 1px dashed var(--border-color);"></td>`;
      }
      html += `<td></td>`;
      html += `</tr>`;
    }

    html += `<tr class="sufficiency-row">`;
    html += `<td class="driver-name-col">要員充足状況</td>`;
    
    const reqCount = parseInt(document.getElementById('config-required-drivers').value) || 2;

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      let scheduledCount = 0;
      filteredDriversForCenter.forEach(drv => {
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

    html += `<td></td></tr></tbody></table></div></div>`;
  });

  elements.shiftGridContainer.innerHTML = html;

  // バインド処理
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
  });

  elements.shiftGridContainer.querySelectorAll('.shift-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
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

  elements.shiftGridContainer.querySelectorAll('.shift-cell-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const driverId = select.getAttribute('data-driver-id');
      const dateStr = select.getAttribute('data-date');
      const value = select.value;

      let dayShiftIdx = state.shifts.findIndex(s => s.driver_id === driverId && s.shift_date === dateStr);

      if (value.startsWith('center:')) {
        const centerName = value.substring(7);
        if (dayShiftIdx === -1) {
          state.shifts.push({ driver_id: driverId, shift_date: dateStr, shift_type: 'work', assigned_center: centerName });
        } else {
          state.shifts[dayShiftIdx].shift_type = 'work';
          state.shifts[dayShiftIdx].assigned_center = centerName;
        }
      } else if (value.startsWith('type:')) {
        const typeId = value.substring(5);
        if (dayShiftIdx === -1) {
          state.shifts.push({ driver_id: driverId, shift_date: dateStr, shift_type: typeId, assigned_center: null });
        } else {
          state.shifts[dayShiftIdx].shift_type = typeId;
          state.shifts[dayShiftIdx].assigned_center = null;
        }
      }
      renderShiftGrid();
    });
  });

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

  const editModeOnlyButtons = [elements.btnSaveDraft, elements.btnPublishShift];
  editModeOnlyButtons.forEach(btn => {
    if (btn) {
      btn.disabled = state.isShiftEditing;
      btn.style.opacity = state.isShiftEditing ? '0.5' : '1';
      btn.style.pointerEvents = state.isShiftEditing ? 'none' : 'auto';
    }
  });

  if (elements.btnDownloadPdf) {
    elements.btnDownloadPdf.disabled = state.isShiftEditing;
    elements.btnDownloadPdf.style.opacity = state.isShiftEditing ? '0.5' : '1';
    elements.btnDownloadPdf.style.pointerEvents = state.isShiftEditing ? 'none' : 'auto';
    elements.btnDownloadPdf.title = state.isShiftEditing ? "編集中のためダウンロードできません。" : "";
  }

  elements.shiftGridContainer.querySelectorAll('.allocate-driver-select').forEach(allocateSelect => {
    allocateSelect.addEventListener('change', async () => {
      const driverId = allocateSelect.value;
      if (!driverId) return;
      const targetStation = allocateSelect.getAttribute('data-station');
      if (!targetStation) return;
      const drv = state.drivers.find(d => d.id === driverId);
      if (!drv) return;
      try {
        let stations = drv.center_station ? drv.center_station.split(',').map(s => s.trim()) : [];
        if (!stations.includes(targetStation)) {
          stations.push(targetStation);
        }
        const nextVal = stations.join(',');
        await db.updateDriverCenterStation(driverId, nextVal);
        showToast(`「${drv.name}」を「${targetStation}」に配置しました。`);
        await loadAdminDashboard();
      } catch (err) {
        showToast("配置エラー: " + err.message, 'error');
        await loadAdminDashboard();
      }
    });
  });
}

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

function generateShiftGridData() {
  const lastDay = new Date(state.currentYear, state.currentMonth, 0).getDate();
  const gridData = [];
  
  const filteredDrivers = (!state.filterCenterStation || state.filterCenterStation === 'all')
    ? state.drivers
    : state.drivers.filter(d => {
        const stations = d.center_station ? d.center_station.split(',').map(s => s.trim()) : [];
        return stations.includes(state.filterCenterStation);
      });

  const header = ["ドライバー名"];
  for (let d = 1; d <= lastDay; d++) {
    header.push(`${d}日`);
  }
  header.push("出勤日数");
  gridData.push(header);

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
    gridData.push(row);
  });

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
  gridData.push(suffRow);

  return gridData;
}

function downloadAppShiftPdf(targetCenter = 'all') {
  const printWindow = window.open('', '_blank');
  const displayTitle = targetCenter === 'all'
    ? `${state.currentYear}年 ${state.currentMonth}月 シフト表 (すべてのセンター・局)`
    : `${state.currentYear}年 ${state.currentMonth}月 シフト表 (${targetCenter})`;

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
        
        .center-shift-section {
          margin-bottom: 20px;
          page-break-inside: avoid;
        }
        .center-title {
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
        
        /* Hide edit elements for print */
        .remove-from-center-btn, .allocate-row {
          display: none !important;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">株式会社enTrust 希望休管理</div>
        <h1 class="title">${displayTitle}</h1>
        <div class="meta-info">出力日時: ${new Date().toLocaleString('ja-JP')}</div>
      </div>
  `;

  const gridContainer = document.getElementById('shift-grid-container');
  if (gridContainer) {
    const cloned = gridContainer.cloneNode(true);
    
    cloned.querySelectorAll('.allocate-row').forEach(row => row.remove());
    cloned.querySelectorAll('.remove-from-center-btn').forEach(btn => btn.remove());
    
    cloned.querySelectorAll('.center-shift-section').forEach(sect => {
      const headerTitle = sect.querySelector('h3').textContent.trim();
      const cleanHeaderTitle = headerTitle.replace(/^[🏢❓]\s*/, '');
      if (targetCenter !== 'all' && cleanHeaderTitle !== targetCenter) {
        return;
      }
      const tableWrapper = sect.querySelector('.shift-table-wrapper');
      if (tableWrapper) {
        html += `
          <div class="center-shift-section">
            <h2 class="center-title">${headerTitle}</h2>
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
  };
}

function openPrintModal() {
  if (!elements.printCenterSelect) return;

  const centers = state.centers || [];
  let html = `<option value="all">すべてのセンター・局 (個別並列)</option>`;
  centers.forEach(c => {
    html += `<option value="${c}">${c}</option>`;
  });
  
  if (state.drivers.some(d => !d.center_station)) {
    html += `<option value="未設定">未設定のドライバーのみ</option>`;
  }

  elements.printCenterSelect.innerHTML = html;

  const currentFilter = state.filterCenterStation || 'all';
  if (centers.includes(currentFilter) || currentFilter === 'all' || currentFilter === '未設定') {
    elements.printCenterSelect.value = currentFilter;
  } else {
    elements.printCenterSelect.value = 'all';
  }

  openModal(elements.printModal);
}

function renderAdminCalendar() {
  elements.adminCalendarMonth.textContent = `${state.currentYear}年 ${state.currentMonth}月`;
  elements.adminCalendarGrid.innerHTML = '';

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

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cell admin-cell other-month';
    cell.innerHTML = `<div class="admin-cell-header"><span class="admin-day-number">${prevMonthLastDay - i}</span></div>`;
    elements.adminCalendarGrid.appendChild(cell);
  }

  for (let day = 1; day <= lastDay; day++) {
    const cell = document.createElement('div');
    cell.className = 'cell admin-cell';
    
    const dateStr = `${state.currentYear}-${String(state.currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayReqs = state.allRequests.filter(r => r.request_date === dateStr);
    
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
      
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        openApprovalModal(req);
      });
      listContainer.appendChild(badge);
    });

    elements.adminCalendarGrid.appendChild(cell);
  }
}

function renderDailyAllocation() {
  if (!elements.dailyAllocationContainer) return;

  const dateVal = elements.allocationDatePicker.value;
  if (!dateVal) return;

  const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
  const dt = dateVal.split("-");
  const dObj = new Date(parseInt(dt[0]), parseInt(dt[1]) - 1, parseInt(dt[2]));
  const weekdayStr = weekdayNames[dObj.getDay()];

  const centers = state.centers || [];
  let html = "";

  // 1. 各センターごとの配置カード
  centers.forEach(center => {
    const color = getCenterColor(center.name);
    const assignedDrivers = state.drivers.filter(drv => {
      const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateVal);
      return dayShift && dayShift.assigned_center === center.name;
    });

    html += `
      <div class="glass-panel site-allocation-card" style="border-top: 4px solid ${color}; padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
        <h3 style="font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; color: var(--text-main);">
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
          ${center.name}
          <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: auto;">${assignedDrivers.length}名</span>
        </h3>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 40px; align-content: flex-start; padding: 0.5rem 0;">
          ${assignedDrivers.length > 0 
            ? assignedDrivers.map(drv => `
                <span class="driver-allocation-tag" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: var(--radius-full); padding: 4px 10px; font-size: 0.8rem; font-weight: 600;">
                  ${drv.name}
                </span>
              `).join("")
            : `<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">本日の配置なし</span>`
          }
        </div>
      </div>
    `;
  });

  // 2. 一般出勤 (センター未指定)
  const generalWorkDrivers = state.drivers.filter(drv => {
    const dateStr = dateVal;
    const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
    const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
    const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
    const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
    const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');
    
    const assignedCenter = dayShift ? dayShift.assigned_center : null;
    return isWork && !assignedCenter;
  });

  html += `
    <div class="glass-panel site-allocation-card" style="border-top: 4px solid var(--accent-color); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
      <h3 style="font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; color: var(--text-main);">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: var(--accent-color); display: inline-block;"></span>
        一般出勤 (センター未指定)
        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: auto;">${generalWorkDrivers.length}名</span>
      </h3>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 40px; align-content: flex-start; padding: 0.5rem 0;">
        ${generalWorkDrivers.length > 0 
          ? generalWorkDrivers.map(drv => `
              <span class="driver-allocation-tag" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: var(--radius-full); padding: 4px 10px; font-size: 0.8rem; font-weight: 600;">
                ${drv.name}
              </span>
            `).join("")
          : `<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">なし</span>`
        }
      </div>
    </div>
  `;

  // 3. 公休・希望休 (休み)
  const offDrivers = state.drivers.filter(drv => {
    const dateStr = dateVal;
    const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateStr && r.status === 'approved');
    const dayShift = state.shifts.find(s => s.driver_id === drv.id && s.shift_date === dateStr);
    const shiftType = dayShift ? dayShift.shift_type : (req ? 'hope_off' : 'work');
    const typeMatch = state.shiftTypes.find(t => t.id === shiftType);
    const isWork = typeMatch ? typeMatch.is_work : (shiftType === 'work');
    return !isWork;
  });

  html += `
    <div class="glass-panel site-allocation-card" style="border-top: 4px solid var(--rejected); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
      <h3 style="font-size: 1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; color: var(--text-main);">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: var(--rejected); display: inline-block;"></span>
        公休・希望休 (休み)
        <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal; margin-left: auto;">${offDrivers.length}名</span>
      </h3>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 40px; align-content: flex-start; padding: 0.5rem 0;">
        ${offDrivers.length > 0 
          ? offDrivers.map(drv => {
              const req = state.allRequests.find(r => r.driver_id === drv.id && r.request_date === dateVal && r.status === 'approved');
              const displayLabel = req ? `${drv.name} (希望)` : drv.name;
              const badgeStyle = req 
                ? 'background: var(--pending-bg); border-color: var(--pending); color: var(--pending);'
                : 'background: rgba(255, 255, 255, 0.03); border-color: var(--border-color); color: var(--text-sub);';
              return `
                <span class="driver-allocation-tag" style="border: 1px solid var(--border-color); border-radius: var(--radius-full); padding: 4px 10px; font-size: 0.8rem; font-weight: 600; ${badgeStyle}">
                  ${displayLabel}
                </span>
              `;
            }).join("")
          : `<span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">なし</span>`
        }
      </div>
    </div>
  `;

  elements.dailyAllocationContainer.innerHTML = html;
}

function renderApprovalQueue() {
  elements.approvalQueueList.innerHTML = '';
  
  const pendingRequests = (state.allPendingRequests || []).filter(r => r.status === 'pending');
  
  if (pendingRequests.length === 0) {
    elements.approvalQueueList.innerHTML = `
      <div class="empty-state">現在、承認待ちの希望休申請はありません。</div>
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

    card.querySelector('.btn-action.approve').addEventListener('click', () => handleApproveReject(req.id, 'approved'));
    card.querySelector('.btn-action.reject').addEventListener('click', () => handleApproveReject(req.id, 'rejected'));

    elements.approvalQueueList.appendChild(card);
  });
}

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

function openApprovalModal(req) {
  elements.detailDateLabel.textContent = formatDateJapanese(req.request_date) + ` (${req.driver_name})`;
  
  const statusTexts = { pending: '保留中', approved: '承認済み', rejected: '却下' };
  elements.detailStatusBadge.textContent = statusTexts[req.status];
  elements.detailStatusBadge.className = `badge ${req.status}`;
  
  elements.detailAdminComment.parentElement.classList.add('hidden');
  elements.detailCancelBtn.classList.add('hidden');
  
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
    
    const canDelete = drv.id !== state.user.id;
    const deleteBtnHtml = canDelete 
      ? `<button class="btn-icon delete-driver-btn" data-id="${drv.id}" title="ドライバーを削除" style="color:var(--rejected); width:28px; height:28px; margin-left:0.5rem">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
         </button>` 
      : '';

    let passwordHtml = '';
    if (drv.plain_password) {
      passwordHtml = `
        | パスワード: <span class="password-masked" data-pwd="${drv.plain_password}" style="color:var(--pending); font-weight:600; font-family: monospace;">••••••••</span>
        <button class="btn-icon toggle-password-visibility-btn" style="width:20px; height:20px; padding:0; display:inline-flex; align-items:center; justify-content:center; color:var(--text-muted); background:none; border:none; cursor:pointer;" title="パスワードを表示">
          <svg class="eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      `;
    }

    item.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:2px; flex:1">
        <span class="roster-driver-name" style="font-weight:600">${drv.name}</span>
        <span class="roster-driver-email" style="font-size:0.75rem; color:var(--text-muted); display:inline-flex; align-items:center; gap:0.25rem; flex-wrap:wrap;">
          ${drv.email || 'メールアドレス未登録'}${passwordHtml}
        </span>
      </div>
      <div style="display:flex; align-items:center">
        ${canDelete ? deleteBtnHtml : ''}
      </div>
    `;

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

    const togglePwdBtn = item.querySelector('.toggle-password-visibility-btn');
    if (togglePwdBtn) {
      togglePwdBtn.addEventListener('click', () => {
        const pwdSpan = item.querySelector('.password-masked');
        if (pwdSpan) {
          const isMasked = pwdSpan.textContent === '••••••••';
          if (isMasked) {
            pwdSpan.textContent = pwdSpan.getAttribute('data-pwd');
            togglePwdBtn.innerHTML = `<svg class="eye-off-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
            togglePwdBtn.title = "パスワードを非表示";
          } else {
            pwdSpan.textContent = '••••••••';
            togglePwdBtn.innerHTML = `<svg class="eye-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
            togglePwdBtn.title = "パスワードを表示";
          }
        }
      });
    }

    elements.rosterList.appendChild(item);
  });
}

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

    badge.querySelector('.edit-shift-type-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const newName = prompt(`「${t.name}」の新しい表示記号/名前を入力してください：`, t.name);
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
  document.getElementById('setting-url').value = localStorage.getItem('supabase_url') || 'https://byugsueqscfxobxrfuno.supabase.co';
  document.getElementById('setting-key').value = localStorage.getItem('supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5dWdzdWVxc2NmeG9ieHJmdW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTQ5ODAsImV4cCI6MjA5NzEzMDk4MH0.tLxM1wr5cAkpoz9_Va38a9fHXJTdUU5tVwHDp7s-3tU';
  document.getElementById('setting-gas-url').value = localStorage.getItem('gas_notification_url') || '';
  
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
  
  const gasUrl = document.getElementById('setting-gas-url').value.trim();
  localStorage.setItem('gas_notification_url', gasUrl);
  
  if (mode === 'demo') {
    db.switchToDemo();
    showToast('設定を保存し、デモモードに変更しました。');
    closeModal(elements.settingsModal);
    handleLogout();
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
      handleLogout();
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
  
  if (user && user.role === 'admin') {
    showView('admin');
  } else {
    if (user && user.role === 'driver') {
      await db.signOut();
      state.user = null;
    }
    showView('auth');
  }

  // イベントリスナーの登録
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.logoutBtn.addEventListener('click', handleLogout);

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

  const filterSelect = document.getElementById('filter-center-station');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.filterCenterStation = e.target.value;
      renderShiftGrid();
    });
  }

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

  const addShiftTypeForm = document.getElementById('add-shift-type-form');
  if (addShiftTypeForm) {
    addShiftTypeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('new-shift-type-name');
      const selectIsWork = document.getElementById('new-shift-type-is-work');
      
      const name = input ? input.value.trim() : '';
      const isWork = selectIsWork ? selectIsWork.value === 'true' : false;
      
      if (!name) return;
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

  if (elements.tabBtnApprove && elements.tabBtnShift && elements.tabBtnDailyAllocation) {
    const tabs = [elements.tabBtnApprove, elements.tabBtnShift, elements.tabBtnDailyAllocation];
    const panes = [elements.adminApprovePane, elements.adminShiftPane, elements.adminDailyAllocationPane];

    function switchTab(activeTab, activePane) {
      tabs.forEach(t => {
        t.classList.toggle('active', t === activeTab);
        t.style.color = (t === activeTab) ? 'var(--text-main)' : 'var(--text-muted)';
      });
      panes.forEach(p => {
        if (p) {
          p.classList.toggle('hidden', p !== activePane);
        }
      });
    }

    elements.tabBtnApprove.addEventListener('click', () => {
      switchTab(elements.tabBtnApprove, elements.adminApprovePane);
    });

    elements.tabBtnShift.addEventListener('click', () => {
      switchTab(elements.tabBtnShift, elements.adminShiftPane);
      renderShiftGrid();
    });

    elements.tabBtnDailyAllocation.addEventListener('click', () => {
      switchTab(elements.tabBtnDailyAllocation, elements.adminDailyAllocationPane);
      renderDailyAllocation();
    });
  }

  if (elements.btnSaveDraft) elements.btnSaveDraft.addEventListener('click', saveShiftDraft);
  if (elements.btnPublishShift) elements.btnPublishShift.addEventListener('click', publishShift);
  if (elements.btnDownloadPdf) elements.btnDownloadPdf.addEventListener('click', openPrintModal);

  if (elements.btnEditShift) {
    elements.btnEditShift.addEventListener('click', () => {
      state.isShiftEditing = true;
      state.originalShifts = JSON.parse(JSON.stringify(state.shifts));
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
      state.shifts = JSON.parse(JSON.stringify(state.originalShifts));
      showToast("編集をキャンセルし、変更前の状態に戻しました。");
      renderShiftGrid();
    });
  }

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

  elements.closeDetailBtn.addEventListener('click', () => closeModal(elements.detailModal));
  
  if (elements.closePrintBtn) elements.closePrintBtn.addEventListener('click', () => closeModal(elements.printModal));
  if (elements.btnCancelPrint) elements.btnCancelPrint.addEventListener('click', () => closeModal(elements.printModal));
  
  if (elements.printConfigForm) {
    elements.printConfigForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const targetCenter = elements.printCenterSelect.value;
      closeModal(elements.printModal);
      downloadAppShiftPdf(targetCenter);
    });
  }
  
  window.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeModal(elements.settingsModal);
    if (e.target === elements.printModal) closeModal(elements.printModal);
    if (e.target === elements.detailModal) {
      closeModal(elements.detailModal);
      const adminArea = document.getElementById('admin-modal-actions');
      if (adminArea) adminArea.remove();
    }
  });

  // 日付配置ピッカーの初期化
  if (elements.allocationDatePicker) {
    const today = new Date();
    elements.allocationDatePicker.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    elements.allocationDatePicker.addEventListener('change', renderDailyAllocation);
  }

  // デモデータ バックアップ
  const btnExportBackup = document.getElementById('btn-export-backup');
  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', () => {
      try {
        const backupData = {
          users: JSON.parse(localStorage.getItem('driver_mock_users') || '[]'),
          profiles: JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]'),
          requests: JSON.parse(localStorage.getItem('driver_mock_requests') || '[]'),
          shifts: JSON.parse(localStorage.getItem('driver_mock_shifts') || '[]'),
          publish_status: JSON.parse(localStorage.getItem('driver_mock_shift_publish_status') || '[]'),
          centers: JSON.parse(localStorage.getItem('driver_centers') || '[]'),
          shift_types: JSON.parse(localStorage.getItem('driver_shift_types') || '[]'),
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `entrust_shift_backup_${new Date().toISOString().substring(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast("バックアップファイルを出力しました。");
      } catch (err) {
        showToast("バックアップ失敗: " + err.message, "error");
      }
    });
  }

  // デモデータ 復元
  const btnImportBackup = document.getElementById('btn-import-backup');
  const backupInput = document.getElementById('backup-file-input');
  if (btnImportBackup && backupInput) {
    btnImportBackup.addEventListener('click', () => {
      backupInput.click();
    });

    backupInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = JSON.parse(reader.result);
          if (data.profiles && data.shifts) {
            localStorage.setItem('driver_mock_users', JSON.stringify(data.users || []));
            localStorage.setItem('driver_mock_profiles', JSON.stringify(data.profiles || []));
            localStorage.setItem('driver_mock_requests', JSON.stringify(data.requests || []));
            localStorage.setItem('driver_mock_shifts', JSON.stringify(data.shifts || []));
            localStorage.setItem('driver_mock_shift_publish_status', JSON.stringify(data.publish_status || []));
            localStorage.setItem('driver_centers', JSON.stringify(data.centers || []));
            localStorage.setItem('driver_shift_types', JSON.stringify(data.shift_types || []));

            showToast("データを復元しました。画面を再読み込みします...");
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            showToast("無効なバックアップファイル形式です。", "error");
          }
        } catch (err) {
          showToast("復元失敗: " + err.message, "error");
        }
      };
      reader.readAsText(file);
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);
