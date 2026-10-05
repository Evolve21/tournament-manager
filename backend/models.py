from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Tournament Pro")
    year = Column(Integer, default=2026)
    mode = Column(String, default="groups")  # 'groups' oder 'cl'
    has_return_matches = Column(Boolean, default=False)
    advance_count = Column(Integer, default=2)
    status = Column(String, default="setup") # 'setup', 'group_stage', 'knockout', 'finished'

    teams = relationship("Team", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="tournament", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    name = Column(String, index=True)
    group_name = Column(String, nullable=True)

    tournament = relationship("Tournament", back_populates="teams")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)
    home_penalty = Column(Integer, nullable=True)
    away_penalty = Column(Integer, nullable=True)

    stage = Column(String, default="group") # 'group' oder 'knockout'
    round_number = Column(Integer, default=1)
    bracket_slot = Column(Integer, nullable=True)
    next_match_id = Column(Integer, ForeignKey("matches.id"), nullable=True)
    next_match_slot = Column(String, nullable=True) # 'home' oder 'away'

    tournament = relationship("Tournament", back_populates="matches")
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])

class PastTournament(Base):
    __tablename__ = "past_tournaments"

    id = Column(Integer, primary_key=True, index=True)
    tournament_name = Column(String)
    year = Column(Integer)
    winner_name = Column(String)
    runner_up_name = Column(String)
    top_scorer_name = Column(String)
    top_scorer_goals = Column(Integer)
