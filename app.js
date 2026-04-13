// ─── STATE ──────────────────────────────────────────────────────────────────
let masterQuestions = [];
let questions = [];
let incorrectQuestions = [];
let currentReviewIndex = 0;
let rawQuestionsLength = 0;
let currentIndex = 0;
let userStats = {
  totalAnswered: 0,
  totalCorrect: 0,
  domainStats: {}
};

let globalStats = {
  totalAnswered: 0,
  totalCorrect: 0,
  missedQuestions: [],
  domainStats: {},
  questionHistory: {},   // P3: per-question spaced repetition data
  timePerQuestion: [],   // P2: array of {questionId, seconds}
  sessionHistory: [],    // P6: array of {date, score, mode, count}
  confidenceData: { low: {total:0,correct:0}, medium: {total:0,correct:0}, high: {total:0,correct:0} },
  masteryState: {}       // Keyed by question.question, value 1-5 (Box level)
};

// P2: Timer state
let timerEnabled = false;
let timerInterval = null;
let timerSeconds = 0;
let questionStartTime = null;

// P4: Study mode state
let studyQuestions = [];
let studyIndex = 0;

// Exam simulation mode state
let examSimMode = false;

// Confidence calibration state
let currentConfidence = null;

// Difficulty filter state
let selectedDifficulty = 'all';

// ─── DOM ELEMENTS ───────────────────────────────────────────────────────────
const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const studyScreen = document.getElementById('study-screen');

const modeSmartDrillBtn = document.getElementById('mode-smart-drill');
const modeMasteryBtn = document.getElementById('mode-mastery');
const modeFullBtn = document.getElementById('mode-full');
const modeStudyBtn = document.getElementById('mode-study');
const nextBtn = document.getElementById('next-btn');
const restartBtn = document.getElementById('restart-btn');
const viewDashboardBtn = document.getElementById('view-dashboard-btn');

const questionTracker = document.getElementById('question-tracker');
const progressBar = document.getElementById('progress-bar');
const domainBadge = document.getElementById('domain-badge');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');

const reviewBtn = document.getElementById('review-btn');
const reviewCarouselContainer = document.getElementById('review-carousel-container');
const nextReviewBtn = document.getElementById('next-review-btn');

const flaggedScreen = document.getElementById('flagged-screen');
const flaggedGrid = document.getElementById('flagged-grid');
const submitExamBtn = document.getElementById('submit-exam-btn');
const flagBtn = document.getElementById('flag-btn');
const examReviewScreen = document.getElementById('exam-review-screen');

const feedbackPanel = document.getElementById('feedback-panel');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackExplanation = document.getElementById('feedback-explanation');
const keyConceptText = document.getElementById('key-concept-text');
const sourceText = document.getElementById('source-text');

const finalScore = document.getElementById('final-score');
const domainStatsContainer = document.getElementById('domain-stats-container');

// P2: Timer elements
const timerToggle = document.getElementById('timer-toggle');
const timerDisplay = document.getElementById('timer-display');

// ─── P1: READINESS CALCULATION ──────────────────────────────────────────────
function calculateReadiness() {
  const domains = Object.entries(globalStats.domainStats);
  if (domains.length === 0 || globalStats.totalAnswered < 10) {
    return { score: 0, status: 'insufficient', message: 'Answer at least 10 questions to see your readiness.', domainFlags: [] };
  }

  let domainScores = [];
  let domainFlags = [];
  const allDomains = [
    'Identify Business Needs and Solutions',
    'Identify Data Needs',
    'Manage AI Model Development and Evaluation',
    'Operationalize AI Solutions',
    'Support Responsible and Trustworthy AI Efforts'
  ];

  allDomains.forEach(domain => {
    const stats = globalStats.domainStats[domain];
    if (!stats || stats.total < 3) {
      domainFlags.push({ domain, score: 0, flag: 'needs-data', message: 'Not enough data' });
      domainScores.push(0);
    } else {
      const pct = Math.round((stats.correct / stats.total) * 100);
      domainScores.push(pct);
      if (pct < 60) {
        domainFlags.push({ domain, score: pct, flag: 'critical', message: `${pct}% — Needs significant work` });
      } else if (pct < 75) {
        domainFlags.push({ domain, score: pct, flag: 'warning', message: `${pct}% — Almost there` });
      } else {
        domainFlags.push({ domain, score: pct, flag: 'strong', message: `${pct}% — Strong` });
      }
    }
  });

  // Coverage: what % of the question bank have you seen?
  const coverage = Math.min(100, Math.round((globalStats.totalAnswered / Math.max(rawQuestionsLength, 1)) * 100));

  // Weighted score: 60% accuracy, 25% per-domain minimum, 15% coverage
  const overallAccuracy = Math.round((globalStats.totalCorrect / globalStats.totalAnswered) * 100);
  const minDomainScore = domainScores.filter(s => s > 0).length > 0 ? Math.min(...domainScores.filter(s => s > 0)) : 0;
  const domainsWithData = domainFlags.filter(d => d.flag !== 'needs-data').length;

  let readinessScore = Math.round(
    (overallAccuracy * 0.6) +
    (minDomainScore * 0.25) +
    (coverage * 0.15)
  );

  // Penalize if not all domains have data
  if (domainsWithData < 5) {
    readinessScore = Math.min(readinessScore, 60);
  }

  readinessScore = Math.max(0, Math.min(100, readinessScore));

  let status, message;
  if (readinessScore >= 80 && minDomainScore >= 70 && domainsWithData === 5) {
    status = 'ready';
    message = 'You\'re ready to take the CPMAI exam!';
  } else if (readinessScore >= 65) {
    status = 'almost';
    message = 'Almost there — shore up weak domains.';
  } else {
    status = 'studying';
    message = 'Keep studying — focus on flagged domains.';
  }

  return { score: readinessScore, status, message, domainFlags, overallAccuracy, coverage };
}

function renderReadinessRing() {
  const readinessRingContainer = document.getElementById('readiness-ring');
  if (!readinessRingContainer) return;

  const readiness = calculateReadiness();
  const circumference = 2 * Math.PI * 54; // radius = 54
  const offset = circumference - (readiness.score / 100) * circumference;

  let strokeColor, statusIcon, statusClass;
  if (readiness.status === 'ready') {
    strokeColor = 'var(--correct-color)';
    statusIcon = '✅';
    statusClass = 'ready';
  } else if (readiness.status === 'almost') {
    strokeColor = '#fbbf24';
    statusIcon = '📖';
    statusClass = 'almost';
  } else if (readiness.status === 'studying') {
    strokeColor = 'var(--wrong-color)';
    statusIcon = '📚';
    statusClass = 'studying';
  } else {
    strokeColor = 'var(--text-muted)';
    statusIcon = '❓';
    statusClass = 'insufficient';
  }

  readinessRingContainer.innerHTML = `
    <div class="readiness-widget ${statusClass}">
      <div class="readiness-ring-svg">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8"/>
          <circle cx="60" cy="60" r="54" fill="none" stroke="${strokeColor}" stroke-width="8"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 60 60)"
            style="transition: stroke-dashoffset 1s ease-out;"/>
        </svg>
        <div class="readiness-ring-label">
          <span class="readiness-score-number">${readiness.score}</span>
          <span class="readiness-score-pct">%</span>
        </div>
      </div>
      <div class="readiness-info">
        <span class="readiness-status-text">${statusIcon} ${readiness.message}</span>
        ${readiness.overallAccuracy !== undefined ? `<span class="readiness-detail">Accuracy: ${readiness.overallAccuracy}% · Coverage: ${readiness.coverage}%</span>` : ''}
      </div>
    </div>
  `;
}

function renderDashboardReadiness() {
  const container = document.getElementById('dashboard-readiness');
  if (!container) return;

  const readiness = calculateReadiness();
  if (readiness.status === 'insufficient') {
    container.innerHTML = `<div class="readiness-dashboard-banner insufficient"><span>❓ ${readiness.message}</span></div>`;
    return;
  }

  let bannerClass = readiness.status;
  let icon = readiness.status === 'ready' ? '✅' : readiness.status === 'almost' ? '⚠️' : '📚';

  let flagsHtml = readiness.domainFlags.map(d => {
    let flagIcon = d.flag === 'strong' ? '🟢' : d.flag === 'warning' ? '🟡' : d.flag === 'critical' ? '🔴' : '⚪';
    let shortName = d.domain.replace('Identify ', '').replace('Manage ', '').replace('Support ', '').replace(' Efforts', '');
    return `<div class="readiness-domain-flag ${d.flag}"><span>${flagIcon}</span><span class="flag-domain-name">${shortName}</span><span class="flag-score">${d.message}</span></div>`;
  }).join('');

  container.innerHTML = `
    <div class="readiness-dashboard-banner ${bannerClass}">
      <div class="readiness-banner-header">
        <span class="readiness-banner-score">${icon} Exam Readiness: ${readiness.score}%</span>
        <span class="readiness-banner-message">${readiness.message}</span>
      </div>
      <div class="readiness-domain-flags">${flagsHtml}</div>
    </div>
  `;
}

// ─── TOAST NOTIFICATIONS ────────────────────────────────────────────────────
function showToast(message, type = 'success', durationMs = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.innerText = message;
  toast.className = `toast toast-visible toast-${type}`;
  setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, durationMs);
}

// ─── P2: TIMER ──────────────────────────────────────────────────────────────
function startTimer(totalQuestions) {
  if (!timerEnabled) return;
  // ~65 seconds per question (matching real exam pace)
  timerSeconds = totalQuestions * 65;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      showToast('⏰ Time\'s up! Your exam has been auto-submitted.', 'warning', 5000);
      // Route to the correct results screen based on mode
      if (examSimMode) {
        showExamReview();
      } else {
        showDashboard(false);
      }
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  if (!timerDisplay) return;
  if (!timerEnabled) {
    timerDisplay.classList.add('hidden');
    return;
  }

  timerDisplay.classList.remove('hidden');
  const hours = Math.floor(timerSeconds / 3600);
  const minutes = Math.floor((timerSeconds % 3600) / 60);
  const seconds = timerSeconds % 60;

  let timeStr;
  if (hours > 0) {
    timeStr = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } else {
    timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  timerDisplay.innerText = `⏱ ${timeStr}`;

  // Warning states
  timerDisplay.classList.remove('timer-warning', 'timer-critical');
  if (timerSeconds <= 300) {
    timerDisplay.classList.add('timer-critical');
  } else if (timerSeconds <= 600) {
    timerDisplay.classList.add('timer-warning');
  }
}

function recordQuestionTime(questionId) {
  if (!questionStartTime) return;
  const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
  globalStats.timePerQuestion.push({ questionId, seconds: elapsed });
  saveGlobalStats();
}

function getAverageTimePerQuestion() {
  if (!globalStats.timePerQuestion || globalStats.timePerQuestion.length === 0) return null;
  const total = globalStats.timePerQuestion.reduce((acc, t) => acc + t.seconds, 0);
  return Math.round(total / globalStats.timePerQuestion.length);
}

// ─── P3: SPACED REPETITION ─────────────────────────────────────────────────
function getQuestionKey(q) {
  return `q_${q.id}`;
}

function updateSpacedData(q, isCorrect) {
  const key = getQuestionKey(q);
  const now = Date.now();

  if (!globalStats.questionHistory) globalStats.questionHistory = {};

  let entry = globalStats.questionHistory[key] || {
    easeFactor: 2.5,
    interval: 1,     // days
    repetitions: 0,
    lastSeen: now,
    nextReview: now,
    timesCorrect: 0,
    timesIncorrect: 0
  };

  entry.lastSeen = now;

  if (isCorrect) {
    entry.timesCorrect++;
    entry.repetitions++;
    if (entry.repetitions === 1) {
      entry.interval = 1;
    } else if (entry.repetitions === 2) {
      entry.interval = 3;
    } else {
      entry.interval = Math.round(entry.interval * entry.easeFactor);
    }
    entry.easeFactor = Math.max(1.3, entry.easeFactor + 0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02));
  } else {
    entry.timesIncorrect++;
    entry.repetitions = 0;
    entry.interval = 1;
    entry.easeFactor = Math.max(1.3, entry.easeFactor - 0.2);
  }

  entry.nextReview = now + entry.interval * 24 * 60 * 60 * 1000;
  globalStats.questionHistory[key] = entry;
  saveGlobalStats();
}

function getSpacedReviewQuestions() {
  const now = Date.now();
  if (!globalStats.questionHistory) return [];

  // Questions due for review (nextReview <= now) or never seen
  let dueQuestions = masterQuestions.filter(q => {
    const key = getQuestionKey(q);
    const entry = globalStats.questionHistory[key];
    if (!entry) return true; // never seen = due
    return entry.nextReview <= now;
  });

  // Sort: most overdue first
  dueQuestions.sort((a, b) => {
    const ea = globalStats.questionHistory[getQuestionKey(a)];
    const eb = globalStats.questionHistory[getQuestionKey(b)];
    const aNext = ea ? ea.nextReview : 0;
    const bNext = eb ? eb.nextReview : 0;
    return aNext - bNext;
  });

  return dueQuestions;
}

// ─── P4: STUDY MODE ─────────────────────────────────────────────────────────
function startStudyMode() {
  const filterDropdown = document.getElementById('domain-filter');
  const selectedDomain = filterDropdown ? filterDropdown.value : 'All';

  if (selectedDomain === 'All') {
    studyQuestions = [...masterQuestions];
  } else {
    studyQuestions = masterQuestions.filter(q => q.domain === selectedDomain);
  }

  studyQuestions = studyQuestions.sort(() => Math.random() - 0.5);
  studyIndex = 0;

  if (studyQuestions.length === 0) {
    alert('No questions found for this domain.');
    return;
  }

  showScreen(studyScreen);
  loadStudyCard();
}

function loadStudyCard() {
  const q = studyQuestions[studyIndex];

  document.getElementById('study-tracker').innerText = `Card ${studyIndex + 1} of ${studyQuestions.length}`;
  document.getElementById('study-domain-badge').innerText = q.domain;
  document.getElementById('study-question-text').innerText = q.question;

  // Show correct answer
  const cleanedAnswer = q.correct_answer.replace(/^[A-Z]\.\s+/, '');
  document.getElementById('study-answer-text').innerHTML = `<strong>Answer:</strong> ${cleanedAnswer}`;
  document.getElementById('study-explanation-text').innerHTML = `<strong>Why:</strong> ${q.correct_explanation}`;
  document.getElementById('study-key-concept').innerText = q.key_concept;
  document.getElementById('study-source').innerText = q.source || 'PMI CPMAI';

  // Show all options with the correct one highlighted
  const optionsHtml = q.options.map(opt => {
    const cleaned = opt.replace(/^[A-Z]\.\s+/, '');
    const isCorrect = cleaned === cleanedAnswer;
    return `<div class="study-option ${isCorrect ? 'study-option-correct' : ''}">${isCorrect ? '✅' : '○'} ${cleaned}</div>`;
  }).join('');
  document.getElementById('study-options-display').innerHTML = optionsHtml;

  // Mark as seen in spaced repetition data
  const key = getQuestionKey(q);
  if (!globalStats.questionHistory) globalStats.questionHistory = {};
  if (!globalStats.questionHistory[key]) {
    globalStats.questionHistory[key] = {
      easeFactor: 2.5, interval: 1, repetitions: 0,
      lastSeen: Date.now(), nextReview: Date.now(),
      timesCorrect: 0, timesIncorrect: 0
    };
  }
  globalStats.questionHistory[key].lastSeen = Date.now();
  saveGlobalStats();

  // Update nav button states
  document.getElementById('study-prev-btn').disabled = studyIndex === 0;
  document.getElementById('study-next-btn').innerText = studyIndex === studyQuestions.length - 1 ? 'Back to Menu' : 'Next Card →';
}

// ─── FETCH & INIT ───────────────────────────────────────────────────────────
async function loadQuestions() {
  try {
    let rawQuestions;

    // Try inline data first (works with file://), fall back to fetch (works with http server)
    if (typeof QUESTIONS_DATA !== 'undefined') {
      rawQuestions = QUESTIONS_DATA;
    } else {
      const response = await fetch('questions.json');
      rawQuestions = await response.json();
    }

    rawQuestionsLength = rawQuestions.length;

    // Update question count display
    const countEl = document.getElementById('question-count');
    if (countEl) countEl.innerText = rawQuestionsLength;

    // Clean up options (removes A. B. C. D. prefixes) so we can shuffle options randomly
    masterQuestions = rawQuestions.map(q => {
      const cleanPrefix = (str) => str.replace(/^[A-Z]\.\s+/, '');
      return {
        ...q,
        options: q.options.map(cleanPrefix),
        correct_answer: cleanPrefix(q.correct_answer),
        answered: false,
        selectedOption: null
      };
    });

    const savedState = localStorage.getItem('cpmai_quiz_state');
    let useSaved = false;

    if (savedState) {
      const state = JSON.parse(savedState);
      if (state.version === rawQuestionsLength) {
        questions = state.questions;
        currentIndex = state.currentIndex;
        userStats = state.userStats;

        const filterDropdown = document.getElementById('domain-filter');
        if (filterDropdown && state.selectedDomain) {
          filterDropdown.value = state.selectedDomain;
        }

        useSaved = true;
      }
    }

    const savedGlobal = localStorage.getItem('cpmai_global_stats');
    if (savedGlobal) {
      const parsed = JSON.parse(savedGlobal);
      globalStats = { ...globalStats, ...parsed };
      // Ensure new fields exist from older saves
      if (!globalStats.questionHistory) globalStats.questionHistory = {};
      if (!globalStats.timePerQuestion) globalStats.timePerQuestion = [];
    }

    // Render readiness ring on start screen
    renderReadinessRing();

    // Update mastery UI display
    updateMasteryUI();

    if (useSaved && userStats.totalAnswered > 0 && currentIndex < questions.length) {
      showScreen(quizScreen);
      loadQuestion();
    } else if (useSaved && currentIndex >= questions.length && questions.length > 0) {
      showDashboard(false);
    }

  } catch (error) {
    console.error("Error loading questions:", error);
    questionText.innerText = "Error loading questions. Ensure you are running via a local server (e.g. VS Code Live Server) to bypass CORS issues.";
  }
}

function updateMasteryUI() {
  if (!globalStats.masteryState) globalStats.masteryState = {};
  
  let boxCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  masterQuestions.forEach(q => {
    let box = globalStats.masteryState[q.question] || 1;
    if (box > 5) box = 5;
    boxCounts[box]++;
  });

  const total = masterQuestions.length;

  for (let b = 1; b <= 5; b++) {
    const el = document.getElementById(`box-${b}-count`);
    if (el) el.innerText = boxCounts[b];
    const bar = document.getElementById(`mastery-bar-${b}`);
    if (bar) bar.style.width = `${(boxCounts[b] / total) * 100}%`;
  }

  const masteredCount = document.getElementById('mastery-mastered-count');
  if (masteredCount) {
    masteredCount.innerText = `${boxCounts[5]}/${total} Mastered`;
  }
}

// ─── STATE MANAGEMENT ───────────────────────────────────────────────────────
function showScreen(screen) {
  startScreen.classList.remove('active');
  quizScreen.classList.remove('active');
  dashboardScreen.classList.remove('active');
  flaggedScreen.classList.remove('active');
  if (studyScreen) studyScreen.classList.remove('active');
  if (examReviewScreen) examReviewScreen.classList.remove('active');
  // Game screens
  const gameScreenIds = ['game-matcher-screen','game-rapid-screen','game-sequencer-screen','game-mines-screen'];
  gameScreenIds.forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('active'); });
  screen.classList.add('active');

  // Stop timer if leaving quiz
  if (screen !== quizScreen) {
    // Don't stop if going to flagged screen
    if (screen !== flaggedScreen) {
      stopTimer();
      if (timerDisplay) timerDisplay.classList.add('hidden');
    }
  }
}

function saveState() {
  const filterDropdown = document.getElementById('domain-filter');
  const selectedDomain = filterDropdown ? filterDropdown.value : 'All';

  localStorage.setItem('cpmai_quiz_state', JSON.stringify({
    selectedDomain,
    questions,
    currentIndex,
    userStats,
    version: rawQuestionsLength
  }));
}

function saveGlobalStats() {
  localStorage.setItem('cpmai_global_stats', JSON.stringify(globalStats));
  updateMasteryUI();
}

function getSmartQuestionPool(sourcePool, limit) {
  let boxes = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  sourcePool.forEach(q => {
    let box = globalStats.masteryState[q.question] || 1;
    boxes[box].push(q);
  });

  for (let b = 1; b <= 5; b++) {
    boxes[b] = boxes[b].sort(() => Math.random() - 0.5);
  }

  let selected = [];
  let quotas = [
    { box: 1, count: Math.ceil(limit * 0.4) },
    { box: 2, count: Math.ceil(limit * 0.3) },
    { box: 3, count: Math.ceil(limit * 0.2) },
    { box: 4, count: Math.ceil(limit * 0.1) }
  ];

  quotas.forEach(q => {
    let toAdd = boxes[q.box].splice(0, q.count);
    selected.push(...toAdd);
  });

  let remaining = limit - selected.length;
  for (let b = 1; b <= 5 && remaining > 0; b++) {
    let toAdd = boxes[b].splice(0, remaining);
    selected.push(...toAdd);
    remaining -= toAdd.length;
  }

  return selected.sort(() => Math.random() - 0.5);
}

function startQuiz(mode = 'full') {
  const filterDropdown = document.getElementById('domain-filter');
  const selectedDomain = filterDropdown ? filterDropdown.value : 'All';

  let pool = [];
  // Apply Domain Filter initially
  if (selectedDomain === 'All') {
    pool = [...masterQuestions];
  } else {
    pool = masterQuestions.filter(q => q.domain === selectedDomain);
  }

  // Apply Difficulty Filter
  if (selectedDifficulty !== 'all') {
    pool = pool.filter(q => q.difficulty === selectedDifficulty);
  }

  // Apply Adaptive Study Mode Filter
  if (mode === 'smartDrill') {
    pool = getSmartQuestionPool(pool, 10);
  } else if (mode === 'mastery') {
    // Mastery Mode: All unmastered questions (Boxes 1-4)
    pool = pool.filter(q => (globalStats.masteryState[q.question] || 1) < 5);
    if (pool.length === 0) {
      alert("You have mastered all available questions! 🎉");
      return;
    }
    // Cap at a reasonable continuous limit to prevent browser slowdowns
    pool = pool.sort(() => Math.random() - 0.5).slice(0, 100);
  }
  
  currentIndex = 0;
  questions = pool.sort(() => Math.random() - 0.5);

  // Re-build userStats from scratch based on current filtered questions
  userStats = {
    totalAnswered: 0,
    totalCorrect: 0,
    domainStats: {}
  };

  questions.forEach(q => {
    q.answered = false;
    q.selectedOption = null;
    delete q.shuffledOptions;

    if (!userStats.domainStats[q.domain]) {
      userStats.domainStats[q.domain] = { total: 0, correct: 0 };
    }
    userStats.domainStats[q.domain].total++;
  });

  // P2: Check timer (exam sim always has timer)
  timerEnabled = examSimMode ? true : (timerToggle ? timerToggle.checked : false);

  saveState();
  showScreen(quizScreen);

  // Add or remove exam-sim-mode class
  if (examSimMode) {
    quizScreen.classList.add('exam-sim-mode');
    // Add indicator badge to tracker
    const indicator = document.createElement('span');
    indicator.className = 'exam-sim-indicator';
    indicator.innerText = 'EXAM SIM';
    questionTracker.after(indicator);
  } else {
    quizScreen.classList.remove('exam-sim-mode');
    const existing = document.querySelector('.exam-sim-indicator');
    if (existing) existing.remove();
  }

  loadQuestion();

  // Start timer if enabled
  if (timerEnabled) {
    startTimer(questions.length);
  }
}

function loadQuestion() {
  const q = questions[currentIndex];

  // P2: Track question start time
  questionStartTime = Date.now();

  // Update UI Elements
  questionTracker.innerText = `Question ${currentIndex + 1} of ${questions.length}`;
  progressBar.style.width = `${((currentIndex) / questions.length) * 100}%`;

  domainBadge.innerText = q.domain;
  questionText.innerText = q.question;

  // Show difficulty badge
  const existingDiffBadge = document.querySelector('.difficulty-badge');
  if (existingDiffBadge) existingDiffBadge.remove();
  if (q.difficulty) {
    const badge = document.createElement('span');
    badge.className = `difficulty-badge diff-${q.difficulty}`;
    badge.innerText = q.difficulty;
    domainBadge.after(badge);
  }

  // Reset UI
  optionsContainer.innerHTML = '';
  feedbackPanel.classList.add('hidden');
  flagBtn.classList.remove('hidden');

  // Show/hide confidence buttons
  const confBtns = document.getElementById('confidence-buttons');
  if (confBtns) {
    confBtns.classList.remove('hidden');
    currentConfidence = null;
    confBtns.querySelectorAll('.conf-btn').forEach(b => b.classList.remove('conf-selected'));
  }

  // Create shuffled options randomly for this question if none exist
  if (!q.shuffledOptions) {
    q.shuffledOptions = [...q.options].sort(() => Math.random() - 0.5);
  }

  q.shuffledOptions.forEach(optionText => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerText = optionText;
    btn.onclick = () => {
      const correctBtn = Array.from(optionsContainer.children).find(b => b.innerText === q.correct_answer);
      handleAnswer(q, btn, correctBtn);
    };
    optionsContainer.appendChild(btn);
  });

  // Reshow state if already answered (e.g. from reload)
  if (q.answered) {
    flagBtn.classList.add('hidden');
    const selectedBtn = Array.from(optionsContainer.children).find(b => b.innerText === q.selectedOption);
    const correctBtn = Array.from(optionsContainer.children).find(b => b.innerText === q.correct_answer);
    showFeedback(q, selectedBtn, correctBtn);
  }
}

function handleAnswer(q, selectedBtn, correctBtn) {
  if (q.answered) return;
  flagBtn.classList.add('hidden');

  q.answered = true;
  q.selectedOption = selectedBtn.innerText;

  userStats.totalAnswered++;
  globalStats.totalAnswered++;

  if (!globalStats.domainStats[q.domain]) globalStats.domainStats[q.domain] = { total: 0, correct: 0 };
  globalStats.domainStats[q.domain].total++;

  const isCorrect = selectedBtn.innerText === q.correct_answer;

  // Track confidence calibration
  if (currentConfidence && globalStats.confidenceData) {
    if (!globalStats.confidenceData[currentConfidence]) globalStats.confidenceData[currentConfidence] = {total:0,correct:0};
    globalStats.confidenceData[currentConfidence].total++;
    if (isCorrect) globalStats.confidenceData[currentConfidence].correct++;
  }

  if (isCorrect) {
    userStats.totalCorrect++;
    userStats.domainStats[q.domain].correct++;

    globalStats.totalCorrect++;
    globalStats.domainStats[q.domain].correct++;
  }

  // Update Mastery Box State (Leitner System)
  if (!globalStats.masteryState) globalStats.masteryState = {};
  if (isCorrect) {
    let currentBox = globalStats.masteryState[q.question] || 1;
    if (currentBox < 5) {
      globalStats.masteryState[q.question] = currentBox + 1;
    }
  } else {
    // Dropped back to box 1 on incorrect
    globalStats.masteryState[q.question] = 1;
  }

  // P2: Record time spent on this question
  recordQuestionTime(q.id);

  // P3: Update spaced repetition data
  updateSpacedData(q, isCorrect);

  saveState();
  saveGlobalStats();

  // In exam sim mode, auto-advance without showing feedback
  if (examSimMode) {
    // Briefly highlight selection
    selectedBtn.style.border = '2px solid var(--accent-primary)';
    selectedBtn.style.opacity = '0.7';
    Array.from(optionsContainer.children).forEach(b => b.disabled = true);

    // Hide confidence buttons after answering
    const confBtns = document.getElementById('confidence-buttons');
    if (confBtns) confBtns.classList.add('hidden');
    flagBtn.classList.add('hidden');

    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        currentIndex++;
        saveState();
        loadQuestion();
      } else {
        showExamReview();
      }
    }, 400);
    return;
  }

  showFeedback(q, selectedBtn, correctBtn);
}

function showFeedback(q, selectedBtn, correctBtn) {
  const buttons = optionsContainer.querySelectorAll('.option-btn');
  buttons.forEach(btn => btn.disabled = true);

  const isCorrect = selectedBtn.innerText === q.correct_answer;

  if (isCorrect) {
    selectedBtn.classList.add('correct');
    feedbackPanel.className = 'feedback-panel glass-panel success';
    feedbackTitle.innerText = "Correct!";
    feedbackTitle.style.color = 'var(--correct-color)';
    feedbackExplanation.innerHTML = `<strong>Why the correct answer is right:</strong> ${q.correct_explanation}`;
  } else {
    selectedBtn.classList.add('wrong');
    correctBtn.classList.add('correct');
    feedbackPanel.className = 'feedback-panel glass-panel error';
    feedbackTitle.innerText = "Incorrect";
    feedbackTitle.style.color = 'var(--wrong-color)';
    feedbackExplanation.innerHTML = `
      <div style="margin-bottom: 0.5rem;"><strong>Why you got it wrong:</strong> ${q.wrong_explanation}</div>
      <div><strong>Why the correct answer is right:</strong> ${q.correct_explanation}</div>
    `;
  }

  keyConceptText.innerText = q.key_concept;
  sourceText.innerText = q.source || "PMI CPMAI";
  feedbackPanel.classList.remove('hidden');

  if (currentIndex === questions.length - 1) {
    nextBtn.innerText = "View Results";
  } else {
    nextBtn.innerHTML = "Next Question &rarr;";
  }
}

function nextQuestion() {
  if (currentIndex < questions.length - 1) {
    currentIndex++;
    saveState();
    loadQuestion();
  } else {
    checkFlaggedQuestions();
  }
}

function checkFlaggedQuestions() {
  const skipped = questions.filter(q => !q.answered);
  if (skipped.length === 0) {
    showDashboard(false);
  } else {
    flaggedGrid.innerHTML = '';
    questions.forEach((q, idx) => {
      if (!q.answered) {
        const btn = document.createElement('button');
        btn.className = 'glass-btn';
        btn.style.width = '60px';
        btn.style.height = '60px';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'center';
        btn.style.alignItems = 'center';
        btn.style.fontSize = '1.2rem';
        btn.innerText = (idx + 1).toString();
        btn.addEventListener('click', () => {
          currentIndex = idx;
          showScreen(quizScreen);
          loadQuestion();
        });
        flaggedGrid.appendChild(btn);
      }
    });
    showScreen(flaggedScreen);
  }
}

function showDashboard(isGlobalView = false) {
  stopTimer();
  progressBar.style.width = '100%';

  // Record session for performance trending (non-global only, avoid dupes)
  if (!isGlobalView && userStats.totalAnswered > 0) {
    recordSessionOnDashboard();
  }

  const statsSource = isGlobalView ? globalStats : userStats;
  // Fix: Use answered count as denominator, not total question count
  const totalSafeLength = isGlobalView ? statsSource.totalAnswered : (statsSource.totalAnswered > 0 ? statsSource.totalAnswered : 1);

  if (statsSource.totalAnswered === 0) {
    finalScore.innerText = "0%";
    finalScore.style.color = 'var(--text-muted)';
  } else {
    const scorePercentage = Math.round((statsSource.totalCorrect / totalSafeLength) * 100);
    finalScore.innerText = `${scorePercentage}%`;
    finalScore.style.color = scorePercentage >= 80 ? 'var(--correct-color)' : (scorePercentage >= 60 ? '#fbbf24' : 'var(--wrong-color)');
  }

  // Adjust title dynamically
  const titleEl = dashboardScreen.querySelector('h1');
  if (titleEl) {
    titleEl.innerText = isGlobalView ? "All-Time Global Readiness" : "Session Dashboard";
  }

  domainStatsContainer.innerHTML = '';

  if (Object.keys(statsSource.domainStats).length === 0) {
    domainStatsContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No data available yet.</p>';
  } else {
    for (const [domain, stats] of Object.entries(statsSource.domainStats)) {
      const percentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

      let scoreClass = 'domain-score';
      if (percentage >= 80) scoreClass += ' high';
      else if (percentage < 60) scoreClass += ' low';

      const card = document.createElement('div');
      card.className = 'domain-stat-card';
      card.innerHTML = `
        <span class="domain-name">${domain}</span>
        <span class="${scoreClass}">${stats.correct} / ${stats.total} (${percentage}%)</span>
      `;
      domainStatsContainer.appendChild(card);
    }
  }

  // P2: Show average time per question
  const avgTime = getAverageTimePerQuestion();
  const timeStatEl = document.getElementById('avg-time-stat');
  if (timeStatEl) {
    if (avgTime !== null) {
      timeStatEl.classList.remove('hidden');
      timeStatEl.innerText = `⏱ Avg. time per question: ${avgTime}s`;
    } else {
      timeStatEl.classList.add('hidden');
    }
  }

  // P1: Render readiness section on dashboard
  renderDashboardReadiness();

  // P6: Render session history chart
  renderSessionChart();

  // P9: Render domain radar chart
  renderDomainRadar();

  // P10: Render activity heatmap
  renderActivityHeatmap();

  // P7: Render confidence calibration
  renderCalibration();

  // P8: Predicted exam score
  renderPredictedScore();

  // Only allow reviewing incorrect questions if we are looking at the current session
  if (!isGlobalView) {
    incorrectQuestions = questions.filter(q => q.answered && q.selectedOption !== q.correct_answer);
    if (incorrectQuestions.length > 0) {
      reviewBtn.classList.remove('hidden');
    } else {
      reviewBtn.classList.add('hidden');
    }
  } else {
    reviewBtn.classList.add('hidden');
  }

  // Ensure default view is stats
  domainStatsContainer.classList.remove('hidden');
  reviewCarouselContainer.classList.add('hidden');

  // Advance index and save state so reload restores to dashboard (only if not global view)
  if (!isGlobalView && currentIndex < questions.length) {
    currentIndex = questions.length;
    saveState();
  }

  showScreen(dashboardScreen);
}

// ─── REVIEW FEATURES ────────────────────────────────────────────────────────
function startReview() {
  domainStatsContainer.classList.add('hidden');
  reviewCarouselContainer.classList.remove('hidden');
  reviewBtn.classList.add('hidden');
  currentReviewIndex = 0;
  loadReviewQuestion();
}

function loadReviewQuestion() {
  const q = incorrectQuestions[currentReviewIndex];
  document.getElementById('review-question-text').innerText = q.question;
  document.getElementById('review-feedback-explanation').innerHTML = `
      <div style="margin-bottom: 0.5rem;"><strong>You selected:</strong> <span style="color:var(--wrong-color);">${q.selectedOption}</span></div>
      <div style="margin-bottom: 0.5rem;"><strong>Why it's wrong:</strong> ${q.wrong_explanation}</div>
      <div><strong>Why the correct answer is right:</strong> ${q.correct_explanation}</div>
  `;
  document.getElementById('review-key-concept-text').innerText = q.key_concept;
  document.getElementById('review-tracker').innerText = `${currentReviewIndex + 1} of ${incorrectQuestions.length} Incorrect`;

  if (currentReviewIndex === incorrectQuestions.length - 1) {
    nextReviewBtn.innerText = "Finish Review";
  } else {
    nextReviewBtn.innerHTML = "Next Wrong Answer &rarr;";
  }
}

function handleNextReview() {
  if (currentReviewIndex < incorrectQuestions.length - 1) {
    currentReviewIndex++;
    loadReviewQuestion();
  } else {
    // Done reviewing, go back to stats
    domainStatsContainer.classList.remove('hidden');
    reviewCarouselContainer.classList.add('hidden');
    reviewBtn.classList.remove('hidden');
  }
}

// ─── EXAM SIMULATION REVIEW ─────────────────────────────────────────────────
function showExamReview() {
  stopTimer();
  examSimMode = false;
  quizScreen.classList.remove('exam-sim-mode');
  const existing = document.querySelector('.exam-sim-indicator');
  if (existing) existing.remove();

  const answered = questions.filter(q => q.answered);
  const correct = answered.filter(q => q.selectedOption === q.correct_answer);
  const wrong = answered.filter(q => q.selectedOption !== q.correct_answer);
  const skipped = questions.filter(q => !q.answered);
  const pct = answered.length > 0 ? Math.round((correct.length / questions.length) * 100) : 0;

  // Record session history
  recordSession(pct, 'exam-sim', questions.length);

  // Populate score
  const scoreEl = document.getElementById('exam-review-score');
  scoreEl.innerText = `${pct}%`;
  scoreEl.style.color = pct >= 80 ? 'var(--correct-color)' : (pct >= 60 ? '#fbbf24' : 'var(--wrong-color)');

  // Summary
  const summaryEl = document.getElementById('exam-review-summary');
  const passText = pct >= 65 ? '✅ You passed!' : '❌ Below passing threshold (65%)';
  summaryEl.innerHTML = `${passText}<br><span style="color:var(--text-muted); font-size:0.85rem;">
    ${correct.length} correct · ${wrong.length} incorrect · ${skipped.length} skipped out of ${questions.length} questions
  </span>`;

  // Build review list
  const listEl = document.getElementById('exam-review-list');
  listEl.innerHTML = '';

  questions.forEach((q, idx) => {
    const item = document.createElement('div');
    let status, badgeClass, badgeText;

    if (!q.answered) {
      status = 'skipped';
      badgeClass = 'badge-skipped';
      badgeText = 'SKIPPED';
    } else if (q.selectedOption === q.correct_answer) {
      status = 'correct';
      badgeClass = 'badge-correct';
      badgeText = '✓ CORRECT';
    } else {
      status = 'wrong';
      badgeClass = 'badge-wrong';
      badgeText = '✗ INCORRECT';
    }

    item.className = `exam-review-item review-${status}`;
    item.innerHTML = `
      <div class="review-item-header">
        <span class="review-item-q">${idx + 1}. ${q.question}</span>
        <span class="review-item-badge ${badgeClass}">${badgeText}</span>
      </div>
      <details class="review-item-details">
        <summary>Show explanation</summary>
        <div style="margin-top: 0.5rem;">
          ${q.answered ? `<p><strong>You selected:</strong> <span style="color:${status === 'correct' ? 'var(--correct-color)' : 'var(--wrong-color)'}">${q.selectedOption}</span></p>` : '<p><em>No answer selected</em></p>'}
          <p><strong>Correct answer:</strong> <span style="color:var(--correct-color)">${q.correct_answer}</span></p>
          <p style="margin-top:0.4rem;">${q.correct_explanation}</p>
          ${status === 'wrong' ? `<p style="margin-top:0.4rem;"><strong>Why yours was wrong:</strong> ${q.wrong_explanation}</p>` : ''}
          <p style="margin-top:0.4rem; font-style:italic; color:var(--text-muted); font-size:0.82rem;">💡 ${q.key_concept}</p>
        </div>
      </details>
    `;
    listEl.appendChild(item);
  });

  showScreen(examReviewScreen);
}

// ─── SESSION HISTORY ────────────────────────────────────────────────────────
function recordSession(score, mode, count) {
  if (!globalStats.sessionHistory) globalStats.sessionHistory = [];
  globalStats.sessionHistory.push({
    date: new Date().toISOString(),
    score,
    mode,
    count
  });
  // Keep only last 50 sessions
  if (globalStats.sessionHistory.length > 50) {
    globalStats.sessionHistory = globalStats.sessionHistory.slice(-50);
  }
  saveGlobalStats();
}

function renderSessionChart() {
  const container = document.getElementById('session-history-container');
  const canvas = document.getElementById('session-history-chart');
  if (!container || !canvas) return;

  const sessions = globalStats.sessionHistory || [];
  if (sessions.length < 2) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const recent = sessions.slice(-20);
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const w = rect.width - padding.left - padding.right;
  const h = rect.height - padding.top - padding.bottom;

  // Y axis gridlines: 0-100
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.font = '10px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'right';

  [0, 25, 50, 75, 100].forEach(val => {
    const y = padding.top + h - (val / 100) * h;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + w, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, padding.left - 5, y + 3);
  });

  // Passing threshold line at 65%
  const passY = padding.top + h - (65 / 100) * h;
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, passY);
  ctx.lineTo(padding.left + w, passY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot points
  const points = recent.map((s, i) => ({
    x: padding.left + (i / (recent.length - 1)) * w,
    y: padding.top + h - (s.score / 100) * h
  }));

  // Area fill gradient
  const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + h);
  gradient.addColorStop(0, 'rgba(99, 102, 241, 0.18)');
  gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
  ctx.beginPath();
  ctx.moveTo(points[0].x, padding.top + h);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padding.top + h);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Score line (smoothed via bezier curves)
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const cp1x = points[i-1].x + (points[i].x - points[i-1].x) * 0.4;
    const cp2x = points[i].x - (points[i].x - points[i-1].x) * 0.4;
    ctx.bezierCurveTo(cp1x, points[i-1].y, cp2x, points[i].y, points[i].x, points[i].y);
  }
  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 3-session moving average trendline
  if (recent.length >= 3) {
    const maPoints = [];
    for (let i = 2; i < recent.length; i++) {
      const avg = (recent[i].score + recent[i-1].score + recent[i-2].score) / 3;
      maPoints.push({
        x: padding.left + (i / (recent.length - 1)) * w,
        y: padding.top + h - (avg / 100) * h
      });
    }

    ctx.beginPath();
    ctx.moveTo(maPoints[0].x, maPoints[0].y);
    for (let i = 1; i < maPoints.length; i++) {
      const cp1x = maPoints[i-1].x + (maPoints[i].x - maPoints[i-1].x) * 0.4;
      const cp2x = maPoints[i].x - (maPoints[i].x - maPoints[i-1].x) * 0.4;
      ctx.bezierCurveTo(cp1x, maPoints[i-1].y, cp2x, maPoints[i].y, maPoints[i].x, maPoints[i].y);
    }
    ctx.strokeStyle = '#f472b6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Score dots with color coding
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    const score = recent[i].score;
    ctx.fillStyle = score >= 80 ? '#10b981' : score >= 60 ? '#fbbf24' : '#ef4444';
    ctx.fill();
    // White ring around dots
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // X labels (dates)
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'center';
  ctx.font = '9px Inter, sans-serif';
  const step = Math.max(1, Math.floor(recent.length / 6));
  for (let i = 0; i < recent.length; i += step) {
    const date = new Date(recent[i].date);
    const label = `${date.getMonth()+1}/${date.getDate()}`;
    ctx.fillText(label, points[i].x, padding.top + h + 18);
  }

  // Trend direction indicator
  const trendEl = document.getElementById('trend-indicator');
  if (trendEl && recent.length >= 4) {
    const recentHalf = recent.slice(-Math.ceil(recent.length / 2));
    const olderHalf = recent.slice(0, Math.ceil(recent.length / 2));
    const recentAvg = recentHalf.reduce((a, s) => a + s.score, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, s) => a + s.score, 0) / olderHalf.length;
    const diff = Math.round(recentAvg - olderAvg);

    if (diff > 3) {
      trendEl.className = 'trend-indicator trend-up';
      trendEl.innerText = `▲ +${diff}% improving`;
    } else if (diff < -3) {
      trendEl.className = 'trend-indicator trend-down';
      trendEl.innerText = `▼ ${diff}% declining`;
    } else {
      trendEl.className = 'trend-indicator trend-flat';
      trendEl.innerText = `▸ Steady`;
    }
  }
}

// ─── DOMAIN RADAR CHART ─────────────────────────────────────────────────────
function renderDomainRadar() {
  const container = document.getElementById('domain-radar-container');
  const canvas = document.getElementById('domain-radar-chart');
  if (!container || !canvas) return;

  const domains = [
    { key: 'Identify Business Needs and Solutions', short: 'Business\nNeeds' },
    { key: 'Identify Data Needs', short: 'Data\nNeeds' },
    { key: 'Manage AI Model Development and Evaluation', short: 'Model\nDev' },
    { key: 'Operationalize AI Solutions', short: 'Deploy &\nOps' },
    { key: 'Support Responsible and Trustworthy AI Efforts', short: 'Ethics &\nTrust' }
  ];

  const domainData = domains.map(d => {
    const stats = globalStats.domainStats[d.key];
    if (!stats || stats.total < 1) return { ...d, pct: 0, hasData: false };
    return { ...d, pct: Math.round((stats.correct / stats.total) * 100), hasData: true, total: stats.total, correct: stats.correct };
  });

  const hasAnyData = domainData.some(d => d.hasData);
  if (!hasAnyData) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const radius = Math.min(cx, cy) - 45;
  const n = domains.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2; // Start from top

  // Draw concentric rings (25%, 50%, 75%, 100%)
  [0.25, 0.5, 0.75, 1.0].forEach(ring => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = startAngle + i * angleStep;
      const x = cx + Math.cos(angle) * radius * ring;
      const y = cy + Math.sin(angle) * radius * ring;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Draw spokes
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Draw data polygon (filled)
  ctx.beginPath();
  domainData.forEach((d, i) => {
    const angle = startAngle + i * angleStep;
    const r = (d.pct / 100) * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();

  // Gradient fill
  const radarGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  radarGradient.addColorStop(0, 'rgba(99, 102, 241, 0.05)');
  radarGradient.addColorStop(1, 'rgba(99, 102, 241, 0.25)');
  ctx.fillStyle = radarGradient;
  ctx.fill();

  ctx.strokeStyle = '#818cf8';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw data points and labels
  domainData.forEach((d, i) => {
    const angle = startAngle + i * angleStep;
    const r = (d.pct / 100) * radius;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    // Data point
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = d.pct >= 80 ? '#10b981' : d.pct >= 60 ? '#fbbf24' : '#ef4444';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Labels (outside the chart)
    const labelR = radius + 30;
    const lx = cx + Math.cos(angle) * labelR;
    const ly = cy + Math.sin(angle) * labelR;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Multi-line labels
    const lines = d.short.split('\n');
    lines.forEach((line, li) => {
      ctx.fillText(line, lx, ly + (li - (lines.length - 1) / 2) * 12);
    });

    // Percentage label near the data point
    if (d.hasData) {
      const pctR = Math.max(r + 12, 20);
      const pctX = cx + Math.cos(angle) * pctR;
      const pctY = cy + Math.sin(angle) * pctR;
      ctx.fillStyle = d.pct >= 80 ? '#10b981' : d.pct >= 60 ? '#fbbf24' : '#ef4444';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`${d.pct}%`, pctX, pctY);
    }
  });
}

// ─── ACTIVITY HEATMAP ───────────────────────────────────────────────────────
function renderActivityHeatmap() {
  const container = document.getElementById('activity-heatmap-container');
  const grid = document.getElementById('activity-heatmap');
  const streakBadge = document.getElementById('streak-badge');
  if (!container || !grid) return;

  const sessions = globalStats.sessionHistory || [];
  if (sessions.length < 1) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  grid.innerHTML = '';

  // Build day->count map for last 91 days (13 weeks)
  const dayMap = {};
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  sessions.forEach(s => {
    const d = new Date(s.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dayMap[key] = (dayMap[key] || 0) + (s.count || 1);
  });

  // Find max questions in a single day for color scaling
  const maxQuestions = Math.max(1, ...Object.values(dayMap));

  // Build 91 days (13 weeks × 7 days), columns = weeks
  const totalDays = 91;
  const cells = [];
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Create day-label column first
  for (let row = 0; row < 7; row++) {
    const label = document.createElement('div');
    label.className = 'heatmap-row-label';
    label.innerText = (row % 2 === 1) ? dayLabels[row] : '';
    grid.appendChild(label);
  }

  // Adjust grid to 14 columns (1 label + 13 weeks)
  grid.style.gridTemplateColumns = 'auto repeat(13, 1fr)';

  // Calculate study streak
  let streak = 0;
  for (let i = 0; i <= totalDays; i++) {
    const date = new Date(now.getTime() - i * msPerDay);
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    if (dayMap[key]) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  // We need to fill 13 weeks column by column (each column = 1 week)
  // Start from the oldest date
  const startDate = new Date(now.getTime() - (totalDays - 1) * msPerDay);
  // Adjust to start on Sunday
  const startDow = startDate.getDay();
  const adjustedStart = new Date(startDate.getTime() - startDow * msPerDay);

  // Build columns (weeks)
  for (let week = 0; week < 13; week++) {
    for (let dow = 0; dow < 7; dow++) {
      const dayDate = new Date(adjustedStart.getTime() + (week * 7 + dow) * msPerDay);
      const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth()+1).padStart(2,'0')}-${String(dayDate.getDate()).padStart(2,'0')}`;
      const count = dayMap[key] || 0;
      const isFuture = dayDate > now;

      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';

      if (isFuture) {
        cell.style.background = 'transparent';
        cell.style.border = 'none';
      } else if (count > 0) {
        const intensity = Math.min(1, count / maxQuestions);
        // 5 intensity levels
        let alpha;
        if (intensity < 0.2) alpha = 0.15;
        else if (intensity < 0.4) alpha = 0.3;
        else if (intensity < 0.6) alpha = 0.5;
        else if (intensity < 0.8) alpha = 0.7;
        else alpha = 0.9;
        cell.style.background = `rgba(99, 102, 241, ${alpha})`;
      }

      if (!isFuture) {
        const monthDay = `${dayDate.getMonth()+1}/${dayDate.getDate()}`;
        cell.setAttribute('data-tooltip', count > 0 ? `${monthDay}: ${count} questions` : `${monthDay}: No activity`);
      }

      grid.appendChild(cell);
    }
  }

  // Show streak badge
  if (streakBadge) {
    if (streak > 0) {
      streakBadge.innerText = `🔥 ${streak} day streak`;
      streakBadge.style.display = 'inline-block';
    } else {
      streakBadge.style.display = 'none';
    }
  }
}

// ─── CONFIDENCE CALIBRATION ─────────────────────────────────────────────────
function renderCalibration() {
  const container = document.getElementById('calibration-container');
  const grid = document.getElementById('calibration-stats');
  if (!container || !grid) return;

  const data = globalStats.confidenceData;
  if (!data) { container.classList.add('hidden'); return; }

  const total = (data.low?.total || 0) + (data.medium?.total || 0) + (data.high?.total || 0);
  if (total < 5) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  const levels = [
    { key: 'low', label: '😐 Low', color: '#fca5a5' },
    { key: 'medium', label: '🤔 Med', color: '#fde68a' },
    { key: 'high', label: '💪 High', color: '#6ee7b7' },
  ];

  grid.innerHTML = levels.map(l => {
    const d = data[l.key] || { total: 0, correct: 0 };
    const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
    const isCalibrated = l.key === 'low' ? pct < 50 : l.key === 'medium' ? pct >= 40 && pct <= 75 : pct >= 70;
    return `
      <div class="calibration-card">
        <div class="cal-title">${l.label}</div>
        <div class="cal-value" style="color: ${l.color}">${pct}%</div>
        <div class="cal-detail">${d.correct}/${d.total} correct</div>
        <div class="cal-detail">${isCalibrated ? '✓ Well calibrated' : '⚠ Miscalibrated'}</div>
      </div>
    `;
  }).join('');
}

// ─── PREDICTED EXAM SCORE ───────────────────────────────────────────────────
function renderPredictedScore() {
  const container = document.getElementById('predicted-score-container');
  const valueEl = document.getElementById('predicted-score-value');
  const verdictEl = document.getElementById('predicted-score-verdict');
  if (!container || !valueEl || !verdictEl) return;

  // Need at least 30 answered questions for a meaningful prediction
  if (globalStats.totalAnswered < 30) {
    container.classList.add('hidden');
    return;
  }

  // Official PMI-CPMAI domain weights
  const domainWeights = {
    'Identify Business Needs and Solutions': 0.26,
    'Identify Data Needs': 0.26,
    'Operationalize AI Solutions': 0.17,
    'Manage AI Model Development and Evaluation': 0.16,
    'Support Responsible and Trustworthy AI Efforts': 0.15,
  };

  let weightedScore = 0;
  let coveredWeight = 0;

  for (const [domain, weight] of Object.entries(domainWeights)) {
    const stats = globalStats.domainStats[domain];
    if (stats && stats.total >= 5) {
      const domainAccuracy = stats.correct / stats.total;
      weightedScore += domainAccuracy * weight;
      coveredWeight += weight;
    }
  }

  if (coveredWeight < 0.5) {
    container.classList.add('hidden');
    return;
  }

  // Normalize to covered domains
  const predicted = Math.round((weightedScore / coveredWeight) * 100);

  container.classList.remove('hidden');
  valueEl.innerText = `${predicted}%`;
  valueEl.style.color = predicted >= 80 ? 'var(--correct-color)' : predicted >= 65 ? '#fbbf24' : 'var(--wrong-color)';

  if (predicted >= 80) {
    verdictEl.innerText = '✅ Strong pass likelihood';
    verdictEl.style.color = 'var(--correct-color)';
  } else if (predicted >= 65) {
    verdictEl.innerText = '⚠️ Borderline — keep studying';
    verdictEl.style.color = '#fbbf24';
  } else {
    verdictEl.innerText = '❌ Below passing — focus on weak domains';
    verdictEl.style.color = 'var(--wrong-color)';
  }
}

// Also record session history for normal quiz completions
const originalShowDashboard = showDashboard;
// We monkey-patch via the nextQuestion flow — record session when dashboard is shown
function recordSessionOnDashboard() {
  if (userStats.totalAnswered > 0 && questions.length > 0) {
    const pct = Math.round((userStats.totalCorrect / userStats.totalAnswered) * 100);
    const mode = questions.length <= 10 ? 'quick10' : questions.length <= 20 ? 'spaced' : 'full';
    recordSession(pct, mode, questions.length);
  }
}

// ─── EVENT LISTENERS ────────────────────────────────────────────────────────
modeSmartDrillBtn.addEventListener('click', () => startQuiz('smartDrill'));
modeMasteryBtn.addEventListener('click', () => startQuiz('mastery'));
modeFullBtn.addEventListener('click', () => startQuiz('full'));
if (modeStudyBtn) modeStudyBtn.addEventListener('click', () => startStudyMode());

// Difficulty filter tabs
document.querySelectorAll('.diff-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.diff-tab').forEach(t => t.classList.remove('diff-tab-active'));
    tab.classList.add('diff-tab-active');
    selectedDifficulty = tab.dataset.diff;
  });
});

// Exam Simulation Mode — Domain-Weighted Selection
function buildExamPool(targetCount) {
  // Official PMI-CPMAI exam domain weights
  const domainWeights = {
    'Identify Business Needs and Solutions': 0.26,
    'Identify Data Needs': 0.26,
    'Manage AI Model Development and Evaluation': 0.16,
    'Operationalize AI Solutions': 0.17,
    'Support Responsible and Trustworthy AI Efforts': 0.15
  };

  let pool = [];
  for (const [domain, weight] of Object.entries(domainWeights)) {
    const domainQuestions = masterQuestions.filter(q => q.domain === domain);
    const count = Math.max(1, Math.round(targetCount * weight));
    // Shuffle and take the needed count
    const shuffled = [...domainQuestions].sort(() => Math.random() - 0.5);
    pool.push(...shuffled.slice(0, count));
  }

  // Trim or pad to exact target
  pool = pool.sort(() => Math.random() - 0.5);
  if (pool.length > targetCount) pool = pool.slice(0, targetCount);

  return pool;
}

const modeExamSimBtn = document.getElementById('mode-exam-sim');
if (modeExamSimBtn) {
  modeExamSimBtn.addEventListener('click', () => {
    const examCount = 50;
    examSimMode = true;
    timerEnabled = true;

    // Build a domain-weighted pool
    questions = buildExamPool(examCount);
    questions.forEach(q => {
      q.answered = false;
      q.selectedOption = null;
      delete q.shuffledOptions;
    });

    currentIndex = 0;
    userStats = { totalAnswered: 0, totalCorrect: 0, domainStats: {} };
    questions.forEach(q => {
      if (!userStats.domainStats[q.domain]) userStats.domainStats[q.domain] = { total: 0, correct: 0 };
      userStats.domainStats[q.domain].total++;
    });

    saveState();
    showScreen(quizScreen);

    // Add exam sim mode class + indicator
    quizScreen.classList.add('exam-sim-mode');
    const existingIndicator = document.querySelector('.exam-sim-indicator');
    if (existingIndicator) existingIndicator.remove();
    const indicator = document.createElement('span');
    indicator.className = 'exam-sim-indicator';
    indicator.innerText = 'EXAM SIM';
    questionTracker.after(indicator);

    loadQuestion();
    stopTimer();
    startTimer(examCount);
  });
}

// Exam review home button
const examReviewHomeBtn = document.getElementById('exam-review-home-btn');
if (examReviewHomeBtn) {
  examReviewHomeBtn.addEventListener('click', () => {
    renderReadinessRing();
    updateSpacedCount();
    showScreen(startScreen);
  });
}

// Confidence buttons
document.querySelectorAll('.conf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentConfidence = btn.dataset.conf;
    document.querySelectorAll('.conf-btn').forEach(b => b.classList.remove('conf-selected'));
    btn.classList.add('conf-selected');
  });
});

nextBtn.addEventListener('click', nextQuestion);
flagBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', () => {
  renderReadinessRing();
  updateSpacedCount();
  showScreen(startScreen);
});
reviewBtn.addEventListener('click', startReview);
nextReviewBtn.addEventListener('click', handleNextReview);
submitExamBtn.addEventListener('click', () => showDashboard(false));

// Quit Quiz button
const quitQuizBtn = document.getElementById('quit-quiz-btn');
if (quitQuizBtn) {
  quitQuizBtn.addEventListener('click', () => {
    if (userStats.totalAnswered > 0) {
      if (!confirm('You have answered ' + userStats.totalAnswered + ' questions. Quit and lose this session?')) return;
    }
    stopTimer();
    renderReadinessRing();
    updateSpacedCount();
    showScreen(startScreen);
  });
}

// Re-route the header logo to act as a Home button
document.querySelector('header .logo').style.cursor = 'pointer';
document.querySelector('header .logo').addEventListener('click', () => {
  stopTimer();
  renderReadinessRing();
  updateSpacedCount();
  showScreen(startScreen);
});

// Dashboard button now shows Global Data
viewDashboardBtn.addEventListener('click', () => {
  showDashboard(true);
});

// ─── DATA MANAGEMENT ────────────────────────────────────────────────────────
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const resetBtn = document.getElementById('reset-btn');
const importFileInput = document.getElementById('import-file-input');

if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const exportData = {
      globalStats: JSON.parse(localStorage.getItem('cpmai_global_stats') || '{}'),
      quizState: JSON.parse(localStorage.getItem('cpmai_quiz_state') || '{}'),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpmai_progress_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 Progress exported successfully!', 'success');
  });
}

if (importBtn) {
  importBtn.addEventListener('click', () => importFileInput.click());
}

if (importFileInput) {
  importFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.globalStats) {
          localStorage.setItem('cpmai_global_stats', JSON.stringify(data.globalStats));
          globalStats = { ...globalStats, ...data.globalStats };
        }
        if (data.quizState) {
          localStorage.setItem('cpmai_quiz_state', JSON.stringify(data.quizState));
        }
        renderReadinessRing();
        updateSpacedCount();
        showToast('📥 Progress imported successfully!', 'success');
      } catch (err) {
        showToast('❌ Invalid file format.', 'error');
      }
    };
    reader.readAsText(file);
    importFileInput.value = ''; // Reset so same file can be re-imported
  });
}

if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (!confirm('⚠️ This will permanently delete ALL your quiz progress, statistics, and spaced repetition data. This cannot be undone.\n\nAre you sure?')) return;
    localStorage.removeItem('cpmai_quiz_state');
    localStorage.removeItem('cpmai_global_stats');
    globalStats = {
      totalAnswered: 0,
      totalCorrect: 0,
      missedQuestions: [],
      domainStats: {},
      questionHistory: {},
      timePerQuestion: []
    };
    userStats = { totalAnswered: 0, totalCorrect: 0, domainStats: {} };
    questions = [];
    currentIndex = 0;
    renderReadinessRing();
    updateSpacedCount();
    showToast('🗑 All progress has been reset.', 'warning');
  });
}

// ─── KEYBOARD NAVIGATION ────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Only active on quiz screen
  if (!quizScreen.classList.contains('active')) return;

  const q = questions[currentIndex];
  if (!q) return;

  // 1-4 keys to select answers
  if (['1', '2', '3', '4'].includes(e.key)) {
    if (q.answered) return;
    const idx = parseInt(e.key) - 1;
    const btns = optionsContainer.querySelectorAll('.option-btn');
    if (btns[idx]) btns[idx].click();
  }

  // Enter or ArrowRight to advance to next question
  if (e.key === 'Enter' || e.key === 'ArrowRight') {
    if (q.answered) {
      nextQuestion();
    }
  }
});

// P4: Study mode navigation
const studyPrevBtn = document.getElementById('study-prev-btn');
const studyNextBtn = document.getElementById('study-next-btn');
const studyShuffleBtn = document.getElementById('study-shuffle-btn');
const studyHomeBtn = document.getElementById('study-home-btn');

if (studyPrevBtn) {
  studyPrevBtn.addEventListener('click', () => {
    if (studyIndex > 0) {
      studyIndex--;
      loadStudyCard();
    }
  });
}

if (studyNextBtn) {
  studyNextBtn.addEventListener('click', () => {
    if (studyIndex < studyQuestions.length - 1) {
      studyIndex++;
      loadStudyCard();
    } else {
      showScreen(startScreen);
      renderReadinessRing();
      updateSpacedCount();
    }
  });
}

if (studyShuffleBtn) {
  studyShuffleBtn.addEventListener('click', () => {
    studyQuestions = studyQuestions.sort(() => Math.random() - 0.5);
    studyIndex = 0;
    loadStudyCard();
  });
}

if (studyHomeBtn) {
  studyHomeBtn.addEventListener('click', () => {
    showScreen(startScreen);
    renderReadinessRing();
    updateSpacedCount();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// GAME CENTER
// ═══════════════════════════════════════════════════════════════════════════

const GAME_DATA = [
  { term: 'Business Understanding', def: 'Define project objectives and requirements from a business perspective' },
  { term: 'Data Understanding', def: 'Assess the current state, quality, and volume of available data' },
  { term: 'Data Preparation', def: 'Clean, transform, and format data for modeling' },
  { term: 'Model Development', def: 'Select algorithms, train models, and tune hyperparameters' },
  { term: 'Model Evaluation', def: 'Validate model performance using metrics aligned to business goals' },
  { term: 'Operationalization', def: 'Deploy, monitor, and maintain AI models in production' },
  { term: 'Model Drift', def: 'Gradual degradation of model predictions over time' },
  { term: 'Concept Drift', def: 'The fundamental relationship between inputs and target variable changes' },
  { term: 'Data Drift', def: 'Statistical properties of input data change over time' },
  { term: 'Overfitting', def: 'Model memorizes training data but fails on unseen data' },
  { term: 'Underfitting', def: 'Model is too simple to capture patterns in the data' },
  { term: 'Recall', def: 'Ability to find all relevant positive cases in the dataset' },
  { term: 'Precision', def: 'Proportion of positive predictions that are actually correct' },
  { term: 'F1 Score', def: 'Harmonic mean of precision and recall' },
  { term: 'MSE', def: 'Mean Squared Error — average of squared differences for regression' },
  { term: 'AUC-ROC', def: 'Evaluates a binary classifier\'s ability to distinguish between classes' },
  { term: 'Human-in-the-Loop', def: 'Human reviews or approves AI decisions in sensitive applications' },
  { term: 'Explainable AI (XAI)', def: 'Methods to understand and articulate how a model makes decisions' },
  { term: 'Selection Bias', def: 'Training data does not represent the real-world population' },
  { term: 'Algorithmic Discrimination', def: 'AI systematically makes unfair decisions against certain groups' },
  { term: 'Data Leakage', def: 'Training data contains information not available at prediction time' },
  { term: 'Feature Store', def: 'Centralized hub that serves ML variables across all environments' },
  { term: 'Shadow Deployment', def: 'New model runs alongside legacy system without affecting decisions' },
  { term: 'Canary Deployment', def: 'Release model to a small fraction of users before full rollout' },
  { term: 'API', def: 'Interface allowing other software to send data and receive predictions' },
  { term: 'Data Augmentation', def: 'Creating synthetic variations to expand the training dataset' },
  { term: 'Data Integration', def: 'Combining data from disparate sources into a unified location' },
  { term: 'Data Anonymization', def: 'Removing personally identifiable information from datasets' },
  { term: 'Inter-Annotator Agreement', def: 'Consistency among human labelers when tagging data' },
  { term: 'Inference Latency', def: 'Time for a deployed model to receive input and return a prediction' },
  { term: 'Reward Function', def: 'Defines desired behavior in reinforcement learning' },
  { term: 'Transfer Learning', def: 'Using a pre-trained model as starting point for a new task' },
  { term: 'Cross-Validation', def: 'Testing model on multiple data splits to ensure generalization' },
  { term: 'AI Project Charter', def: 'Foundational document capturing goals, scope, and success criteria' },
  { term: 'Supervised Learning', def: 'Training with labeled input-output pairs to predict outcomes' },
  { term: 'Unsupervised Learning', def: 'Finding hidden patterns or groupings in unlabeled data' },
  { term: 'RAG', def: 'Combining a foundation model with a knowledge base for grounded responses' },
  { term: 'Prompt Engineering', def: 'Designing effective inputs to get desired outputs from GenAI' },
  { term: 'Synthetic Data', def: 'Artificially generated data to supplement rare real-world edge cases' },
  { term: 'Confusion Matrix', def: 'Table showing True/False Positives and Negatives for classification' }
];

const PHASE_ORDER = [
  'Business Understanding',
  'Data Understanding',
  'Data Preparation',
  'Model Development',
  'Model Evaluation',
  'Operationalization'
];

const PHASE_ACTIVITIES = {
  'Business Understanding': ['Define success criteria','Go/No-Go decision','AI Project Charter','Identify AI Pattern','Assess ROI'],
  'Data Understanding': ['Exploratory Data Analysis','Assess data quality','Check label availability','Data governance review'],
  'Data Preparation': ['Feature engineering','Handle missing values','Train/test split','Data augmentation','Data anonymization'],
  'Model Development': ['Algorithm selection','Hyperparameter tuning','Model training','Transfer learning'],
  'Model Evaluation': ['Cross-validation','Bias and fairness testing','Explainability analysis','Metric selection'],
  'Operationalization': ['Deploy as API','Monitor for drift','Set up retraining pipeline','Version control','Canary deployment']
};

const MINE_CATEGORIES = [
  {
    name: 'Data Preparation Techniques',
    correct: ['Feature engineering','Data augmentation','Train/test split','Data anonymization','Handle missing values'],
    wrong: ['Model Drift','Shadow Deployment','Recall','AUC-ROC','Cross-validation','AI Project Charter','Go/No-Go decision','Bias testing']
  },
  {
    name: 'Model Evaluation Metrics',
    correct: ['Recall','Precision','F1 Score','AUC-ROC','MSE','Confusion Matrix'],
    wrong: ['Feature Store','Data Integration','API','Canary Deployment','Data Augmentation','Reward Function','Prompt Engineering','RAG']
  },
  {
    name: 'Responsible AI Concepts',
    correct: ['Human-in-the-Loop','Explainable AI','Selection Bias','Algorithmic Discrimination','Data Anonymization'],
    wrong: ['MSE','Hyperparameter tuning','Feature Store','Canary Deployment','Transfer Learning','Data Augmentation','API','Inference Latency']
  },
  {
    name: 'MLOps & Deployment',
    correct: ['Shadow Deployment','Canary Deployment','Feature Store','Version Control','Inference Latency','Model Drift'],
    wrong: ['Recall','F1 Score','AI Project Charter','Data Augmentation','Selection Bias','Prompt Engineering','Supervised Learning','RAG']
  },
  {
    name: 'Business Understanding Activities',
    correct: ['Define success criteria','Go/No-Go decision','AI Project Charter','Identify AI Pattern','Assess ROI'],
    wrong: ['Feature engineering','Cross-validation','Deploy as API','Monitor for drift','Data augmentation','Hyperparameter tuning','Bias testing','Model training']
  }
];

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getGameScores() {
  return JSON.parse(localStorage.getItem('cpmai_game_scores') || '{}');
}

function saveGameScore(game, score) {
  const scores = getGameScores();
  if (!scores[game] || score > scores[game]) {
    scores[game] = score;
    localStorage.setItem('cpmai_game_scores', JSON.stringify(scores));
  }
}

function renderHighScores() {
  const el = document.getElementById('game-high-scores');
  if (!el) return;
  const scores = getGameScores();
  const labels = { matcher: '🎯 Matcher', rapid: '⚡ Rapid', sequencer: '🔄 Sequencer', mines: '💣 Mines' };
  const parts = Object.entries(scores).filter(([,v]) => v > 0).map(([k,v]) => `${labels[k] || k}: ${v}`);
  el.innerText = parts.length ? '🏆 Best: ' + parts.join(' · ') : '';
}

// ─── GAME 1: TERM MATCHER ──────────────────────────────────────────────────
let matcherState = {};

function startTermMatcher() {
  const screen = document.getElementById('game-matcher-screen');
  showScreen(screen);

  const pairs = shuffleArr(GAME_DATA).slice(0, 8);
  const terms = shuffleArr(pairs.map((p, i) => ({ id: i, text: p.term })));
  const defs = shuffleArr(pairs.map((p, i) => ({ id: i, text: p.def })));

  matcherState = { pairs, terms, defs, selected: null, matched: 0, score: 0, wrong: 0, startTime: Date.now(), done: false };

  const termsCol = document.getElementById('matcher-terms');
  const defsCol = document.getElementById('matcher-defs');
  termsCol.innerHTML = '';
  defsCol.innerHTML = '';

  document.getElementById('matcher-result').classList.add('hidden');
  document.getElementById('matcher-restart-btn').classList.add('hidden');

  terms.forEach(t => {
    const card = document.createElement('div');
    card.className = 'matcher-card';
    card.dataset.id = t.id;
    card.dataset.type = 'term';
    card.innerText = t.text;
    card.addEventListener('click', () => handleMatcherClick(card, 'term'));
    termsCol.appendChild(card);
  });

  defs.forEach(d => {
    const card = document.createElement('div');
    card.className = 'matcher-card';
    card.dataset.id = d.id;
    card.dataset.type = 'def';
    card.innerText = d.text;
    card.addEventListener('click', () => handleMatcherClick(card, 'def'));
    defsCol.appendChild(card);
  });

  // Timer update
  matcherState.timerInterval = setInterval(() => {
    if (matcherState.done) return;
    const elapsed = Math.floor((Date.now() - matcherState.startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    document.getElementById('matcher-timer').innerText = `⏱ ${m}:${String(s).padStart(2,'0')}`;
  }, 500);

  updateMatcherScore();
}

function handleMatcherClick(card, type) {
  if (matcherState.done || card.classList.contains('matched')) return;

  if (!matcherState.selected) {
    matcherState.selected = card;
    card.classList.add('selected');
  } else {
    const first = matcherState.selected;
    // Must click different type
    if (first.dataset.type === type) {
      first.classList.remove('selected');
      matcherState.selected = card;
      card.classList.add('selected');
      return;
    }

    if (first.dataset.id === card.dataset.id) {
      // Correct match
      first.classList.remove('selected');
      first.classList.add('matched');
      card.classList.add('matched');
      matcherState.matched++;
      matcherState.score += 10;
      updateMatcherScore();

      if (matcherState.matched === matcherState.pairs.length) {
        finishTermMatcher();
      }
    } else {
      // Wrong match
      matcherState.wrong++;
      matcherState.score = Math.max(0, matcherState.score - 3);
      updateMatcherScore();
      first.classList.remove('selected');
      first.classList.add('wrong-flash');
      card.classList.add('wrong-flash');
      setTimeout(() => {
        first.classList.remove('wrong-flash');
        card.classList.remove('wrong-flash');
      }, 500);
    }
    matcherState.selected = null;
  }
}

function updateMatcherScore() {
  document.getElementById('matcher-score').innerText = `${matcherState.score} pts`;
}

function finishTermMatcher() {
  matcherState.done = true;
  clearInterval(matcherState.timerInterval);
  const elapsed = Math.floor((Date.now() - matcherState.startTime) / 1000);
  const timeBonus = Math.max(0, 60 - elapsed) * 2;
  const finalScore = matcherState.score + timeBonus;
  saveGameScore('matcher', finalScore);

  const result = document.getElementById('matcher-result');
  result.classList.remove('hidden');
  result.innerHTML = `
    <h3>🎯 Complete!</h3>
    <div class="final-game-score" style="color:var(--correct-color);">${finalScore} pts</div>
    <div class="game-stats">Matched ${matcherState.pairs.length} pairs in ${elapsed}s · ${matcherState.wrong} mistakes · +${timeBonus} speed bonus</div>
  `;
  document.getElementById('matcher-restart-btn').classList.remove('hidden');
  renderHighScores();
}

// ─── GAME 2: RAPID FIRE ────────────────────────────────────────────────────
let rapidState = {};

function startRapidFire() {
  const screen = document.getElementById('game-rapid-screen');
  showScreen(screen);

  const pool = shuffleArr(GAME_DATA).slice(0, 20);

  rapidState = {
    pool, index: 0, score: 0, combo: 1, lives: 3, timePerQ: 8000,
    timerStart: 0, timerInterval: null, done: false
  };

  document.getElementById('rapid-result').classList.add('hidden');
  document.getElementById('rapid-restart-btn').classList.add('hidden');
  document.getElementById('rapid-card').classList.remove('hidden');
  document.getElementById('rapid-progress').classList.remove('hidden');

  loadRapidQuestion();
}

function loadRapidQuestion() {
  if (rapidState.done) return;
  const q = rapidState.pool[rapidState.index];

  document.getElementById('rapid-q-counter').innerText = `${rapidState.index + 1}/${rapidState.pool.length}`;
  document.getElementById('rapid-term').innerText = q.term;
  updateRapidUI();

  // Build 3 options: 1 correct + 2 random wrong
  const wrongPool = GAME_DATA.filter(g => g.term !== q.term);
  const wrongs = shuffleArr(wrongPool).slice(0, 2);
  const options = shuffleArr([{ text: q.def, correct: true }, ...wrongs.map(w => ({ text: w.def, correct: false }))]);

  const optContainer = document.getElementById('rapid-options');
  optContainer.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'rapid-opt-btn';
    btn.innerText = opt.text;
    btn.addEventListener('click', () => handleRapidAnswer(btn, opt.correct, q));
    optContainer.appendChild(btn);
  });

  // Start countdown timer
  rapidState.timerStart = Date.now();
  const timerBar = document.getElementById('rapid-timer-bar');
  timerBar.style.width = '100%';

  if (rapidState.timerInterval) clearInterval(rapidState.timerInterval);
  rapidState.timerInterval = setInterval(() => {
    const elapsed = Date.now() - rapidState.timerStart;
    const pct = Math.max(0, 1 - elapsed / rapidState.timePerQ) * 100;
    timerBar.style.width = `${pct}%`;
    if (pct <= 0) {
      clearInterval(rapidState.timerInterval);
      handleRapidTimeout();
    }
  }, 50);
}

function handleRapidAnswer(btn, isCorrect, q) {
  if (rapidState.done) return;
  clearInterval(rapidState.timerInterval);

  const allBtns = document.querySelectorAll('.rapid-opt-btn');
  allBtns.forEach(b => b.disabled = true);

  if (isCorrect) {
    btn.classList.add('rapid-correct');
    const points = 10 * rapidState.combo;
    rapidState.score += points;
    rapidState.combo++;
    const comboEl = document.getElementById('rapid-combo');
    comboEl.classList.add('combo-pulse');
    setTimeout(() => comboEl.classList.remove('combo-pulse'), 300);
  } else {
    btn.classList.add('rapid-wrong');
    // Show correct
    allBtns.forEach(b => {
      if (b.innerText === q.def) b.classList.add('rapid-correct');
    });
    rapidState.combo = 1;
    rapidState.lives--;
  }

  updateRapidUI();

  setTimeout(() => {
    if (rapidState.lives <= 0) {
      finishRapidFire();
    } else if (rapidState.index >= rapidState.pool.length - 1) {
      finishRapidFire();
    } else {
      rapidState.index++;
      loadRapidQuestion();
    }
  }, isCorrect ? 500 : 1200);
}

function handleRapidTimeout() {
  if (rapidState.done) return;
  rapidState.lives--;
  rapidState.combo = 1;
  updateRapidUI();

  const allBtns = document.querySelectorAll('.rapid-opt-btn');
  allBtns.forEach(b => {
    b.disabled = true;
    const q = rapidState.pool[rapidState.index];
    if (b.innerText === q.def) b.classList.add('rapid-correct');
  });

  setTimeout(() => {
    if (rapidState.lives <= 0 || rapidState.index >= rapidState.pool.length - 1) {
      finishRapidFire();
    } else {
      rapidState.index++;
      loadRapidQuestion();
    }
  }, 1000);
}

function updateRapidUI() {
  document.getElementById('rapid-score').innerText = `${rapidState.score} pts`;
  document.getElementById('rapid-combo').innerText = `×${rapidState.combo}`;
  document.getElementById('rapid-lives').innerText = '❤️'.repeat(rapidState.lives) + '🖤'.repeat(3 - rapidState.lives);
}

function finishRapidFire() {
  rapidState.done = true;
  clearInterval(rapidState.timerInterval);
  saveGameScore('rapid', rapidState.score);

  document.getElementById('rapid-card').classList.add('hidden');
  document.getElementById('rapid-progress').classList.add('hidden');

  const answered = rapidState.index + 1;
  const result = document.getElementById('rapid-result');
  result.classList.remove('hidden');
  result.innerHTML = `
    <h3>⚡ Game Over!</h3>
    <div class="final-game-score" style="color:#fbbf24;">${rapidState.score} pts</div>
    <div class="game-stats">Answered ${answered}/${rapidState.pool.length} · Max combo ×${rapidState.combo} · ${rapidState.lives}/3 lives left</div>
  `;
  document.getElementById('rapid-restart-btn').classList.remove('hidden');
  renderHighScores();
}

// ─── GAME 3: PHASE SEQUENCER ───────────────────────────────────────────────
let seqState = {};

function startPhaseSequencer() {
  const screen = document.getElementById('game-sequencer-screen');
  showScreen(screen);

  seqState = { level: 1, score: 0, totalCorrect: 0, totalAttempts: 0 };
  loadSeqLevel();
}

function loadSeqLevel() {
  const board = document.getElementById('seq-board');
  const feedback = document.getElementById('seq-feedback');
  const checkBtn = document.getElementById('seq-check-btn');
  const nextBtn = document.getElementById('seq-next-btn');
  const restartBtn = document.getElementById('seq-restart-btn');
  const resultEl = document.getElementById('seq-result');

  board.innerHTML = '';
  feedback.classList.add('hidden');
  resultEl.classList.add('hidden');
  checkBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');

  document.getElementById('seq-level').innerText = `Level ${seqState.level}`;
  document.getElementById('seq-score').innerText = `${seqState.score} pts`;

  let items = [];
  if (seqState.level === 1) {
    document.getElementById('seq-instruction').innerText = 'Drag the CPMAI phases into the correct order (top to bottom).';
    items = shuffleArr(PHASE_ORDER.map(p => ({ text: p, correctIdx: PHASE_ORDER.indexOf(p) })));
  } else if (seqState.level === 2) {
    document.getElementById('seq-instruction').innerText = 'Order these activities from earliest to latest in the CPMAI lifecycle.';
    const activities = [
      { text: 'Define success criteria', correctIdx: 0 },
      { text: 'Assess data quality', correctIdx: 1 },
      { text: 'Feature engineering', correctIdx: 2 },
      { text: 'Algorithm selection', correctIdx: 3 },
      { text: 'Cross-validation', correctIdx: 4 },
      { text: 'Deploy as API', correctIdx: 5 },
      { text: 'Monitor for drift', correctIdx: 6 },
      { text: 'Set up retraining pipeline', correctIdx: 7 }
    ];
    items = shuffleArr(activities);
  } else {
    document.getElementById('seq-instruction').innerText = 'Given a failure scenario, order the corrective actions.';
    const items3 = [
      { text: 'Detect model performance drop', correctIdx: 0 },
      { text: 'Investigate root cause (drift vs bug)', correctIdx: 1 },
      { text: 'Gather recent production data', correctIdx: 2 },
      { text: 'Retrain model on updated data', correctIdx: 3 },
      { text: 'Evaluate new model against baseline', correctIdx: 4 },
      { text: 'Canary deploy the updated model', correctIdx: 5 }
    ];
    items = shuffleArr(items3);
  }

  seqState.items = items;
  let dragSrcIdx = null;

  items.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'seq-item';
    el.draggable = true;
    el.innerHTML = `<span class="seq-grip">☰</span><span class="seq-num">${idx + 1}</span><span>${item.text}</span>`;
    el.dataset.idx = idx;

    el.addEventListener('dragstart', (e) => {
      dragSrcIdx = idx;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => { el.classList.remove('drag-over'); });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const targetIdx = parseInt(el.dataset.idx);
      if (dragSrcIdx !== null && dragSrcIdx !== targetIdx) {
        // Swap items
        const temp = seqState.items[dragSrcIdx];
        seqState.items[dragSrcIdx] = seqState.items[targetIdx];
        seqState.items[targetIdx] = temp;
        renderSeqBoard();
      }
    });

    // Touch support
    el.addEventListener('touchstart', (e) => {
      dragSrcIdx = idx;
      el.classList.add('dragging');
    }, { passive: true });
    el.addEventListener('touchend', () => {
      el.classList.remove('dragging');
      // Find element under touch
      const allItems = board.querySelectorAll('.seq-item');
      allItems.forEach((target, tIdx) => {
        target.classList.remove('drag-over');
      });
    });

    board.appendChild(el);
  });
}

function renderSeqBoard() {
  const board = document.getElementById('seq-board');
  const children = board.querySelectorAll('.seq-item');
  children.forEach((el, idx) => {
    el.dataset.idx = idx;
    el.querySelector('.seq-num').innerText = idx + 1;
    const item = seqState.items[idx];
    el.querySelector('span:last-child').innerText = item.text;
    el.classList.remove('seq-correct', 'seq-wrong');
  });
}

function checkSeqOrder() {
  const board = document.getElementById('seq-board');
  const children = board.querySelectorAll('.seq-item');
  let correct = 0;

  seqState.items.forEach((item, idx) => {
    const el = children[idx];
    if (item.correctIdx === idx) {
      el.classList.add('seq-correct');
      correct++;
    } else {
      el.classList.add('seq-wrong');
    }
  });

  seqState.totalCorrect += correct;
  seqState.totalAttempts += seqState.items.length;

  const pts = correct * 15;
  const perfectBonus = correct === seqState.items.length ? 30 : 0;
  seqState.score += pts + perfectBonus;
  document.getElementById('seq-score').innerText = `${seqState.score} pts`;

  const feedback = document.getElementById('seq-feedback');
  feedback.classList.remove('hidden');

  if (correct === seqState.items.length) {
    feedback.innerHTML = `✅ Perfect! All ${correct} in the right order. +${pts + perfectBonus} pts (includes 30pt perfect bonus)`;
  } else {
    feedback.innerHTML = `${correct}/${seqState.items.length} correct · +${pts} pts<br><span style="color:var(--text-muted)">Green = correct position, Red = wrong position</span>`;
  }

  document.getElementById('seq-check-btn').classList.add('hidden');

  if (seqState.level < 3) {
    document.getElementById('seq-next-btn').classList.remove('hidden');
  } else {
    // Game over
    saveGameScore('sequencer', seqState.score);
    document.getElementById('seq-restart-btn').classList.remove('hidden');
    const result = document.getElementById('seq-result');
    result.classList.remove('hidden');
    result.innerHTML = `
      <h3>🔄 Sequencer Complete!</h3>
      <div class="final-game-score" style="color:#8b5cf6;">${seqState.score} pts</div>
      <div class="game-stats">${seqState.totalCorrect}/${seqState.totalAttempts} items placed correctly across 3 levels</div>
    `;
    renderHighScores();
  }
}

// ─── GAME 4: CONCEPT MINESWEEPER ───────────────────────────────────────────
let minesState = {};

function startMinesweeper() {
  const screen = document.getElementById('game-mines-screen');
  showScreen(screen);

  const rounds = shuffleArr(MINE_CATEGORIES).slice(0, 3);
  minesState = { rounds, round: 0, score: 0, totalCorrectPicks: 0, totalWrongPicks: 0 };
  loadMinesRound();
}

function loadMinesRound() {
  const r = minesState.rounds[minesState.round];
  const grid = document.getElementById('mines-grid');
  const feedback = document.getElementById('mines-feedback');
  const submitBtn = document.getElementById('mines-submit-btn');
  const nextBtn = document.getElementById('mines-next-btn');
  const restartBtn = document.getElementById('mines-restart-btn');
  const resultEl = document.getElementById('mines-result');

  grid.innerHTML = '';
  feedback.classList.add('hidden');
  resultEl.classList.add('hidden');
  submitBtn.classList.remove('hidden');
  nextBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');

  document.getElementById('mines-round').innerText = `Round ${minesState.round + 1}/3`;
  document.getElementById('mines-score').innerText = `${minesState.score} pts`;
  document.getElementById('mines-category').innerText = r.name;

  // Pick 5 correct + 7 wrong = 12 cells
  const correctItems = shuffleArr(r.correct).slice(0, 5);
  const wrongItems = shuffleArr(r.wrong).slice(0, 7);
  const allCells = shuffleArr([...correctItems.map(t => ({ text: t, isCorrect: true })), ...wrongItems.map(t => ({ text: t, isCorrect: false }))]);

  minesState.currentCells = allCells;

  allCells.forEach((cell, idx) => {
    const el = document.createElement('div');
    el.className = 'mines-cell';
    el.innerText = cell.text;
    el.dataset.idx = idx;
    el.addEventListener('click', () => {
      if (el.classList.contains('mines-revealed')) return;
      el.classList.toggle('mines-selected');
    });
    grid.appendChild(el);
  });
}

function submitMinesPicks() {
  const grid = document.getElementById('mines-grid');
  const cells = grid.querySelectorAll('.mines-cell');
  let roundCorrect = 0;
  let roundWrong = 0;

  cells.forEach((el, idx) => {
    const cell = minesState.currentCells[idx];
    const wasSelected = el.classList.contains('mines-selected');
    el.classList.add('mines-revealed');
    el.classList.remove('mines-selected');

    if (wasSelected && cell.isCorrect) {
      el.classList.add('mines-correct');
      roundCorrect++;
    } else if (wasSelected && !cell.isCorrect) {
      el.classList.add('mines-wrong');
      roundWrong++;
    } else if (!wasSelected && cell.isCorrect) {
      el.classList.add('mines-missed');
    }
  });

  const pts = (roundCorrect * 10) - (roundWrong * 15);
  minesState.score += Math.max(0, pts);
  minesState.totalCorrectPicks += roundCorrect;
  minesState.totalWrongPicks += roundWrong;
  document.getElementById('mines-score').innerText = `${minesState.score} pts`;

  const feedback = document.getElementById('mines-feedback');
  feedback.classList.remove('hidden');
  const totalCorrectAvail = minesState.currentCells.filter(c => c.isCorrect).length;
  const missed = totalCorrectAvail - roundCorrect;
  feedback.innerHTML = `✅ ${roundCorrect} correct picks · ❌ ${roundWrong} wrong picks · ⚠️ ${missed} missed · ${pts >= 0 ? '+' : ''}${pts} pts`;

  document.getElementById('mines-submit-btn').classList.add('hidden');

  if (minesState.round < 2) {
    document.getElementById('mines-next-btn').classList.remove('hidden');
  } else {
    // Game over
    saveGameScore('mines', minesState.score);
    document.getElementById('mines-restart-btn').classList.remove('hidden');
    const result = document.getElementById('mines-result');
    result.classList.remove('hidden');
    result.innerHTML = `
      <h3>💣 Minesweeper Complete!</h3>
      <div class="final-game-score" style="color:#ec4899;">${minesState.score} pts</div>
      <div class="game-stats">${minesState.totalCorrectPicks} correct picks · ${minesState.totalWrongPicks} wrong picks across 3 rounds</div>
    `;
    renderHighScores();
  }
}

// ─── GAME EVENT LISTENERS ──────────────────────────────────────────────────
document.getElementById('game-term-matcher').addEventListener('click', startTermMatcher);
document.getElementById('game-rapid-fire').addEventListener('click', startRapidFire);
document.getElementById('game-phase-seq').addEventListener('click', startPhaseSequencer);
document.getElementById('game-minesweeper').addEventListener('click', startMinesweeper);

// Matcher
document.getElementById('matcher-home-btn').addEventListener('click', () => { clearInterval(matcherState.timerInterval); showScreen(startScreen); renderHighScores(); });
document.getElementById('matcher-restart-btn').addEventListener('click', startTermMatcher);

// Rapid Fire
document.getElementById('rapid-home-btn').addEventListener('click', () => { clearInterval(rapidState.timerInterval); rapidState.done = true; showScreen(startScreen); renderHighScores(); });
document.getElementById('rapid-restart-btn').addEventListener('click', startRapidFire);

// Sequencer
document.getElementById('seq-home-btn').addEventListener('click', () => { showScreen(startScreen); renderHighScores(); });
document.getElementById('seq-check-btn').addEventListener('click', checkSeqOrder);
document.getElementById('seq-next-btn').addEventListener('click', () => {
  seqState.level++;
  loadSeqLevel();
});
document.getElementById('seq-restart-btn').addEventListener('click', startPhaseSequencer);

// Minesweeper
document.getElementById('mines-home-btn').addEventListener('click', () => { showScreen(startScreen); renderHighScores(); });
document.getElementById('mines-submit-btn').addEventListener('click', submitMinesPicks);
document.getElementById('mines-next-btn').addEventListener('click', () => {
  minesState.round++;
  loadMinesRound();
});
document.getElementById('mines-restart-btn').addEventListener('click', startMinesweeper);

// Render high scores on load
renderHighScores();

// ─── INIT ───────────────────────────────────────────────────────────────────
loadQuestions();
