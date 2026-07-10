from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    league: Mapped[str] = mapped_column(String, index=True)
    name: Mapped[str] = mapped_column(String)
    abbreviation: Mapped[str] = mapped_column(String)

    # Relationships
    home_games: Mapped[list["Game"]] = relationship(
        "Game", foreign_keys="[Game.home_team_id]", back_populates="home_team"
    )
    away_games: Mapped[list["Game"]] = relationship(
        "Game", foreign_keys="[Game.away_team_id]", back_populates="away_team"
    )
    rating: Mapped["Rating"] = relationship("Rating", back_populates="team", uselist=False)
    rating_history: Mapped[list["RatingHistory"]] = relationship("RatingHistory", back_populates="team")


class Game(Base):
    __tablename__ = "games"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    league: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String)  # e.g., "scheduled", "in_progress", "completed"

    # Relationships
    home_team: Mapped["Team"] = relationship("Team", foreign_keys=[home_team_id], back_populates="home_games")
    away_team: Mapped["Team"] = relationship("Team", foreign_keys=[away_team_id], back_populates="away_games")
    prediction: Mapped["Prediction"] = relationship("Prediction", back_populates="game", uselist=False)


class Rating(Base):
    __tablename__ = "ratings"

    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), primary_key=True)
    elo_rating: Mapped[float] = mapped_column(Float)
    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    team: Mapped["Team"] = relationship("Team", back_populates="rating")


class RatingHistory(Base):
    __tablename__ = "rating_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"), nullable=True, index=True)
    elo_rating: Mapped[float] = mapped_column(Float)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    team: Mapped["Team"] = relationship("Team", back_populates="rating_history")
    game: Mapped[Optional["Game"]] = relationship("Game")


class Prediction(Base):
    __tablename__ = "predictions"

    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), primary_key=True)
    home_win_prob: Mapped[float] = mapped_column(Float)
    away_win_prob: Mapped[float] = mapped_column(Float)
    draw_prob: Mapped[float | None] = mapped_column(Float, nullable=True)

    game: Mapped["Game"] = relationship("Game", back_populates="prediction")


class FetchRun(Base):
    __tablename__ = "fetch_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    league: Mapped[str] = mapped_column(String, index=True)
    status: Mapped[str] = mapped_column(String)  # "success", "error"
