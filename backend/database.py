from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Keep SQLite data in the backend directory, regardless of the process working directory.
DATABASE_URL = f"sqlite:///{Path(__file__).resolve().parent / 'tournament.db'}"

# 2. Der Motor (Engine): Stellt die physische Verbindung zur Datei her
engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# 3. Die Fabrik für Sitzungen (Sessions)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Die Basisklasse für unsere späteren Tabellen
Base = declarative_base()

# 5. Der Türsteher / Helfer für Datenbank-Zugriffe
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
