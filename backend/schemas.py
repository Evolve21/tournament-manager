from pydantic import BaseModel
from typing import Optional

class TournamentStartConfig(BaseModel):
    mode: str = "groups"
    target_group_size: int = 4
    advance_per_group: int = 2
    cl_matches_per_team: int = 4
    cl_advance_count: int = 4

class TeamCreate(BaseModel):
    name: str

class TeamResponse(BaseModel):
    id: int
    name: str
    group_name: Optional[str] = None

    class Config:
        from_attributes = True

class MatchUpdateScore(BaseModel):
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    home_penalty: Optional[int] = None
    away_penalty: Optional[int] = None
