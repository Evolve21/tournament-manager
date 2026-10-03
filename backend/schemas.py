from pydantic import BaseModel
from typing import Optional, List

# ==========================================
# 1. TURNIER-SCHEMAS
# ==========================================

class TournamentCreate(BaseModel):
    name: str = "Tournament Pro"
    mode: str = "groups"  # 'groups' oder 'league'
    has_return_matches: bool = False

class TournamentStartConfig(BaseModel):
    target_group_size: int = 4        # z. B. 4 Teams pro Gruppe
    advance_per_group: int = 2        # Wie viele pro Gruppe kommen ins K.-o.?
    cl_advance_count: int = 8         # Für CL-Modus: z. B. Top 8 kommen weiter

# ==========================================
# 2. TEAM-SCHEMAS
# ==========================================

class TeamCreate(BaseModel):
    name: str

class TeamResponse(BaseModel):
    id: int
    name: str
    group_name: Optional[str] = None

    class Config:
        from_attributes = True

# ==========================================
# 3. MATCH-SCHEMAS
# ==========================================

class MatchUpdateScore(BaseModel):
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    home_penalty: Optional[int] = None
    away_penalty: Optional[int] = None

class MatchResponse(BaseModel):
    id: int
    home_team_id: Optional[int] = None
    away_team_id: Optional[int] = None
    home_team_name: Optional[str] = None
    away_team_name: Optional[str] = None
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    home_penalty: Optional[int] = None
    away_penalty: Optional[int] = None
    stage: str
    round_number: int
    bracket_slot: Optional[int] = None

    class Config:
        from_attributes = True
