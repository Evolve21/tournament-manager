from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, default="Tournament Pro")
    mode = Column(String, default="groups")  # 'groups' oder 'league' (CL-Modus)
    has_return_matches = Column(Boolean, default=False)
    status = Column(String, default="setup") # 'setup', 'group_stage', 'knockout', 'finished'

    # Beziehungen zu Teams und Matches
    teams = relationship("Team", back_populates="tournament", cascade="all, delete-orphan")
    matches = relationship("Match", back_populates="tournament", cascade="all, delete-orphan")


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    name = Column(String, index=True)
    group_name = Column(String, nullable=True) # z.B. "A", "B" oder None bei CL

    # Beziehung zurück zum Turnier
    tournament = relationship("Tournament", back_populates="teams")


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id"))
    
    # Wer spielt?
    home_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    away_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)

    # Tore
    home_score = Column(Integer, nullable=True)
    away_score = Column(Integer, nullable=True)

    # Elfmeterschießen bei K.-o.-Spielen
    home_penalty = Column(Integer, nullable=True)
    away_penalty = Column(Integer, nullable=True)

    # Wo im Turnier gehört dieses Spiel hin?
    stage = Column(String, default="group") # 'group' oder 'knockout'
    round_number = Column(Integer, default=1) # Spieltag 1, 2, 3... ODER K.-o.-Runde: 1 (Finale), 2 (Halbfinale), 4 (Viertelfinale)
    bracket_slot = Column(Integer, nullable=True) # Eindeutiger Platz im K.-o.-Baum

    # Beziehungs-Definitionen
    tournament = relationship("Tournament", back_populates="matches")
    home_team = relationship("Team", foreign_keys=[home_team_id])
    away_team = relationship("Team", foreign_keys=[away_team_id])
