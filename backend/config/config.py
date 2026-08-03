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
    # -- [server] ----------------------------------------------------------
    ("SECRET_KEY", "server", "app_secret_key", ""),
    ("DATABASE_URL", "server", "sqlalchemy_database_uri", ""),
    ("TEST_DATABASE_URL", "server", "sqlalchemy_test_database_uri", ""),
    ("SQLALCHEMY_TRACK_MODIFICATIONS", "server", "sqlalchemy_track_modifications", "false"),
    ("SQL_ECHO", "server", "sqlalchemy_echo", "false"),
    ("DB_POOL_SIZE", "server", "sqlalchemy_pool_size", "10"),
    ("DB_MAX_OVERFLOW", "server", "sqlalchemy_max_overflow", "20"),
    ("DB_POOL_TIMEOUT", "server", "sqlalchemy_pool_timeout", "30"),
    ("DB_POOL_RECYCLE", "server", "sqlalchemy_pool_recycle", "280"),
    ("PORTAL_BASE_URL", "server", "frontend_base_url", "http://localhost:5173"),
    ("CORS_ORIGINS", "server", "cors_origins", "http://localhost:5173"),
    # -- [jwt] -------------------------------------------------------------
    ("JWT_SECRET_KEY", "jwt", "secret_key", ""),
    ("JWT_ACCESS_MINUTES", "jwt", "access_token_expires_minutes", "480"),
    ("JWT_REFRESH_DAYS", "jwt", "refresh_token_expires_days", "30"),
    # -- [upload_folder] ---------------------------------------------------
    ("UPLOAD_FOLDER", "upload_folder", "upload_folder", "uploads"),
    # -- [gemini] / [whisper] ----------------------------------------------
    ("GEMINI_API_KEY", "gemini", "api_key", ""),
    ("GEMINI_MODEL", "gemini", "model", "gemini-flash-latest"),
    ("WHISPER_MODEL", "whisper", "model", "small"),
    ("WHISPER_LANGUAGE", "whisper", "language", ""),
    # -- [hospital] --------------------------------------------------------
    ("HOSPITAL_NAME", "hospital", "name", "Yasodha Hospitals"),
    ("HOSPITAL_TAGLINE", "hospital", "tagline", "Compassionate care, every day"),
    ("HOSPITAL_ADDRESS", "hospital", "address", ""),
    ("HOSPITAL_PHONE", "hospital", "phone", ""),
    ("HOSPITAL_EMAIL", "hospital", "email", ""),
    ("HOSPITAL_WEBSITE", "hospital", "website", ""),
)

# Config a running app must not start without. The database URL is in here
# because there is no host/port fallback that could assemble a working one --
# without it the app would boot fine and then fail on the first query.
REQUIRED = ("SECRET_KEY", "JWT_SECRET_KEY", "DATABASE_URL")

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
APP_ENV = _ENV_OVERRIDE or _ini.get("server", "environment", fallback="development").strip()
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


def _test_database_uri():
    """The database TestingConfig points at.

    Uses `sqlalchemy_test_database_uri` when one is written down. Otherwise it
    derives one by suffixing `_test` onto the database named in the main URL,
    so a test run can never be pointed at live patient records by forgetting
    to set a second URL.
    """
    explicit = _VALUES["TEST_DATABASE_URL"]
    if explicit:
        return explicit

    base, sep, query = _VALUES["DATABASE_URL"].partition("?")
    head, slash, name = base.rpartition("/")
    if not name:
        # Nothing that looks like a database name to suffix -- better to hand
        # back something obviously unusable than to silently return the live
        # URL and let a test suite drop real tables.
        return ""
    return f"{head}{slash}{name}_test{sep}{query}"


def _upload_folder():
    """Resolves UPLOAD_FOLDER to an absolute path.

    A relative value resolves against backend/, never the working directory:
    `python app.py` and `flask db upgrade` are run from different places, and
    uploads landing in two directories depending on how you started the server
    is the kind of bug you only notice when a photo 404s.
    """
    folder = _VALUES["UPLOAD_FOLDER"]
    if not os.path.isabs(folder):
        folder = os.path.join(BASE_DIR, folder)
    return os.path.abspath(folder)


class BaseConfig:
    """Shared settings across all environments."""

    ENV_NAME = APP_ENV
    DEBUG = False
    TESTING = False

    SECRET_KEY = _VALUES["SECRET_KEY"]

    # -- Database ----------------------------------------------------------
    SQLALCHEMY_DATABASE_URI = _VALUES["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = _as_bool("SQLALCHEMY_TRACK_MODIFICATIONS")
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
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=_as_int("JWT_ACCESS_MINUTES"))
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
    UPLOAD_FOLDER = _upload_folder()
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
    SQLALCHEMY_DATABASE_URI = _test_database_uri()
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
