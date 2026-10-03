const API_URL = "http://127.0.0.1:8000";

let currentTeams = [];
let currentMatches = [];

// ==========================================
// 1. INITIALISIERUNG & STATUS
// ==========================================
async function init() {
  try {
    const res = await fetch(`${API_URL}/tournament`);
    const tournament = await res.json();

    if (tournament.status === "setup") {
      document.getElementById("setupSection").classList.remove("hidden");
      document.getElementById("tournamentSection").classList.add("hidden");
      await loadTeams();
    } else {
      document.getElementById("setupSection").classList.add("hidden");
      document.getElementById("tournamentSection").classList.remove("hidden");
      await refreshTournamentData();
    }
  } catch (err) {
    console.error("Backend nicht erreichbar:", err);
  }
}

// ==========================================
// 2. SETUP: TEAMS VERWALTEN
// ==========================================
async function loadTeams() {
  const res = await fetch(`${API_URL}/teams`);
  currentTeams = await res.json();

  const list = document.getElementById("teamList");
  list.innerHTML = "";
  currentTeams.forEach(team => {
    const chip = document.createElement("div");
    chip.className = "team-chip";
    chip.innerHTML = `
      <span>${team.name}</span>
      <button onclick="deleteTeam(${team.id})">×</button>
    `;
    list.appendChild(chip);
  });

  const startBtn = document.getElementById("startBtn");
  const errDiv = document.getElementById("setupError");

  if (currentTeams.length < 4) {
    startBtn.disabled = true;
    errDiv.textContent = `Mindestens 4 Teams erforderlich (Aktuell: ${currentTeams.length}).`;
  } else {
    startBtn.disabled = false;
    errDiv.textContent = "";
  }
}

async function addTeam() {
  const input = document.getElementById("newTeamName");
  const name = input.value.trim();
  if (!name) return;

  await fetch(`${API_URL}/teams`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
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
// 3. TURNIER STARTEN & RESET
// ==========================================
async function startTournament() {
  const groupSize = parseInt(document.getElementById("groupSizeSelect").value);

  const res = await fetch(`${API_URL}/tournament/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_group_size: groupSize,
      advance_per_group: 2,
      cl_advance_count: 8
    })
  });

  if (res.ok) {
    init();
  }
}

async function resetTournament() {
  if (confirm("Turnier wirklich komplett zurücksetzen? Alle Ergebnisse werden gelöscht.")) {
    await fetch(`${API_URL}/tournament/reset`, { method: "POST" });
    init();
  }
}

// ==========================================
// 4. SPIEL- & TABELLEN-DATEN RENDERN
// ==========================================
async function refreshTournamentData() {
  // Matches laden
  const mRes = await fetch(`${API_URL}/matches`);
  currentMatches = await mRes.json();

  // Filter-Dropdown füllen
  const tRes = await fetch(`${API_URL}/teams`);
  currentTeams = await tRes.json();
  const filter = document.getElementById("teamFilter");
  filter.innerHTML = `<option value="ALL">ALLE TEAMS ANZEIGEN</option>`;
  currentTeams.forEach(t => {
    filter.innerHTML += `<option value="${t.id}">${t.name}</option>`;
  });

  renderMatches();
  await renderStandings();
}

async function renderStandings() {
  const res = await fetch(`${API_URL}/standings`);
  const standingsByGroup = await res.json();
  const container = document.getElementById("standingsContainer");
  container.innerHTML = "";

  for (const [groupName, rows] of Object.entries(standingsByGroup)) {
    let html = `
      <div class="panel">
        <h3>GRUPPE ${groupName}</h3>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>TEAM</th>
              <th>SP</th>
              <th>S</th>
              <th>U</th>
              <th>N</th>
              <th>TORE</th>
              <th>DIFF</th>
              <th>PKT</th>
            </tr>
          </thead>
          <tbody>
    `;

    rows.forEach((row, idx) => {
      // Top 2 optisch hervorheben (qualifiziert)
      const qualifyClass = idx < 2 ? "qualify-row" : "";
      html += `
        <tr class="${qualifyClass}">
          <td>${idx + 1}</td>
          <td class="team-col">${row.name}</td>
          <td>${row.played}</td>
          <td>${row.won}</td>
          <td>${row.drawn}</td>
          <td>${row.lost}</td>
          <td>${row.gf}:${row.ga}</td>
          <td>${row.gd > 0 ? "+" + row.gd : row.gd}</td>
          <td><strong>${row.points}</strong></td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML += html;
  }
}

function renderMatches() {
  const selectedTeamId = document.getElementById("teamFilter").value;
  const container = document.getElementById("matchesContainer");
  container.innerHTML = "";

  currentMatches.forEach((m, idx) => {
    // Filter prüfen
    if (selectedTeamId !== "ALL") {
      const id = parseInt(selectedTeamId);
      if (m.home_team_id !== id && m.away_team_id !== id) return;
    }

    const homeVal = m.home_score !== null ? m.home_score : "";
    const awayVal = m.away_score !== null ? m.away_score : "";

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <div class="match-header">
        <span>SPIELTAG ${m.round_number}</span>
        <span>ID: #${m.id}</span>
      </div>
      <div class="match-teams">
        <span class="match-team-name">${m.home_team_name}</span>
        <div class="match-score-inputs">
          <input type="number" min="0" value="${homeVal}" 
                 id="score-home-${m.id}" 
                 data-match-id="${m.id}" 
                 data-type="home"
                 data-index="${idx * 2}">
          <span>:</span>
          <input type="number" min="0" value="${awayVal}" 
                 id="score-away-${m.id}" 
                 data-match-id="${m.id}" 
                 data-type="away"
                 data-index="${idx * 2 + 1}">
        </div>
        <span class="match-team-name away">${m.away_team_name}</span>
      </div>
    `;
    container.appendChild(card);
  });

  setupEnterKeyNavigation();
}

// ==========================================
// 5. UX: BLITZ-EINGABE MIT ENTER-TASTE
// ==========================================
function setupEnterKeyNavigation() {
  const inputs = Array.from(document.querySelectorAll('.match-score-inputs input'));

  inputs.forEach(input => {
    input.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        
        // 1. Ergebnis speichern
        const matchId = input.dataset.matchId;
        const homeScoreVal = document.getElementById(`score-home-${matchId}`).value;
        const awayScoreVal = document.getElementById(`score-away-${matchId}`).value;

        if (homeScoreVal !== "" && awayScoreVal !== "") {
          await fetch(`${API_URL}/matches/${matchId}/score`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              home_score: parseInt(homeScoreVal),
              away_score: parseInt(awayScoreVal)
            })
          });
          // Tabelle neu berechnen
          await renderStandings();
        }

        // 2. Cursor ins nächste Eingabefeld springen lassen
        const currentIndex = parseInt(input.dataset.index);
        const nextInput = inputs.find(i => parseInt(i.dataset.index) === currentIndex + 1);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    });
  });
}

// Start beim Laden der Seite
init();
