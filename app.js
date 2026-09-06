(function () {
  // ==========================================
  // 1. CONFIGURATION & CONSTANTS
  // ==========================================
  const GEMINI_API_KEY = "AQ.Ab8RN6I7rm2K-1L5kIcALDswX1Q13PwK0elgl-7fzYGxeDLxvA";
  const GEMINI_MODEL = "gemini-3.6-flash";

  const firebaseConfig = {
    apiKey: "AIzaSyAuPEfL4kEQ0j9IB9TDVbQUOmOcSXrTTvA",
    authDomain: "evo1-a0050.firebaseapp.com",
    projectId: "evo1-a0050",
    storageBucket: "evo1-a0050.firebasestorage.app",
    messagingSenderId: "119820529385",
    appId: "1:119820529385:web:5351044e31f72a1fb24a78"
  };

  let auth = null;
  let db = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      firebase.initializeApp(firebaseConfig);
      auth = firebase.auth();
      db = firebase.firestore();
    }
  } catch (e) {
    console.warn("Firebase initialization skipped or failed:", e);
  }

  const STORAGE_KEY = 'evo-state';

  const DEFAULT_STATE = {
    user: { name: '', avatar: '⚔️', class: 'warrior' },
    quests: [],
    completedQuests: [],
    xp: 0,
    level: 1,
    gold: 50,
    streak: { current: 1, longest: 1, lastActiveDate: null },
    achievements: [],
    dailyLog: {},
    bossState: { activeBossIndex: 0, hp: 5, defeated: 0 },
    bossesDefeated: 0,
    nightOwl: false,
    speedrunner: false
  };

  let state = {};
  let currentUser = null; // Firebase user or null for guest
  let currentBreakdownSteps = [];

  const CATEGORY_ICONS = {
    study: '📚',
    exercise: '💪',
    code: '💻',
    wellness: '🧘',
    work: '💼',
    creative: '🎨'
  };

  const ACHIEVEMENTS = [
    { id: 'first_blood', name: 'First Blood', desc: 'Complete your first quest', icon: '🗡️', check: s => s.completedQuests.length >= 1 },
    { id: 'hat_trick', name: 'Hat Trick', desc: '3 quests in one day', icon: '🎩', check: s => todayCount(s) >= 3 },
    { id: 'unstoppable', name: 'Unstoppable', desc: '7-day streak', icon: '🔥', check: s => s.streak.current >= 7 },
    { id: 'centurion', name: 'Centurion', desc: '100 quests completed', icon: '💯', check: s => s.completedQuests.length >= 100 },
    { id: 'boss_slayer', name: 'Boss Slayer', desc: 'Defeat a boss in the Arena', icon: '💀', check: s => s.bossesDefeated >= 1 },
    { id: 'night_owl', name: 'Night Owl', desc: 'Quest completed after midnight', icon: '🦉', check: s => s.nightOwl },
    { id: 'speedrunner', name: 'Speedrunner', desc: 'Quest completed within 1hr of creation', icon: '⚡', check: s => s.speedrunner },
    { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '⭐', check: s => s.level >= 5 },
    { id: 'level_10', name: 'Veteran', desc: 'Reach level 10', icon: '🌟', check: s => s.level >= 10 },
    { id: 'gold_hoarder', name: 'Gold Hoarder', desc: 'Accumulate 500 gold', icon: '💰', check: s => s.gold >= 500 },
    { id: 'ten_quests', name: 'Adventurer', desc: 'Complete 10 total quests', icon: '🗺️', check: s => s.completedQuests.length >= 10 },
    { id: 'streak_3', name: 'Warming Up', desc: '3-day active streak', icon: '🌡️', check: s => s.streak.current >= 3 },
    { id: 'streak_30', name: 'Legendary Streak', desc: '30-day active streak', icon: '👑', check: s => s.streak.current >= 30 },
    { id: 'all_categories', name: 'Renaissance Hero', desc: 'Complete quests in every category', icon: '🎭', check: s => allCategories(s) }
  ];

  const BOSSES = [
    { name: 'Procrastination Dragon', sprite: '🐉', maxHp: 5 },
    { name: 'Distraction Demon', sprite: '👹', maxHp: 6 },
    { name: 'Burnout Phoenix', sprite: '🔥', maxHp: 7 }
  ];

  // ==========================================
  // 2. AUDIO SYNTHESIZER (8-BIT RPG SFX)
  // ==========================================
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) audioCtx = new AudioCtxClass();
    }
    return audioCtx;
  }

  function playSfx(type) {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'complete') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        osc.frequency.setValueAtTime(783.99, now + 0.16);
        osc.frequency.setValueAtTime(1046.50, now + 0.24);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'levelup') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.1);
        osc.frequency.setValueAtTime(659.25, now + 0.2);
        osc.frequency.setValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else if (type === 'ai') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'hit') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (err) {
      // Audio autoplay policy catch
    }
  }

  // ==========================================
  // 3. UTILS & STATE PERSISTENCE
  // ==========================================
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (currentUser && db) {
      syncToFirestore();
    }
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        state = { ...DEFAULT_STATE, ...parsed };
        state.user = { ...DEFAULT_STATE.user, ...(parsed.user || {}) };
        state.streak = { ...DEFAULT_STATE.streak, ...(parsed.streak || {}) };
        state.bossState = { ...DEFAULT_STATE.bossState, ...(parsed.bossState || {}) };
      } catch (e) {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      // Give initial starter quests if brand new
      state.quests = [
        {
          id: 'starter_1',
          name: '⚔️ The First Trial',
          desc: 'Explore the Quest Board and customize your Hero Profile.',
          category: 'study',
          type: 'daily',
          difficulty: 1,
          xp: 25,
          rarity: 'common',
          deadline: '',
          createdAt: Date.now(),
          status: 'active'
        },
        {
          id: 'starter_2',
          name: '🤖 Summon the AI Forge',
          desc: 'Click the 🤖 AI button and generate 3 custom missions for your goals.',
          category: 'code',
          type: 'daily',
          difficulty: 2,
          xp: 50,
          rarity: 'rare',
          deadline: '',
          createdAt: Date.now(),
          status: 'active'
        }
      ];
    }
  }

  function getTodayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function todayCount(s) {
    return s.dailyLog[getTodayStr()] || 0;
  }

  function allCategories(s) {
    const cats = new Set(s.completedQuests.map(q => q.category));
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
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  // ==========================================
  // 4. FIREBASE AUTH & FIRESTORE SYNC
  // ==========================================
  function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = msg;
  }

  function signInWithGoogle() {
    if (!auth) {
      showAuthError("Firebase not ready. Try Quick Play as Guest!");
      return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => showAuthError(err.message));
  }

  function signInWithMicrosoft() {
    if (!auth) {
      showAuthError("Firebase not ready. Try Quick Play as Guest!");
      return;
    }
    const provider = new firebase.auth.OAuthProvider('microsoft.com');
    auth.signInWithPopup(provider).catch(err => showAuthError(err.message));
  }

  function signInWithEmail(email, password) {
    if (!auth) {
      showAuthError("Firebase not ready. Try Quick Play as Guest!");
      return;
    }
    auth.signInWithEmailAndPassword(email, password).catch(err => showAuthError(err.message));
  }

  function signUpWithEmail(email, password) {
    if (!auth) {
      showAuthError("Firebase not ready. Try Quick Play as Guest!");
      return;
    }
    auth.createUserWithEmailAndPassword(email, password).catch(err => showAuthError(err.message));
  }

  function signOut() {
    if (auth) auth.signOut();
    currentUser = null;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('screen-auth').classList.add('active');
  }

  async function syncToFirestore() {
    if (!currentUser || !db) return;
    try {
      await db.collection('players').doc(currentUser.uid).set({
        name: state.user.name,
        avatar: state.user.avatar,
        class: state.user.class,
        xp: state.xp,
        level: state.level,
        gold: state.gold,
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
          bossState: state.bossState,
          bossesDefeated: state.bossesDefeated,
          nightOwl: state.nightOwl,
          speedrunner: state.speedrunner
        }),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore sync failed:', e.message);
    }
  }

  async function loadFromFirestore() {
    if (!currentUser || !db) return false;
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
        state.gold = data.gold || 50;

        if (data.fullState) {
          try {
            const full = JSON.parse(data.fullState);
            state.quests = full.quests || [];
            state.completedQuests = full.completedQuests || [];
            state.achievements = full.achievements || [];
            state.dailyLog = full.dailyLog || {};
            state.streak = full.streak || DEFAULT_STATE.streak;
            state.bossState = full.bossState || DEFAULT_STATE.bossState;
            state.bossesDefeated = full.bossesDefeated || 0;
            state.nightOwl = full.nightOwl || false;
            state.speedrunner = full.speedrunner || false;
          } catch (parseErr) {
            console.warn('Failed to parse fullState:', parseErr);
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    if (db) {
      try {
        const snapshot = await db.collection('players')
          .orderBy('xp', 'desc')
          .limit(25)
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

        if (players.length > 0) return players;
      } catch (e) {
        console.warn('Leaderboard remote fetch failed, using local & champions:', e.message);
      }
    }

    // Default champions leaderboard including current player
    const userPlayer = {
      name: state.user.name || 'Hero',
      avatar: state.user.avatar || '⚔️',
      level: state.level,
      xp: state.xp,
      isUser: true
    };

    const mockPlayers = [
      { name: 'Valkyrie_Neo', avatar: '🦅', level: 12, xp: 4850, isUser: false },
      { name: 'PixelMage', avatar: '🧙', level: 9, xp: 3200, isUser: false },
      { name: 'ShadowCoder', avatar: '🦊', level: 7, xp: 2150, isUser: false },
      { name: 'CyberTitan', avatar: '🛡️', level: 6, xp: 1750, isUser: false },
      { name: 'RogueZen', avatar: '🎯', level: 4, xp: 980, isUser: false }
    ];

    const all = [userPlayer, ...mockPlayers];
    all.sort((a, b) => b.xp - a.xp);
    return all;
  }

  // ==========================================
  // 5. NAVIGATION & GUEST SESSION
  // ==========================================
  let activeScreen = 'screen-auth';
  let questFilter = 'daily';
  let lbFilter = 'weekly';

  function navigateTo(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      activeScreen = screenId;
    }

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
    if (screenId === 'screen-boss') renderBoss();
  }

  function openNav() {
    document.getElementById('side-nav').classList.remove('hidden');
  }

  function closeNav() {
    document.getElementById('side-nav').classList.add('hidden');
  }

  function startGuestSession() {
    currentUser = null;
    loadState();
    if (!state.user.name) {
      state.user.name = 'CyberHero';
      state.user.avatar = '⚔️';
      state.user.class = 'warrior';
      saveState();
    }
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('game-hud').classList.remove('hidden');
    updateHUD();
    navigateTo('screen-dashboard');
    showToast(`⚡ Welcome to EVO, ${state.user.name}!`);
    playSfx('levelup');
  }

  // ==========================================
  // 6. GOOGLE GEMINI 3.6 FLASH INTEGRATION
  // ==========================================
  async function callGemini(promptText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const payload = {
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.7
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("Empty response from Gemini.");
    }

    let cleanJson = candidateText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```\s*$/, "");
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/i, "").replace(/```\s*$/, "");
    }

    return JSON.parse(cleanJson);
  }

  function generateOfflineQuests(goal, time, level, category, type) {
    const cat = category === 'auto' ? 'code' : category;
    const t = type || 'daily';
    const cleanGoal = goal || "Skill Mastery & Fitness";

    return {
      quests: [
        {
          name: `⚡ Foundation: ${cleanGoal.slice(0, 30)}`,
          desc: `Kickstart your session with focused fundamentals. Dedicate 20 minutes to active practice.`,
          category: cat,
          type: t,
          difficulty: 2,
          xp: 50,
          tacticalTip: "Eliminate all notifications and enter a flow state."
        },
        {
          name: `🛡️ Intensive Sprint: ${cleanGoal.slice(0, 26)}`,
          desc: `Tackle a concrete project component or workout milestone to build real momentum.`,
          category: cat,
          type: t,
          difficulty: 3,
          xp: 75,
          tacticalTip: "Break complex logic into small verifiable micro-steps."
        },
        {
          name: `🏆 Boss Challenge: Review & Apply`,
          desc: `Test your mastery by summarizing key takeaways or logging your performance.`,
          category: cat === 'exercise' ? 'wellness' : 'study',
          type: t,
          difficulty: 2,
          xp: 50,
          tacticalTip: "Document what you learned to cement long-term retention."
        }
      ]
    };
  }

  async function generateAIQuests() {
    const goalInput = document.getElementById("ai-goal");
    const goal = goalInput.value.trim() || "Level up my general coding, study, and fitness";
    const time = document.getElementById("ai-time").value;
    const level = document.getElementById("ai-level").value;
    const categorySelect = document.getElementById("ai-category").value;
    const typeSelect = document.getElementById("ai-type").value;

    const error = document.getElementById("ai-error");
    const loading = document.getElementById("ai-loading");
    const results = document.getElementById("ai-results");

    error.textContent = "";
    results.classList.add("hidden");
    loading.classList.remove("hidden");

    const heroName = state.user.name || "Hero";
    const heroClass = state.user.class || "warrior";
    const heroLevel = state.level || 1;
    const streakDays = state.streak.current || 0;

    const prompt = `You are EVO Core, the adaptive AI master of a gamified productivity RPG where real-life tasks are quests.
Generate exactly 3 exciting, practical, and highly actionable missions for the player.

Player Context:
- Name: ${heroName}
- Class: ${heroClass} (incorporate subtle RPG flavor suited for a ${heroClass})
- Level: ${heroLevel}
- Active Streak: ${streakDays} days
- Player's Goal / Target: "${goal}"
- Time Allocated: ${time}
- Skill Tier: ${level}
- Target Category: ${categorySelect === "auto" ? "choose the most appropriate from: study, exercise, code, wellness, work, creative" : categorySelect}
- Quest Duration Type: ${typeSelect}

Return a valid JSON object strictly matching this schema:
{
  "quests": [
    {
      "name": "Punchy quest name with RPG flair (max 45 chars)",
      "desc": "Clear, measurable, real-world task description with tangible win condition (1-2 sentences)",
      "category": "study" | "exercise" | "code" | "wellness" | "work" | "creative",
      "type": "daily" | "weekly" | "epic",
      "difficulty": 1 to 5 (integer, 1=easy, 2=normal, 3=hard, 4=epic, 5=legendary),
      "xp": number (between 25 and 125, roughly difficulty * 25),
      "tacticalTip": "A 1-sentence tip on how to do this effectively"
    }
  ]
}`;

    try {
      let parsed;
      try {
        parsed = await callGemini(prompt);
      } catch (geminiErr) {
        console.warn("Gemini call failed or rate-limited. Falling back to offline generator:", geminiErr);
        parsed = generateOfflineQuests(goal, time, level, categorySelect, typeSelect);
      }

      if (!parsed || !Array.isArray(parsed.quests) || parsed.quests.length === 0) {
        parsed = generateOfflineQuests(goal, time, level, categorySelect, typeSelect);
      }

      renderAIQuestResults(parsed.quests);
      playSfx("ai");
      results.classList.remove("hidden");
    } catch (err) {
      console.error("AI Generation error:", err);
      error.textContent = "AI generation encountered a problem. Using adaptive offline quests.";
      const fallback = generateOfflineQuests(goal, time, level, categorySelect, typeSelect);
      renderAIQuestResults(fallback.quests);
      results.classList.remove("hidden");
    } finally {
      loading.classList.add("hidden");
    }
  }

  function renderAIQuestResults(quests) {
    const list = document.getElementById("ai-quest-list");
    list.innerHTML = "";

    quests.forEach((q, idx) => {
      const card = document.createElement("div");
      card.className = "ai-generated-card";

      const validCategory = (q.category && CATEGORY_ICONS[q.category]) ? q.category : 'code';
      const diff = Math.max(1, Math.min(5, Number(q.difficulty) || 2));
      const xp = Number(q.xp) || (diff * 25);
      const icon = CATEGORY_ICONS[validCategory] || '⚔️';

      card.innerHTML = `
        <div class="ai-card-top">
          <h4 class="ai-card-title">${q.name}</h4>
          <span class="ai-badge">${icon} ${validCategory.toUpperCase()}</span>
        </div>
        <p class="ai-card-desc">${q.desc}</p>
        ${q.tacticalTip ? `<p style="font-size:0.78rem;color:var(--primary);margin-bottom:8px;">💡 <em>${q.tacticalTip}</em></p>` : ''}
        <div class="ai-card-bottom">
          <div class="ai-card-badges">
            <span>${'💀'.repeat(diff)}</span>
            <span style="color:var(--accent-gold);font-weight:700;">+${xp} XP</span>
          </div>
          <button type="button" class="btn-ai-add-single" data-idx="${idx}">+ ACCEPT MISSION</button>
        </div>
      `;

      card.dataset.quest = JSON.stringify({
        ...q,
        category: validCategory,
        difficulty: diff,
        xp: xp
      });

      list.appendChild(card);
    });

    list.querySelectorAll('.btn-ai-add-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.currentTarget.closest('.ai-generated-card');
        if (card && card.dataset.quest) {
          const questData = JSON.parse(card.dataset.quest);
          addSingleQuestToBoard(questData);
          card.style.opacity = '0.5';
          e.currentTarget.textContent = 'ADDED ✓';
          e.currentTarget.disabled = true;
        }
      });
    });
  }

  function addSingleQuestToBoard(q) {
    const diff = Math.max(1, Math.min(5, Number(q.difficulty) || 2));
    const xp = Number(q.xp) || (diff * 25);
    const cat = (q.category && CATEGORY_ICONS[q.category]) ? q.category : 'study';
    const type = q.type || 'daily';

    const newQuest = {
      id: 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: q.name,
      desc: q.desc,
      category: cat,
      type: type,
      difficulty: diff,
      xp: xp,
      rarity: getRarity(xp),
      deadline: '',
      createdAt: Date.now(),
      status: 'active',
      isAiGenerated: true
    };

    state.quests.unshift(newQuest);
    saveState();
    renderQuests();
    updateDashboardStats();
    showToast(`⚔️ Quest Accepted: ${newQuest.name}`);
    playSfx('complete');
  }

  function addAllAIQuests() {
    const cards = document.querySelectorAll("#ai-quest-list .ai-generated-card");
    let count = 0;
    cards.forEach(card => {
      if (card.dataset.quest && card.style.opacity !== '0.5') {
        const q = JSON.parse(card.dataset.quest);
        addSingleQuestToBoard(q);
        count++;
      }
    });

    document.getElementById("modal-ai-quest").classList.add("hidden");
    document.getElementById("ai-results").classList.add("hidden");
    if (count > 0) {
      showToast(`🤖 ${count} AI missions added to Quest Board!`);
    }
  }

  // ==========================================
  // 7. AI QUEST BREAKDOWN
  // ==========================================
  async function triggerQuestBreakdown(questId) {
    const quest = state.quests.find(q => q.id === questId);
    if (!quest) return;

    const modal = document.getElementById('modal-ai-breakdown');
    document.getElementById('breakdown-target-title').textContent = `🎯 ${quest.name}`;
    document.getElementById('breakdown-target-desc').textContent = quest.desc || 'No description provided.';
    const loading = document.getElementById('breakdown-loading');
    const stepsList = document.getElementById('breakdown-steps-list');
    const addBtn = document.getElementById('btn-breakdown-add-subquests');

    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    stepsList.innerHTML = '';
    addBtn.classList.add('hidden');

    const prompt = `You are EVO AI Quest Architect.
The player is facing this quest:
Title: "${quest.name}"
Description: "${quest.desc}"
Category: "${quest.category}"

Break this quest into exactly 3 tactical, bite-sized micro-steps (15-20 minutes each) that make starting easy and eliminate procrastination.

Return JSON in this format:
{
  "subquests": [
    {
      "name": "Phase 1: short title",
      "desc": "Concrete first action step",
      "xp": 25
    },
    {
      "name": "Phase 2: short title",
      "desc": "Execution step",
      "xp": 25
    },
    {
      "name": "Phase 3: short title",
      "desc": "Wrap up and validation step",
      "xp": 25
    }
  ]
}`;

    try {
      let data;
      try {
        data = await callGemini(prompt);
      } catch (err) {
        console.warn("Breakdown API error, using default breakdown:", err);
        data = {
          subquests: [
            { name: `Phase 1: Setup & Prep for ${quest.name.slice(0, 20)}`, desc: "Gather tools, clear distractions, and outline your immediate objective.", xp: 25 },
            { name: `Phase 2: Core Execution Sprint`, desc: "Focus for 20 minutes with zero tab switching to complete the main bulk.", xp: 25 },
            { name: `Phase 3: Verification & Victory Lap`, desc: "Review your output, confirm accuracy, and mark the milestone complete.", xp: 25 }
          ]
        };
      }

      currentBreakdownSteps = data.subquests || [];
      stepsList.innerHTML = '';
      currentBreakdownSteps.forEach((step, i) => {
        const item = document.createElement('div');
        item.className = 'breakdown-step-item';
        item.innerHTML = `
          <div class="breakdown-step-num">STEP ${i + 1} • +${step.xp} XP</div>
          <div class="breakdown-step-title">${step.name}</div>
          <div class="breakdown-step-desc">${step.desc}</div>
        `;
        stepsList.appendChild(item);
      });

      addBtn.classList.remove('hidden');
      playSfx('ai');
    } catch (e) {
      stepsList.innerHTML = '<p style="color:var(--danger)">Failed to generate breakdown. Please try again.</p>';
    } finally {
      loading.classList.add('hidden');
    }
  }

  function addBreakdownSubQuests() {
    if (!currentBreakdownSteps || currentBreakdownSteps.length === 0) return;

    currentBreakdownSteps.forEach(step => {
      const newSub = {
        id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: step.name,
        desc: step.desc,
        category: 'study',
        type: 'daily',
        difficulty: 1,
        xp: step.xp || 25,
        rarity: 'common',
        deadline: '',
        createdAt: Date.now(),
        status: 'active'
      };
      state.quests.unshift(newSub);
    });

    saveState();
    renderQuests();
    updateDashboardStats();
    document.getElementById('modal-ai-breakdown').classList.add('hidden');
    showToast(`⚡ Added 3 micro-quests to your Quest Board!`);
    playSfx('complete');
  }

  // ==========================================
  // 8. QUEST SYSTEM & DASHBOARD
  // ==========================================
  function getActiveDifficulty() {
    return document.querySelectorAll('.skull-btn.active').length || 1;
  }

  function updatePreview() {
    const nameEl = document.getElementById('quest-name');
    const descEl = document.getElementById('quest-desc');
    const catEl = document.getElementById('quest-category');
    const typeEl = document.getElementById('quest-type');

    if (!nameEl) return;

    const name = nameEl.value || 'Quest Name';
    const desc = descEl.value || 'Description...';
    const cat = catEl.value;
    const type = typeEl.value;
    const diff = getActiveDifficulty();
    const xp = diff * 25;

    const prevTitle = document.getElementById('preview-title');
    const prevDesc = document.getElementById('preview-desc');
    const prevCat = document.getElementById('preview-category');
    const prevType = document.getElementById('preview-type');
    const prevDiff = document.getElementById('preview-difficulty');
    const prevXp = document.getElementById('preview-xp');
    const prevRarity = document.getElementById('preview-rarity');

    if (prevTitle) prevTitle.textContent = name;
    if (prevDesc) prevDesc.textContent = desc;
    if (prevCat) prevCat.textContent = CATEGORY_ICONS[cat] || '⚔️';
    if (prevType) prevType.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    if (prevDiff) prevDiff.textContent = '💀'.repeat(diff);
    if (prevXp) prevXp.textContent = `+${xp} XP`;
    if (prevRarity) prevRarity.className = `qc-rarity-bar rarity-${getRarity(xp)}`;
  }

  function createQuest() {
    const name = document.getElementById('quest-name').value.trim();
    if (!name) return;

    const diff = getActiveDifficulty();
    const xp = diff * 25;

    const quest = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: name,
      desc: document.getElementById('quest-desc').value.trim(),
      category: document.getElementById('quest-category').value,
      type: document.getElementById('quest-type').value,
      difficulty: diff,
      xp: xp,
      rarity: getRarity(xp),
      deadline: document.getElementById('quest-deadline').value || '',
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
    document.getElementById('diff-label').textContent = 'Easy';
    document.getElementById('diff-xp').textContent = '+25 XP';
    updatePreview();
    document.getElementById('modal-quest-create').classList.add('hidden');

    renderQuests();
    updateDashboardStats();
    showToast(`⚔️ Quest Forged: ${quest.name}`);
    playSfx('complete');
  }

  function completeQuest(id) {
    const idx = state.quests.findIndex(q => q.id === id);
    if (idx === -1) return;

    const quest = state.quests.splice(idx, 1)[0];
    quest.status = 'completed';
    quest.completedAt = Date.now();
    state.completedQuests.push(quest);

    const diff = Number(quest.difficulty) || 1;
    const earnedXP = Number(quest.xp) || (diff * 25);
    const earnedGold = diff * 10;

    state.xp += earnedXP;
    state.gold += earnedGold;

    updateStreak();

    // Check night owl achievement
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) {
      state.nightOwl = true;
    }

    // Check speedrunner
    if (quest.createdAt && (Date.now() - quest.createdAt < 3600000)) {
      state.speedrunner = true;
    }

    // Damage boss if boss arena is active
    if (state.streak.current >= 7 && state.bossState.hp > 0) {
      state.bossState.hp -= 1;
      playSfx('hit');
      if (activeScreen === 'screen-boss') renderBoss();
    } else {
      playSfx('complete');
    }

    saveState();

    const qcOverlay = document.getElementById('quest-complete-overlay');
    document.getElementById('qc-reward-text').textContent = `+${earnedXP} XP | +${earnedGold} Gold`;
    qcOverlay.classList.remove('hidden');
    setTimeout(() => qcOverlay.classList.add('hidden'), 1600);

    checkLevelUp();
    checkAchievements();
    updateHUD();
    renderQuests();
    updateDashboardStats();
  }

  function deleteQuest(id) {
    state.quests = state.quests.filter(q => q.id !== id);
    saveState();
    renderQuests();
    updateDashboardStats();
    showToast("Quest removed.");
  }

  function renderQuests() {
    const grid = document.getElementById('quest-grid');
    if (!grid) return;
    grid.innerHTML = '';

    let filtered = state.quests;
    if (questFilter !== 'all') {
      filtered = state.quests.filter(q => (q.type || 'daily') === questFilter);
    }

    const emptyState = document.getElementById('empty-state');
    if (filtered.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      filtered.forEach(q => {
        const card = document.createElement('div');
        const rarity = q.rarity || getRarity(q.xp || 25);
        const diff = Math.max(1, Math.min(5, Number(q.difficulty) || 1));
        const cat = (q.category && CATEGORY_ICONS[q.category]) ? q.category : 'study';
        const icon = CATEGORY_ICONS[cat] || '⚔️';
        const typeName = (q.type || 'daily').charAt(0).toUpperCase() + (q.type || 'daily').slice(1);

        card.className = `quest-card rarity-${rarity}`;
        card.innerHTML = `
          <div class="qc-rarity-bar rarity-${rarity}"></div>
          <div class="qc-header">
            <span class="qc-category">${icon}</span>
            <span class="qc-type-badge">${typeName}</span>
            <button class="qc-delete" data-id="${q.id}" title="Remove Quest">✕</button>
          </div>
          <h3 class="qc-title">${q.name}</h3>
          <p class="qc-desc">${q.desc || ''}</p>
          <div class="qc-footer">
            <span class="qc-difficulty">${'💀'.repeat(diff)}</span>
            <span class="qc-xp">+${q.xp || (diff * 25)} XP</span>
          </div>
          <div class="qc-ai-actions">
            <button class="btn-breakdown-action" data-id="${q.id}" title="AI Break down this quest">
              🤖 AI Breakdown
            </button>
          </div>
          <button class="btn-primary btn-complete" data-id="${q.id}" style="margin-top:12px;width:100%;">
            ⚔️ COMPLETE MISSION
          </button>
        `;
        grid.appendChild(card);
      });

      grid.querySelectorAll('.btn-complete').forEach(btn => {
        btn.addEventListener('click', (e) => completeQuest(e.currentTarget.dataset.id));
      });
      grid.querySelectorAll('.qc-delete').forEach(btn => {
        btn.addEventListener('click', (e) => deleteQuest(e.currentTarget.dataset.id));
      });
      grid.querySelectorAll('.btn-breakdown-action').forEach(btn => {
        btn.addEventListener('click', (e) => triggerQuestBreakdown(e.currentTarget.dataset.id));
      });
    }
  }

  function updateDashboardStats() {
    const statActive = document.getElementById('stat-active');
    const statCompleted = document.getElementById('stat-completed-today');
    const statXP = document.getElementById('stat-xp-today');

    if (statActive) statActive.textContent = state.quests.length;
    const today = getTodayStr();
    const todayCompleted = state.completedQuests.filter(q =>
      new Date(q.completedAt).toISOString().split('T')[0] === today
    );
    if (statCompleted) statCompleted.textContent = todayCompleted.length;
    if (statXP) statXP.textContent = todayCompleted.reduce((sum, q) => sum + (Number(q.xp) || 0), 0);
  }

  // ==========================================
  // 9. STREAK SYSTEM
  // ==========================================
  function updateStreak() {
    const today = getTodayStr();
    if (!state.dailyLog[today]) {
      state.dailyLog[today] = 0;
    }
    state.dailyLog[today]++;

    if (state.streak.lastActiveDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];

      if (state.streak.lastActiveDate === yStr) {
        state.streak.current++;
      } else if (state.streak.lastActiveDate !== today) {
        state.streak.current = 1;
      }

      state.streak.lastActiveDate = today;
      if (state.streak.current > state.streak.longest) {
        state.streak.longest = state.streak.current;
      }
    }
  }

  // ==========================================
  // 10. HUD, XP & LEVELING
  // ==========================================
  function updateHUD() {
    const elUser = document.getElementById('hud-username');
    const elClass = document.getElementById('hud-class');
    const elAvatar = document.getElementById('hud-avatar');
    const elBadge = document.getElementById('hud-level-badge');
    const elStreak = document.getElementById('streak-count');
    const elGold = document.getElementById('gold-count');

    if (elUser) elUser.textContent = state.user.name || 'Hero';
    if (elClass) elClass.textContent = (state.user.class || 'warrior').charAt(0).toUpperCase() + (state.user.class || 'warrior').slice(1);
    if (elAvatar) elAvatar.textContent = state.user.avatar || '⚔️';
    if (elBadge) elBadge.textContent = `LV ${state.level}`;
    if (elStreak) elStreak.textContent = state.streak.current;
    if (elGold) elGold.textContent = state.gold.toLocaleString();

    const reqXP = requiredXP(state.level);
    const prevXP = state.level === 1 ? 0 : requiredXP(state.level - 1);
    const progressXP = Math.max(0, state.xp - prevXP);
    const levelXP = Math.max(1, reqXP - prevXP);
    const pct = Math.max(0, Math.min(100, (progressXP / levelXP) * 100));

    const fill = document.getElementById('xp-bar-fill');
    const glow = document.getElementById('xp-bar-glow');
    const text = document.getElementById('xp-text');

    if (fill) fill.style.width = `${pct}%`;
    if (glow) glow.style.width = `${pct}%`;
    if (text) text.textContent = `${state.xp} / ${reqXP} XP`;
  }

  function checkLevelUp() {
    let leveledUp = false;
    while (state.xp >= requiredXP(state.level)) {
      state.level++;
      leveledUp = true;
    }
    if (leveledUp) {
      saveState();
      playSfx('levelup');
      const overlay = document.getElementById('level-up-overlay');
      const num = document.getElementById('level-up-number');
      if (num) num.textContent = state.level;
      if (overlay) {
        overlay.classList.remove('hidden');
        setTimeout(() => overlay.classList.add('hidden'), 2800);
      }
      updateHUD();
      showToast(`⚡ LEVEL UP! You reached Level ${state.level}!`);
    }
  }

  // ==========================================
  // 11. ACHIEVEMENTS
  // ==========================================
  function checkAchievements() {
    ACHIEVEMENTS.forEach(ach => {
      if (!state.achievements.includes(ach.id)) {
        if (ach.check(state)) {
          state.achievements.push(ach.id);
          showToast(`🏆 Achievement Unlocked: ${ach.name}`);
          playSfx('levelup');
        }
      }
    });
    saveState();
  }

  // ==========================================
  // 12. HERO PROFILE SCREEN
  // ==========================================
  function renderProfile() {
    const pAvatar = document.getElementById('profile-avatar');
    const pName = document.getElementById('profile-name');
    const pClass = document.getElementById('profile-class');
    const pLvl = document.getElementById('profile-level');

    if (pAvatar) pAvatar.textContent = state.user.avatar || '⚔️';
    if (pName) pName.textContent = state.user.name || 'Hero';
    if (pClass) pClass.textContent = (state.user.class || 'warrior').toUpperCase();
    if (pLvl) pLvl.textContent = state.level;

    const reqXP = requiredXP(state.level);
    const prevXP = state.level === 1 ? 0 : requiredXP(state.level - 1);
    const pct = Math.max(0, Math.min(1, (state.xp - prevXP) / Math.max(1, reqXP - prevXP)));
    const dashOffset = 339.292 - (339.292 * pct);
    const ringFill = document.getElementById('profile-ring-fill');
    if (ringFill) ringFill.style.strokeDashoffset = dashOffset;

    const setStat = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setStat('pstat-xp', state.xp.toLocaleString());
    setStat('pstat-quests', state.completedQuests.length);
    setStat('pstat-streak', state.streak.current);
    setStat('pstat-longest', state.streak.longest);
    setStat('pstat-badges', state.achievements.length);
    setStat('pstat-level', state.level);

    // Heatmap
    const heatmap = document.getElementById('streak-heatmap');
    if (heatmap) {
      heatmap.innerHTML = '';
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const val = state.dailyLog[ds] || 0;
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
    }

    // Equipped Badges
    const eq = document.getElementById('equipped-badges');
    if (eq) {
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
  }

  function renderAchievements() {
    const grid = document.getElementById('badge-grid');
    if (!grid) return;
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
  // 13. LEADERBOARD SCREEN
  // ==========================================
  async function renderLeaderboard() {
    const podium = document.getElementById('leaderboard-podium');
    const body = document.getElementById('lb-body');
    if (!body || !podium) return;

    body.innerHTML = '<div class="lb-row" style="justify-content:center;color:var(--text-muted);">Loading rankings...</div>';
    podium.innerHTML = '';

    const players = await fetchLeaderboardData();

    if (players.length === 0) {
      body.innerHTML = '<div class="lb-row" style="justify-content:center;color:var(--text-muted);">No players yet. Be the first!</div>';
      return;
    }

    // Podium (Top 3)
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

    // Table
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
  // 14. BOSS BATTLE ARENA
  // ==========================================
  function renderBoss() {
    const isUnlocked = state.streak.current >= 7;
    const locked = document.getElementById('boss-locked');
    const visual = document.getElementById('boss-visual');
    const qList = document.getElementById('boss-quest-list');

    if (!locked || !visual || !qList) return;

    if (!isUnlocked) {
      locked.classList.remove('hidden');
      visual.style.display = 'none';
      qList.style.display = 'none';
      const streakProgress = document.getElementById('boss-streak-progress');
      if (streakProgress) {
        streakProgress.textContent = `Current Streak: ${state.streak.current} / 7 Days`;
      }
      return;
    }

    locked.classList.add('hidden');
    visual.style.display = 'flex';
    qList.style.display = 'flex';

    const bossIndex = (state.bossState.activeBossIndex || 0) % BOSSES.length;
    const boss = BOSSES[bossIndex];
    document.getElementById('boss-name').textContent = `💀 ${boss.name}`;
    document.getElementById('boss-sprite').textContent = boss.sprite;

    const hp = Math.max(0, state.bossState.hp !== undefined ? state.bossState.hp : boss.maxHp);
    const fill = document.getElementById('boss-hp-fill');
    const hpText = document.getElementById('boss-hp-text');

    if (fill) fill.style.width = `${(hp / boss.maxHp) * 100}%`;
    if (hpText) hpText.textContent = `HP: ${hp} / ${boss.maxHp}`;

    const victory = document.getElementById('boss-victory');
    if (hp <= 0) {
      if (victory) victory.classList.remove('hidden');
      qList.innerHTML = '';
    } else {
      if (victory) victory.classList.add('hidden');
      qList.innerHTML = '';
      if (state.quests.length === 0) {
        qList.innerHTML = '<p style="color:#aaa;text-align:center;">No active quests to attack with! Forge quests to strike the boss.</p>';
      } else {
        state.quests.forEach(q => {
          const btn = document.createElement('button');
          btn.className = 'btn-primary';
          btn.style.width = '100%';
          btn.style.marginBottom = '10px';
          btn.textContent = `⚔️ Strike with: ${q.name} (+${q.xp} XP)`;
          btn.onclick = () => {
            const sprite = document.getElementById('boss-sprite');
            if (sprite) {
              sprite.classList.add('taking-damage');
              setTimeout(() => sprite.classList.remove('taking-damage'), 500);
            }
            completeQuest(q.id);
          };
          qList.appendChild(btn);
        });
      }
    }
  }

  // ==========================================
  // 15. PARTICLE BACKGROUND CANVAS
  // ==========================================
  function setupCanvas() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 70; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 1,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(Math.random() * 0.4 + 0.2)
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00f0ff';

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
  // 16. EVENT LISTENERS SETUP
  // ==========================================
  function setupEventListeners() {
    // ---- QUICK GUEST PLAY (HACKATHON INSTANT DEMO) ----
    const guestBtn = document.getElementById('btn-guest-play');
    if (guestBtn) guestBtn.addEventListener('click', startGuestSession);

    // ---- FIREBASE AUTH ----
    const btnGoogle = document.getElementById('btn-google');
    if (btnGoogle) btnGoogle.addEventListener('click', signInWithGoogle);

    const btnMs = document.getElementById('btn-microsoft');
    if (btnMs) btnMs.addEventListener('click', signInWithMicrosoft);

    const emailForm = document.getElementById('email-auth-form');
    if (emailForm) {
      emailForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        signInWithEmail(email, pass);
      });
    }

    const btnSignup = document.getElementById('btn-email-signup');
    if (btnSignup) {
      btnSignup.addEventListener('click', () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if (!email || pass.length < 6) {
          showAuthError('Please enter email and password (min 6 chars).');
          return;
        }
        signUpWithEmail(email, pass);
      });
    }

    // ---- HERO SETUP (Landing) ----
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

    const btnEnter = document.getElementById('btn-enter');
    if (btnEnter) {
      btnEnter.addEventListener('click', () => {
        const name = document.getElementById('input-username').value.trim();
        if (!name) {
          document.getElementById('login-error').textContent = 'Please enter a hero name.';
          return;
        }
        state.user.name = name;
        const selectedAvatar = document.querySelector('.avatar-option.selected');
        const selectedClass = document.querySelector('.class-option.selected');
        state.user.avatar = selectedAvatar ? selectedAvatar.dataset.avatar : '⚔️';
        state.user.class = selectedClass ? selectedClass.dataset.class : 'warrior';
        saveState();

        document.getElementById('screen-landing').classList.remove('active');
        document.getElementById('game-hud').classList.remove('hidden');
        updateHUD();
        navigateTo('screen-dashboard');
        showToast(`⚡ Welcome to the Arena, ${name}!`);
        playSfx('levelup');
      });
    }

    // ---- HUD CLICKS ----
    const hudProfile = document.getElementById('hud-profile-link');
    if (hudProfile) {
      hudProfile.addEventListener('click', () => navigateTo('screen-profile'));
    }

    // ---- SIDE NAVIGATION ----
    const menuToggle = document.getElementById('hud-menu-toggle');
    if (menuToggle) menuToggle.addEventListener('click', openNav);

    const navClose = document.getElementById('nav-close');
    if (navClose) navClose.addEventListener('click', closeNav);

    const navOverlay = document.getElementById('nav-overlay');
    if (navOverlay) navOverlay.addEventListener('click', closeNav);

    document.querySelectorAll('.nav-item[data-screen]').forEach(item => {
      item.addEventListener('click', (e) => navigateTo(e.currentTarget.dataset.screen));
    });

    const menuAi = document.getElementById('btn-menu-ai');
    if (menuAi) {
      menuAi.addEventListener('click', () => {
        closeNav();
        document.getElementById('modal-ai-quest').classList.remove('hidden');
      });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY);
        signOut();
      });
    }

    // ---- DASHBOARD TABS ----
    document.querySelectorAll('.quest-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.quest-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        questFilter = e.currentTarget.dataset.tab;
        renderQuests();
      });
    });

    // ---- MANUAL QUEST FORGE ----
    const modalQuest = document.getElementById('modal-quest-create');
    const fabManual = document.getElementById('fab-add-quest');
    if (fabManual) {
      fabManual.addEventListener('click', () => {
        modalQuest.classList.remove('hidden');
        updatePreview();
      });
    }

    const btnEmptyAdd = document.getElementById('btn-empty-add');
    if (btnEmptyAdd) {
      btnEmptyAdd.addEventListener('click', () => {
        modalQuest.classList.remove('hidden');
        updatePreview();
      });
    }

    const closeQuest = document.getElementById('modal-close-quest');
    if (closeQuest) {
      closeQuest.addEventListener('click', () => modalQuest.classList.add('hidden'));
    }

    // Difficulty Skulls
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

    // Form Live Preview
    const qName = document.getElementById('quest-name');
    const qDesc = document.getElementById('quest-desc');
    const qCat = document.getElementById('quest-category');
    const qType = document.getElementById('quest-type');

    if (qName) qName.addEventListener('input', updatePreview);
    if (qDesc) qDesc.addEventListener('input', updatePreview);
    if (qCat) qCat.addEventListener('change', updatePreview);
    if (qType) qType.addEventListener('change', updatePreview);

    const questForm = document.getElementById('quest-form');
    if (questForm) {
      questForm.addEventListener('submit', (e) => {
        e.preventDefault();
        createQuest();
      });
    }

    // ---- AI MISSION FORGE MODAL & ACTIONS ----
    const modalAi = document.getElementById('modal-ai-quest');
    const openAiModal = () => {
      if (modalAi) modalAi.classList.remove('hidden');
    };

    const fabAi = document.getElementById('fab-ai-quest');
    if (fabAi) fabAi.addEventListener('click', openAiModal);

    const bannerAi = document.getElementById('btn-banner-ai');
    if (bannerAi) bannerAi.addEventListener('click', openAiModal);

    const emptyAi = document.getElementById('btn-empty-ai');
    if (emptyAi) emptyAi.addEventListener('click', openAiModal);

    const closeAi = document.getElementById('modal-close-ai');
    if (closeAi) {
      closeAi.addEventListener('click', () => {
        if (modalAi) modalAi.classList.add('hidden');
      });
    }

    // Suggestion tags
    document.querySelectorAll('.ai-tag').forEach(tag => {
      tag.addEventListener('click', (e) => {
        const goalInput = document.getElementById('ai-goal');
        if (goalInput) goalInput.value = e.currentTarget.dataset.tag;
      });
    });

    const btnAiGen = document.getElementById('btn-ai-generate');
    if (btnAiGen) btnAiGen.addEventListener('click', generateAIQuests);

    const btnAiAddAll = document.getElementById('btn-ai-add-all');
    if (btnAiAddAll) btnAiAddAll.addEventListener('click', addAllAIQuests);

    // ---- AI BREAKDOWN MODAL ----
    const modalBreakdown = document.getElementById('modal-ai-breakdown');
    const closeBreakdown = document.getElementById('modal-close-breakdown');
    if (closeBreakdown) {
      closeBreakdown.addEventListener('click', () => modalBreakdown.classList.add('hidden'));
    }

    const btnBreakdownAdd = document.getElementById('btn-breakdown-add-subquests');
    if (btnBreakdownAdd) {
      btnBreakdownAdd.addEventListener('click', addBreakdownSubQuests);
    }

    // ---- LEADERBOARD TABS ----
    document.querySelectorAll('.lb-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        lbFilter = e.currentTarget.dataset.lb;
        renderLeaderboard();
      });
    });

    // ---- BOSS BATTLE CLAIM ----
    const bossClaim = document.getElementById('btn-boss-claim');
    if (bossClaim) {
      bossClaim.addEventListener('click', () => {
        document.getElementById('boss-victory').classList.add('hidden');
        state.xp += 500;
        state.gold += 100;
        state.bossesDefeated = (state.bossesDefeated || 0) + 1;
        state.bossState.activeBossIndex = (state.bossState.activeBossIndex + 1) % BOSSES.length;
        state.bossState.hp = BOSSES[state.bossState.activeBossIndex].maxHp;
        saveState();
        checkLevelUp();
        updateHUD();
        renderBoss();
        showToast('🏆 Boss Defeated! +500 XP & +100 Gold claimed!');
        playSfx('levelup');
      });
    }
  }

  // ==========================================
  // 17. APP INITIALIZATION
  // ==========================================
  function init() {
    loadState();
    setupCanvas();
    setupEventListeners();

    if (auth) {
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
          // If already has local profile in localStorage and user hasn't explicitly logged out
          if (state.user && state.user.name) {
            document.getElementById('screen-auth').classList.remove('active');
            document.getElementById('game-hud').classList.remove('hidden');
            updateHUD();
            navigateTo('screen-dashboard');
          } else {
            currentUser = null;
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('game-hud').classList.add('hidden');
            document.getElementById('screen-auth').classList.add('active');
          }
        }
      });
    } else {
      // Offline / Firebase unavailable
      if (state.user && state.user.name) {
        document.getElementById('screen-auth').classList.remove('active');
        document.getElementById('game-hud').classList.remove('hidden');
        updateHUD();
        navigateTo('screen-dashboard');
      } else {
        document.getElementById('screen-auth').classList.add('active');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
