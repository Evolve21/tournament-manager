from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from database import engine, Base, get_db
import models
import schemas
import tournament_logic as logic

# 1. Erstellt alle Tabellen in SQLite, falls sie noch nicht existieren
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tournament Manager Pro API")

# 2. CORS (Cross-Origin Resource Sharing): Erlaubt unserem Frontend Zugriff
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Hilfsfunktion: Holt oder erstellt das Standard-Turnier (ID 1)
def get_default_tournament(db: Session) -> models.Tournament:
    t = db.query(models.Tournament).first()
    if not t:
        t = models.Tournament(name="Tournament Pro", mode="groups", status="setup")
        db.add(t)
        db.commit()
        db.refresh(t)
    return t

# ==========================================
# ENDPUNKTE: TURNIER-STATUS & RESET
# ==========================================

@app.get("/tournament")
def get_tournament_info(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    return {
        "id": t.id,
        "name": t.name,
        "mode": t.mode,
        "has_return_matches": t.has_return_matches,
        "status": t.status
    }

@app.post("/tournament/reset")
def reset_tournament(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    # Alle Matches und Teams löschen
    db.query(models.Match).filter(models.Match.tournament_id == t.id).delete()
    db.query(models.Team).filter(models.Team.tournament_id == t.id).delete()
    t.status = "setup"
    db.commit()
    return {"message": "Turnier erfolgreich zurückgesetzt."}

# ==========================================
# ENDPUNKTE: TEAMS VERWALTEN
# ==========================================

@app.get("/teams", response_model=List[schemas.TeamResponse])
def get_teams(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    return db.query(models.Team).filter(models.Team.tournament_id == t.id).all()

@app.post("/teams", response_model=schemas.TeamResponse)
def add_team(team_in: schemas.TeamCreate, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    if t.status != "setup":
        raise HTTPException(status_code=400, detail="Turnier läuft bereits. Keine neuen Teams erlaubt.")
    
    new_team = models.Team(name=team_in.name.strip(), tournament_id=t.id)
    db.add(new_team)
    db.commit()
    db.refresh(new_team)
    return new_team

@app.delete("/teams/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    if t.status != "setup":
        raise HTTPException(status_code=400, detail="Teams können nur in der Setup-Phase gelöscht werden.")
    
    team = db.query(models.Team).filter(models.Team.id == team_id, models.Team.tournament_id == t.id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team nicht gefunden.")
    
    db.delete(team)
    db.commit()
    return {"message": "Team gelöscht."}

@app.post("/teams/demo")
def load_demo_teams(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    if t.status != "setup":
        raise HTTPException(status_code=400, detail="Nur in Setup-Phase möglich.")
    
    db.query(models.Team).filter(models.Team.tournament_id == t.id).delete()
    demo_names = [
        "Real Madrid", "Manchester City", "Bayern München", "FC Barcelona",
        "FC Arsenal", "Inter Mailand", "Paris Saint-Germain", "Borussia Dortmund"
    ]
    for name in demo_names:
        db.add(models.Team(name=name, tournament_id=t.id))
    db.commit()
    return {"message": "8 Demo-Teams erfolgreich geladen."}

# ==========================================
# ENDPUNKT: TURNIER STARTEN & SPIELPLAN ERZEUGEN
# ==========================================

@app.post("/tournament/start")
def start_tournament(config: schemas.TournamentStartConfig, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    teams = db.query(models.Team).filter(models.Team.tournament_id == t.id).all()
    
    if len(teams) < 4:
        raise HTTPException(status_code=400, detail="Mindestens 4 Teams erforderlich.")

    # 1. Gruppen einteilen
    team_ids = [team.id for team in teams]
    group_mapping = logic.split_into_groups(team_ids, config.target_group_size)

    # Gruppennamen den Teams in der DB zuweisen
    for group_name, members in group_mapping.items():
        for team_id in members:
            team_obj = db.query(models.Team).get(team_id)
            if team_obj:
                team_obj.group_name = group_name

    # 2. Spielplan für jede Gruppe generieren
    all_generated_matches = []
    for group_name, members in group_mapping.items():
        group_matches = logic.generate_round_robin_matches(members, t.has_return_matches)
        all_generated_matches.extend(group_matches)

    # 3. Matches in Datenbank speichern
    for m in all_generated_matches:
        db_match = models.Match(
            tournament_id=t.id,
            home_team_id=m["home_team_id"],
            away_team_id=m["away_team_id"],
            round_number=m["round_number"],
            stage="group"
        )
        db.add(db_match)

    t.status = "group_stage"
    db.commit()
    return {"message": "Turnier gestartet und Spielplan erstellt."}

# ==========================================
# ENDPUNKTE: MATCHES & SCORE UPDATE
# ==========================================

@app.get("/matches")
def get_matches(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    matches = db.query(models.Match).filter(models.Match.tournament_id == t.id).all()
    
    # IDs in echte Team-Namen auflösen für das Frontend
    team_lookup = {team.id: team.name for team in db.query(models.Team).filter(models.Team.tournament_id == t.id).all()}
    
    result = []
    for m in matches:
        result.append({
            "id": m.id,
            "round_number": m.round_number,
            "stage": m.stage,
            "home_team_id": m.home_team_id,
            "away_team_id": m.away_team_id,
            "home_team_name": team_lookup.get(m.home_team_id, "TBD"),
            "away_team_name": team_lookup.get(m.away_team_id, "TBD"),
            "home_score": m.home_score,
            "away_score": m.away_score,
            "home_penalty": m.home_penalty,
            "away_penalty": m.away_penalty,
            "bracket_slot": m.bracket_slot
        })
    return result

@app.put("/matches/{match_id}/score")
def update_score(match_id: int, score_data: schemas.MatchUpdateScore, db: Session = Depends(get_db)):
    m = db.query(models.Match).get(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match nicht gefunden.")

    m.home_score = score_data.home_score
    m.away_score = score_data.away_score
    m.home_penalty = score_data.home_penalty
    m.away_penalty = score_data.away_penalty

    db.commit()
    return {"message": "Ergebnis aktualisiert."}

# ==========================================
# ENDPUNKT: TABELLENSTÄNDE (STANDINGS)
# ==========================================

@app.get("/standings")
def get_standings(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    teams = db.query(models.Team).filter(models.Team.tournament_id == t.id).all()
    matches = db.query(models.Match).filter(models.Match.tournament_id == t.id, models.Match.stage == "group").all()

    # Nach Gruppen trennen und auswerten
    groups: Dict[str, List[models.Team]] = {}
    for team in teams:
        g = team.group_name or "Tabelle"
        groups.setdefault(g, []).append(team)

    standings_by_group = {}
    for g_name, g_teams in sorted(groups.items()):
        g_team_ids = {team.id for team in g_teams}
        # Nur Spiele dieser Gruppe filtern
        g_matches = [m for m in matches if m.home_team_id in g_team_ids and m.away_team_id in g_team_ids]
        standings_by_group[g_name] = logic.calculate_standings(g_teams, g_matches)

    return standings_by_group
