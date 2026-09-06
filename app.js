(function () {
  // ==========================================
  // 1. FIREBASE CONFIG — REPLACE WITH YOUR OWN
  // ==========================================
  const firebaseConfig = {
  apiKey: "AIzaSyAuPEfL4kEQ0j9IB9TDVbQUOmOcSXrTTvA",
  authDomain: "evo1-a0050.firebaseapp.com",
  projectId: "evo1-a0050",
  storageBucket: "evo1-a0050.firebasestorage.app",
  messagingSenderId: "119820529385",
  appId: "1:119820529385:web:5351044e31f72a1fb24a78"
};

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  // ==========================================
  // 2. CONSTANTS & STATE
  // ==========================================
  const STORAGE_KEY = 'evo-state';

  const DEFAULT_STATE = {
    user: { name: '', avatar: '⚔️', class: 'warrior', lastGoal: '' },
    quests: [],
    completedQuests: [],
    xp: 0,
    level: 1,
    streak: { current: 0, longest: 0, lastActiveDate: null },
    achievements: [],
    dailyLog: {},
    nightOwl: false,
    speedrunner: false
  };

  let state = {};
  let currentUser = null;
  let pendingAIMissions = [];

  const CATEGORY_ICONS = {
    study: '📚', exercise: '💪', code: '💻',
    wellness: '🧘', work: '💼', creative: '🎨'
  };

  const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Blood', desc: 'Complete your first quest', icon: '🗡️', check: s => s.completedQuests.length >= 1 },
    { id: 'hat_trick', name: 'Hat Trick', desc: '3 quests in one day', icon: '🎩', check: s => todayCount(s) >= 3 },
    { id: 'unstoppable', name: 'Unstoppable', desc: '7-day streak', icon: '🔥', check: s => s.streak.current >= 7 },
    { id: 'centurion', name: 'Centurion', desc: '100 quests completed', icon: '💯', check: s => s.completedQuests.length >= 100 },
    { id: 'night_owl', name: 'Night Owl', desc: 'Quest after midnight', icon: '🦉', check: s => s.nightOwl },
    { id: 'speedrunner', name: 'Speedrunner', desc: 'Quest within 1hr of creation', icon: '⚡', check: s => s.speedrunner },
    { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐', check: s => s.level >= 5 },
    { id: 'level_10', name: 'Veteran', desc: 'Reach level 10', icon: '🌟', check: s => s.level >= 10 },
    { id: 'xp_500', name: 'XP Hunter', desc: 'Earn 500 XP', icon: '✨', check: s => s.xp >= 500 },
    { id: 'ten_quests', name: 'Adventurer', desc: 'Complete 10 quests', icon: '🗺️', check: s => s.completedQuests.length >= 10 },
    { id: 'streak_3', name: 'Warming Up', desc: '3-day streak', icon: '🌡️', check: s => s.streak.current >= 3 },
    { id: 'streak_30', name: 'Legendary Streak', desc: '30-day streak', icon: '👑', check: s => s.streak.current >= 30 },
    { id: 'fifty_quests', name: 'Champion', desc: '50 quests completed', icon: '🏅', check: s => s.completedQuests.length >= 50 },
    { id: 'all_categories', name: 'Renaissance', desc: 'Quest in every category', icon: '🎭', check: s => allCategories(s) }
  ];

  const TIME_MINUTES = {
    '30 minutes': 30,
    '1 hour': 60,
    '2 hours': 120,
    '4 hours': 240,
    'full day': 480,
    '1 week': 7 * 60,
    '2 weeks': 14 * 60
  };

  // ==========================================
  // 3. UTILS & HELPERS
  // ==========================================
  function localDateStr(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDaysStr(dateStr, n) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + n);
    return localDateStr(dt);
  }

  function getTodayStr() {
    return localDateStr(new Date());
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (currentUser) {
      syncToFirestore();
    }
  }

  function hydrateState() {
    state.user = { ...DEFAULT_STATE.user, ...(state.user || {}) };
    state.streak = { ...DEFAULT_STATE.streak, ...(state.streak || {}) };
    state.quests = Array.isArray(state.quests) ? state.quests : [];
    state.completedQuests = Array.isArray(state.completedQuests) ? state.completedQuests : [];
    state.dailyLog = state.dailyLog && typeof state.dailyLog === 'object' ? state.dailyLog : {};
    state.xp = Number(state.xp) || 0;
    state.level = Number(state.level) || 1;
    if (!Array.isArray(state.achievements)) state.achievements = [];
    state.achievements = state.achievements
      .map(a => (typeof a === 'string' ? a : a && a.id))
      .filter(Boolean);
    rebuildActivityLog();
    recalcStreakFromLog();
    checkAchievements(true);
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
      } catch (e) {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    hydrateState();
  }

  function todayCount(s) {
    return (s.dailyLog && s.dailyLog[getTodayStr()]) || 0;
  }

  function allCategories(s) {
    const cats = new Set((s.completedQuests || []).map(q => q.category).filter(Boolean));
    return cats.size >= 6;
  }

  function requiredXP(level) {
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  function getRarity(xp) {
    if (xp <= 25) return 'common';
    if (xp <= 50) return 'rare';
    if (xp <= 100) return 'epic';
    return 'legendary';
  }

  function showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function rebuildActivityLog() {
    const fromQuests = {};
    (state.completedQuests || []).forEach(q => {
      const ds = localDateStr(q.completedAt);
      if (!ds) return;
      fromQuests[ds] = (fromQuests[ds] || 0) + 1;
    });
    const log = { ...fromQuests };
    Object.keys(state.dailyLog || {}).forEach(key => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      const stored = Number(state.dailyLog[key]) || 0;
      if (stored > (log[key] || 0)) log[key] = stored;
    });
    state.dailyLog = log;
  }

  function recalcStreakFromLog() {
    const today = getTodayStr();
    const activeDates = Object.keys(state.dailyLog || {})
      .filter(d => (state.dailyLog[d] || 0) > 0)
      .sort();

    if (activeDates.length === 0) {
      state.streak.current = 0;
      state.streak.lastActiveDate = null;
      state.streak.longest = state.streak.longest || 0;
      return;
    }

    let cursor = today;
    if (!(state.dailyLog[cursor] > 0)) {
      const yesterday = addDaysStr(today, -1);
      if (state.dailyLog[yesterday] > 0) {
        cursor = yesterday;
      } else {
        state.streak.current = 0;
        state.streak.lastActiveDate = activeDates[activeDates.length - 1];
        return;
      }
    }

    let count = 0;
    while (state.dailyLog[cursor] > 0) {
      count++;
      cursor = addDaysStr(cursor, -1);
    }

    state.streak.current = count;
    state.streak.lastActiveDate = state.dailyLog[today] > 0 ? today : addDaysStr(today, -1);
    if (count > (state.streak.longest || 0)) {
      state.streak.longest = count;
    }

    let longest = state.streak.longest || 0;
    let run = 0;
    let prev = null;
    activeDates.forEach(ds => {
      if (prev && ds === addDaysStr(prev, 1)) run++;
      else run = 1;
      if (run > longest) longest = run;
      prev = ds;
    });
    state.streak.longest = longest;
  }

  // ==========================================
  // 4. FIREBASE AUTH
  // ==========================================
  function showAuthError(msg) {
    document.getElementById('auth-error').textContent = msg;
  }

  function signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      showAuthError(err.message);
    });
  }

  function signInWithMicrosoft() {
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    auth.signInWithPopup(provider).catch(err => {
      showAuthError(err.message);
    });
  }

  function signInWithEmail(email, password) {
    auth.signInWithEmailAndPassword(email, password).catch(err => {
      showAuthError(err.message);
    });
  }

  function signUpWithEmail(email, password) {
    auth.createUserWithEmailAndPassword(email, password).catch(err => {
      showAuthError(err.message);
    });
  }

  function signOut() {
    auth.signOut();
  }

  // ==========================================
  // 5. FIRESTORE SYNC
  // ==========================================
  async function syncToFirestore() {
    if (!currentUser) return;
    try {
      await db.collection('players').doc(currentUser.uid).set({
        name: state.user.name,
        avatar: state.user.avatar,
        class: state.user.class,
        xp: state.xp,
        level: state.level,
        questsCompleted: state.completedQuests.length,
        streak: state.streak.current,
        longestStreak: state.streak.longest,
        badgeCount: state.achievements.length,
        email: currentUser.email || '',
        fullState: JSON.stringify({
          quests: state.quests,
          completedQuests: state.completedQuests,
          achievements: state.achievements,
          dailyLog: state.dailyLog,
          streak: state.streak,
          nightOwl: state.nightOwl,
          speedrunner: state.speedrunner,
          lastGoal: state.user.lastGoal || ''
        }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore sync failed:', e.message);
    }
  }

  async function loadFromFirestore() {
    if (!currentUser) return false;
    try {
      const doc = await db.collection('players').doc(currentUser.uid).get();
      if (doc.exists && doc.data().name) {
        const data = doc.data();

        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        state.user.name = data.name;
        state.user.avatar = data.avatar || '⚔️';
        state.user.class = data.class || 'warrior';
        state.xp = data.xp || 0;
        state.level = data.level || 1;

        if (data.fullState) {
          try {
            const full = JSON.parse(data.fullState);
            state.quests = full.quests || [];
            state.completedQuests = full.completedQuests || [];
            state.achievements = full.achievements || [];
            state.dailyLog = full.dailyLog || {};
            state.streak = full.streak || DEFAULT_STATE.streak;
            state.nightOwl = full.nightOwl || false;
            state.speedrunner = full.speedrunner || false;
            state.user.lastGoal = full.lastGoal || '';
          } catch (parseErr) {
            console.warn('Failed to parse fullState:', parseErr);
          }
        }

        if ((!state.completedQuests || state.completedQuests.length === 0) && data.questsCompleted) {
          // Keep XP/level even if fullState was missing
        }

        hydrateState();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        syncToFirestore();
        return true;
      }
      return false;
    } catch (e) {
      console.warn('Firestore load failed:', e.message);
      loadState();
      return !!state.user.name;
    }
  }

  async function fetchLeaderboardData() {
    try {
      const snapshot = await db.collection('players')
        .orderBy('xp', 'desc')
        .limit(50)
        .get();

      const players = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.name) {
          players.push({
            name: data.name,
            avatar: data.avatar || '⚔️',
            level: data.level || 1,
            xp: data.xp || 0,
            isUser: doc.id === (currentUser ? currentUser.uid : null)
          });
        }
      });

      return players;
    } catch (e) {
      console.warn('Leaderboard fetch failed:', e.message);
      return [{
        name: state.user.name,
        avatar: state.user.avatar,
        level: state.level,
        xp: state.xp,
        isUser: true
      }];
    }
  }

  // ==========================================
  // 6. NAVIGATION
  // ==========================================
  let activeScreen = 'screen-auth';
  let questFilter = 'daily';
  let lbFilter = 'weekly';

  function navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (!target) return;
    target.classList.add('active');
    activeScreen = screenId;

    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.screen === screenId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    closeNav();

    if (screenId === 'screen-dashboard') { renderQuests(); updateDashboardStats(); }
    if (screenId === 'screen-profile') renderProfile();
    if (screenId === 'screen-achievements') renderAchievements();
    if (screenId === 'screen-leaderboard') renderLeaderboard();
  }

  function openNav() {
    document.getElementById('side-nav').classList.remove('hidden');
  }

  function closeNav() {
    document.getElementById('side-nav').classList.add('hidden');
  }

  // ==========================================
  // 7. INIT & AUTH STATE
  // ==========================================
  function init() {
    loadState();
    setupCanvas();
    setupEventListeners();

    auth.onAuthStateChanged(async (user) => {
      if (user) {
        currentUser = user;
        const hasProfile = await loadFromFirestore();

        document.getElementById('screen-auth').classList.remove('active');

        if (hasProfile && state.user.name) {
          document.getElementById('game-hud').classList.remove('hidden');
          updateHUD();
          navigateTo('screen-dashboard');
        } else {
          loadState();
          document.getElementById('screen-landing').classList.add('active');
        }
      } else {
        currentUser = null;
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('game-hud').classList.add('hidden');
        document.getElementById('screen-auth').classList.add('active');
      }
    });
  }

  function setupEventListeners() {
    document.getElementById('btn-google').addEventListener('click', signInWithGoogle);
    document.getElementById('btn-microsoft').addEventListener('click', signInWithMicrosoft);

    document.getElementById('email-auth-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const pass = document.getElementById('auth-password').value;
      signInWithEmail(email, pass);
    });

    document.getElementById('btn-email-signup').addEventListener('click', () => {
      const email = document.getElementById('auth-email').value;
      const pass = document.getElementById('auth-password').value;
      if (!email || pass.length < 6) {
        showAuthError('Please enter email and password (min 6 chars).');
        return;
      }
      signUpWithEmail(email, pass);
    });

    const avatars = document.querySelectorAll('.avatar-option');
    avatars.forEach(btn => btn.addEventListener('click', (e) => {
      avatars.forEach(b => b.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
    }));

    const classes = document.querySelectorAll('.class-option');
    classes.forEach(btn => btn.addEventListener('click', (e) => {
      classes.forEach(b => b.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
    }));

    document.getElementById('btn-enter').addEventListener('click', () => {
      const name = document.getElementById('input-username').value.trim();
      if (!name) {
        document.getElementById('login-error').textContent = 'Please enter a hero name.';
        return;
      }
      state.user.name = name;
      state.user.avatar = document.querySelector('.avatar-option.selected').dataset.avatar;
      state.user.class = document.querySelector('.class-option.selected').dataset.class;
      saveState();

      document.getElementById('screen-landing').classList.remove('active');
      document.getElementById('game-hud').classList.remove('hidden');
      updateHUD();
      navigateTo('screen-dashboard');
    });

    document.getElementById('hud-profile-link').addEventListener('click', () => {
      navigateTo('screen-profile');
    });

    document.getElementById('hud-menu-toggle').addEventListener('click', openNav);
    document.getElementById('nav-close').addEventListener('click', closeNav);
    document.getElementById('nav-overlay').addEventListener('click', closeNav);
    document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
      item.addEventListener('click', (e) => navigateTo(e.currentTarget.dataset.screen));
    });
    document.getElementById('btn-logout').addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      signOut();
    });

    document.querySelectorAll('.quest-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.quest-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        questFilter = e.currentTarget.dataset.tab;
        renderQuests();
      });
    });

    const modal = document.getElementById('modal-quest-create');
    document.getElementById('fab-add-quest').addEventListener('click', () => {
      modal.classList.remove('hidden');
      updatePreview();
    });
    document.getElementById('btn-empty-add').addEventListener('click', () => {
      modal.classList.remove('hidden');
      updatePreview();
    });
    document.getElementById('modal-close-quest').addEventListener('click', () => modal.classList.add('hidden'));

    const skulls = document.querySelectorAll('.skull-btn');
    skulls.forEach(skull => {
      skull.addEventListener('click', (e) => {
        const diff = parseInt(e.currentTarget.dataset.diff);
        skulls.forEach((s, idx) => {
          if (idx < diff) s.classList.add('active');
          else s.classList.remove('active');
        });
        const labels = ['Easy', 'Normal', 'Hard', 'Epic', 'Legendary'];
        document.getElementById('diff-label').textContent = labels[diff - 1];
        document.getElementById('diff-xp').textContent = `+${diff * 25} XP`;
        updatePreview();
      });
    });

    document.getElementById('quest-name').addEventListener('input', updatePreview);
    document.getElementById('quest-desc').addEventListener('input', updatePreview);
    document.getElementById('quest-category').addEventListener('change', updatePreview);
    document.getElementById('quest-type').addEventListener('change', updatePreview);

    document.getElementById('quest-form').addEventListener('submit', (e) => {
      e.preventDefault();
      createQuest();
    });

    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        lbFilter = e.currentTarget.dataset.lb;
        renderLeaderboard();
      });
    });

    const aiModal = document.getElementById('modal-ai-quest');
    document.getElementById('fab-ai-quest').addEventListener('click', () => openAIModal());
    document.getElementById('modal-close-ai').addEventListener('click', () => aiModal.classList.add('hidden'));
    document.getElementById('btn-ai-generate').addEventListener('click', generateAIPlan);
    document.getElementById('btn-ai-add-all').addEventListener('click', addAIMissionsToBoard);
  }

  // ==========================================
  // 8. QUEST SYSTEM
  // ==========================================
  function getActiveDifficulty() {
    return document.querySelectorAll('.skull-btn.active').length || 1;
  }

  function updatePreview() {
    const name = document.getElementById('quest-name').value || 'Quest Name';
    const desc = document.getElementById('quest-desc').value || 'Description...';
    const cat = document.getElementById('quest-category').value;
    const type = document.getElementById('quest-type').value;
    const diff = getActiveDifficulty();
    const xp = diff * 25;

    document.getElementById('preview-title').textContent = name;
    document.getElementById('preview-desc').textContent = desc;
    document.getElementById('preview-category').textContent = CATEGORY_ICONS[cat];
    document.getElementById('preview-type').textContent = type.charAt(0).toUpperCase() + type.slice(1);
    document.getElementById('preview-difficulty').textContent = '💀'.repeat(diff);
    document.getElementById('preview-xp').textContent = `+${xp} XP`;
    document.getElementById('preview-rarity').className = `qc-rarity-bar rarity-${getRarity(xp)}`;
  }

  function createQuest() {
    const diff = getActiveDifficulty();
    const xp = diff * 25;

    const quest = {
      id: Date.now() + Math.random().toString(),
      name: document.getElementById('quest-name').value,
      desc: document.getElementById('quest-desc').value,
      category: document.getElementById('quest-category').value,
      type: document.getElementById('quest-type').value,
      difficulty: diff,
      xp: xp,
      rarity: getRarity(xp),
      createdAt: Date.now(),
      status: 'active'
    };

    state.quests.push(quest);
    saveState();

    document.getElementById('quest-form').reset();
    document.querySelectorAll('.skull-btn').forEach((s, i) => {
      if (i === 0) s.classList.add('active');
      else s.classList.remove('active');
    });
    updatePreview();
    document.getElementById('modal-quest-create').classList.add('hidden');

    renderQuests();
    updateDashboardStats();
  }

  function completeQuest(id) {
    const idx = state.quests.findIndex(q => q.id === id);
    if (idx === -1) return;

    const quest = state.quests.splice(idx, 1)[0];
    quest.status = 'completed';
    quest.completedAt = Date.now();
    state.completedQuests.push(quest);

    updateStreak();

    state.xp += quest.xp;

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) state.nightOwl = true;
    if (Date.now() - quest.createdAt < 3600000) state.speedrunner = true;

    saveState();

    const qcOverlay = document.getElementById('quest-complete-overlay');
    document.getElementById('qc-reward-text').textContent = `+${quest.xp} XP`;
    qcOverlay.classList.remove('hidden');
    setTimeout(() => qcOverlay.classList.add('hidden'), 1500);

    checkLevelUp();
    checkAchievements(false);
    updateHUD();
    renderQuests();
    updateDashboardStats();
  }

  function deleteQuest(id) {
    state.quests = state.quests.filter(q => q.id !== id);
    saveState();
    renderQuests();
    updateDashboardStats();
  }

  function renderQuests() {
    const grid = document.getElementById('quest-grid');
    grid.innerHTML = '';

    let filtered = state.quests;
    if (questFilter !== 'all') {
      filtered = state.quests.filter(q => q.type === questFilter);
    }

    if (filtered.length === 0) {
      document.getElementById('empty-state').classList.remove('hidden');
    } else {
      document.getElementById('empty-state').classList.add('hidden');
      filtered.forEach(q => {
        const card = document.createElement('div');
        card.className = `quest-card rarity-${q.rarity}`;
        const timeChip = q.durationLabel
          ? `<span class="qc-type-badge">${q.durationLabel}</span>`
          : '';
        card.innerHTML = `
          <div class="qc-rarity-bar rarity-${q.rarity}"></div>
          <div class="qc-header">
            <span class="qc-category">${CATEGORY_ICONS[q.category] || '🗡️'}</span>
            <span class="qc-type-badge">${(q.type || 'daily').charAt(0).toUpperCase() + (q.type || 'daily').slice(1)}</span>
            ${timeChip}
            <button class="qc-delete" data-id="${q.id}">✕</button>
          </div>
          <h3 class="qc-title">${q.name}</h3>
          <p class="qc-desc">${q.desc}</p>
          <div class="qc-footer">
            <span class="qc-difficulty">${'💀'.repeat(q.difficulty || 1)}</span>
            <span class="qc-xp">+${q.xp} XP</span>
          </div>
          <button class="btn-primary btn-complete" data-id="${q.id}">COMPLETE</button>
        `;
        grid.appendChild(card);
      });

      grid.querySelectorAll('.btn-complete').forEach(btn => {
        btn.addEventListener('click', (e) => completeQuest(e.currentTarget.dataset.id));
      });
      grid.querySelectorAll('.qc-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteQuest(e.currentTarget.dataset.id));
      });
    }
  }

  function updateDashboardStats() {
    setText('stat-active', state.quests.length);
    const today = getTodayStr();
    const todayCompleted = state.completedQuests.filter(q =>
      localDateStr(q.completedAt) === today
    );
    setText('stat-completed-today', todayCompleted.length);
    setText('stat-xp-today', todayCompleted.reduce((sum, q) => sum + q.xp, 0));
  }

  // ==========================================
  // 9. STREAK SYSTEM
  // ==========================================
  function updateStreak() {
    const today = getTodayStr();
    state.dailyLog[today] = (state.dailyLog[today] || 0) + 1;
    recalcStreakFromLog();
  }

  // ==========================================
  // 10. HUD, XP & LEVELING
  // ==========================================
  function updateHUD() {
    setText('hud-username', state.user.name);
    setText('hud-class', (state.user.class || 'warrior').charAt(0).toUpperCase() + (state.user.class || 'warrior').slice(1));
    setText('hud-avatar', state.user.avatar);
    setText('hud-level-badge', `LV ${state.level}`);
    setText('streak-count', state.streak.current);

    const reqXP = requiredXP(state.level);
    const prevXP = state.level === 1 ? 0 : requiredXP(state.level - 1);
    const progressXP = state.xp - prevXP;
    const levelXP = reqXP - prevXP;
    const pct = Math.max(0, Math.min(100, (progressXP / levelXP) * 100));

    const fill = document.getElementById('xp-bar-fill');
    const glow = document.getElementById('xp-bar-glow');
    if (fill) fill.style.width = `${pct}%`;
    if (glow) glow.style.width = `${pct}%`;
    setText('xp-text', `${state.xp} / ${reqXP} XP`);
  }

  function checkLevelUp() {
    let leveledUp = false;
    while (state.xp >= requiredXP(state.level)) {
      state.level++;
      leveledUp = true;
    }
    if (leveledUp) {
      saveState();
      const overlay = document.getElementById('level-up-overlay');
      setText('level-up-number', state.level);
      overlay.classList.remove('hidden');
      setTimeout(() => overlay.classList.add('hidden'), 2500);
      updateHUD();
    }
  }

  // ==========================================
  // 11. ACHIEVEMENTS
  // ==========================================
  function checkAchievements(silent) {
    ACHIEVEMENTS.forEach(ach => {
      if (!state.achievements.includes(ach.id)) {
        if (ach.check(state)) {
          state.achievements.push(ach.id);
          if (!silent) showToast(`🏆 Achievement Unlocked: ${ach.name}`);
        }
      }
    });
    if (!silent) saveState();
  }

  // ==========================================
  // 12. PROFILE & SCREENS
  // ==========================================
  function renderProfile() {
    setText('profile-avatar', state.user.avatar);
    setText('profile-name', state.user.name);
    setText('profile-class', (state.user.class || 'warrior').toUpperCase());
    setText('profile-level', state.level);
    setText('pstat-level', state.level);

    const reqXP = requiredXP(state.level);
    const prevXP = state.level === 1 ? 0 : requiredXP(state.level - 1);
    const pct = Math.max(0, Math.min(1, (state.xp - prevXP) / (reqXP - prevXP || 1)));
    const dashOffset = 339.292 - (339.292 * pct);
    const ring = document.getElementById('profile-ring-fill');
    if (ring) ring.style.strokeDashoffset = dashOffset;

    setText('pstat-xp', state.xp.toLocaleString());
    setText('pstat-quests', state.completedQuests.length);
    setText('pstat-streak', state.streak.current);
    setText('pstat-longest', state.streak.longest);
    setText('pstat-badges', state.achievements.length);

    const heatmap = document.getElementById('streak-heatmap');
    const empty = document.getElementById('heatmap-empty');
    heatmap.innerHTML = '';
    const today = new Date();
    let totalActivity = 0;
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const ds = localDateStr(d);
      const val = state.dailyLog[ds] || 0;
      totalActivity += val;
      let level = 'dark';
      if (val >= 1 && val <= 2) level = 'low';
      if (val >= 3 && val <= 4) level = 'medium';
      if (val >= 5) level = 'high';

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.dataset.level = level;
      cell.title = `${ds}: ${val} quests`;
      heatmap.appendChild(cell);
    }
    if (empty) {
      if (totalActivity === 0) empty.classList.remove('hidden');
      else empty.classList.add('hidden');
    }

    const eq = document.getElementById('equipped-badges');
    eq.innerHTML = '';
    const unlocked = ACHIEVEMENTS.filter(a => state.achievements.includes(a.id)).slice(0, 5);
    if (unlocked.length === 0) {
      eq.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No badges yet — complete quests to earn them!</p>';
    } else {
      unlocked.forEach(ach => {
        const b = document.createElement('div');
        b.className = 'badge unlocked';
        b.innerHTML = `
          <div class="badge-icon">${ach.icon}</div>
          <div class="badge-name">${ach.name}</div>
        `;
        eq.appendChild(b);
      });
    }
  }

  function renderAchievements() {
    const grid = document.getElementById('badge-grid');
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach(ach => {
      const isUnlocked = state.achievements.includes(ach.id);
      const el = document.createElement('div');
      el.className = `badge ${isUnlocked ? 'unlocked' : 'locked'}`;
      el.innerHTML = `
        <div class="badge-icon">${ach.icon}</div>
        <div class="badge-name">${ach.name}</div>
        <div class="badge-desc">${ach.desc}</div>
      `;
      grid.appendChild(el);
    });
  }

  // ==========================================
  // 13. LEADERBOARD
  // ==========================================
  async function renderLeaderboard() {
    const podium = document.getElementById('leaderboard-podium');
    const body = document.getElementById('lb-body');

    body.innerHTML = '<div class="lb-row" style="justify-content:center;color:var(--text-muted);">Loading rankings...</div>';
    podium.innerHTML = '';

    const players = await fetchLeaderboardData();

    if (players.length === 0) {
      body.innerHTML = '<div class="lb-row" style="justify-content:center;color:var(--text-muted);">No players yet. Be the first!</div>';
      return;
    }

    const top3 = players.slice(0, 3);
    const podiumClasses = ['gold', 'silver', 'bronze'];
    podium.innerHTML = '';
    top3.forEach((p, i) => {
      podium.insertAdjacentHTML('beforeend', `
        <div class="podium-place podium-${podiumClasses[i]} ${p.isUser ? 'user-highlight' : ''}">
          <div class="podium-rank">${i + 1}</div>
          <div class="podium-name">${p.name}</div>
          <div class="podium-lvl">Lv ${p.level}</div>
        </div>
      `);
    });

    body.innerHTML = '';
    players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = `lb-row ${p.isUser ? 'user-highlight' : ''}`;
      row.innerHTML = `
        <span class="lb-col lb-rank">${i + 1}</span>
        <span class="lb-col lb-player">${p.avatar} ${p.name}</span>
        <span class="lb-col lb-lvl">${p.level}</span>
        <span class="lb-col lb-xp">${p.xp.toLocaleString()}</span>
      `;
      body.appendChild(row);
    });
  }

  // ==========================================
  // 14. AI QUEST PLANNER
  // ==========================================
  function openAIModal() {
    const modal = document.getElementById('modal-ai-quest');
    document.getElementById('ai-error').textContent = '';
    document.getElementById('ai-results').classList.add('hidden');
    document.getElementById('ai-loading').classList.add('hidden');
    if (state.user.lastGoal) {
      document.getElementById('ai-goal').value = state.user.lastGoal;
    }
    pendingAIMissions = [];
    modal.classList.remove('hidden');
  }

  function inferCategory(goal, playerClass) {
    const g = (goal || '').toLowerCase();
    if (/gym|fit|run|workout|exercise|health|sport/.test(g)) return 'exercise';
    if (/code|program|react|python|javascript|dev|software/.test(g)) return 'code';
    if (/meditat|sleep|well|mindful|yoga|stress/.test(g)) return 'wellness';
    if (/draw|music|write|creat|art|design/.test(g)) return 'creative';
    if (/work|job|career|email|meeting/.test(g)) return 'work';
    if (/study|learn|exam|physics|math|read|course/.test(g)) return 'study';
    const classMap = { warrior: 'exercise', mage: 'study', rogue: 'code', scholar: 'study' };
    return classMap[playerClass] || 'study';
  }

  function formatMinutes(mins) {
    if (mins >= 120) return `${Math.round(mins / 60)}h`;
    return `${mins}m`;
  }

  function recentPerformanceSummary() {
    const recent = [...(state.completedQuests || [])]
      .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
      .slice(0, 8);
    const cats = {};
    recent.forEach(q => {
      cats[q.category] = (cats[q.category] || 0) + 1;
    });
    const topCat = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0];
    return {
      recent,
      topCat,
      done: state.completedQuests.length,
      active: state.quests.length,
      streak: state.streak.current
    };
  }

  function splitBlocks(totalMin, timeLabel) {
    if (timeLabel === '1 week' || timeLabel === '2 weeks') {
      const days = timeLabel === '2 weeks' ? 14 : 7;
      return [
        { label: `Days 1–${Math.ceil(days / 3)}`, minutes: 45, title: 'Foundation', focus: 'Set the base: concepts, setup, and a repeatable daily habit.' },
        { label: `Days ${Math.ceil(days / 3) + 1}–${Math.ceil(days * 2 / 3)}`, minutes: 60, title: 'Deep Practice', focus: 'Spend the bulk of each session on the hardest skill block.' },
        { label: `Days ${Math.ceil(days * 2 / 3) + 1}–${days}`, minutes: 45, title: 'Apply & Review', focus: 'Ship something small and lock in what you learned.' }
      ];
    }
    if (timeLabel === 'full day') {
      return [
        { label: 'Morning', minutes: 150, title: 'Prime Hours', focus: 'Tackle the highest-focus work while energy is highest.' },
        { label: 'Afternoon', minutes: 180, title: 'Build', focus: 'Practice, drills, and output — this is the volume block.' },
        { label: 'Evening', minutes: 150, title: 'Consolidate', focus: 'Review, notes, and a light wrap so tomorrow starts faster.' }
      ];
    }
    const a = Math.max(8, Math.round(totalMin * 0.25));
    const b = Math.max(10, Math.round(totalMin * 0.45));
    const c = Math.max(8, totalMin - a - b);
    return [
      { label: `0–${formatMinutes(a)}`, minutes: a, title: 'Warm-up', focus: 'Orient, gather materials, and knock out a small first win.' },
      { label: `${formatMinutes(a)}–${formatMinutes(a + b)}`, minutes: b, title: 'Core Block', focus: 'Deep work on the main skill. No switching tasks.' },
      { label: `Last ${formatMinutes(c)}`, minutes: c, title: 'Lock-in', focus: 'Review, apply, and write what you will do next session.' }
    ];
  }

  function buildAIPlan(goal, timeLabel, skillLevel) {
    const totalMin = TIME_MINUTES[timeLabel] || 60;
    const playerClass = state.user.class || 'warrior';
    const category = inferCategory(goal, playerClass);
    const perf = recentPerformanceSummary();
    const blocks = splitBlocks(totalMin, timeLabel);
    const isLong = timeLabel === '1 week' || timeLabel === '2 weeks';
    const types = isLong ? ['daily', 'weekly', 'epic'] : ['daily', 'daily', timeLabel === 'full day' ? 'weekly' : 'daily'];
    const skillDiff = { beginner: 1, intermediate: 2, advanced: 4 };
    const baseDiff = Math.min(5, (skillDiff[skillLevel] || 2) + (state.level >= 8 ? 1 : 0));

    const verbs = {
      study: ['Map', 'Study', 'Review'],
      exercise: ['Warm up', 'Train', 'Recover'],
      code: ['Set up', 'Build', 'Debug'],
      wellness: ['Check in', 'Practice', 'Reflect'],
      work: ['Plan', 'Execute', 'Close'],
      creative: ['Collect', 'Create', 'Edit']
    };
    const v = verbs[category] || verbs.study;

    const missions = blocks.map((block, i) => {
      const diff = Math.min(5, Math.max(1, baseDiff + (i === 1 ? 1 : 0) - (i === 0 ? 1 : 0)));
      const xp = diff * 25;
      const type = types[i];
      return {
        id: Date.now() + '-' + i + Math.random().toString(16).slice(2),
        name: `${v[i]}: ${goal}`.slice(0, 50),
        desc: `${block.focus} Aim for about ${formatMinutes(block.minutes)} in this block.`,
        category,
        type,
        difficulty: diff,
        xp,
        rarity: getRarity(xp),
        durationMin: block.minutes,
        durationLabel: block.label,
        roadmapPhase: block.title,
        aiGenerated: true,
        createdAt: Date.now(),
        status: 'active'
      };
    });

    const trend = perf.topCat
      ? `Recent missions lean ${perf.topCat}. This plan stays on ${category} for the goal, at ${skillLevel} intensity.`
      : `No recent mission history yet — starting a ${skillLevel} ${category} track for a ${playerClass}.`;

    const analysis = `${state.user.name || 'Hero'} · Lv ${state.level} ${playerClass}. ${perf.done} quests done, ${perf.streak}-day streak, ${perf.active} active. ${trend} Roadmap is sized to ${timeLabel}.`;

    return { analysis, roadmap: blocks, missions };
  }

  async function generateAIPlan() {
    const goal = document.getElementById('ai-goal').value.trim();
    const timeLabel = document.getElementById('ai-time').value;
    const skillLevel = document.getElementById('ai-level').value;
    const errorEl = document.getElementById('ai-error');
    errorEl.textContent = '';

    if (!goal) {
      errorEl.textContent = 'Enter a goal so AI can build your roadmap.';
      return;
    }

    document.getElementById('ai-results').classList.add('hidden');
    document.getElementById('ai-loading').classList.remove('hidden');
    setText('ai-loading-text', 'Studying your profile and recent missions...');

    await new Promise(r => setTimeout(r, 700));
    setText('ai-loading-text', `Fitting a roadmap into ${timeLabel}...`);
    await new Promise(r => setTimeout(r, 500));

    const plan = buildAIPlan(goal, timeLabel, skillLevel);
    pendingAIMissions = plan.missions;
    state.user.lastGoal = goal;

    document.getElementById('ai-analysis').textContent = plan.analysis;
    const road = document.getElementById('ai-roadmap');
    road.innerHTML = plan.roadmap.map(p => `
      <div class="ai-phase">
        <div class="ai-phase-time">${p.label}</div>
        <div class="ai-phase-body">
          <strong>${p.title}</strong>
          <p>${p.focus}</p>
        </div>
      </div>
    `).join('');

    const list = document.getElementById('ai-quest-list');
    list.innerHTML = plan.missions.map(q => `
      <div class="ai-mission-card">
        <h5>${CATEGORY_ICONS[q.category] || ''} ${q.name}</h5>
        <p class="qc-desc">${q.desc}</p>
        <div class="ai-mission-meta">
          <span>${q.type}</span>
          <span>${q.durationLabel}</span>
          <span>${'💀'.repeat(q.difficulty)}</span>
          <span>+${q.xp} XP</span>
        </div>
      </div>
    `).join('');

    document.getElementById('ai-loading').classList.add('hidden');
    document.getElementById('ai-results').classList.remove('hidden');
  }

  function addAIMissionsToBoard() {
    if (!pendingAIMissions.length) return;
    pendingAIMissions.forEach(q => state.quests.push(q));
    pendingAIMissions = [];
    saveState();
    document.getElementById('modal-ai-quest').classList.add('hidden');
    document.getElementById('ai-results').classList.add('hidden');
    showToast('🤖 3 AI missions added to your board');
    questFilter = 'all';
    document.querySelectorAll('.quest-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'all');
    });
    renderQuests();
    updateDashboardStats();
  }

  // ==========================================
  // 15. PARTICLES BACKGROUND
  // ==========================================
  function setupCanvas() {
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.5 + 0.2)
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fff';

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < 0) {
          p.y = canvas.height;
          p.x = Math.random() * canvas.width;
        }
      });
      requestAnimationFrame(draw);
    }
    draw();
  }

  // ==========================================
  // 16. RUN INIT
  // ==========================================
  document.addEventListener('DOMContentLoaded', init);

})();
