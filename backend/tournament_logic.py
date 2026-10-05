import random
import math
from typing import List, Dict, Any, Optional

def is_power_of_two(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0

def split_into_groups(team_ids: List[int], target_group_size: int = 4) -> Dict[str, List[int]]:
    n = len(team_ids)
    if n == 0:
        return {}
    
    # 1. Echter Zufallstopf: Reihenfolge komplett mischen
    shuffled_ids = list(team_ids)
    random.shuffle(shuffled_ids)

    num_groups = max(1, round(n / target_group_size))
    groups: Dict[str, List[int]] = {chr(65 + i): [] for i in range(num_groups)}
    for index, team_id in enumerate(shuffled_ids):
        groups[chr(65 + (index % num_groups))].append(team_id)
    return groups

def generate_round_robin_matches(team_ids: List[int], has_return_matches: bool = False) -> List[Dict[str, Any]]:
    teams = list(team_ids)
    if len(teams) % 2 != 0:
        teams.append(None)
    n = len(teams)
    num_rounds = n - 1
    matches = []

    for round_num in range(num_rounds):
        for i in range(n // 2):
            t1, t2 = teams[i], teams[n - 1 - i]
            if t1 is None or t2 is None:
                continue
            home, away = (t1, t2) if (round_num + i) % 2 == 0 else (t2, t1)
            matches.append({
                "round_number": round_num + 1,
                "home_team_id": home,
                "away_team_id": away
            })
        teams = [teams[0]] + [teams[-1]] + teams[1:-1]

    if has_return_matches:
        ret = []
        for m in matches:
            ret.append({
                "round_number": m["round_number"] + num_rounds,
                "home_team_id": m["away_team_id"],
                "away_team_id": m["home_team_id"]
            })
        matches.extend(ret)
    return matches

def generate_cl_matches(team_ids: List[int], matches_per_team: int) -> List[Dict[str, Any]]:
    # Nutzt den Berger-Algorithmus und schneidet auf matches_per_team ab
    all_possible = generate_round_robin_matches(team_ids, has_return_matches=True)
    # Filtern auf die gewünschte Anzahl Spieltage
    max_rounds = min(matches_per_team, len(team_ids) - 1 if len(team_ids) % 2 == 0 else len(team_ids))
    return [m for m in all_possible if m["round_number"] <= max_rounds]

def calculate_standings(teams: list, matches: list) -> List[Dict[str, Any]]:
    stats = {
        t.id: {
            "id": t.id,
            "name": t.name,
            "group_name": t.group_name,
            "played": 0, "won": 0, "drawn": 0, "lost": 0,
            "gf": 0, "ga": 0, "gd": 0, "points": 0
        }
        for t in teams
    }
    fin = [m for m in matches if m.home_score is not None and m.away_score is not None]

    for m in fin:
        if m.home_team_id not in stats or m.away_team_id not in stats:
            continue
        h, a = stats[m.home_team_id], stats[m.away_team_id]
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

    def h2h_points(t1, t2):
        pts = 0
        for m in fin:
            if m.home_team_id == t1 and m.away_team_id == t2:
                if m.home_score > m.away_score: pts += 3
                elif m.home_score == m.away_score: pts += 1
            elif m.home_team_id == t2 and m.away_team_id == t1:
                if m.away_score > m.home_score: pts += 3
                elif m.away_score == m.home_score: pts += 1
        return pts

    # Tie-Breaker: Punkte -> Direkter Vergleich -> Tordifferenz -> Erzielte Tore -> Alphabetisch (Name A-Z)
    return sorted(
        stats.values(),
        key=lambda item: (
            item["points"],
            sum(h2h_points(item["id"], o["id"]) for o in stats.values() if o["points"] == item["points"] and o["id"] != item["id"]),
            item["gd"],
            item["gf"],
            # Buchstabe für Buchstabe invertiert, damit bei reverse=True A vor B landet:
            [-ord(c) for c in item["name"].lower()]
        ),
        reverse=True
    )
