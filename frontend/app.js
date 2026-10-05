const API_URL = "http://127.0.0.1:8000";

let tournamentInfo = null;
let currentMode = "groups";
let currentTeams = [];
let allMatches = [];

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
  } catch (err) {
    console.error("API-Verbindungsfehler:", err);
  }
}

// ==========================================
// 2. MODUS-STEUERUNG & SETUP
// ==========================================
function setMode(mode) {
  currentMode = mode;
  document.getElementById("btnModeGroups").classList.toggle("active", mode === "groups");
  document.getElementById("btnModeCL").classList.toggle("active", mode === "cl");
  document.getElementById("groupsConfig").classList.toggle("hidden", mode !== "groups");
  document.getElementById("clConfig").classList.toggle("hidden", mode !== "cl");
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
    el.innerHTML = `<span>${tm.name}</span><button onclick="deleteTeam(${tm.id})">×</button>`;
    list.appendChild(el);
  });
  
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
    const numGroups = Math.max(1, Math.round(n / groupSize));
    const totalQualifiers = numGroups * advance;

    const isPowerOfTwo = (totalQualifiers & (totalQualifiers - 1)) === 0 && totalQualifiers >= 2;
    if (!isPowerOfTwo) {
      valid = false;
      text = `Mit ${numGroups} Gruppen à ${advance} Weiterkommenden gäbe es ${totalQualifiers} Teams. Ein K.-o.-Baum benötigt 2, 4, 8 oder 16 Teams!`;
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
  const input = document.getElementById("newTeamName");
  if (!input.value.trim()) return;
  await fetch(`${API_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.value.trim() })
  });
  input.value = "";
  await loadTeams();
}

async function deleteTeam(id) {
  await fetch(`${API_URL}/teams/${id}`, { method: "DELETE" });
  await loadTeams();
}

async function loadDemoTeams() {
  await fetch(`${API_URL}/teams/demo`, { method: "POST" });
  await loadTeams();
}

// ==========================================
// 3. TURNIERSTART & STEUERUNG
// ==========================================
async function startTournament() {
  const groupSize = parseInt(document.getElementById("groupSizeSelect").value);
  const advance = parseInt(document.getElementById("advanceGroupSelect").value);
  const clMatches = parseInt(document.getElementById("clMatchesInput").value);
  const clAdvance = parseInt(document.getElementById("clAdvanceSelect").value);

  const res = await fetch(`${API_URL}/tournament/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: currentMode,
      target_group_size: groupSize,
      advance_per_group: advance,
      cl_matches_per_team: clMatches,
      cl_advance_count: clAdvance
    })
  });
  if (res.ok) init();
}

async function triggerKnockout() {
  const res = await fetch(`${API_URL}/tournament/start-knockout`, { method: "POST" });
  if (res.ok) {
    document.getElementById("btnTriggerKO").classList.add("hidden");
    init();
  }
}

async function resetTournament() {
  if (confirm("Turnier wirklich zurücksetzen? Alle Stände werden gelöscht.")) {
    await fetch(`${API_URL}/tournament/reset`, { method: "POST" });
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
          <input type="number" class="score-input" data-match-id="${m.id}" data-field="home_penalty" value="${hp}">
          <span>:</span>
          <input type="number" class="score-input" data-match-id="${m.id}" data-field="away_penalty" value="${ap}">
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="match-row">
      <span class="team-title">${m.home_team_name}</span>
      <div class="score-box">
        <input type="number" min="0" class="score-input" data-match-id="${m.id}" data-field="home_score" value="${hVal}">
        <span>:</span>
        <input type="number" min="0" class="score-input" data-match-id="${m.id}" data-field="away_score" value="${aVal}">
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
      await saveMatch(input.dataset.matchId);
    };

    input.onkeydown = async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
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

  await fetch(`${API_URL}/matches/${matchId}/score`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  await refreshData(false);
}



// Enter-Taste für Team-Hinzufügen
document.getElementById("newTeamName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addTeam();
  }
});


init();
