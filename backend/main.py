import random
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from database import engine, Base, get_db
import models
import schemas
import tournament_logic as logic

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Tournament Manager Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_default_tournament(db: Session) -> models.Tournament:
    t = db.query(models.Tournament).first()
    if not t:
        t = models.Tournament(name="Tournament Pro", mode="groups", status="setup", advance_count=2)
        db.add(t)
        db.commit()
        db.refresh(t)
    return t

@app.get("/tournament")
def get_tournament_info(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    return {
        "id": t.id,
        "name": t.name,
        "mode": t.mode,
        "has_return_matches": t.has_return_matches,
        "advance_count": t.advance_count,
        "status": t.status
    }

@app.post("/tournament/reset")
def reset_tournament(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    db.query(models.Match).filter(models.Match.tournament_id == t.id).delete()
    db.query(models.Team).filter(models.Team.tournament_id == t.id).delete()
    t.status = "setup"
    t.advance_count = 2
    db.commit()
    return {"message": "Zurückgesetzt."}

@app.get("/teams", response_model=List[schemas.TeamResponse])
def get_teams(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    return db.query(models.Team).filter(models.Team.tournament_id == t.id).all()

@app.post("/teams", response_model=schemas.TeamResponse)
def add_team(team_in: schemas.TeamCreate, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    if t.status != "setup":
        raise HTTPException(status_code=400, detail="Turnier läuft bereits.")
    new_team = models.Team(name=team_in.name.strip(), tournament_id=t.id)
    db.add(new_team)
    db.commit()
    db.refresh(new_team)
    return new_team

@app.delete("/teams/{team_id}")
def delete_team(team_id: int, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    team = db.query(models.Team).filter(models.Team.id == team_id, models.Team.tournament_id == t.id).first()
    if team:
        db.delete(team)
        db.commit()
    return {"message": "Gelöscht"}

@app.post("/teams/demo")
def load_demo_teams(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    db.query(models.Team).filter(models.Team.tournament_id == t.id).delete()
    demo_names = [
        "Real Madrid", "Manchester City", "Bayern München", "FC Barcelona",
        "FC Arsenal", "Inter Mailand", "Paris Saint-Germain", "Borussia Dortmund"
    ]
    for name in demo_names:
        db.add(models.Team(name=name, tournament_id=t.id))
    db.commit()
    return {"message": "Demo-Teams geladen."}

@app.post("/tournament/start")
def start_tournament(config: schemas.TournamentStartConfig, db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    teams = db.query(models.Team).filter(models.Team.tournament_id == t.id).all()
    if len(teams) < 2:
        raise HTTPException(status_code=400, detail="Mindestens 2 Teams erforderlich.")

    t.mode = config.mode
    t.name = config.name
    t.year = config.year

    team_ids = [tm.id for tm in teams]
    random.shuffle(team_ids)
    all_matches = []

    if config.mode == "groups":
        group_mapping = logic.split_into_groups(team_ids, config.target_group_size)
        total_qualifiers = len(group_mapping) * config.advance_per_group
        if not logic.is_power_of_two(total_qualifiers):
            raise HTTPException(status_code=400, detail=f"Gesamtzahl Qualifikanten ({total_qualifiers}) muss eine 2er-Potenz sein (2, 4, 8)!")

        t.advance_count = config.advance_per_group
        for g_name, members in group_mapping.items():
            for tid in members:
                tm = db.query(models.Team).get(tid)
                if tm: tm.group_name = g_name
            all_matches.extend(logic.generate_round_robin_matches(members, t.has_return_matches))
    else:
        if not logic.is_power_of_two(config.cl_advance_count):
            raise HTTPException(status_code=400, detail="Qualifikanten-Anzahl muss eine 2er-Potenz sein (2, 4, 8)!")
        t.advance_count = config.cl_advance_count
        for tm in teams:
            tm.group_name = "Liga"
        all_matches = logic.generate_cl_matches(team_ids, config.cl_matches_per_team)

    for m in all_matches:
        db.add(models.Match(
            tournament_id=t.id,
            home_team_id=m["home_team_id"],
            away_team_id=m["away_team_id"],
            round_number=m["round_number"],
            stage="group"
        ))

    t.status = "group_stage"
    db.commit()
    return {"message": "Gestartet"}

@app.post("/tournament/start-knockout")
def start_knockout(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    existing_ko = db.query(models.Match).filter(models.Match.tournament_id == t.id, models.Match.stage == "knockout").first()
    if existing_ko:
        raise HTTPException(status_code=400, detail="K.-o.-Baum existiert bereits.")

    teams = db.query(models.Team).filter(models.Team.tournament_id == t.id).all()
    group_matches = db.query(models.Match).filter(models.Match.tournament_id == t.id, models.Match.stage == "group").all()

    qualified = []
    if t.mode == "groups":
        groups = {}
        for tm in teams:
            groups.setdefault(tm.group_name, []).append(tm)
        for g_name, g_teams in sorted(groups.items()):
            g_ids = {tm.id for tm in g_teams}
            m_list = [m for m in group_matches if m.home_team_id in g_ids and m.away_team_id in g_ids]
            standings = logic.calculate_standings(g_teams, m_list)
            for idx in range(t.advance_count):
                if idx < len(standings):
                    qualified.append({"id": standings[idx]["id"], "seed": idx + 1})
    else:
        standings = logic.calculate_standings(teams, group_matches)
        for s in standings[:t.advance_count]:
            qualified.append({"id": s["id"], "seed": 1})

    k = len(qualified)
    if k < 2 or not logic.is_power_of_two(k):
        raise HTTPException(status_code=400, detail=f"Ungültige Qualifikantenanzahl ({k}).")

    # Baum von Finale rückwärts aufbauen für perfekte Verknüpfung
    first_round_slots = k // 2
    bracket_pairs = []
    if t.mode == "groups" and any(item.get("seed") == 2 for item in qualified):
        firsts = [item for item in qualified if item.get("seed") == 1]
        seconds = [item for item in qualified if item.get("seed") == 2]
        seconds.reverse()
        for i in range(first_round_slots):
            bracket_pairs.append((firsts[i]["id"], seconds[i]["id"]))
    else:
        for i in range(first_round_slots):
            bracket_pairs.append((qualified[i]["id"], qualified[k - 1 - i]["id"]))

    # Finale erstellen
    final_match = models.Match(
        tournament_id=t.id, stage="knockout", round_number=1, bracket_slot=1
    )
    db.add(final_match)
    db.flush()

    # Runden rückwärts verlinken
    current_level = [final_match]
    current_count = 1

    while current_count < first_round_slots:
        next_level = []
        for parent in current_level:
            m_home = models.Match(
                tournament_id=t.id, stage="knockout", round_number=parent.round_number * 2,
                next_match_id=parent.id, next_match_slot="home"
            )
            m_away = models.Match(
                tournament_id=t.id, stage="knockout", round_number=parent.round_number * 2,
                next_match_id=parent.id, next_match_slot="away"
            )
            db.add(m_home)
            db.add(m_away)
            db.flush()
            next_level.extend([m_home, m_away])
        current_level = next_level
        current_count *= 2

    # Teams in die erste Runde setzen
    for idx, match in enumerate(current_level):
        match.home_team_id = bracket_pairs[idx][0]
        match.away_team_id = bracket_pairs[idx][1]

    t.status = "knockout"
    db.commit()
    return {"message": "K.-o.-Baum generiert."}

@app.get("/matches")
def get_matches(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    matches = db.query(models.Match).filter(models.Match.tournament_id == t.id).order_by(models.Match.stage.desc(), models.Match.round_number.desc(), models.Match.id).all()
    lookup = {tm.id: tm.name for tm in db.query(models.Team).filter(models.Team.tournament_id == t.id).all()}
    
    return [{
        "id": m.id,
        "round_number": m.round_number,
        "stage": m.stage,
        "home_team_id": m.home_team_id,
        "away_team_id": m.away_team_id,
        "home_team_name": lookup.get(m.home_team_id, "TBD"),
        "away_team_name": lookup.get(m.away_team_id, "TBD"),
        "home_score": m.home_score,
        "away_score": m.away_score,
        "home_penalty": m.home_penalty,
        "away_penalty": m.away_penalty,
        "next_match_id": m.next_match_id
    } for m in matches]

@app.put("/matches/{match_id}/score")
def update_score(match_id: int, score_data: schemas.MatchUpdateScore, db: Session = Depends(get_db)):
    m = db.query(models.Match).get(match_id)
    if not m:
        raise HTTPException(status_code=404, detail="Match nicht gefunden.")

    m.home_score = score_data.home_score
    m.away_score = score_data.away_score
    m.home_penalty = score_data.home_penalty
    m.away_penalty = score_data.away_penalty

    # AUTO-ADVANCE IM K.-O.-BAUM
    if m.stage == "knockout" and m.next_match_id:
        winner_id = None
        if m.home_score is not None and m.away_score is not None:
            if m.home_score > m.away_score:
                winner_id = m.home_team_id
            elif m.away_score > m.home_score:
                winner_id = m.away_team_id
            elif m.home_penalty is not None and m.away_penalty is not None:
                if m.home_penalty > m.away_penalty:
                    winner_id = m.home_team_id
                elif m.away_penalty > m.home_penalty:
                    winner_id = m.away_team_id

        next_m = db.query(models.Match).get(m.next_match_id)
        if next_m:
            if m.next_match_slot == "home":
                next_m.home_team_id = winner_id
            else:
                next_m.away_team_id = winner_id

    db.commit()
    return {"message": "Gespeichert"}

@app.get("/standings")
def get_standings(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    teams = db.query(models.Team).filter(models.Team.tournament_id == t.id).all()
    matches = db.query(models.Match).filter(models.Match.tournament_id == t.id, models.Match.stage == "group").all()

    groups = {}
    for team in teams:
        g = team.group_name or "Tabelle"
        groups.setdefault(g, []).append(team)

    res = {}
    for g_name, g_teams in sorted(groups.items()):
        g_ids = {tm.id for tm in g_teams}
        g_matches = [m for m in matches if m.home_team_id in g_ids and m.away_team_id in g_ids]
        res[g_name] = logic.calculate_standings(g_teams, g_matches)
    return res

@app.get("/past-tournaments")
def get_past_tournaments(db: Session = Depends(get_db)):
    return db.query(models.PastTournament).order_by(models.PastTournament.id.desc()).all()

@app.post("/tournament/archive")
def archive_tournament(db: Session = Depends(get_db)):
    t = get_default_tournament(db)
    final = db.query(models.Match).filter_by(tournament_id=t.id, stage="knockout", round_number=1).first()
    if not final or final.home_score is None or final.away_score is None:
        raise HTTPException(status_code=400, detail="Finale ist noch nicht beendet.")

    # Sieger & Vize bestimmen
    if final.home_score > final.away_score or (final.home_score == final.away_score and (final.home_penalty or 0) > (final.away_penalty or 0)):
        winner_id, runner_id = final.home_team_id, final.away_team_id
    else:
        winner_id, runner_id = final.away_team_id, final.home_team_id

    winner = db.query(models.Team).get(winner_id)
    runner = db.query(models.Team).get(runner_id)

    # Torschützenkönig über das gesamte Turnier berechnen
    teams = db.query(models.Team).filter_by(tournament_id=t.id).all()
    matches = db.query(models.Match).filter_by(tournament_id=t.id).all()
    goals = {tm.id: 0 for tm in teams}
    for m in matches:
        if m.home_score is not None and m.away_score is not None:
            if m.home_team_id in goals: goals[m.home_team_id] += m.home_score
            if m.away_team_id in goals: goals[m.away_team_id] += m.away_score

    top_id = max(goals, key=goals.get) if goals else None
    top_team = db.query(models.Team).get(top_id) if top_id else None

    entry = models.PastTournament(
        tournament_name=t.name,
        year=t.year,
        winner_name=winner.name if winner else "-",
        runner_up_name=runner.name if runner else "-",
        top_scorer_name=top_team.name if top_team else "-",
        top_scorer_goals=goals.get(top_id, 0) if top_id else 0
    )
    db.add(entry)

    # Aktives Turnier zurücksetzen, Archiv bleibt dauerhaft bestehen
    db.query(models.Match).filter_by(tournament_id=t.id).delete()
    db.query(models.Team).filter_by(tournament_id=t.id).delete()
    t.status = "setup"
    db.commit()
    return {"status": "archived"}

app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
