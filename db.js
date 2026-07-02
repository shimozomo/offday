// =================================================================
// データベースクライアント・モック統合モジュール (db.js)
// =================================================================

let supabaseClient = null;
let currentMode = 'demo'; // 'live' | 'demo'
let currentUser = null; // 現在ログイン中のユーザーオブジェクト

// フォールバック用の純粋な JavaScript SHA-256 実装
function sha256Pure(ascii) {
  function rotateRight(n, x) {
    return (x >>> n) | (x << (32 - n));
  }
  const choice = (x, y, z) => (x & y) ^ (~x & z);
  const majority = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);
  const sigma0 = x => rotateRight(2, x) ^ rotateRight(13, x) ^ rotateRight(22, x);
  const sigma1 = x => rotateRight(6, x) ^ rotateRight(11, x) ^ rotateRight(25, x);
  const gamma0 = x => rotateRight(7, x) ^ rotateRight(18, x) ^ (x >>> 3);
  const gamma1 = x => rotateRight(17, x) ^ rotateRight(19, x) ^ (x >>> 10);

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const words = [];
  const len = ascii.length;
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= (ascii.charCodeAt(i) & 0xff) << ((3 - (i % 4)) * 8);
  }

  // padding
  const bitLen = len * 8;
  words[len >> 2] |= 0x80 << ((3 - (len % 4)) * 8);
  
  const wordLen = ((len + 8) >> 6) + 1;
  const wordCount = wordLen * 16;
  while (words.length < wordCount) {
    words.push(0);
  }
  words[wordCount - 2] = Math.floor(bitLen / 0x100000000);
  words[wordCount - 1] = bitLen & 0xffffffff;

  for (let i = 0; i < wordCount; i += 16) {
    const W = [];
    for (let j = 0; j < 16; j++) {
      W[j] = words[i + j] || 0;
    }
    for (let j = 16; j < 64; j++) {
      W[j] = (gamma1(W[j - 2]) + W[j - 7] + gamma0(W[j - 15]) + W[j - 16]) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      const T1 = (h + sigma1(e) + choice(e, f, g) + K[j] + W[j]) | 0;
      const T2 = (sigma0(a) + majority(a, b, c)) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) | 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  return H.map(x => {
    const hex = (x >>> 0).toString(16);
    return '0'.repeat(8 - hex.length) + hex;
  }).join('');
}

// パスワードのハッシュ化（SHA-256）
async function hashPassword(password) {
  // Web Crypto API が安全なコンテキスト（HTTPS等）で利用可能であれば使用
  if (window.crypto && window.crypto.subtle) {
    try {
      const msgUint8 = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn("Web Crypto API failed, using fallback:", e);
    }
  }
  // 非セキュアなコンテキスト (file:// 等) では純粋な JS 実装を使用
  return sha256Pure(password);
}
window.hashPassword = hashPassword;

// 管理者メールアドレスの生成ヘルパー (日本語名を安全なメール形式にマッピング)
function getAdminEmail(name) {
  const cleanName = name.replace(/\s+/g, '');
  const b64 = btoa(encodeURIComponent(cleanName)).replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 15);
  return `admin_${b64}@system.local`;
}
window.getAdminEmail = getAdminEmail;

// =================================================================
// デモ用モックデータ初期化 (LocalStorage)
// =================================================================
const MOCK_PROFILES = [
  { id: "mock-driver-1", name: "佐藤 健二", role: "driver", email: "driver1@example.com", plain_password: "password", center_station: "休" },
  { id: "mock-driver-2", name: "鈴木 裕介", role: "driver", email: "driver2@example.com", plain_password: "password", center_station: "休" },
  { id: "mock-driver-3", name: "高橋 浩", role: "driver", email: "driver3@example.com", plain_password: "password", center_station: "休" },
  { id: "mock-admin-1", name: "管理者", role: "admin", admin_passcode: "7a5df5ffa0dec2228d90b8d0a0f1b0767b748b0a41314c123075b8289e4e053f", email: getAdminEmail("管理者"), plain_password: "1010", center_station: null }
];

const MOCK_USERS = [
  { id: "mock-driver-1", email: "driver1@example.com", password: "password" },
  { id: "mock-driver-2", email: "driver2@example.com", password: "password" },
  { id: "mock-driver-3", email: "driver3@example.com", password: "password" },
  { id: "mock-admin-1", email: getAdminEmail("管理者"), password: "1010" }
];

// 初期モック申請データ（当月・翌月のダミーデータ）
function getInitialMockRequests() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-indexed

  // 日付文字列のユーティリティ (YYYY-MM-DD)
  const format = (d) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const formatNext = (d) => {
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  return [
    { id: "req-1", driver_id: "mock-driver-1", request_date: format(5), status: "approved", reason: "家族旅行のため", admin_comment: "了解しました。安全運転でお願いします。" },
    { id: "req-2", driver_id: "mock-driver-1", request_date: format(10), status: "pending", reason: "市役所手続き", admin_comment: null },
    { id: "req-3", driver_id: "mock-driver-2", request_date: format(10), status: "approved", reason: "定期健康診断", admin_comment: "受診結果を後ほど提出してください。" },
    { id: "req-4", driver_id: "mock-driver-2", request_date: format(15), status: "pending", reason: "子供の運動会", admin_comment: null },
    { id: "req-5", driver_id: "mock-driver-3", request_date: format(10), status: "pending", reason: "免許更新講習", admin_comment: null },
    { id: "req-6", driver_id: "mock-driver-3", request_date: format(20), status: "rejected", reason: "私用", admin_comment: "この日は配車が混雑しているため、別日への変更をお願いできますか？" }
  ];
}

// ローカルストレージ内のモックデータの初期化
function initMockData() {
  const profilesRaw = localStorage.getItem('driver_mock_profiles');
  const usersRaw = localStorage.getItem('driver_mock_users');
  const storedTypes = localStorage.getItem('driver_shift_types');
  const needsTypesReset = !storedTypes || 
                           storedTypes.includes('"name":"○"') || 
                           storedTypes.includes('"name":"休み"') || 
                           storedTypes.includes('"id":"hope_off"');

  const needsReset = !profilesRaw || 
                      !usersRaw ||
                      needsTypesReset ||
                      profilesRaw.includes("田中 運行管理者") || 
                      profilesRaw.includes("田中 管理者") ||
                      !profilesRaw.includes("admin_passcode") ||
                      !profilesRaw.includes("7a5df5ffa0dec2228d90b8d0a0f1b0767b748b0a41314c123075b8289e4e053f") ||
                      !profilesRaw.includes('"email"') ||
                      !profilesRaw.includes("plain_password") ||
                      !profilesRaw.includes("center_station") || // center_stationがない場合はリセット
                      !profilesRaw.includes('"center_station":"休"') || // 複数所属対応用のモックデータリセット条件
                      !usersRaw.includes(getAdminEmail("管理者"));

  if (needsReset) {
    localStorage.setItem('driver_mock_profiles', JSON.stringify(MOCK_PROFILES));
    localStorage.setItem('driver_mock_users', JSON.stringify(MOCK_USERS));
    localStorage.setItem('driver_mock_requests', JSON.stringify(getInitialMockRequests()));
    localStorage.removeItem('driver_centers');
    localStorage.removeItem('driver_shift_types');
    localStorage.removeItem('driver_demo_session'); // 古いセッションの強制破棄
  } else {
    if (!localStorage.getItem('driver_mock_requests')) {
      localStorage.setItem('driver_mock_requests', JSON.stringify(getInitialMockRequests()));
    }
  }
}

// =================================================================
// DBマネージャー API
// =================================================================
window.db = {
  // 初期化処理
  async init() {
    initMockData();
    
    const url = localStorage.getItem('supabase_url') || 'https://byugsueqscfxobxrfuno.supabase.co';
    const key = localStorage.getItem('supabase_anon_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5dWdzdWVxc2NmeG9ieHJmdW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NTQ5ODAsImV4cCI6MjA5NzEzMDk4MH0.tLxM1wr5cAkpoz9_Va38a9fHXJTdUU5tVwHDp7s-3tU';
    const forceDemo = localStorage.getItem('supabase_force_demo') === 'true';

    if (url && key && !forceDemo && window.supabase) {
      try {
        supabaseClient = window.supabase.createClient(url, key);
        // 接続テストを兼ねて認証状態を確認
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        
        currentMode = 'live';
        console.log("Supabase ライブモードで起動しました");
        
        // ログイン状態であればプロフィール取得
        if (data.session) {
          const user = data.session.user;
          const { data: profile, error: pError } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
          if (!pError && profile) {
            currentUser = {
              id: user.id,
              email: user.email,
              name: profile.name,
              role: profile.role,
              center_station: profile.center_station
            };
          }
        }
      } catch (err) {
        console.warn("Supabase への接続に失敗したため、デモモードで起動します:", err);
        currentMode = 'demo';
        this.restoreDemoSession();
      }
    } else {
      currentMode = 'demo';
      console.log("デモモードで起動しました (Supabase 未設定)");
      this.restoreDemoSession();
    }
    return { mode: currentMode, user: currentUser };
  },

  // デモセッションの復元
  restoreDemoSession() {
    const savedUser = localStorage.getItem('driver_demo_session');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
    } else {
      currentUser = null;
    }
  },

  getMode() {
    return currentMode;
  },

  getCurrentUser() {
    return currentUser;
  },

  // 接続情報の登録
  async setCredentials(url, key) {
    if (!url || !key) {
      throw new Error("Supabase URL と Anon Key を入力してください。");
    }

    if (!window.supabase) {
      throw new Error("Supabase SDK が読み込まれていません。ネットワーク環境を確認してください。");
    }

    try {
      const client = window.supabase.createClient(url, key);
      // 接続検証テスト
      const { error } = await client.from('profiles').select('count', { count: 'exact', head: true });
      if (error && error.code !== 'PGRST116') { // RLS による空結果以外の本質的エラーをキャッチ
        throw error;
      }
      
      // 保存
      localStorage.setItem('supabase_url', url);
      localStorage.setItem('supabase_anon_key', key);
      localStorage.removeItem('supabase_force_demo');
      
      supabaseClient = client;
      currentMode = 'live';
      
      // デモセッションはクリア
      localStorage.removeItem('driver_demo_session');
      currentUser = null;
      
      return true;
    } catch (err) {
      console.error("Supabase 接続エラー:", err);
      throw new Error(`接続に失敗しました: ${err.message || err.details || "APIキーが無効、またはCORS設定を確認してください。"}`);
    }
  },

  // 接続情報の削除・デモモードへの移行
  switchToDemo() {
    localStorage.setItem('supabase_force_demo', 'true');
    currentMode = 'demo';
    supabaseClient = null;
    currentUser = null;
    localStorage.removeItem('driver_demo_session');
    return { mode: currentMode, user: null };
  },

  async clearCredentials() {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_anon_key');
    localStorage.removeItem('supabase_force_demo');
    localStorage.removeItem('driver_demo_session');
    currentMode = 'demo';
    supabaseClient = null;
    currentUser = null;
  },

  // =================================================================
  // AUTH 認証 API
  // =================================================================
  async signIn(email, password) {
    if (currentMode === 'live') {
      // 全ユーザーのパスワードをハッシュ化して送信（文字数制限を回避）
      const authPassword = await hashPassword(password);
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: authPassword });
      if (error) throw error;
      
      // プロフィールの取得 (存在しない場合は自動作成して自己修復)
      let profile = null;
      const { data: pData, error: pError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
        
      if (pError && pError.code === 'PGRST116') {
        const newProfile = {
          id: data.user.id,
          name: data.user.user_metadata?.name || (email.startsWith('admin_') ? '管理者' : 'ドライバー'),
          email: data.user.email,
          role: data.user.user_metadata?.role || (email.startsWith('admin_') ? 'admin' : 'driver'),
          driver_license_type: data.user.user_metadata?.driver_license_type || null,
          admin_passcode: email.startsWith('admin_') ? authPassword : null
        };
        
        const { data: inserted, error: insertError } = await supabaseClient
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();
          
        if (insertError) {
          throw new Error("プロフィールの自動作成に失敗しました: " + insertError.message);
        }
        profile = inserted;
      } else if (pError) {
        throw new Error("プロフィール情報の取得に失敗しました: " + pError.message);
      } else {
        profile = pData;
      }
      
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        name: profile.name,
        role: profile.role,
        center_station: profile.center_station
      };
      return currentUser;
    } else {
      // デモモードでの認証
      const users = JSON.parse(localStorage.getItem('driver_mock_users') || '[]');
      const user = users.find(u => u.email === email && u.password === password);
      if (!user) {
        throw new Error("メールアドレスまたはパスワードが正しくありません。");
      }
      
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      const profile = profiles.find(p => p.id === user.id);
      
      currentUser = {
        id: user.id,
        email: user.email,
        name: profile ? profile.name : "デモユーザー",
        role: profile ? profile.role : "driver",
        center_station: profile ? profile.center_station : null
      };
      
      localStorage.setItem('driver_demo_session', JSON.stringify(currentUser));
      return currentUser;
    }
  },

  async signUp(email, password, name, role = 'driver', licenseType = null, centerStation = null) {
    if (currentMode === 'live') {
      // 全ユーザーのパスワードをハッシュ化して送信（文字数制限を回避）
      const authPassword = await hashPassword(password);
      // 管理者自身が作成する場合等、既存セッションの自動ログアウトを避けるため、一時的なクライアントを使用して signUp を実行する
      const tempClient = window.supabase.createClient(
        localStorage.getItem('supabase_url'),
        localStorage.getItem('supabase_anon_key'),
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      const passcodeHash = await hashPassword(password);
      const { data, error } = await tempClient.auth.signUp({
        email,
        password: authPassword,
        options: {
          data: {
            name: name,
            role: role,
            driver_license_type: licenseType,
            admin_passcode: passcodeHash,
            plain_password: password,
            center_station: centerStation
          }
        }
      });
      if (error) throw error;
      
      // profiles に passcodeHash, plain_password, center_station を保存する (トリガー側で保存されるが、フォールバックとして実行)
      if (data.user) {
        try {
          const { error: updateError } = await tempClient
            .from('profiles')
            .update({ admin_passcode: passcodeHash, plain_password: password, center_station: centerStation })
            .eq('id', data.user.id);
          if (updateError) throw updateError;
        } catch (updateErr) {
          console.warn("パスコードのフォールバック更新に失敗しました（トリガー側で設定されている可能性があります）:", updateErr);
        }
      }

      // 公開の新規登録で、かつログイン状態でなければ自動ログインを行う
      if (!currentUser && data.session) {
        // メインの supabaseClient にセッションを設定し、ログイン状態を共有する
        await supabaseClient.auth.setSession(data.session);
        
        currentUser = {
          id: data.user.id,
          email: data.user.email,
          name: name,
          role: role,
          center_station: centerStation
        };
      }
      return data.user;
    } else {
      // デモモードでのユーザー作成
      const users = JSON.parse(localStorage.getItem('driver_mock_users') || '[]');
      if (users.find(u => u.email === email)) {
        throw new Error("このメールアドレスは既に登録されています。");
      }
      
      const newId = 'mock-' + Math.random().toString(36).substr(2, 9);
      
      users.push({ id: newId, email, password });
      localStorage.setItem('driver_mock_users', JSON.stringify(users));
      
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      const passcodeHash = await hashPassword(password);
      profiles.push({
        id: newId,
        name,
        role,
        admin_passcode: passcodeHash,
        plain_password: password,
        center_station: centerStation
      });
      localStorage.setItem('driver_mock_profiles', JSON.stringify(profiles));
      
      // ログインしていない場合のみ自動ログイン
      if (!currentUser) {
        currentUser = {
          id: newId,
          email,
          name,
          role,
          center_station: centerStation
        };
        localStorage.setItem('driver_demo_session', JSON.stringify(currentUser));
        return currentUser;
      }
      return {
        id: newId,
        email,
        name,
        role,
        center_station: centerStation
      };
    }
  },

  // 所属センター・局名の変更
  async updateDriverCenterStation(driverId, centerStation) {
    if (currentMode === 'live') {
      try {
        const { error } = await supabaseClient
          .from('profiles')
          .update({ center_station: centerStation })
          .eq('id', driverId);
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || (error.message && error.message.includes('center_station'))) {
            console.warn("profiles の center_station カラムが存在しないため、LocalStorage上で更新します。");
            this.updateLocalDriverCenterStation(driverId, centerStation);
            return true;
          }
          throw error;
        }
        return true;
      } catch (err) {
        console.warn("Failed to update driver center station on Supabase, falling back to LocalStorage:", err);
        this.updateLocalDriverCenterStation(driverId, centerStation);
        return true;
      }
    } else {
      this.updateLocalDriverCenterStation(driverId, centerStation);
      return true;
    }
  },

  updateLocalDriverCenterStation(driverId, centerStation) {
    const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
    const idx = profiles.findIndex(p => p.id === driverId);
    if (idx !== -1) {
      profiles[idx].center_station = centerStation;
      localStorage.setItem('driver_mock_profiles', JSON.stringify(profiles));
    }
  },

  async signOut() {
    if (currentMode === 'live' && supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    currentUser = null;
    localStorage.removeItem('driver_demo_session');
  },

  // =================================================================
  // 希望休申請 API
  // =================================================================
  
  // 指定月（または全件）の申請を取得
  async getOffDayRequests(driverId = null, year = null, month = null) {
    if (currentMode === 'live') {
      try {
        let query = supabaseClient.from('off_day_requests').select(`
          *,
          profiles (
            name
          )
        `);
        
        if (driverId) {
          query = query.eq('driver_id', driverId);
        }
        
        if (year && month) {
          const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
          let nextMonth = month + 1;
          let nextYear = year;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
          }
          const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
          
          query = query.gte('request_date', startDate).lt('request_date', endDate);
        }
        
        const { data, error } = await query.order('request_date', { ascending: true });
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            return this.getLocalOffDayRequests(driverId, year, month);
          }
          throw error;
        }
        
        return data.map(r => ({
          ...r,
          driver_name: r.profiles ? r.profiles.name : "不明"
        }));
      } catch (err) {
        console.warn("Failed to get off day requests from Supabase, falling back to LocalStorage:", err);
        return this.getLocalOffDayRequests(driverId, year, month);
      }
    } else {
      return this.getLocalOffDayRequests(driverId, year, month);
    }
  },

  getLocalOffDayRequests(driverId = null, year = null, month = null) {
    let requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
    const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
    
    if (driverId) {
      requests = requests.filter(r => r.driver_id === driverId);
    }
    
    if (year && month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}-`;
      requests = requests.filter(r => r.request_date.startsWith(prefix));
    }
    
    return requests.map(r => {
      const profile = profiles.find(p => p.id === r.driver_id);
      return {
        ...r,
        driver_name: profile ? profile.name : "不明"
      };
    }).sort((a, b) => a.request_date.localeCompare(b.request_date));
  },

  // 申請の送信（新規または上書き）
  async submitOffDayRequest(driverId, dateStr, reason = "") {
    if (currentMode === 'live') {
      const { data, error } = await supabaseClient
        .from('off_day_requests')
        .upsert({
          driver_id: driverId,
          request_date: dateStr,
          reason: reason,
          status: 'pending',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'driver_id,request_date'
        })
        .select();
        
      if (error) throw error;
      return data[0];
    } else {
      // デモモード
      const requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
      const existingIdx = requests.findIndex(r => r.driver_id === driverId && r.request_date === dateStr);
      
      const requestItem = {
        id: existingIdx >= 0 ? requests[existingIdx].id : 'req-' + Math.random().toString(36).substr(2, 9),
        driver_id: driverId,
        request_date: dateStr,
        reason: reason,
        status: 'pending',
        admin_comment: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        requests[existingIdx] = requestItem;
      } else {
        requests.push(requestItem);
      }
      
      localStorage.setItem('driver_mock_requests', JSON.stringify(requests));
      return requestItem;
    }
  },

  // 申請の削除（キャンセル）
  async deleteOffDayRequest(requestId) {
    if (currentMode === 'live') {
      const { error } = await supabaseClient
        .from('off_day_requests')
        .delete()
        .eq('id', requestId);
        
      if (error) throw error;
      return true;
    } else {
      // デモモード
      let requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
      requests = requests.filter(r => r.id !== requestId);
      localStorage.setItem('driver_mock_requests', JSON.stringify(requests));
      return true;
    }
  },

  // 管理者用: 申請の承認・却下
  async updateRequestStatus(requestId, status, adminComment = "") {
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      throw new Error("無効なステータスです。");
    }
    
    if (currentMode === 'live') {
      const { data, error } = await supabaseClient
        .from('off_day_requests')
        .update({
          status: status,
          admin_comment: adminComment,
          updated_at: new Date().toISOString()
        })
        .eq('id', requestId)
        .select();
        
      if (error) throw error;
      return data[0];
    } else {
      // デモモード
      const requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
      const requestIdx = requests.findIndex(r => r.id === requestId);
      
      if (requestIdx === -1) {
        throw new Error("指定された申請が見つかりません。");
      }
      
      requests[requestIdx].status = status;
      requests[requestIdx].admin_comment = adminComment;
      requests[requestIdx].updated_at = new Date().toISOString();
      
      localStorage.setItem('driver_mock_requests', JSON.stringify(requests));
      return requests[requestIdx];
    }
  },

  // 管理者用: ドライバーの削除
  async deleteDriver(driverId) {
    if (currentMode === 'live') {
      const { error } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', driverId);
      if (error) throw error;
      return true;
    } else {
      // デモモード
      // 1. プロフィールの削除
      let profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      profiles = profiles.filter(p => p.id !== driverId);
      localStorage.setItem('driver_mock_profiles', JSON.stringify(profiles));

      // 2. 認証ユーザーの削除
      let users = JSON.parse(localStorage.getItem('driver_mock_users') || '[]');
      users = users.filter(u => u.id !== driverId);
      localStorage.setItem('driver_mock_users', JSON.stringify(users));

      // 3. 希望休申請の削除
      let requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
      requests = requests.filter(r => r.driver_id !== driverId);
      localStorage.setItem('driver_mock_requests', JSON.stringify(requests));

      return true;
    }
  },

  // 管理者用: 全ドライバーリストと希望休取得日数の集計
  async getAllDrivers(year = null, month = null) {
    if (currentMode === 'live') {
      try {
        const { data: drivers, error } = await supabaseClient
          .from('profiles')
          .select('*')
          .eq('role', 'driver')
          .order('name');
          
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || (error.message && error.message.includes('center_station'))) {
            return this.getLocalDriversWithStats(year, month);
          }
          throw error;
        }
        
        // 各ドライバーの今月の承認済希望休日数を取得
        const requests = await this.getOffDayRequests(null, year, month);
        
        return drivers.map(drv => {
          const drvReqs = requests.filter(r => r.driver_id === drv.id && r.status === 'approved');
          return {
            ...drv,
            approved_count: drvReqs.length
          };
        });
      } catch (err) {
        console.warn("Failed to get drivers from Supabase, falling back to LocalStorage:", err);
        return this.getLocalDriversWithStats(year, month);
      }
    } else {
      return this.getLocalDriversWithStats(year, month);
    }
  },

  getLocalDriversWithStats(year, month) {
    const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
    const drivers = profiles.filter(p => p.role === 'driver');
    
    // 同期的にローカルの申請データを取得する
    let requests = JSON.parse(localStorage.getItem('driver_mock_requests') || '[]');
    if (year && month) {
      const prefix = `${year}-${String(month).padStart(2, '0')}-`;
      requests = requests.filter(r => r.request_date.startsWith(prefix));
    }
    
    return drivers.map(drv => {
      const drvReqs = requests.filter(r => r.driver_id === drv.id && r.status === 'approved');
      return {
        ...drv,
        approved_count: drvReqs.length
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  },

  // 全管理者リストを取得
  async getAllAdmins() {
    if (currentMode === 'live') {
      // Profiles RLS allows reading all profiles
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('name, admin_passcode')
        .eq('role', 'admin')
        .order('name');
      if (error && error.code !== 'PGRST116') throw error;
      return data || [];
    } else {
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      return profiles.filter(p => p.role === 'admin').map(p => ({ name: p.name, admin_passcode: p.admin_passcode }));
    }
  },

  // パスコードが既に使用されているかチェック
  async checkPasscodeExists(hash) {
    if (currentMode === 'live') {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('admin_passcode', hash);
      if (error && error.code !== 'PGRST116') throw error;
      return data && data.length > 0;
    } else {
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      return profiles.some(p => p.admin_passcode === hash);
    }
  },

  // パスコードからプロフィールを取得
  async getProfileByPasscode(hash) {
    if (currentMode === 'live') {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('name, email, role')
        .eq('admin_passcode', hash);
      if (error && error.code !== 'PGRST116') throw error;
      return data && data[0] ? data[0] : null;
    } else {
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      const profile = profiles.find(p => p.admin_passcode === hash);
      return profile ? { name: profile.name, email: profile.email, role: profile.role } : null;
    }
  },

  // 管理者のパスワード変更
  async changeAdminPassword(userId, currentPassword, newPassword) {
    const currentHash = await hashPassword(currentPassword);
    const newHash = await hashPassword(newPassword);

    if (currentMode === 'live') {
      // 1. 現在のパスワードが正しいか(Profiles 内の hash と一致するか)チェック
      const { data: profile, error: pError } = await supabaseClient
        .from('profiles')
        .select('admin_passcode')
        .eq('id', userId)
        .single();
      if (pError) throw new Error("プロフィール情報の取得に失敗しました: " + pError.message);

      if (profile.admin_passcode !== currentHash) {
        throw new Error("現在のパスワードが正しくありません。");
      }

      // 2. Supabase Auth のパスワードを更新
      const { error: authError } = await supabaseClient.auth.updateUser({
        password: newHash
      });
      if (authError) throw authError;

      // 3. Profiles テーブルの admin_passcode を更新
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ admin_passcode: newHash })
        .eq('id', userId);
      if (updateError) throw updateError;

      return true;
    } else {
      // デモモード
      const profiles = JSON.parse(localStorage.getItem('driver_mock_profiles') || '[]');
      const profileIdx = profiles.findIndex(p => p.id === userId);
      if (profileIdx === -1) throw new Error("ユーザーが見つかりません。");

      if (profiles[profileIdx].admin_passcode !== currentHash) {
        throw new Error("現在のパスワードが正しくありません。");
      }

      profiles[profileIdx].admin_passcode = newHash;
      localStorage.setItem('driver_mock_profiles', JSON.stringify(profiles));

      // mock_users のパスワードも更新
      const users = JSON.parse(localStorage.getItem('driver_mock_users') || '[]');
      const userIdx = users.findIndex(u => u.id === userId);
      if (userIdx !== -1) {
        users[userIdx].password = newPassword;
        localStorage.setItem('driver_mock_users', JSON.stringify(users));
      }

      return true;
    }
  },

  // =================================================================
  // 自動シフト管理用 API
  // =================================================================
  
  // 指定年月のシフトデータを取得
  async getShifts(year, month) {
    if (currentMode === 'live') {
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const { data, error } = await supabaseClient
          .from('shifts')
          .select('*')
          .gte('shift_date', startDate)
          .lt('shift_date', endDate);

        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            console.warn("shifts テーブルが存在しないため、LocalStorageのシフトデータをロードします。");
            return this.getLocalShifts(year, month);
          }
          throw error;
        }
        return data || [];
      } catch (err) {
        console.warn("Failed to get shifts from Supabase, falling back to LocalStorage:", err);
        return this.getLocalShifts(year, month);
      }
    } else {
      return this.getLocalShifts(year, month);
    }
  },

  getLocalShifts(year, month) {
    const shifts = JSON.parse(localStorage.getItem('driver_mock_shifts') || '[]');
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    return shifts.filter(s => s.shift_date.startsWith(prefix));
  },

  // シフトデータおよび公開状態を保存
  // シフトデータおよび公開状態を保存
  async saveShifts(year, month, shiftsArray, publishStatus) {
    if (currentMode === 'live') {
      try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const { error: deleteError } = await supabaseClient
          .from('shifts')
          .delete()
          .gte('shift_date', startDate)
          .lt('shift_date', endDate);

        if (deleteError) {
          if (deleteError.code === '42P01' || deleteError.code === 'PGRST205') {
            db.saveLocalShifts(year, month, shiftsArray, publishStatus);
            return true;
          }
          throw deleteError;
        }

        if (shiftsArray.length > 0) {
          const { error: insertError } = await supabaseClient
            .from('shifts')
            .insert(shiftsArray);
          
          if (insertError) {
            // カラム 'assigned_center' の不在 (42703) またはチェック制約違反 (23514) のハンドリング
            if (insertError.code === '42703' || insertError.code === '23514') {
              console.warn("assigned_center 不在またはチェック制約違反を検知しました。基本区分にマッピングして保存し、LocalStorageにフォールバックします。");
              
              const types = JSON.parse(localStorage.getItem('driver_shift_types') || '[]');
              const mappedArray = shiftsArray.map(s => {
                let baseType = 'work';
                const match = types.find(t => t.id === s.shift_type);
                if (match) {
                  baseType = match.is_work ? 'work' : 'off';
                } else if (s.shift_type === 'off' || s.shift_type === 'hope_off') {
                  baseType = s.shift_type;
                }
                
                // カラムや制約の競合を完全に避けるため、retry用配列からは assigned_center を取り除きます
                const { assigned_center, ...rest } = s;
                return {
                  ...rest,
                  shift_type: baseType
                };
              });

              const { error: retryError } = await supabaseClient
                .from('shifts')
                .insert(mappedArray);
              if (retryError) throw retryError;
              
              db.saveLocalShifts(year, month, shiftsArray, publishStatus);
              
              const { error: statusError } = await supabaseClient
                .from('shift_publish_status')
                .upsert({
                  year,
                  month,
                  status: publishStatus,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'year,month'
                });
              if (statusError && statusError.code !== '42P01' && statusError.code !== 'PGRST205') {
                throw statusError;
              }
              
              const err = new Error("DB_MIGRATION_REQUIRED");
              err.code = "DB_MIGRATION_REQUIRED";
              throw err;
            }
            throw insertError;
          }
        }

        const { error: statusError } = await supabaseClient
          .from('shift_publish_status')
          .upsert({
            year,
            month,
            status: publishStatus,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'year,month'
          });

        if (statusError) {
          if (statusError.code === '42P01' || statusError.code === 'PGRST205') {
            console.warn("shift_publish_status テーブルが存在しないため公開ステータスはローカルに保存されました。");
            db.saveLocalPublishStatus(year, month, publishStatus);
            return true;
          }
          throw statusError;
        }

        return true;
      } catch (err) {
        if (err.code === 'DB_MIGRATION_REQUIRED') {
          throw err;
        }
        console.warn("Failed to save shifts to Supabase, falling back to LocalStorage:", err);
        db.saveLocalShifts(year, month, shiftsArray, publishStatus);
        return true;
      }
    } else {
      db.saveLocalShifts(year, month, shiftsArray, publishStatus);
      return true;
    }
  },

  saveLocalShifts(year, month, shiftsArray, publishStatus) {
    let allShifts = JSON.parse(localStorage.getItem('driver_mock_shifts') || '[]');
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    allShifts = allShifts.filter(s => !s.shift_date.startsWith(prefix));
    allShifts = allShifts.concat(shiftsArray);
    localStorage.setItem('driver_mock_shifts', JSON.stringify(allShifts));
    this.saveLocalPublishStatus(year, month, publishStatus);
  },

  saveLocalPublishStatus(year, month, publishStatus) {
    let allStatuses = JSON.parse(localStorage.getItem('driver_mock_shift_publish_status') || '[]');
    allStatuses = allStatuses.filter(s => !(s.year === year && s.month === month));
    allStatuses.push({
      year,
      month,
      status: publishStatus
    });
    localStorage.setItem('driver_mock_shift_publish_status', JSON.stringify(allStatuses));
  },

  // 指定年月の公開ステータスを取得
  async getShiftPublishStatus(year, month) {
    if (currentMode === 'live') {
      try {
        const { data, error } = await supabaseClient
          .from('shift_publish_status')
          .select('status')
          .eq('year', year)
          .eq('month', month)
          .single();

        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            return this.getLocalPublishStatus(year, month);
          }
          if (error.code === 'PGRST116') {
            // データが見つからない場合は draft (下書き) をデフォルトにする
            return 'draft';
          }
          return 'draft';
        }
        return data ? data.status : 'draft';
      } catch (err) {
        return this.getLocalPublishStatus(year, month);
      }
    } else {
      return this.getLocalPublishStatus(year, month);
    }
  },

  getLocalPublishStatus(year, month) {
    const allStatuses = JSON.parse(localStorage.getItem('driver_mock_shift_publish_status') || '[]');
    const match = allStatuses.find(s => s.year === year && s.month === month);
    return match ? match.status : 'draft';
  },

  // センター・局リストの取得
  async getCenters() {
    if (currentMode === 'live') {
      try {
        const { data, error } = await supabaseClient
          .from('centers')
          .select('name')
          .order('name');
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            return this.getLocalCenters();
          }
          throw error;
        }
        return (data || []).map(c => c.name);
      } catch (err) {
        console.warn("Failed to fetch centers from Supabase, falling back to LocalStorage:", err);
        return this.getLocalCenters();
      }
    } else {
      return this.getLocalCenters();
    }
  },

  getLocalCenters() {
    const centers = localStorage.getItem('driver_centers');
    if (!centers) {
      const defaultCenters = ["休"];
      localStorage.setItem('driver_centers', JSON.stringify(defaultCenters));
      return defaultCenters;
    }
    return JSON.parse(centers);
  },

  // センターの追加
  async addCenter(name) {
    if (!name || !name.trim()) throw new Error("センター・局名を入力してください。");
    const cleanName = name.trim();

    if (currentMode === 'live') {
      try {
        const { error } = await supabaseClient
          .from('centers')
          .insert({ name: cleanName });
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            this.addLocalCenter(cleanName);
            return true;
          }
          throw error;
        }
        return true;
      } catch (err) {
        console.warn("Failed to add center to Supabase, falling back to LocalStorage:", err);
        this.addLocalCenter(cleanName);
        return true;
      }
    } else {
      this.addLocalCenter(cleanName);
      return true;
    }
  },

  addLocalCenter(name) {
    const centers = this.getLocalCenters();
    if (!centers.includes(name)) {
      centers.push(name);
      localStorage.setItem('driver_centers', JSON.stringify(centers));
    }
  },

  // センターの削除
  async deleteCenter(name) {
    if (currentMode === 'live') {
      try {
        const { error } = await supabaseClient
          .from('centers')
          .delete()
          .eq('name', name);
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            this.deleteLocalCenter(name);
            return true;
          }
          throw error;
        }
        return true;
      } catch (err) {
        console.warn("Failed to delete center from Supabase, falling back to LocalStorage:", err);
        this.deleteLocalCenter(name);
        return true;
      }
    } else {
      this.deleteLocalCenter(name);
      return true;
    }
  },

  deleteLocalCenter(name) {
    let centers = this.getLocalCenters();
    centers = centers.filter(c => c !== name);
    localStorage.setItem('driver_centers', JSON.stringify(centers));
  },

  // シフト区分の取得
  async getShiftTypes() {
    if (currentMode === 'live') {
      try {
        const { data, error } = await supabaseClient
          .from('shift_types')
          .select('*')
          .order('id');
        
        if (error) {
          if (error.code === '42P01' || error.code === 'PGRST205') {
            return this.getLocalShiftTypes();
          }
          throw error;
        }
        return data || [];
      } catch (err) {
        console.warn("Failed to fetch shift types from Supabase, falling back to LocalStorage:", err);
        return this.getLocalShiftTypes();
      }
    } else {
      return this.getLocalShiftTypes();
    }
  },

  getLocalShiftTypes() {
    const stored = localStorage.getItem('driver_shift_types');
    if (!stored) {
      const defaults = [
        { id: 'work', name: '出勤', is_work: true },
        { id: 'off', name: '休', is_work: false }
      ];
      localStorage.setItem('driver_shift_types', JSON.stringify(defaults));
      return defaults;
    }
    return JSON.parse(stored);
  },

  // シフト区分の保存
  async saveShiftTypes(types) {
    if (currentMode === 'live') {
      try {
        // 全件削除してインサート（UPSERTの代用）
        const { error: deleteError } = await supabaseClient
          .from('shift_types')
          .delete()
          .neq('id', 'dummy_nonexistent');
        
        if (deleteError) {
          if (deleteError.code === '42P01' || deleteError.code === 'PGRST205') {
            this.saveLocalShiftTypes(types);
            return true;
          }
          throw deleteError;
        }

        if (types.length > 0) {
          const { error: insertError } = await supabaseClient
            .from('shift_types')
            .insert(types);
          if (insertError) throw insertError;
        }
        
        this.saveLocalShiftTypes(types);
        return true;
      } catch (err) {
        console.warn("Failed to save shift types to Supabase, falling back to LocalStorage:", err);
        this.saveLocalShiftTypes(types);
        return true;
      }
    } else {
      this.saveLocalShiftTypes(types);
      return true;
    }
  },

  saveLocalShiftTypes(types) {
    localStorage.setItem('driver_shift_types', JSON.stringify(types));
  }
};
