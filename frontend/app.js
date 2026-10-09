const API_URL = window.location.origin;


let tournamentInfo = null;
let currentMode = "groups";
let currentTeams = [];
let allMatches = [];
const ADMIN_STORAGE_KEY = "tournament_admin_key";
const DEFAULT_ADMIN_KEY = "turnier-admin";

function getAdminKey() {
  return localStorage.getItem(ADMIN_STORAGE_KEY) || "";
}

function isAdminMode() {
  return Boolean(getAdminKey());
}

function updateAdminModeUI() {
  const button = document.getElementById("adminModeButton");
  if (!button) return;

  const active = isAdminMode();
  button.textContent = active ? "Admin-Modus: AN" : "Admin-Modus: AUS";
  button.classList.toggle("btn-primary", active);
  button.classList.toggle("btn-secondary", !active);

  document.querySelectorAll("[data-admin-only]").forEach((control) => {
    control.classList.toggle("admin-locked", !active);
    control.setAttribute("aria-disabled", String(!active));
    if (control instanceof HTMLInputElement) {
      control.readOnly = !active;
    }
  });
}

function toggleAdminMode() {
  const existingKey = getAdminKey();
  if (existingKey) {
    const confirmDisable = confirm("Admin-Modus wirklich deaktivieren?");
    if (!confirmDisable) return;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    updateAdminModeUI();
    return;
  }

  const overlay = document.getElementById("adminLoginOverlay");
  const passwordInput = document.getElementById("adminPasswordInput");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  passwordInput.value = "";
  passwordInput.focus();
}

function closeAdminLogin() {
  const overlay = document.getElementById("adminLoginOverlay");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  document.getElementById("adminModeButton").focus();
}

function submitAdminLogin(event) {
  event.preventDefault();
  const passwordInput = document.getElementById("adminPasswordInput");
  const cleanedKey = passwordInput.value.trim();
  if (!cleanedKey) {
    passwordInput.focus();
    return;
  }

  if (cleanedKey !== DEFAULT_ADMIN_KEY) {
    alert("Falscher Admin-Code.");
    passwordInput.select();
    return;
  }

  localStorage.setItem(ADMIN_STORAGE_KEY, cleanedKey);
  closeAdminLogin();
  updateAdminModeUI();
  alert("Admin-Modus aktiviert.");
}

document.getElementById("adminLoginForm").addEventListener("submit", submitAdminLogin);
document.getElementById("cancelAdminLogin").addEventListener("click", closeAdminLogin);
document.getElementById("adminLoginOverlay").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeAdminLogin();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.getElementById("adminLoginOverlay").classList.contains("hidden")) {
    closeAdminLogin();
  }
});

document.addEventListener("click", (event) => {
  const control = event.target.closest("[data-admin-only]");
  if (!control || isAdminMode()) return;
  event.preventDefault();
  event.stopPropagation();
  alert("Nur im Admin-Modus möglich.");
}, true);

document.addEventListener("keydown", (event) => {
  const control = event.target.closest("[data-admin-only]");
  if (!control || isAdminMode() || event.key === "Tab") return;
  event.preventDefault();
  event.stopPropagation();
  alert("Nur im Admin-Modus möglich.");
}, true);

async function protectedFetch(url, options = {}, requireAdmin = false) {
  const headers = new Headers(options.headers || {});

  if (requireAdmin) {
    const key = getAdminKey();
    if (!key) {
      alert("Nur im Admin-Modus erlaubt.");
      throw new Error("Admin required");
    }
    headers.set("X-Admin-Key", key);
  }

  return fetch(url, {
    ...options,
    headers
  });
}

// ==========================================
// 1. INITIALISIERUNG
// ==========================================
async function init() {
  try {
    const res = await fetch(`${API_URL}/tournament`);
    tournamentInfo = await res.json();

    if (tournamentInfo.status === "setup") {
      document.getElementById("setupSection").classList.remove("hidden");
      document.getElementById("tournamentSection").classList.add("hidden");
      await loadTeams();
    } else {
      document.getElementById("setupSection").classList.add("hidden");
      document.getElementById("tournamentSection").classList.remove("hidden");
      
      const koBtn = document.getElementById("btnTriggerKO");
      if (tournamentInfo.status === "knockout") {
        koBtn.classList.add("hidden");
      } else {
        koBtn.classList.remove("hidden");
      }
      
      await refreshData(true);
    }
    await loadPastTournaments();

  } catch (err) {
    console.error("API-Verbindungsfehler:", err);
  }
}

// ==========================================
// 2. MODUS-STEUERUNG & SETUP
// ==========================================
function setMode(mode) {
  currentMode = mode;
  const isGroups = mode === "groups";
  document.getElementById("btnModeGroups").classList.toggle("active", isGroups);
  document.getElementById("btnModeCL").classList.toggle("active", !isGroups);
  document.getElementById("groupsConfig").classList.toggle("hidden", !isGroups);
  document.getElementById("clConfig").classList.toggle("hidden", isGroups);
  validateStart();
}

async function loadTeams() {
  const res = await fetch(`${API_URL}/teams`);
  currentTeams = await res.json();
  const list = document.getElementById("teamList");
  list.innerHTML = "";
  
  currentTeams.forEach(tm => {
    const el = document.createElement("div");
    el.className = "team-item";
    el.innerHTML = `<span>${tm.name}</span><button data-admin-only aria-label="Team ${tm.name} löschen" onclick="deleteTeam(${tm.id})">×</button>`;
    list.appendChild(el);
  });
  
  updateAdminModeUI();
  validateStart();
}

function validateStart() {
  const n = currentTeams.length;
  const startBtn = document.getElementById("startBtn");
  const msg = document.getElementById("validationMsg");
  let valid = true;
  let text = "";

  if (n < 2) {
    valid = false;
    text = `Mindestens 2 Teams erforderlich (Aktuell: ${n}).`;
  } else if (currentMode === "groups") {
    const groupSize = parseInt(document.getElementById("groupSizeSelect").value);
    const advance = parseInt(document.getElementById("advanceGroupSelect").value);
    const exactGroupCount = n / groupSize;
    const lowerGroupCount = Math.floor(exactGroupCount);
    const fraction = exactGroupCount - lowerGroupCount;
    const roundedGroupCount = fraction < 0.5
      ? lowerGroupCount
      : fraction > 0.5
        ? lowerGroupCount + 1
        : lowerGroupCount % 2 === 0
          ? lowerGroupCount
          : lowerGroupCount + 1;
    const numGroups = Math.max(1, roundedGroupCount);
    const totalQualifiers = numGroups * advance;

    const isPowerOfTwo = (totalQualifiers & (totalQualifiers - 1)) === 0 && totalQualifiers >= 2;
    if (!isPowerOfTwo) {
      valid = false;
      text = `Mit ${numGroups} Gruppen à ${advance} Weiterkommenden gäbe es ${totalQualifiers} Teams. Ein K.-o.-Baum benötigt eine 2er-Potenz (2, 4, 8 oder 16 Teams)!`;
    }
  } else if (currentMode === "cl") {
    const advance = parseInt(document.getElementById("clAdvanceSelect").value);
    if (advance > n) {
      valid = false;
      text = `Es können nicht mehr Teams (${advance}) weiterkommen als teilnehmen (${n})!`;
    }
  }

  startBtn.disabled = !valid;
  if (!valid && text) {
    msg.textContent = text;
    msg.classList.remove("hidden");
  } else {
    msg.classList.add("hidden");
  }
}

async function addTeam() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }

  const input = document.getElementById("newTeamName");
  if (!input.value.trim()) return;
  await protectedFetch(`${API_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.value.trim() })
  }, true);
  input.value = "";
  await loadTeams();
}

async function deleteTeam(id) {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }
  await protectedFetch(`${API_URL}/teams/${id}`, { method: "DELETE" }, true);
  await loadTeams();
}

async function loadDemoTeams() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }
  await protectedFetch(`${API_URL}/teams/demo`, { method: "POST" }, true);
  await loadTeams();
}

// ==========================================
// 3. TURNIERSTART & STEUERUNG
// ==========================================
async function startTournament() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }

  const groupSize = parseInt(document.getElementById("groupSizeSelect").value);
  const advance = parseInt(document.getElementById("advanceGroupSelect").value);
  const clMatches = parseInt(document.getElementById("clMatchesInput").value);
  const clAdvance = parseInt(document.getElementById("clAdvanceSelect").value);

  const res = await protectedFetch(`${API_URL}/tournament/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: currentMode,
      target_group_size: groupSize,
      advance_per_group: advance,
      cl_matches_per_team: clMatches,
      cl_advance_count: clAdvance,
      name: document.getElementById("tourneyNameInput").value.trim() || "Tournament Pro",
      year: parseInt(document.getElementById("tourneyYearInput").value) || 2026,
    })
  }, true);
  if (res.ok) init();
}

async function triggerKnockout() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }

  const res = await protectedFetch(`${API_URL}/tournament/start-knockout`, { method: "POST" }, true);
  if (res.ok) {
    document.getElementById("btnTriggerKO").classList.add("hidden");
    init();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Der K.-o.-Baum konnte nicht erzeugt werden.");
  }
}

async function resetTournament() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }
  if (confirm("Turnier wirklich zurücksetzen? Alle Stände werden gelöscht.")) {
    await protectedFetch(`${API_URL}/tournament/reset`, { method: "POST" }, true);
    init();
  }
}

// ==========================================
// 4. RENDERING DER SPIELE & TABELLEN
// ==========================================
async function refreshData(renderAll = false) {
  const mRes = await fetch(`${API_URL}/matches`);
  allMatches = await mRes.json();
  await renderStandings();
  if (renderAll) {
    renderRounds();
  }
  renderBracket();
  attachInputListeners();
  updateAdminModeUI();
}

async function renderStandings() {
  const res = await fetch(`${API_URL}/standings`);
  const data = await res.json();
  const c = document.getElementById("standingsContainer");
  c.innerHTML = "";

  const advanceLimit = tournamentInfo ? tournamentInfo.advance_count : 2;

  for (const [groupName, rows] of Object.entries(data)) {
    let html = `
      <div style="margin-bottom: 20px;">
        <span class="table-title">// ${groupName}</span>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Sp</th>
              <th>S</th>
              <th>U</th>
              <th>N</th>
              <th>Tore</th>
              <th>Diff</th>
              <th>Pkt</th>
            </tr>
          </thead>
          <tbody>
    `;

    rows.forEach((r, idx) => {
      const q = idx < advanceLimit ? "class='qualify'" : "";
      html += `
        <tr ${q}>
          <td>${idx + 1}</td>
          <td><strong>${r.name}</strong></td>
          <td>${r.played}</td>
          <td>${r.won}</td>
          <td>${r.drawn}</td>
          <td>${r.lost}</td>
          <td>${r.gf}:${r.ga}</td>
          <td>${r.gd > 0 ? "+" + r.gd : r.gd}</td>
          <td><strong>${r.points}</strong></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    c.innerHTML += html;
  }
}

function renderRounds() {
  const c = document.getElementById("roundsContainer");
  c.innerHTML = "";

  const groupMatches = allMatches.filter(m => m.stage === "group");
  const rounds = {};
  groupMatches.forEach(m => {
    rounds[m.round_number] = rounds[m.round_number] || [];
    rounds[m.round_number].push(m);
  });

  for (const [rNum, matches] of Object.entries(rounds)) {
    const block = document.createElement("div");
    block.className = "round-box";
    block.innerHTML = `
      <span class="round-header">// SPIELTAG ${rNum}</span>
      <div class="matches-grid" id="rg-${rNum}"></div>
    `;
    c.appendChild(block);

    const grid = block.querySelector(`#rg-${rNum}`);
    matches.forEach(m => {
      grid.appendChild(createMatchCard(m));
    });
  }
}

function renderBracket() {
  const c = document.getElementById("bracketContainer");
  c.innerHTML = "";
  const koMatches = allMatches.filter(m => m.stage === "knockout");
  if (koMatches.length === 0) {
    c.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">Vorrunde spielen und oben 'K.-o.-Baum generieren' anklicken.</p>`;
    return;
  }

  const roundMap = {};
  koMatches.forEach(m => {
    roundMap[m.round_number] = roundMap[m.round_number] || [];
    roundMap[m.round_number].push(m);
  });

  const sortedRounds = Object.keys(roundMap).map(Number).sort((a, b) => b - a);

  sortedRounds.forEach(r => {
    const col = document.createElement("div");
    col.className = "bracket-col";
    const title = r === 1 ? "FINALE" : (r === 2 ? "HALBFINALE" : (r === 4 ? "VIERTELFINALE" : `RUNDE DER LETZTEN ${r * 2}`));
    col.innerHTML = `<div class="bracket-col-title">// ${title}</div>`;
    roundMap[r].forEach(m => {
      col.appendChild(createMatchCard(m, true));
    });
    c.appendChild(col);
  });
}

function createMatchCard(m, isKO = false) {
  const card = document.createElement("div");
  card.className = "match-card";
  const hVal = m.home_score !== null ? m.home_score : "";
  const aVal = m.away_score !== null ? m.away_score : "";

  let penaltyHtml = "";
  if (isKO && m.home_score !== null && m.home_score === m.away_score && m.home_score !== "") {
    const hp = m.home_penalty !== null ? m.home_penalty : "";
    const ap = m.away_penalty !== null ? m.away_penalty : "";
    penaltyHtml = `
      <div class="penalty-row">
        <span>Elfmeter:</span>
        <div class="score-box">
          <input type="number" class="score-input" data-admin-only data-match-id="${m.id}" data-field="home_penalty" value="${hp}">
          <span>:</span>
          <input type="number" class="score-input" data-admin-only data-match-id="${m.id}" data-field="away_penalty" value="${ap}">
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="match-row">
      <span class="team-title">${m.home_team_name}</span>
      <div class="score-box">
        <input type="number" min="0" class="score-input" data-admin-only data-match-id="${m.id}" data-field="home_score" value="${hVal}">
        <span>:</span>
        <input type="number" min="0" class="score-input" data-admin-only data-match-id="${m.id}" data-field="away_score" value="${aVal}">
      </div>
      <span class="team-title away">${m.away_team_name}</span>
    </div>
    ${penaltyHtml}
  `;
  return card;
}

// ==========================================
// 5. INPUT & AUTO-SAVE
// ==========================================
function attachInputListeners() {
  const inputs = Array.from(document.querySelectorAll(".score-input"));

  inputs.forEach((input, idx) => {
    input.onchange = async () => {
      if (!isAdminMode()) {
        alert("Nur im Admin-Modus möglich.");
        return;
      }
      await saveMatch(input.dataset.matchId);
    };

    input.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!isAdminMode()) {
          alert("Nur im Admin-Modus möglich.");
          return;
        }
        await saveMatch(input.dataset.matchId);
        if (inputs[idx + 1]) {
          inputs[idx + 1].focus();
          inputs[idx + 1].select();
        }
      }
    };
  });
}

async function saveMatch(matchId) {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }

  const hInput = document.querySelector(`input[data-match-id="${matchId}"][data-field="home_score"]`);
  const aInput = document.querySelector(`input[data-match-id="${matchId}"][data-field="away_score"]`);
  const hpInput = document.querySelector(`input[data-match-id="${matchId}"][data-field="home_penalty"]`);
  const apInput = document.querySelector(`input[data-match-id="${matchId}"][data-field="away_penalty"]`);

  if (!hInput || !aInput || hInput.value === "" || aInput.value === "") return;

  const payload = {
    home_score: parseInt(hInput.value),
    away_score: parseInt(aInput.value),
    home_penalty: hpInput && hpInput.value !== "" ? parseInt(hpInput.value) : null,
    away_penalty: apInput && apInput.value !== "" ? parseInt(apInput.value) : null
  };

  await protectedFetch(`${API_URL}/matches/${matchId}/score`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, true);

  await refreshData(false);
}



// Enter-Taste für Team-Hinzufügen
document.getElementById("newTeamName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addTeam();
  }
});


async function loadPastTournaments() {
  const res = await fetch(`${API_URL}/past-tournaments`);
  const list = await res.json();
  const c = document.getElementById("pastTournamentsContainer");
  if (!list.length) {
    c.innerHTML = `<p style="color:var(--text-muted); font-size:0.88rem;">Noch keine abgeschlossenen Turniere im Archiv.</p>`;
    return;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Jahr</th>
          <th>Turnier</th>
          <th>Champion 🏆</th>
          <th>Runner-Up</th>
          <th>Top-Scorer (Tore)</th>
        </tr>
      </thead>
      <tbody>
  `;
  list.forEach(item => {
    html += `
      <tr class="qualify">
        <td><strong>${item.year}</strong></td>
        <td>${item.tournament_name}</td>
        <td><strong style="color:var(--green-light);">${item.winner_name}</strong></td>
        <td>${item.runner_up_name}</td>
        <td>${item.top_scorer_name} (${item.top_scorer_goals})</td>
      </tr>
    `;
  });
  html += `</tbody></table>`;
  c.innerHTML = html;
}

async function archiveTournament() {
  if (!isAdminMode()) {
    alert("Nur im Admin-Modus möglich.");
    return;
  }

  if (!confirm("Turnier abschließen, Sieger in 'Past Tournaments' verewigen und neues Turnier vorbereiten?")) return;
  const res = await protectedFetch(`${API_URL}/tournament/archive`, { method: "POST" }, true);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.detail || "Bitte erst das Finale vollständig eintragen!");
    return;
  }
  init();
}


function syncModeButtonState() {
  const isGroups = currentMode === "groups";
  document.getElementById("btnModeGroups").classList.toggle("active", isGroups);
  document.getElementById("btnModeCL").classList.toggle("active", !isGroups);
  document.getElementById("groupsConfig").classList.toggle("hidden", !isGroups);
  document.getElementById("clConfig").classList.toggle("hidden", isGroups);
}

init();
syncModeButtonState();
updateAdminModeUI();
