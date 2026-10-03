import math
from typing import List, Dict, Any

# ==========================================
# 1. INTELLIGENTE GRUPPENEINTEILUNG
# ==========================================
def split_into_groups(team_ids: List[int], target_group_size: int = 4) -> Dict[str, List[int]]:
    """
    Verteilt Teams gleichmäßig auf Gruppen, sodass keine Gruppe leer bleibt
    oder massiv überfüllt ist (z.B. 10 Teams mit Zielgröße 4 -> 4, 3, 3).
    """
    n = len(team_ids)
    if n == 0:
        return {}
    
    # Wie viele Gruppen brauchen wir rechnerisch mindestens?
    num_groups = max(1, round(n / target_group_size))
    
    groups: Dict[str, List[int]] = {}
    for i in range(num_groups):
        group_letter = chr(65 + i)  # 0 -> 'A', 1 -> 'B', 2 -> 'C', usw.
        groups[group_letter] = []

    # Teams reihum ("Snake"-Verteilung) auf die Gruppen verteilen
    for index, team_id in enumerate(team_ids):
        group_letter = chr(65 + (index % num_groups))
        groups[group_letter].append(team_id)

    return groups


# ==========================================
# 2. ROUND-ROBIN SPIELPLAN (FAIRE HEIM-/AUSWÄRTS-BALANCE)
# ==========================================
def generate_round_robin_matches(team_ids: List[int], has_return_matches: bool = False) -> List[Dict[str, Any]]:
    """
    Erzeugt Spieltage nach dem Berger-System (Rotations-Algorithmus).
    Garantiert chronologische Runden und faire Heim/Auswärts-Aufteilung.
    """
    teams = list(team_ids)
    # Bei ungerader Teamanzahl fügen wir ein "Freilos" (None) als Dummy ein
    if len(teams) % 2 != 0:
        teams.append(None)

    n = len(teams)
    num_rounds = n - 1
    matches = []

    for round_num in range(num_rounds):
        for i in range(n // 2):
            t1 = teams[i]
            t2 = teams[n - 1 - i]

            # Freilose überspringen
            if t1 is None or t2 is None:
                continue

            # Heim-/Auswärts-Balance abwechseln
            if (round_num + i) % 2 == 0:
                home, away = t1, t2
            else:
                home, away = t2, t1

            matches.append({
                "round_number": round_num + 1,
                "home_team_id": home,
                "away_team_id": away
            })

        # Rotations-Prinzip: Erstes Team bleibt fix, alle anderen rotieren um 1 Position
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]

    # Rückspiele hinzufügen (Heim- und Auswärtsrecht vertauscht)
    if has_return_matches:
        return_matches = []
        for m in matches:
            return_matches.append({
                "round_number": m["round_number"] + num_rounds,
                "home_team_id": m["away_team_id"],
                "away_team_id": m["home_team_id"]
            })
        matches.extend(return_matches)

    return matches


# ==========================================
# 3. TABELLEN-BERECHNUNG MIT DIREKTEM VERGLEICH
# ==========================================
def calculate_standings(teams: list, matches: list) -> List[Dict[str, Any]]:
    """
    Berechnet die Tabelle nach dem Reglement:
    1. Punkte
    2. Direkter Vergleich zwischen punktgleichen Teams (Head-to-Head)
    3. Tordifferenz
    4. Erzielte Tore
    """
    stats = {
        t.id: {
            "id": t.id,
            "name": t.name,
            "group_name": t.group_name,
            "played": 0,
            "won": 0,
            "drawn": 0,
            "lost": 0,
            "gf": 0,   # Goals For (Tore geschossen)
            "ga": 0,   # Goals Against (Tore kassiert)
            "gd": 0,   # Goal Difference
            "points": 0
        }
        for t in teams
    }

    # Nur beendete Spiele auswerten (wo Tore eingetragen sind)
    finished_matches = [m for m in matches if m.home_score is not None and m.away_score is not None]

    for m in finished_matches:
        if m.home_team_id not in stats or m.away_team_id not in stats:
            continue

        h = stats[m.home_team_id]
        a = stats[m.away_team_id]

        h["played"] += 1
        a["played"] += 1
        h["gf"] += m.home_score
        h["ga"] += m.away_score
        a["gf"] += m.away_score
        a["ga"] += m.home_score

        if m.home_score > m.away_score:
            h["won"] += 1
            h["points"] += 3
            a["lost"] += 1
        elif m.home_score < m.away_score:
            a["won"] += 1
            a["points"] += 3
            h["lost"] += 1
        else:
            h["drawn"] += 1
            a["drawn"] += 1
            h["points"] += 1
            a["points"] += 1

    for s in stats.values():
        s["gd"] = s["gf"] - s["ga"]

    # Direkter Vergleich (Head-to-Head Matrix) berechnen
    def head_to_head_points(t1_id: int, t2_id: int) -> int:
        pts = 0
        for m in finished_matches:
            if m.home_team_id == t1_id and m.away_team_id == t2_id:
                if m.home_score > m.away_score: pts += 3
                elif m.home_score == m.away_score: pts += 1
            elif m.home_team_id == t2_id and m.away_team_id == t1_id:
                if m.away_score > m.home_score: pts += 3
                elif m.home_score == m.away_score: pts += 1
        return pts

    # Sortier-Algorithmus mit allen 4 Stufen
    def sort_key(team_dict):
        t_id = team_dict["id"]
        # Berechne H2H-Punkte gegen alle anderen Teams mit gleicher Gesamtpunktzahl
        tied_teams = [other["id"] for other in stats.values() if other["points"] == team_dict["points"] and other["id"] != t_id]
        h2h_score = sum(head_to_head_points(t_id, other_id) for other_id in tied_teams)

        return (
            team_dict["points"],
            h2h_score,
            team_dict["gd"],
            team_dict["gf"]
        )

    standings = sorted(stats.values(), key=sort_key, reverse=True)
    return standings
