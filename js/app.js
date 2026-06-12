import {
  authenticate,
  clearUserData,
  createUser,
  ensureDemoUser,
  exportUserData,
  getAttempts,
  getBookmarks,
  getUser,
  removeBookmark,
  saveAttempt,
  saveBookmark,
  updateUserProgress
} from "./db.js";
import {
  allQuestions,
  domainOrder,
  questionById,
  scenarioQuestions,
  systemsQuestions
} from "./questions.js";

const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const routeView = document.querySelector("#route-view");
const modalRoot = document.querySelector("#modal-root");
const toastRegion = document.querySelector("#toast-region");
const appFooter = document.querySelector("#app-footer");

const state = {
  currentUser: null,
  attempts: [],
  bookmarks: [],
  activeExam: null,
  lastResult: null,
  route: "dashboard",
  labTab: "monitor",
  selectedMessage: null,
  timer: null,
  installPrompt: null
};

const labData = {
  messages: [
    { id: "AF2D9A8C", flow: "Employee_Master_Sync", sender: "SuccessFactors", receiver: "S/4HANA", status: "Failed", time: "09:42:17", duration: "1.8 s", code: "401", detail: "OAuth token rejected: required scope employee.write is missing.", correlation: "EMP-2026-0612-8841" },
    { id: "7C11E4B0", flow: "Sales_Order_Replicate", sender: "S/4HANA", receiver: "Commerce Cloud", status: "Completed", time: "09:41:52", duration: "840 ms", code: "200", detail: "Message completed successfully.", correlation: "SO-48001921" },
    { id: "D9082F61", flow: "Supplier_Invoice_Inbound", sender: "Partner SFTP", receiver: "S/4HANA", status: "Retrying", time: "09:39:04", duration: "12.4 s", code: "503", detail: "Receiver temporarily unavailable. Retry 2 of 5 scheduled.", correlation: "INV-991840" },
    { id: "B44A16D2", flow: "Customer_Event_Publish", sender: "CRM", receiver: "Event Mesh", status: "Completed", time: "09:37:29", duration: "212 ms", code: "202", detail: "Event accepted by topic queue.", correlation: "CUST-310088" },
    { id: "32FF10A9", flow: "Product_Catalog_API", sender: "API Management", receiver: "S/4HANA", status: "Failed", time: "09:34:08", duration: "30.0 s", code: "504", detail: "HTTP receiver timeout after 30 seconds.", correlation: "API-218771" }
  ],
  artifacts: [
    { name: "Employee Master Sync", type: "Integration Flow", package: "Hire to Retire", status: "Started", version: "2.4.1" },
    { name: "Sales Order Replication", type: "Integration Flow", package: "Lead to Cash", status: "Started", version: "5.1.0" },
    { name: "Supplier Invoice Inbound", type: "Integration Flow", package: "Source to Pay", status: "Started", version: "3.7.2" },
    { name: "Product Catalog API", type: "Integration Flow", package: "Digital Commerce", status: "Started", version: "1.8.0" },
    { name: "Customer Event Publisher", type: "Integration Flow", package: "Customer Domain", status: "Started", version: "2.0.4" },
    { name: "Partner AS4 Gateway", type: "Integration Flow", package: "B2B Network", status: "Draft", version: "0.9.3" }
  ],
  apis: [
    { name: "Customer API v2", type: "REST", package: "Customer Experience", status: "Published", version: "2.2", description: "Governed customer profile and status endpoint." },
    { name: "Product Availability", type: "OData", package: "Digital Commerce", status: "Published", version: "1.4", description: "Near-real-time stock availability by location." },
    { name: "Supplier Onboarding", type: "REST", package: "Source to Pay", status: "Draft", version: "0.8", description: "Partner onboarding workflow API." }
  ],
  security: [
    { name: "SF_OAUTH_CLIENT", type: "OAuth2 Client Credentials", status: "Deployed", detail: "Last updated 8 days ago" },
    { name: "PARTNER_SFTP_KEY", type: "SSH Key", status: "Deployed", detail: "Expires in 148 days" },
    { name: "CORPORATE_CA_2026", type: "Certificate", status: "Deployed", detail: "Trusted root certificate" },
    { name: "S4_TECHNICAL_USER", type: "User Credentials", status: "Deployed", detail: "Rotated 21 days ago" }
  ]
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindGlobalEvents();
  try {
    await ensureDemoUser();
    const storedUsername = localStorage.getItem("flowforge.currentUser");
    if (storedUsername) {
      const user = await getUser(storedUsername);
      if (user) {
        const { hash, salt, ...safeUser } = user;
        await enterApp(safeUser, false);
        return;
      }
    }
  } catch (error) {
    toast("The local database could not be opened.", "error");
    console.error(error);
  }
  showAuth();
}

function bindGlobalEvents() {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });

  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".password-wrap").querySelector("input");
      input.type = input.type === "password" ? "text" : "password";
      button.setAttribute("aria-label", input.type === "password" ? "Show password" : "Hide password");
    });
  });

  document.querySelector("#demo-fill").addEventListener("click", () => {
    document.querySelector("#login-username").value = "architect";
    document.querySelector("#login-password").value = "Forge123!";
  });

  document.querySelector("#login-form").addEventListener("submit", handleLogin);
  document.querySelector("#register-form").addEventListener("submit", handleRegister);
  document.querySelector("#logout-button").addEventListener("click", logout);
  document.querySelector("#profile-button").addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelector("#profile-menu").classList.toggle("hidden");
  });
  document.addEventListener("click", () => document.querySelector("#profile-menu")?.classList.add("hidden"));

  document.querySelector("#mobile-menu").addEventListener("click", toggleSidebar);
  document.querySelector("#sidebar-scrim").addEventListener("click", closeSidebar);

  document.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      navigate(element.dataset.route);
    });
  });

  routeView.addEventListener("click", handleRouteClick);
  routeView.addEventListener("input", handleRouteInput);
  modalRoot.addEventListener("click", handleModalClick);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installPrompt = event;
    document.querySelector("#install-app").classList.remove("hidden");
  });

  document.querySelector("#install-app").addEventListener("click", installApp);
  window.addEventListener("beforeunload", persistActiveExam);

  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(location.hostname);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http") && !isLocalDevelopment) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("Service worker registration failed", error));
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    const active = button.dataset.authTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelector("#login-form").classList.toggle("hidden", tab !== "login");
  document.querySelector("#register-form").classList.toggle("hidden", tab !== "register");
}

async function handleLogin(event) {
  event.preventDefault();
  const username = document.querySelector("#login-username").value;
  const password = document.querySelector("#login-password").value;
  const submit = event.submitter;
  setButtonBusy(submit, true, "Signing in...");
  try {
    const user = await authenticate(username, password);
    if (!user) {
      toast("Username or password is incorrect.", "error");
      return;
    }
    if (document.querySelector("#remember-user").checked) {
      localStorage.setItem("flowforge.rememberedUser", user.username);
    } else {
      localStorage.removeItem("flowforge.rememberedUser");
    }
    await enterApp(user);
    toast(`Welcome back, ${firstName(user.displayName)}.`, "success");
  } catch (error) {
    toast(error.message || "Sign in failed.", "error");
  } finally {
    setButtonBusy(submit, false, "Sign in to FlowForge");
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (data.get("password") !== data.get("confirmPassword")) {
    toast("The passwords do not match.", "error");
    return;
  }
  const submit = event.submitter;
  setButtonBusy(submit, true, "Creating account...");
  try {
    const user = await createUser({
      displayName: data.get("displayName"),
      username: data.get("username"),
      email: data.get("email"),
      password: data.get("password")
    });
    form.reset();
    await enterApp(user);
    toast("Your local FlowForge account is ready.", "success");
  } catch (error) {
    toast(error.message || "Account creation failed.", "error");
  } finally {
    setButtonBusy(submit, false, "Create account");
  }
}

async function enterApp(user, announce = true) {
  state.currentUser = user;
  localStorage.setItem("flowforge.currentUser", user.username);
  state.attempts = await getAttempts(user.username);
  state.bookmarks = await getBookmarks(user.username);
  state.activeExam = loadActiveExam();
  updateUserShell();
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  navigate("dashboard", false);
  if (announce) routeView.focus();
}

function showAuth() {
  authView.classList.remove("hidden");
  appView.classList.add("hidden");
  const remembered = localStorage.getItem("flowforge.rememberedUser");
  if (remembered) document.querySelector("#login-username").value = remembered;
}

function logout() {
  stopTimer();
  persistActiveExam();
  state.currentUser = null;
  state.attempts = [];
  state.bookmarks = [];
  state.activeExam = null;
  localStorage.removeItem("flowforge.currentUser");
  document.querySelector("#profile-menu").classList.add("hidden");
  showAuth();
  toast("You have signed out.");
}

function updateUserShell() {
  const name = state.currentUser.displayName || state.currentUser.username;
  const xp = calculateXp();
  const rank = rankForXp(xp);
  document.querySelector("#header-name").textContent = name;
  document.querySelector("#header-rank").textContent = rank.name;
  document.querySelector("#header-avatar").textContent = initials(name);
  const readiness = calculateReadiness();
  document.querySelector("#sidebar-readiness").textContent = `${readiness}%`;
  document.querySelector("#sidebar-ring").style.setProperty("--progress", `${readiness}%`);
  updateUserProgress(state.currentUser.username, xp).catch(console.error);
}

function navigate(route, updateFocus = true) {
  if (state.route === "exam" && route !== "exam" && state.activeExam && !state.activeExam.completed) {
    persistActiveExam();
    stopTimer();
  }
  state.route = route;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.route === route));
  appView.classList.toggle("exam-mode", route === "exam");
  appFooter.classList.toggle("hidden", route === "exam");
  closeSidebar();
  renderRoute();
  if (updateFocus) routeView.focus();
}

function renderRoute() {
  const routes = {
    dashboard: renderDashboard,
    exams: renderExamCenter,
    exam: renderExam,
    results: renderResults,
    history: renderHistory,
    bookmarks: renderBookmarks,
    lab: renderLab,
    profile: renderProfile
  };
  (routes[state.route] || renderDashboard)();
}

function renderDashboard() {
  const xp = calculateXp();
  const rank = rankForXp(xp);
  const readiness = calculateReadiness();
  const best = state.attempts.length ? Math.max(...state.attempts.map((attempt) => attempt.score)) : 0;
  const average = state.attempts.length ? Math.round(state.attempts.reduce((sum, attempt) => sum + attempt.score, 0) / state.attempts.length) : 0;
  const latest = state.attempts.slice(0, 4);
  const domainStats = aggregateDomainStats();
  const active = state.activeExam && !state.activeExam.completed;

  routeView.innerHTML = `
    <div class="page">
      <section class="hero-banner">
        <div class="hero-copy">
          <span class="eyebrow light">${escapeHtml(rank.name)} · ${xp.toLocaleString()} XP</span>
          <h1>${greeting()}, ${escapeHtml(firstName(state.currentUser.displayName))}.</h1>
          <p>${active ? "Your practical exam is saved and ready to continue." : "Build confidence through practical system decisions and realistic integration scenarios."}</p>
          <div class="hero-actions">
            ${active ? `<button class="button button-primary" data-action="resume-exam"><span class="icon icon-play"></span>Resume ${escapeHtml(examTitle(state.activeExam.type))}</button>` : `<button class="button button-primary" data-action="open-exam" data-type="systems"><span class="icon icon-play"></span>Start system exam</button>`}
            <button class="button button-secondary" data-route-action="exams">Explore exam center</button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="readiness-ring" style="--progress:${readiness}%">
            <div class="ring-copy"><strong>${readiness}%</strong><span>Readiness</span></div>
          </div>
        </div>
      </section>

      <section class="metrics-grid" aria-label="Performance summary">
        ${metricCard("target", "Readiness score", `${readiness}%`, "")}
        ${metricCard("trophy", "Best attempt", `${best}%`, "success")}
        ${metricCard("exam", "Average score", `${average}%`, "violet")}
        ${metricCard("fire", "Experience", `${xp.toLocaleString()} XP`, "warning")}
      </section>

      <section class="dashboard-grid">
        <div class="card">
          <div class="card-header">
            <div><h2>Practice workspace</h2><p>Choose a practical format and train under exam conditions.</p></div>
            <button class="card-link" data-route-action="exams">View all</button>
          </div>
          <div class="exam-list">
            ${dashboardExamRow("systems", "System-based practical", "Navigate architecture, configuration, security, and operations decisions.", "59 questions · 120 min")}
            ${dashboardExamRow("scenario", "Scenario-based practical", "Reason through realistic projects, incidents, and design trade-offs.", "59 questions · 120 min")}
            ${dashboardExamRow("mixed", "Adaptive mixed challenge", "A randomized balance of system knowledge and project scenarios.", "59 questions · 120 min")}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div><h2>Recent activity</h2><p>Your latest saved attempts.</p></div>
            <button class="card-link" data-route-action="history">History</button>
          </div>
          ${latest.length ? `<div class="activity-list">${latest.map(activityItem).join("")}</div>` : emptyState("history", "No completed attempts yet", "Complete an exam to unlock score trends and domain analytics.")}
        </div>

        <div class="card">
          <div class="card-header">
            <div><h2>Domain readiness</h2><p>Calculated from all answered exam questions.</p></div>
          </div>
          ${domainStats.length ? `<div class="domain-list">${domainStats.map(domainRow).join("")}</div>` : emptyState("target", "Awaiting calibration", "Your domain profile appears after your first completed attempt.")}
        </div>

        <div class="card">
          <div class="card-header">
            <div><h2>Forge briefing</h2><p>How this simulator is designed.</p></div>
          </div>
          <div class="info-strip"><span class="icon icon-info"></span><span>The 118 questions are original practice content aligned to Integration Suite learning areas. They are not copied SAP certification questions.</span></div>
          <div class="domain-list">
            ${briefingRow("System tasks", "59", "Architecture, configuration, mapping, security, adapters, and operations")}
            ${briefingRow("Project scenarios", "59", "Applied decisions in realistic enterprise contexts")}
            ${briefingRow("Private database", "On device", "Accounts, attempts, bookmarks, and active exams remain local")}
          </div>
        </div>
      </section>
    </div>`;
}

function renderExamCenter() {
  routeView.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div>
          <span class="eyebrow">Practice catalog</span>
          <h1>Exam center</h1>
          <p>Full simulations contain 59 questions. Quick drills are also available from the setup dialog, and every session is randomized.</p>
        </div>
        ${state.activeExam && !state.activeExam.completed ? `<button class="button button-primary" data-action="resume-exam"><span class="icon icon-play"></span>Resume saved exam</button>` : ""}
      </header>
      <div class="info-strip"><span class="icon icon-info"></span><span>SAP announced a transition toward practical, system-based tasks and roleplay scenarios. FlowForge mirrors that style as an independent preparation experience.</span></div>
      <section class="exam-catalog">
        ${examCatalogCard("systems", "System-based practical", "Work through configuration, modeling, security, connectivity, and operational choices.", "Core bank", "blue")}
        ${examCatalogCard("scenario", "Scenario-based practical", "Act as the integration developer on realistic implementation and incident situations.", "Applied bank", "violet")}
        ${examCatalogCard("mixed", "Adaptive mixed challenge", "Combine both banks in a balanced randomized simulation for final readiness checks.", "Dynamic", "green")}
      </section>
      <section class="card" style="margin-top:1.2rem">
        <div class="card-header"><div><h2>Coverage map</h2><p>Every exam draws from the same seven Integration Suite competency areas.</p></div></div>
        <div class="domain-list">
          ${domainOrder.map((domain) => {
            const count = allQuestions.filter((question) => question.domain === domain).length;
            return briefingRow(domain, `${count} items`, domainDescription(domain));
          }).join("")}
        </div>
      </section>
    </div>`;
}

function openExamSetup(type) {
  const title = examTitle(type);
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <header class="modal-header">
          <h2 id="setup-title">${escapeHtml(title)}</h2>
          <button class="icon-button" data-modal-close aria-label="Close"><span class="icon icon-close"></span></button>
        </header>
        <form id="exam-setup-form" data-type="${type}">
          <div class="modal-body">
            <p style="margin-top:0;color:var(--muted);font-size:.8rem;line-height:1.5">Configure this attempt. The full 59-question format is selected by default.</p>
            <div class="setup-summary">
              <div><strong>${type === "mixed" ? "118" : "59"}</strong><span>Available items</span></div>
              <div><strong>7</strong><span>Skill domains</span></div>
              <div><strong>65%</strong><span>Practice target</span></div>
            </div>
            <label class="field">
              <span>Session length</span>
              <select name="count">
                <option value="59">Full simulation · 59 questions</option>
                <option value="20">Focused practice · 20 questions</option>
                <option value="10">Quick drill · 10 questions</option>
              </select>
            </label>
            <label class="field" style="margin-top:.85rem">
              <span>Time limit</span>
              <select name="duration">
                <option value="120">120 minutes</option>
                <option value="90">90 minutes</option>
                <option value="60">60 minutes</option>
                <option value="0">Untimed practice</option>
              </select>
            </label>
            <div class="setting-row">
              <div class="setting-copy"><strong>Randomize answer choices</strong><span>Each question keeps the same answer but presents choices in a new order.</span></div>
              <label class="switch"><input name="randomizeOptions" type="checkbox" checked><span class="switch-track"></span></label>
            </div>
            <div class="setting-row">
              <div class="setting-copy"><strong>Confirm before final submission</strong><span>Review unanswered and flagged counts before grading.</span></div>
              <label class="switch"><input name="confirmSubmit" type="checkbox" checked><span class="switch-track"></span></label>
            </div>
          </div>
          <footer class="modal-footer">
            <button class="button button-secondary" type="button" data-modal-close>Cancel</button>
            <button class="button button-primary" type="submit">Begin exam</button>
          </footer>
        </form>
      </section>
    </div>`;
}

function startExam(type, settings) {
  if (state.activeExam && !state.activeExam.completed) {
    const replace = confirm("Starting a new exam will replace your currently saved session. Continue?");
    if (!replace) return;
  }

  const count = Number(settings.count);
  const pool = type === "systems"
    ? systemsQuestions
    : type === "scenario"
      ? scenarioQuestions
      : balancedMixedPool();
  const selected = shuffle([...pool]).slice(0, count);
  const durationMinutes = Number(settings.duration);
  const now = Date.now();
  state.activeExam = {
    id: `attempt-${now}-${Math.random().toString(16).slice(2)}`,
    type,
    title: examTitle(type),
    questions: selected.map((question) => ({
      id: question.id,
      optionOrder: settings.randomizeOptions ? shuffle([0, 1, 2, 3]) : [0, 1, 2, 3]
    })),
    answers: {},
    flags: [],
    current: 0,
    startedAt: new Date(now).toISOString(),
    deadline: durationMinutes ? now + durationMinutes * 60 * 1000 : null,
    durationMinutes,
    confirmSubmit: settings.confirmSubmit,
    completed: false
  };
  persistActiveExam();
  closeModal();
  navigate("exam");
  toast("Exam started. Your progress saves automatically.", "success");
}

function renderExam() {
  if (!state.activeExam || state.activeExam.completed) {
    navigate("exams");
    return;
  }
  const exam = state.activeExam;
  exam.current = clamp(exam.current, 0, exam.questions.length - 1);
  const entry = exam.questions[exam.current];
  const question = questionById(entry.id);
  const selectedAnswer = exam.answers[question.id];
  const answered = Object.keys(exam.answers).length;
  const flagged = exam.flags.length;
  const progress = Math.round(((exam.current + 1) / exam.questions.length) * 100);

  routeView.innerHTML = `
    <div class="exam-shell">
      <header class="exam-toolbar">
        <div class="exam-toolbar-copy">
          <strong>${escapeHtml(exam.title)}</strong>
          <span>Candidate: ${escapeHtml(state.currentUser.displayName)}</span>
        </div>
        <div class="exam-progress-wrap">
          <div class="exam-progress-label"><span>Question ${exam.current + 1} of ${exam.questions.length}</span><span>${progress}% viewed</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>
        <div class="timer-box" id="timer-box">
          <span class="icon icon-clock"></span>
          <div><small>Time remaining</small><strong id="exam-timer">${formatRemaining()}</strong></div>
        </div>
      </header>

      <div class="exam-workspace">
        <main class="question-stage">
          <article class="question-card">
            <div class="question-meta">
              <span class="tag">${escapeHtml(question.domain)}</span>
              <span class="tag neutral">${question.kind === "systems" ? "System task" : "Project scenario"}</span>
              <span class="tag ${question.difficulty === "Advanced" ? "difficulty-advanced" : "neutral"}">${escapeHtml(question.difficulty)}</span>
            </div>
            ${question.context ? `<div class="scenario-context"><strong>Project context</strong><br>${escapeHtml(question.context)}</div>` : ""}
            <h1>${escapeHtml(question.prompt)}</h1>
            <p class="question-instruction">Select the best answer.</p>
            <div class="answer-list" role="radiogroup" aria-label="Answer choices">
              ${entry.optionOrder.map((optionIndex, displayIndex) => {
                const selected = selectedAnswer === optionIndex;
                return `<button class="answer-option ${selected ? "selected" : ""}" data-action="select-answer" data-option="${optionIndex}" role="radio" aria-checked="${selected}">
                  <span class="answer-key">${String.fromCharCode(65 + displayIndex)}</span>
                  <span>${escapeHtml(question.options[optionIndex])}</span>
                </button>`;
              }).join("")}
            </div>
          </article>
        </main>
        <aside class="question-sidebar">
          <div class="navigator-heading"><strong>Question navigator</strong><span class="pill">${exam.questions.length}</span></div>
          <div class="navigator-summary">
            <div><strong>${answered}</strong><span>Answered</span></div>
            <div><strong>${exam.questions.length - answered}</strong><span>Remaining</span></div>
            <div><strong>${flagged}</strong><span>Flagged</span></div>
          </div>
          <div class="question-grid">
            ${exam.questions.map((item, index) => {
              const isAnswered = Object.hasOwn(exam.answers, item.id);
              const isFlagged = exam.flags.includes(item.id);
              return `<button class="question-number ${isAnswered ? "answered" : ""} ${isFlagged ? "flagged" : ""} ${index === exam.current ? "current" : ""}" data-action="goto-question" data-index="${index}" aria-label="Question ${index + 1}">${index + 1}</button>`;
            }).join("")}
          </div>
          <div class="navigator-legend">
            <span class="legend-item"><span class="legend-dot current"></span>Current</span>
            <span class="legend-item"><span class="legend-dot answered"></span>Answered</span>
            <span class="legend-item"><span class="legend-dot"></span>Not answered</span>
            <span class="legend-item"><span class="legend-dot flagged"></span>Flagged</span>
          </div>
        </aside>
      </div>

      <footer class="exam-footer">
        <button class="button button-secondary" data-action="previous-question" ${exam.current === 0 ? "disabled" : ""}><span class="icon icon-chevron-left"></span><span class="label-optional">Previous</span></button>
        <button class="button button-secondary flag-button ${exam.flags.includes(question.id) ? "active" : ""}" data-action="toggle-flag"><span class="icon icon-flag"></span><span class="label-optional">${exam.flags.includes(question.id) ? "Flagged" : "Flag for review"}</span></button>
        <button class="button button-ghost" data-action="exit-exam">Save &amp; exit</button>
        ${exam.current === exam.questions.length - 1
          ? `<button class="button button-primary" data-action="submit-exam">Review &amp; submit</button>`
          : `<button class="button button-primary" data-action="next-question">Next<span class="icon icon-chevron-right"></span></button>`}
      </footer>
    </div>`;

  startTimer();
}

function selectAnswer(option) {
  const exam = state.activeExam;
  const questionId = exam.questions[exam.current].id;
  exam.answers[questionId] = Number(option);
  persistActiveExam();
  renderExam();
}

function moveQuestion(offset) {
  state.activeExam.current = clamp(state.activeExam.current + offset, 0, state.activeExam.questions.length - 1);
  persistActiveExam();
  renderExam();
}

function toggleFlag() {
  const exam = state.activeExam;
  const id = exam.questions[exam.current].id;
  exam.flags = exam.flags.includes(id) ? exam.flags.filter((item) => item !== id) : [...exam.flags, id];
  persistActiveExam();
  renderExam();
}

function requestSubmit() {
  const exam = state.activeExam;
  const unanswered = exam.questions.filter((item) => !Object.hasOwn(exam.answers, item.id)).length;
  if (!exam.confirmSubmit) {
    completeExam();
    return;
  }
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
        <header class="modal-header"><h2 id="submit-title">Submit exam?</h2><button class="icon-button" data-modal-close aria-label="Close"><span class="icon icon-close"></span></button></header>
        <div class="modal-body">
          <p style="margin-top:0;color:var(--muted);line-height:1.5">After submission, this attempt will be graded and cannot be changed.</p>
          <div class="setup-summary">
            <div><strong>${Object.keys(exam.answers).length}</strong><span>Answered</span></div>
            <div><strong>${unanswered}</strong><span>Unanswered</span></div>
            <div><strong>${exam.flags.length}</strong><span>Flagged</span></div>
          </div>
          ${unanswered ? `<div class="info-strip"><span class="icon icon-info"></span><span>You still have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Unanswered items are scored as incorrect.</span></div>` : ""}
        </div>
        <footer class="modal-footer">
          <button class="button button-secondary" data-modal-close>Return to exam</button>
          <button class="button button-primary" data-action="confirm-submit">Submit and grade</button>
        </footer>
      </section>
    </div>`;
}

async function completeExam(autoSubmitted = false) {
  const exam = state.activeExam;
  if (!exam || exam.completed) return;
  stopTimer();
  const results = exam.questions.map((entry) => {
    const question = questionById(entry.id);
    const selected = exam.answers[entry.id];
    return {
      questionId: entry.id,
      selected: Number.isInteger(selected) ? selected : null,
      correct: Number.isInteger(selected) && selected === question.answer,
      domain: question.domain
    };
  });
  const correct = results.filter((result) => result.correct).length;
  const score = Math.round((correct / results.length) * 100);
  const domainStats = domainOrder.map((domain) => {
    const items = results.filter((result) => result.domain === domain);
    if (!items.length) return null;
    const domainCorrect = items.filter((result) => result.correct).length;
    return { domain, correct: domainCorrect, total: items.length, score: Math.round((domainCorrect / items.length) * 100) };
  }).filter(Boolean);
  const completedAt = new Date().toISOString();
  const elapsedSeconds = exam.durationMinutes
    ? Math.max(0, exam.durationMinutes * 60 - Math.max(0, Math.ceil((exam.deadline - Date.now()) / 1000)))
    : Math.floor((Date.now() - new Date(exam.startedAt).getTime()) / 1000);
  const attempt = {
    id: exam.id,
    username: state.currentUser.username,
    type: exam.type,
    title: exam.title,
    questionCount: exam.questions.length,
    correct,
    incorrect: results.length - correct,
    unanswered: results.filter((result) => result.selected === null).length,
    score,
    passed: score >= 65,
    autoSubmitted,
    startedAt: exam.startedAt,
    completedAt,
    durationSeconds: elapsedSeconds,
    answers: results,
    domainStats
  };
  exam.completed = true;
  state.lastResult = attempt;
  await saveAttempt(attempt);
  state.attempts = await getAttempts(state.currentUser.username);
  clearActiveExamStorage();
  state.activeExam = null;
  closeModal();
  updateUserShell();
  navigate("results");
  toast(autoSubmitted ? "Time expired. Your exam was submitted." : "Exam graded and saved.", autoSubmitted ? "warning" : "success");
}

function renderResults() {
  const attempt = state.lastResult || state.attempts[0];
  if (!attempt) {
    navigate("history");
    return;
  }
  const statusText = attempt.score >= 80 ? "Strong performance" : attempt.passed ? "Target achieved" : "Keep forging";
  const reviewQuestions = attempt.answers.map((answer, index) => {
    const question = questionById(answer.questionId);
    const bookmarked = state.bookmarks.some((bookmark) => bookmark.questionId === question.id);
    const status = answer.selected === null ? "blank" : answer.correct ? "correct" : "wrong";
    const statusLabel = answer.selected === null ? "—" : answer.correct ? "✓" : "×";
    return `
      <details class="review-item">
        <summary>
          <span class="review-status ${status}">${statusLabel}</span>
          <span class="review-question">${index + 1}. ${escapeHtml(question.prompt)}</span>
          <span class="tag neutral">${escapeHtml(question.domain)}</span>
        </summary>
        <div class="review-body">
          ${question.context ? `<p><strong>Context:</strong> ${escapeHtml(question.context)}</p>` : ""}
          <p class="review-answer ${answer.correct ? "" : "user-wrong"}">Your answer: <strong>${answer.selected === null ? "Not answered" : escapeHtml(question.options[answer.selected])}</strong></p>
          <p class="review-answer">Correct answer: <strong>${escapeHtml(question.options[question.answer])}</strong></p>
          <p>${escapeHtml(question.rationale)}</p>
          <button class="button button-secondary" data-action="toggle-bookmark" data-question="${question.id}"><span class="icon icon-bookmark"></span>${bookmarked ? "Remove bookmark" : "Bookmark question"}</button>
        </div>
      </details>`;
  }).join("");

  routeView.innerHTML = `
    <div class="page">
      <section class="result-hero">
        <div class="score-ring" style="--progress:${attempt.score}%"><strong>${attempt.score}%</strong></div>
        <div class="result-copy">
          <span class="eyebrow light">${attempt.passed ? "Practice target reached" : "Practice target: 65%"}</span>
          <h1>${statusText}</h1>
          <p>You answered ${attempt.correct} of ${attempt.questionCount} questions correctly in ${formatDuration(attempt.durationSeconds)}.</p>
        </div>
      </section>
      <section class="result-stats">
        ${resultStat("Correct", attempt.correct)}
        ${resultStat("Incorrect", attempt.incorrect - attempt.unanswered)}
        ${resultStat("Unanswered", attempt.unanswered)}
        ${resultStat("XP earned", `+${attempt.correct * 12 + 75}`)}
      </section>
      <section class="dashboard-grid">
        <div class="card">
          <div class="card-header"><div><h2>Domain breakdown</h2><p>Use weaker domains to choose your next drill.</p></div></div>
          <div class="domain-list">${attempt.domainStats.map(domainRow).join("")}</div>
        </div>
        <div class="card">
          <div class="card-header"><div><h2>Next action</h2><p>Keep momentum while the decisions are fresh.</p></div></div>
          <div class="data-actions">
            <button class="button button-primary" data-action="open-exam" data-type="${attempt.type}">Retake this format</button>
            <button class="button button-secondary" data-route-action="lab">Open system lab</button>
            <button class="button button-secondary" data-route-action="history">View attempt history</button>
          </div>
        </div>
      </section>
      <section style="margin-top:1.2rem">
        <div class="card-header"><div><h2>Question review</h2><p>Open any item to compare your answer and read the rationale.</p></div></div>
        <div class="review-list">${reviewQuestions}</div>
      </section>
    </div>`;
}

function renderHistory() {
  routeView.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div><span class="eyebrow">Performance record</span><h1>Attempt history</h1><p>Every completed exam is stored in the browser database for this profile.</p></div>
        <button class="button button-primary" data-route-action="exams">Start another exam</button>
      </header>
      ${state.attempts.length ? `
        <div class="table-card">
          <table class="data-table">
            <thead><tr><th>Exam</th><th>Completed</th><th>Score</th><th>Correct</th><th>Duration</th><th></th></tr></thead>
            <tbody>${state.attempts.map((attempt) => `
              <tr>
                <td><strong>${escapeHtml(attempt.title)}</strong><br><span style="color:var(--muted);font-size:.68rem">${attempt.questionCount} questions</span></td>
                <td>${formatDate(attempt.completedAt)}</td>
                <td><span class="score-chip ${attempt.score >= 75 ? "good" : attempt.score < 50 ? "low" : ""}">${attempt.score}%</span></td>
                <td>${attempt.correct} / ${attempt.questionCount}</td>
                <td>${formatDuration(attempt.durationSeconds)}</td>
                <td><button class="button button-ghost" data-action="view-attempt" data-attempt="${attempt.id}">Review</button></td>
              </tr>`).join("")}</tbody>
          </table>
        </div>` : `<div class="card">${emptyState("history", "No attempts stored", "Start a system or scenario exam to create your first performance record.")}<div style="text-align:center"><button class="button button-primary" data-route-action="exams">Open exam center</button></div></div>`}
    </div>`;
}

function renderBookmarks() {
  const questions = state.bookmarks.map((bookmark) => ({ ...bookmark, question: questionById(bookmark.questionId) })).filter((item) => item.question);
  routeView.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div><span class="eyebrow">Review queue</span><h1>Bookmarks</h1><p>Save difficult or useful questions from your result reviews for targeted revision.</p></div>
      </header>
      ${questions.length ? `<div class="review-list">${questions.map(({ question }) => `
        <details class="review-item">
          <summary><span class="review-status correct"><span class="icon icon-bookmark"></span></span><span class="review-question">${escapeHtml(question.prompt)}</span><span class="tag neutral">${escapeHtml(question.domain)}</span></summary>
          <div class="review-body">
            ${question.context ? `<p><strong>Context:</strong> ${escapeHtml(question.context)}</p>` : ""}
            <p class="review-answer">Correct answer: <strong>${escapeHtml(question.options[question.answer])}</strong></p>
            <p>${escapeHtml(question.rationale)}</p>
            <button class="button button-danger" data-action="toggle-bookmark" data-question="${question.id}">Remove bookmark</button>
          </div>
        </details>`).join("")}</div>` : `<div class="card">${emptyState("bookmark", "No bookmarks yet", "Bookmark questions from the result review after completing an exam.")}</div>`}
    </div>`;
}

function renderLab() {
  const tabs = [
    ["monitor", "monitor", "Monitor"],
    ["design", "design", "Design"],
    ["api", "api", "APIs"],
    ["security", "security", "Security"]
  ];
  routeView.innerHTML = `
    <div class="page page-wide">
      <header class="page-header">
        <div><span class="eyebrow">Virtual tenant</span><h1>Integration Suite system lab</h1><p>Explore a safe simulated workspace modeled after common Integration Suite work areas. No external system is contacted.</p></div>
      </header>
      <div class="lab-layout">
        <nav class="lab-nav" aria-label="System lab areas">
          <strong>Capabilities</strong>
          ${tabs.map(([tab, icon, label]) => `<button class="${state.labTab === tab ? "active" : ""}" data-action="lab-tab" data-tab="${tab}"><span class="icon icon-${icon}"></span>${label}</button>`).join("")}
        </nav>
        <section class="lab-content">${renderLabContent()}</section>
      </div>
    </div>`;
}

function renderLabContent() {
  if (state.labTab === "monitor") {
    const selected = labData.messages.find((message) => message.id === state.selectedMessage);
    return `
      <div class="lab-bar"><strong>Monitor Message Processing</strong><label class="field"><input id="lab-search" placeholder="Search flow or correlation ID"></label></div>
      <div class="lab-body">
        <table class="message-table">
          <thead><tr><th>Status</th><th>Integration flow</th><th>Started</th><th>Duration</th><th>Code</th></tr></thead>
          <tbody id="message-body">${labData.messages.map(messageRow).join("")}</tbody>
        </table>
        ${selected ? messageDetail(selected) : `<div class="empty-state"><span class="icon icon-monitor"></span><strong>Select a message</strong><p>Open a row to inspect processing details, correlation data, and a simulated error log.</p></div>`}
      </div>`;
  }
  if (state.labTab === "design") {
    return `
      <div class="lab-bar"><strong>Design · Integration Packages</strong><button class="button button-primary" style="margin-left:auto" data-action="lab-notice">Create</button></div>
      <div class="lab-body"><div class="artifact-grid">${labData.artifacts.map((item) => artifactCard(item, "design")).join("")}</div></div>`;
  }
  if (state.labTab === "api") {
    return `
      <div class="lab-bar"><strong>Configure APIs</strong><button class="button button-primary" style="margin-left:auto" data-action="lab-notice">Create API</button></div>
      <div class="lab-body"><div class="artifact-grid">${labData.apis.map((item) => artifactCard(item, "api")).join("")}</div></div>`;
  }
  return `
    <div class="lab-bar"><strong>Security Material</strong><button class="button button-primary" style="margin-left:auto" data-action="lab-notice">Add</button></div>
    <div class="lab-body"><div class="artifact-grid">${labData.security.map((item) => artifactCard(item, "security")).join("")}</div></div>`;
}

function renderProfile() {
  const xp = calculateXp();
  const rank = rankForXp(xp);
  const nextProgress = Math.round(((xp - rank.min) / Math.max(1, rank.next - rank.min)) * 100);
  routeView.innerHTML = `
    <div class="page">
      <header class="page-header"><div><span class="eyebrow">Local profile</span><h1>Profile &amp; data</h1><p>Manage your browser-stored learning profile and export a portable backup.</p></div></header>
      <div class="profile-grid">
        <section class="card profile-identity">
          <div class="profile-avatar">${initials(state.currentUser.displayName)}</div>
          <h2>${escapeHtml(state.currentUser.displayName)}</h2>
          <p>@${escapeHtml(state.currentUser.username)}</p>
          <p>${escapeHtml(state.currentUser.email)}</p>
          <div class="rank-bar">
            <div class="domain-label"><strong>${escapeHtml(rank.name)}</strong><span>${xp.toLocaleString()} XP</span></div>
            <div class="progress-track"><div class="progress-fill" style="width:${clamp(nextProgress, 0, 100)}%"></div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><div><h2>Data controls</h2><p>FlowForge uses IndexedDB. Nothing is uploaded by the app.</p></div></div>
          <div class="data-actions">
            <div class="data-action"><div><strong>Export learning data</strong><span>Download your profile, attempts, results, and bookmarks as JSON.</span></div><button class="button button-secondary" data-action="export-data"><span class="icon icon-download"></span>Export</button></div>
            <div class="data-action"><div><strong>Clear learning history</strong><span>Delete attempts, bookmarks, and any active exam while keeping your account.</span></div><button class="button button-danger" data-action="clear-data"><span class="icon icon-trash"></span>Clear data</button></div>
            <div class="data-action"><div><strong>Database status</strong><span>${state.attempts.length} attempts and ${state.bookmarks.length} bookmarks stored locally.</span></div><span class="pill green">Online</span></div>
          </div>
        </section>
      </div>
    </div>`;
}

async function handleRouteClick(event) {
  const routeAction = event.target.closest("[data-route-action]");
  if (routeAction) {
    navigate(routeAction.dataset.routeAction);
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "open-exam") openExamSetup(target.dataset.type);
  if (action === "resume-exam") navigate("exam");
  if (action === "select-answer") selectAnswer(target.dataset.option);
  if (action === "previous-question") moveQuestion(-1);
  if (action === "next-question") moveQuestion(1);
  if (action === "goto-question") {
    state.activeExam.current = Number(target.dataset.index);
    persistActiveExam();
    renderExam();
  }
  if (action === "toggle-flag") toggleFlag();
  if (action === "exit-exam") {
    persistActiveExam();
    navigate("dashboard");
    toast("Exam saved. Resume whenever you are ready.");
  }
  if (action === "submit-exam") requestSubmit();
  if (action === "view-attempt") {
    state.lastResult = state.attempts.find((attempt) => attempt.id === target.dataset.attempt);
    navigate("results");
  }
  if (action === "toggle-bookmark") await toggleBookmark(target.dataset.question);
  if (action === "lab-tab") {
    state.labTab = target.dataset.tab;
    state.selectedMessage = null;
    renderLab();
  }
  if (action === "select-message") {
    state.selectedMessage = target.dataset.message;
    renderLab();
  }
  if (action === "lab-notice") toast("This is a read-only practice tenant. Use the exam center to test decisions.", "warning");
  if (action === "export-data") await downloadExport();
  if (action === "clear-data") confirmClearData();
}

function handleRouteInput(event) {
  if (event.target.id === "lab-search") {
    const term = event.target.value.trim().toLowerCase();
    const rows = labData.messages.filter((message) =>
      [message.flow, message.correlation, message.status, message.id].some((value) => value.toLowerCase().includes(term))
    );
    document.querySelector("#message-body").innerHTML = rows.map(messageRow).join("");
  }
}

function handleModalClick(event) {
  const backdropClose = event.target.matches("[data-modal-close]");
  const closeButton = event.target.closest("button[data-modal-close]");
  if (backdropClose || closeButton) {
    closeModal();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "confirm-submit") completeExam();
  if (action === "confirm-clear") clearLearningData();
}

modalRoot.addEventListener("submit", (event) => {
  if (event.target.id !== "exam-setup-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  startExam(event.target.dataset.type, {
    count: data.get("count"),
    duration: data.get("duration"),
    randomizeOptions: data.get("randomizeOptions") === "on",
    confirmSubmit: data.get("confirmSubmit") === "on"
  });
});

async function toggleBookmark(questionId) {
  const existing = state.bookmarks.find((bookmark) => bookmark.questionId === questionId);
  if (existing) {
    await removeBookmark(state.currentUser.username, questionId);
    toast("Bookmark removed.");
  } else {
    await saveBookmark(state.currentUser.username, questionId);
    toast("Question bookmarked.", "success");
  }
  state.bookmarks = await getBookmarks(state.currentUser.username);
  renderRoute();
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  if (!state.activeExam?.deadline) return;
  state.timer = window.setInterval(() => {
    const remaining = getRemainingSeconds();
    updateTimerDisplay();
    if (remaining <= 0) completeExam(true);
  }, 1000);
}

function stopTimer() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function updateTimerDisplay() {
  const timer = document.querySelector("#exam-timer");
  if (!timer) return;
  timer.textContent = formatRemaining();
  document.querySelector("#timer-box")?.classList.toggle("warning", getRemainingSeconds() <= 600 && state.activeExam?.deadline);
}

function getRemainingSeconds() {
  if (!state.activeExam?.deadline) return Infinity;
  return Math.max(0, Math.ceil((state.activeExam.deadline - Date.now()) / 1000));
}

function formatRemaining() {
  if (!state.activeExam?.deadline) return "Untimed";
  const seconds = getRemainingSeconds();
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function persistActiveExam() {
  if (!state.currentUser || !state.activeExam || state.activeExam.completed) return;
  localStorage.setItem(activeExamKey(), JSON.stringify(state.activeExam));
}

function loadActiveExam() {
  try {
    const raw = localStorage.getItem(activeExamKey());
    if (!raw) return null;
    const exam = JSON.parse(raw);
    if (!Array.isArray(exam.questions) || exam.questions.some((item) => !questionById(item.id))) {
      localStorage.removeItem(activeExamKey());
      return null;
    }
    return exam;
  } catch {
    localStorage.removeItem(activeExamKey());
    return null;
  }
}

function clearActiveExamStorage() {
  localStorage.removeItem(activeExamKey());
}

function activeExamKey() {
  return `flowforge.activeExam.${state.currentUser.username}`;
}

function balancedMixedPool() {
  const systems = shuffle([...systemsQuestions]).slice(0, 30);
  const scenarios = shuffle([...scenarioQuestions]).slice(0, 29);
  return shuffle([...systems, ...scenarios]);
}

function aggregateDomainStats() {
  if (!state.attempts.length) return [];
  return domainOrder.map((domain) => {
    const records = state.attempts.flatMap((attempt) => attempt.answers).filter((answer) => answer.domain === domain);
    const correct = records.filter((record) => record.correct).length;
    return records.length ? { domain, correct, total: records.length, score: Math.round((correct / records.length) * 100) } : null;
  }).filter(Boolean);
}

function calculateReadiness() {
  if (!state.attempts.length) return 0;
  const recent = state.attempts.slice(0, 5);
  const weighted = recent.reduce((sum, attempt, index) => sum + attempt.score * (recent.length - index), 0);
  const weight = recent.reduce((sum, _, index) => sum + (recent.length - index), 0);
  return Math.round(weighted / weight);
}

function calculateXp() {
  return state.attempts.reduce((sum, attempt) => sum + attempt.correct * 12 + 75, 0);
}

function rankForXp(xp) {
  const ranks = [
    { name: "Integration Explorer", min: 0, next: 500 },
    { name: "Flow Builder", min: 500, next: 1500 },
    { name: "System Integrator", min: 1500, next: 3000 },
    { name: "Integration Architect", min: 3000, next: 6000 },
    { name: "FlowForge Master", min: 6000, next: 9000 }
  ];
  return [...ranks].reverse().find((rank) => xp >= rank.min) || ranks[0];
}

function confirmClearData() {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <section class="modal" role="dialog" aria-modal="true">
        <header class="modal-header"><h2>Clear learning history?</h2><button class="icon-button" data-modal-close aria-label="Close"><span class="icon icon-close"></span></button></header>
        <div class="modal-body"><p style="margin:0;color:var(--muted);line-height:1.5">This permanently deletes attempts, bookmarks, and the active exam for <strong>${escapeHtml(state.currentUser.username)}</strong>. Your account remains available.</p></div>
        <footer class="modal-footer"><button class="button button-secondary" data-modal-close>Cancel</button><button class="button button-danger" data-action="confirm-clear">Delete learning data</button></footer>
      </section>
    </div>`;
}

async function clearLearningData() {
  await clearUserData(state.currentUser.username);
  clearActiveExamStorage();
  state.attempts = [];
  state.bookmarks = [];
  state.activeExam = null;
  state.lastResult = null;
  closeModal();
  updateUserShell();
  navigate("profile");
  toast("Learning history cleared.");
}

async function downloadExport() {
  const data = await exportUserData(state.currentUser.username);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flowforge-${state.currentUser.username}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Learning data exported.", "success");
}

async function installApp() {
  if (!state.installPrompt) {
    toast("Use your browser menu to install this app.", "warning");
    return;
  }
  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
}

function closeModal() {
  modalRoot.innerHTML = "";
}

function toggleSidebar() {
  document.querySelector("#sidebar").classList.toggle("open");
  document.querySelector("#sidebar-scrim").classList.toggle("hidden");
}

function closeSidebar() {
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelector("#sidebar-scrim").classList.add("hidden");
}

function toast(message, type = "") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;
  toastRegion.append(element);
  window.setTimeout(() => element.remove(), 3600);
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function metricCard(icon, label, value, tone) {
  return `<div class="metric-card"><span class="metric-icon ${tone}"><span class="icon icon-${icon}"></span></span><div class="metric-copy"><span>${label}</span><strong>${value}</strong></div></div>`;
}

function dashboardExamRow(type, title, description, meta) {
  return `<div class="exam-row"><span class="exam-type-icon ${type}"><span class="icon icon-${type === "scenario" ? "review" : type === "mixed" ? "target" : "exam"}"></span></span><div class="exam-row-copy"><strong>${title}</strong><p>${description}</p><div class="exam-meta"><span>${meta}</span><span>7 domains</span></div></div><button class="button button-secondary" data-action="open-exam" data-type="${type}">Configure</button></div>`;
}

function examCatalogCard(type, title, description, badge, tone) {
  return `<article class="exam-card ${type}"><div class="exam-card-top"></div><div class="exam-card-body"><div class="exam-card-kicker"><span class="exam-type-icon ${type}"><span class="icon icon-${type === "scenario" ? "review" : type === "mixed" ? "target" : "exam"}"></span></span><span class="pill ${tone === "violet" ? "violet" : tone === "green" ? "green" : ""}">${badge}</span></div><h2>${title}</h2><p>${description}</p><div class="exam-card-stats"><div><strong>59</strong><span>Questions</span></div><div><strong>120m</strong><span>Default</span></div><div><strong>7</strong><span>Domains</span></div></div><button class="button button-primary" data-action="open-exam" data-type="${type}">Configure exam</button></div></article>`;
}

function activityItem(attempt) {
  const scoreClass = attempt.score >= 75 ? "good" : attempt.score < 50 ? "low" : "";
  return `<div class="activity-item"><span class="activity-score ${scoreClass}">${attempt.score}%</span><div class="activity-copy"><strong>${escapeHtml(attempt.title)}</strong><span>${formatDate(attempt.completedAt)} · ${attempt.correct}/${attempt.questionCount} correct</span></div></div>`;
}

function domainRow(item) {
  const tone = item.score >= 75 ? "good" : item.score < 55 ? "warning" : "";
  return `<div class="domain-row"><div class="domain-label"><span>${escapeHtml(item.domain)}</span><span>${item.score}% · ${item.correct}/${item.total}</span></div><div class="progress-track"><div class="progress-fill ${tone}" style="width:${item.score}%"></div></div></div>`;
}

function briefingRow(title, value, description) {
  return `<div class="domain-row"><div class="domain-label"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(value)}</span></div><span style="color:var(--muted);font-size:.7rem;line-height:1.4">${escapeHtml(description)}</span></div>`;
}

function resultStat(label, value) {
  return `<div class="result-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><span class="icon icon-${icon}"></span><strong>${title}</strong><p>${description}</p></div>`;
}

function messageRow(message) {
  return `<tr data-action="select-message" data-message="${message.id}"><td><span class="state-label ${message.status.toLowerCase()}">${message.status}</span></td><td><strong>${escapeHtml(message.flow)}</strong><br><span style="color:var(--muted);font-size:.62rem">${escapeHtml(message.correlation)}</span></td><td>${message.time}</td><td>${message.duration}</td><td>${message.code}</td></tr>`;
}

function messageDetail(message) {
  return `<section class="detail-panel"><h3>${escapeHtml(message.flow)} · ${escapeHtml(message.id)}</h3><div class="detail-grid"><div><span>Sender</span><strong>${escapeHtml(message.sender)}</strong></div><div><span>Receiver</span><strong>${escapeHtml(message.receiver)}</strong></div><div><span>Correlation ID</span><strong>${escapeHtml(message.correlation)}</strong></div></div><div class="log-box">Status: ${escapeHtml(message.status)}
HTTP code: ${escapeHtml(message.code)}
Detail: ${escapeHtml(message.detail)}
Suggested investigation: inspect security material, receiver availability, and the message processing log before retrying.</div></section>`;
}

function artifactCard(item, type) {
  const statusClass = ["Started", "Published", "Deployed"].includes(item.status) ? "started" : item.status.toLowerCase();
  const description = item.description || `${item.type} · ${item.package || item.detail}`;
  return `<article class="artifact-card" data-action="lab-notice"><div class="artifact-head"><strong>${escapeHtml(item.name)}</strong><span class="state-label ${statusClass}">${escapeHtml(item.status)}</span></div><p>${escapeHtml(description)}</p><div class="exam-meta"><span>${escapeHtml(item.version ? `Version ${item.version}` : item.detail)}</span><span>${type === "security" ? item.type : item.package || item.type}</span></div></article>`;
}

function domainDescription(domain) {
  const descriptions = {
    "Integration Strategy": "Clean core, architecture styles, governance, and interface contracts",
    "Cloud Integration": "iFlow modeling, routing, persistence, error handling, and reliability",
    "Mapping & Transformation": "Message mapping, XSLT, scripting, schemas, and code translation",
    "Security": "OAuth, TLS, credentials, certificates, identity, and least privilege",
    "Connectivity & Adapters": "HTTP, SOAP, OData, SFTP, B2B, Cloud Connector, and timeouts",
    "Monitoring & Operations": "Message logs, tracing, correlation, alerting, retries, and queue health",
    "API Management & Events": "API proxies, policies, products, Event Mesh, and Integration Advisor"
  };
  return descriptions[domain];
}

function examTitle(type) {
  return type === "systems" ? "System-based practical" : type === "scenario" ? "Scenario-based practical" : "Adaptive mixed challenge";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function firstName(name = "") {
  return name.trim().split(/\s+/)[0] || "Architect";
}

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "FF";
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [items[index], items[random]] = [items[random], items[index]];
  }
  return items;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
