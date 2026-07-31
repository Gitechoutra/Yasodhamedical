"""
config/config.py
================
Configuration classes for development, testing and production.

Every value resolves in this order, first hit wins:

    1. a real environment variable        -- what a deployment injects
    2. a variable in backend/.env         -- loaded by python-dotenv
    3. the matching key in config/dev.ini -- or prod.ini when APP_ENV=production
    4. the built-in default below

That order is what lets a server hold its secrets in the environment and never
have an ini file on disk, while `config/dev.ini` stays the single place to
edit locally. Both `config/dev.ini` and `.env` are git-ignored: no real
credential belongs in this file, so nothing here defaults to one.

Copy `config/dev.ini.example` to `config/dev.ini` and fill it in before
running. The environment-variable name for each key is documented there.
"""

import configparser
import os
from datetime import timedelta
from urllib.parse import quote_plus

import truststore
from dotenv import load_dotenv

# This machine sits behind SSL-inspecting network security software: curl
# trusts it (via the Windows certificate store) but Python's default
# certifi bundle doesn't, so any https call (e.g. to the Gemini API) fails
# with CERTIFICATE_VERIFY_FAILED. truststore makes Python's ssl module
# defer to the OS trust store instead, matching curl's behavior.
truststore.inject_into_ssl()

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(CONFIG_DIR, os.pardir))

# Populates os.environ from backend/.env for anything not already set.
# load_dotenv does not overwrite existing variables, which is exactly the
# precedence documented above: a real environment variable still wins.
load_dotenv(os.path.join(BASE_DIR, ".env"))

# APP_ENV (or FLASK_ENV) picks the ini file, so the same code runs against
# config/dev.ini locally and config/prod.ini on a server. Paths resolve
# relative to this file, not the cwd, so `python app.py` and
# `flask db upgrade` behave the same.
_ENV_OVERRIDE = os.getenv("APP_ENV") or os.getenv("FLASK_ENV")
INI_NAME = "prod.ini" if (_ENV_OVERRIDE or "").startswith("prod") else "dev.ini"
INI_PATH = os.path.join(CONFIG_DIR, INI_NAME)

# (environment variable, ini section, ini key, default)
SETTINGS = (
    ("SECRET_KEY", "flask", "secret_key", ""),
    ("JWT_SECRET_KEY", "jwt", "secret_key", ""),
    ("JWT_ACCESS_HOURS", "jwt", "access_token_expires_hours", "8"),
    ("JWT_REFRESH_DAYS", "jwt", "refresh_token_expires_days", "30"),
    # A full URL wins over the assembled host/port/name triple below -- it is
    # what a container platform or managed database hands you.
    ("DATABASE_URL", "database", "url", ""),
    ("DB_HOST", "database", "host", "127.0.0.1"),
    ("DB_PORT", "database", "port", "3306"),
    ("DB_NAME", "database", "name", "hospital"),
    ("DB_USER", "database", "user", "root"),
    ("DB_PASSWORD", "database", "password", ""),
    ("TEST_DB_NAME", "database", "test_name", "hospital_test"),
    ("DB_POOL_SIZE", "database", "pool_size", "10"),
    ("DB_MAX_OVERFLOW", "database", "max_overflow", "20"),
    ("DB_POOL_TIMEOUT", "database", "pool_timeout", "30"),
    ("DB_POOL_RECYCLE", "database", "pool_recycle", "280"),
    ("SQL_ECHO", "database", "echo", "false"),
    ("GEMINI_API_KEY", "ai", "gemini_api_key", ""),
    ("GEMINI_MODEL", "ai", "gemini_model", "gemini-flash-latest"),
    ("WHISPER_MODEL", "ai", "whisper_model", "small"),
    ("WHISPER_LANGUAGE", "ai", "whisper_language", ""),
    ("CORS_ORIGINS", "server", "cors_origins", "http://localhost:5173"),
    # Where the frontend is reachable. Encoded in the QR code printed on
    # consultation reports so a scan opens the record.
    ("PORTAL_BASE_URL", "server", "portal_base_url", "http://localhost:5173"),
    ("UPLOAD_FOLDER", "uploads", "folder", os.path.join(BASE_DIR, "uploads")),
    ("HOSPITAL_NAME", "hospital", "name", "Yasodha Hospitals"),
    ("HOSPITAL_TAGLINE", "hospital", "tagline", "Compassionate care, every day"),
    ("HOSPITAL_ADDRESS", "hospital", "address", ""),
    ("HOSPITAL_PHONE", "hospital", "phone", ""),
    ("HOSPITAL_EMAIL", "hospital", "email", ""),
    ("HOSPITAL_WEBSITE", "hospital", "website", ""),
)

# Secrets a running app must not fall back to a placeholder for.
REQUIRED = ("SECRET_KEY", "JWT_SECRET_KEY")

TRUTHY = {"1", "true", "yes", "on"}

# Looked up when an int setting fails to parse, so a typo falls back to the
# declared default instead of taking the whole import down.
DEFAULTS = {env_key: default for env_key, _section, _key, default in SETTINGS}


def _read_ini(path):
    # interpolation=None: passwords and keys may contain '%' or '$', which the
    # default interpolating parser would try to expand and choke on. It also
    # means a value written as "%(SOME_VAR)s" is read as that literal string
    # and never substituted -- put the real value here, or set the environment
    # variable named above the key in dev.ini.example.
    parser = configparser.ConfigParser(interpolation=None)
    if os.path.exists(path):
        parser.read(path, encoding="utf-8")
    return parser


_ini = _read_ini(INI_PATH)

# An explicit APP_ENV/FLASK_ENV always wins; otherwise the chosen ini says
# which environment this is. Kept out of SETTINGS because it is what picked
# the ini file in the first place.
APP_ENV = _ENV_OVERRIDE or _ini.get("flask", "env", fallback="development").strip()
IS_PRODUCTION = APP_ENV.startswith("prod")


def _resolve():
    """Merges the process environment (including .env) with the ini file.

    A key left blank in the ini falls back to the default rather than
    resolving to "" -- `folder =` under [uploads] means "wherever the default
    is", not "the current working directory". Keys whose default is itself
    empty (whisper_language, and the secrets checked below) are unaffected, so
    blank still means blank where blank is a real answer.
    """
    values = {}
    for env_key, section, key, default in SETTINGS:
        value = os.environ.get(env_key)
        if value is None and _ini.has_option(section, key):
            value = _ini.get(section, key)
        value = default if value is None else value.strip()
        values[env_key] = default if (value == "" and default) else value
    return values


_VALUES = _resolve()

missing = [k for k in REQUIRED if not _VALUES[k]]
if missing:
    raise RuntimeError(
        f"Missing required config: {', '.join(missing)}. "
        f"Set them in {INI_PATH} (copy config/dev.ini.example if it is not "
        "there yet) or export them as environment variables."
    )

# portal/ai/gemini_client.py and portal/ai/whisper_client.py read their
# settings straight from os.getenv rather than app.config, because they are
# importable outside an application context. Mirror the resolved values back
# into the environment so those modules see the ini file too. setdefault, not
# assignment: a real environment variable already won above and must not be
# clobbered here.
for _key, _value in _VALUES.items():
    os.environ.setdefault(_key, _value)
os.environ.setdefault("FLASK_ENV", APP_ENV)


def _as_int(key):
    try:
        return int(_VALUES[key])
    except (TypeError, ValueError):
        return int(DEFAULTS[key])


def _as_bool(key):
    return _VALUES[key].strip().lower() in TRUTHY


def _database_uri(db_name=None):
    """Assembles the SQLAlchemy URL, or returns DATABASE_URL when one is set.

    `db_name` overrides the configured database, which is how TestingConfig
    points at a throwaway copy. A caller-supplied name also means DATABASE_URL
    is bypassed -- it already names a database, and rewriting one out of an
    arbitrary URL is not something to guess at.

    quote_plus so a password containing @ : / # survives the URL.
    """
    if _VALUES["DATABASE_URL"] and db_name is None:
        return _VALUES["DATABASE_URL"]
    name = db_name or _VALUES["DB_NAME"]
    return (
        f"mysql+pymysql://{quote_plus(_VALUES['DB_USER'])}"
        f":{quote_plus(_VALUES['DB_PASSWORD'])}"
        f"@{_VALUES['DB_HOST']}:{_VALUES['DB_PORT']}/{name}?charset=utf8mb4"
    )


class BaseConfig:
    """Shared settings across all environments."""

    ENV_NAME = APP_ENV
    DEBUG = False
    TESTING = False

    SECRET_KEY = _VALUES["SECRET_KEY"]

    # -- Database ----------------------------------------------------------
    DB_HOST = _VALUES["DB_HOST"]
    DB_PORT = _VALUES["DB_PORT"]
    DB_NAME = _VALUES["DB_NAME"]
    DB_USER = _VALUES["DB_USER"]
    DB_PASSWORD = _VALUES["DB_PASSWORD"]

    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = _as_bool("SQL_ECHO")
    # Pooling has to live inside ENGINE_OPTIONS: Flask-SQLAlchemy 3.x dropped
    # the standalone SQLALCHEMY_POOL_SIZE / _MAX_OVERFLOW / _POOL_TIMEOUT keys
    # and ignores them silently, so setting those would look configured and do
    # nothing. pool_pre_ping catches connections MySQL closed while idle.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": _as_int("DB_POOL_RECYCLE"),
    }

    # -- JWT ---------------------------------------------------------------
    JWT_SECRET_KEY = _VALUES["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=_as_int("JWT_ACCESS_HOURS"))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=_as_int("JWT_REFRESH_DAYS"))
    JWT_ALGORITHM = "HS256"

    # -- CORS --------------------------------------------------------------
    CORS_ORIGINS = [o.strip() for o in _VALUES["CORS_ORIGINS"].split(",") if o.strip()]

    # -- AI ----------------------------------------------------------------
    GEMINI_API_KEY = _VALUES["GEMINI_API_KEY"]
    GEMINI_MODEL = _VALUES["GEMINI_MODEL"]
    WHISPER_MODEL = _VALUES["WHISPER_MODEL"]
    WHISPER_LANGUAGE = _VALUES["WHISPER_LANGUAGE"]

    # -- File storage ------------------------------------------------------
    # Avatars and patient photos. Absolute, so a deployment can point it at a
    # mounted volume instead of leaving uploads next to the code.
    UPLOAD_FOLDER = os.path.abspath(_VALUES["UPLOAD_FOLDER"])
    # Backstop for the whole request body. Individual images are capped at
    # 2 MB by helpers/uploads.py, which returns a clean 413 with a message;
    # this only catches something far larger before it is buffered.
    MAX_CONTENT_LENGTH = 32 * 1024 * 1024

    # -- Report letterhead -------------------------------------------------
    PORTAL_BASE_URL = _VALUES["PORTAL_BASE_URL"].rstrip("/")
    HOSPITAL = {
        "name": _VALUES["HOSPITAL_NAME"],
        "tagline": _VALUES["HOSPITAL_TAGLINE"],
        "address": _VALUES["HOSPITAL_ADDRESS"],
        "phone": _VALUES["HOSPITAL_PHONE"],
        "email": _VALUES["HOSPITAL_EMAIL"],
        "website": _VALUES["HOSPITAL_WEBSITE"],
    }


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    """Points at a throwaway database so a test run can drop and recreate
    tables without ever touching real patient records."""

    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = _database_uri(_VALUES["TEST_DB_NAME"])
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(minutes=10)


class ProductionConfig(BaseConfig):
    DEBUG = False
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_size": _as_int("DB_POOL_SIZE"),
        "max_overflow": _as_int("DB_MAX_OVERFLOW"),
        "pool_timeout": _as_int("DB_POOL_TIMEOUT"),
        "pool_recycle": _as_int("DB_POOL_RECYCLE"),
    }


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
    "default": DevelopmentConfig,
}


def get_config(name=None):
    """Returns the config class for `name`, or for the current APP_ENV.

    Prefix matching, not a plain dict lookup: a deployment that exports
    APP_ENV=prod (or FLASK_ENV=production) has to land on ProductionConfig,
    and silently falling back to the development defaults there would run a
    real server with DEBUG on.
    """
    if name is None:
        name = "production" if IS_PRODUCTION else APP_ENV
    name = (name or "").strip().lower()
    if name.startswith("prod"):
        return ProductionConfig
    if name.startswith("test"):
        return TestingConfig
    if name.startswith("dev"):
        return DevelopmentConfig
    return config_by_name.get(name, config_by_name["default"])
