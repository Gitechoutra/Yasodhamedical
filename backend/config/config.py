"""
config/config.py
================
Configuration classes for development, testing and production.

Every value resolves in this order, first hit wins:

    1. a real environment variable        -- what a deployment injects
    2. a variable in backend/.env, or backend/venv/.env
    3. the matching key in config/dev.ini -- or prod.ini when APP_ENV=production
    4. the built-in default below

That order is what lets a server hold its secrets in the environment and never
have an ini file on disk, while `config/dev.ini` stays the single place to
edit locally. `config/dev.ini`, `.env` and `venv/` are all git-ignored: no
real credential belongs in this file, so nothing here defaults to one.

The ini is read forgivingly, because it is written by hand:

  * Keys above the first [section] header are read as [server], so a file
    that opens straight into `sqlalchemy_database_uri = ...` still loads.
  * Values are literal -- '%' and '$' in a password need no escaping.
  * The one exception is a value written as exactly %(NAME)s, which is
    replaced by the environment variable NAME. That keeps a secret in .env
    while the ini still documents that the key exists. An unset NAME
    resolves to empty rather than to the literal text, so a required secret
    left unresolved is reported as missing instead of being handed to an
    API as if it were real.
  * ALIASES below lists the alternative environment-variable spellings
    accepted for a setting, so a .env written in the shared house style
    (APP_SECRET_KEY, FRONTEND_BASE_URL, ...) works unmodified.

SETTINGS is the full list of keys, each with its section, ini key and
default. REQUIRED names the three the app refuses to start without.
"""

import configparser
import os
import re
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

# Populates os.environ from a .env file for anything not already set.
# load_dotenv does not overwrite existing variables, which is exactly the
# precedence documented above: a real environment variable still wins, and
# the first file listed here wins over the second.
#
# backend/venv/.env is checked as well as backend/.env because that is where
# this machine's file lives. Both are git-ignored (backend/.gitignore ignores
# `.env` and the whole of `venv/`), so neither can carry a credential into a
# commit -- but note that deleting and recreating the virtualenv would take
# venv/.env with it, which backend/.env would survive.
for _env_file in (os.path.join(BASE_DIR, ".env"), os.path.join(BASE_DIR, "venv", ".env")):
    load_dotenv(_env_file)

# APP_ENV (or FLASK_ENV) picks the ini file, so the same code runs against
# config/dev.ini locally and config/prod.ini on a server. Paths resolve
# relative to this file, not the cwd, so `python app.py` and
# `flask db upgrade` behave the same.
_ENV_OVERRIDE = os.getenv("APP_ENV") or os.getenv("FLASK_ENV")
INI_NAME = "prod.ini" if (_ENV_OVERRIDE or "").startswith("prod") else "dev.ini"
INI_PATH = os.path.join(CONFIG_DIR, INI_NAME)

# (environment variable, ini section, ini key, default)
SETTINGS = (
    # -- [flask] -----------------------------------------------------------
    ("SECRET_KEY", "flask", "secret_key", ""),
    ("JWT_SECRET_KEY", "flask", "jwt_secret_key", ""),
    ("JWT_ACCESS_MINUTES", "flask", "jwt_access_minutes", "480"),
    ("JWT_REFRESH_DAYS", "flask", "jwt_refresh_days", "30"),
    # -- [database] --------------------------------------------------------
    # Kept as separate parts rather than one URL: each is percent-encoded
    # when the URL is assembled, so a password containing @ : / ? or # needs
    # no escaping by hand. DATABASE_URL still overrides the lot, for a host
    # that injects a complete URL.
    ("DB_HOST", "database", "host", ""),
    ("DB_PORT", "database", "port", "3306"),
    ("DB_NAME", "database", "name", ""),
    ("DB_USER", "database", "user", ""),
    ("DB_PASSWORD", "database", "password", ""),
    ("DB_CHARSET", "database", "charset", "utf8mb4"),
    ("DATABASE_URL", "database", "url", ""),
    ("TEST_DATABASE_URL", "database", "test_url", ""),
    ("SQLALCHEMY_TRACK_MODIFICATIONS", "database", "track_modifications", "false"),
    ("SQL_ECHO", "database", "echo", "false"),
    ("DB_POOL_SIZE", "database", "pool_size", "10"),
    ("DB_MAX_OVERFLOW", "database", "max_overflow", "20"),
    ("DB_POOL_TIMEOUT", "database", "pool_timeout", "30"),
    ("DB_POOL_RECYCLE", "database", "pool_recycle", "280"),
    # -- [ai] --------------------------------------------------------------
    # Transcription and consultation summaries both run through Gemini.
    ("GEMINI_API_KEY", "ai", "gemini_api_key", ""),
    ("GEMINI_MODEL", "ai", "gemini_model", "gemini-flash-latest"),
    # -- [server] ----------------------------------------------------------
    ("CORS_ORIGINS", "server", "cors_origins", "http://localhost:5173"),
    ("PORTAL_BASE_URL", "server", "portal_base_url", "http://localhost:5173"),
    # -- [upload_folder] ---------------------------------------------------
    ("UPLOAD_FOLDER", "upload_folder", "upload_folder", "uploads"),
    # -- [hospital] --------------------------------------------------------
    ("HOSPITAL_NAME", "hospital", "name", "Yasodha Hospitals"),
    ("HOSPITAL_TAGLINE", "hospital", "tagline", "Compassionate care, every day"),
    ("HOSPITAL_ADDRESS", "hospital", "address", ""),
    ("HOSPITAL_PHONE", "hospital", "phone", ""),
    ("HOSPITAL_EMAIL", "hospital", "email", ""),
    ("HOSPITAL_WEBSITE", "hospital", "website", ""),
)

# Config a running app must not start without. Host, name and user are listed
# individually rather than as one URL because they have no safe default: a
# blank one would assemble a syntactically valid URL pointing at the wrong
# database, and the app would boot fine and fail on the first query. The
# password is deliberately absent -- an empty password is a real answer.
REQUIRED = ("SECRET_KEY", "JWT_SECRET_KEY", "DB_HOST", "DB_NAME", "DB_USER")

# Extra environment-variable names accepted for a setting, checked in order
# after the canonical name in SETTINGS. These are the spellings used by the
# house .env template shared across projects -- accepting them means one .env
# works here without being rewritten, and without this file growing a second
# way to express the same setting.
ALIASES = {
    "SECRET_KEY": ("APP_SECRET_KEY",),
    "DATABASE_URL": ("SQLALCHEMY_DATABASE_URI",),
    "TEST_DATABASE_URL": ("SQLALCHEMY_TEST_DATABASE_URI",),
    "SQL_ECHO": ("SQLALCHEMY_ECHO",),
    "JWT_ACCESS_MINUTES": ("JWT_ACCESS_TOKEN_EXPIRES_MINUTES",),
    "JWT_REFRESH_DAYS": ("JWT_REFRESH_TOKEN_EXPIRES_DAYS",),
    "PORTAL_BASE_URL": ("FRONTEND_BASE_URL",),
    "DB_PASSWORD": ("MYSQL_PASSWORD",),
}

TRUTHY = {"1", "true", "yes", "on"}

# Looked up when an int setting fails to parse, so a typo falls back to the
# declared default instead of taking the whole import down.
DEFAULTS = {env_key: default for env_key, _section, _key, default in SETTINGS}


def _with_leading_section(text, section="flask"):
    """Accepts an ini whose first keys sit above its first [section] header.

    configparser raises MissingSectionHeaderError on such a file and takes the
    whole import down with it -- which is how a hand-edited dev.ini can stop
    the app from importing at all. [flask] is the first section of this
    project's ini, so an unheaded preamble is read as that: the file loads as
    it was plainly meant instead of being refused outright.

    A file that already opens with a header is returned untouched.
    """
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped[0] in "#;":
            continue
        return text if stripped.startswith("[") else f"[{section}]\n{text}"
    return text


def _read_ini(path):
    # interpolation=None: passwords and keys may contain '%' or '$', which the
    # default interpolating parser would try to expand and choke on. Values
    # written as "%(SOME_VAR)s" are therefore read literally here and resolved
    # against the environment later, by _expand().
    parser = configparser.ConfigParser(interpolation=None)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            parser.read_string(_with_leading_section(handle.read()), source=path)
    return parser


_PLACEHOLDER = re.compile(r"%\((\w+)\)s")


def _expand(value):
    """Resolves %(NAME)s in an ini value against the environment.

    Interpolation is off in the parser, so a key written as

        api_key = %(GEMINI_API_KEY)s

    otherwise arrives as that literal 19-character string -- which would be
    sent to Google as the API key and rejected with a confusing 400. When any
    named variable is unset the whole value resolves to empty instead, so the
    built-in default applies and REQUIRED still catches a missing secret
    rather than letting a placeholder pass for one.
    """
    if "%(" not in value:
        return value
    if any(not os.environ.get(name) for name in _PLACEHOLDER.findall(value)):
        return ""
    return _PLACEHOLDER.sub(lambda m: os.environ[m.group(1)], value)


_ini = _read_ini(INI_PATH)

# An explicit APP_ENV/FLASK_ENV always wins; otherwise the chosen ini says
# which environment this is. Kept out of SETTINGS because it is what picked
# the ini file in the first place.
APP_ENV = _ENV_OVERRIDE or _ini.get("flask", "env", fallback="development").strip()
IS_PRODUCTION = APP_ENV.startswith("prod")


def _resolve():
    """Merges the process environment (including .env) with the ini file.

    A key left blank in the ini falls back to the default rather than
    resolving to "" -- `upload_folder =` means "wherever the default is", not
    "the current working directory". Keys whose default is itself empty (the
    database password, and the secrets checked below) are unaffected, so blank
    still means blank where blank is a real answer.
    """
    values = {}
    for env_key, section, key, default in SETTINGS:
        value = next(
            (os.environ[n] for n in (env_key, *ALIASES.get(env_key, ())) if n in os.environ),
            None,
        )
        if value is None and _ini.has_option(section, key):
            value = _expand(_ini.get(section, key))
        value = default if value is None else value.strip()
        values[env_key] = default if (value == "" and default) else value
    return values


_VALUES = _resolve()

missing = [k for k in REQUIRED if not _VALUES[k]]
if missing:
    raise RuntimeError(
        f"Missing required config: {', '.join(missing)}. Set them in "
        f"{INI_PATH}, in backend/.env, or as environment variables. The ini "
        "section and key for each is listed in SETTINGS in config/config.py. "
        "A key written as %(NAME)s needs the environment variable NAME set, "
        "or it counts as blank."
    )

# portal/ai/gemini_client.py reads GEMINI_API_KEY and GEMINI_MODEL straight
# from os.getenv rather than app.config, because it is importable outside an
# application context. Mirror the resolved values back into the environment so
# it sees the ini file too. setdefault, not assignment: a real environment
# variable already won above and must not be clobbered here.
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


def _build_database_url(name):
    """Assembles a SQLAlchemy URL for the database called `name`.

    The user and password are percent-encoded, which is the point of keeping
    [database] as separate parts: a password containing @ : / ? or # is
    ordinary, and each of those is a delimiter inside a URL. Written as one
    `url = ...` line it would have to be escaped by hand, and the failure mode
    when it isn't is a connection to the wrong host rather than an error.

    charset stays on the query string -- consultation transcripts carry
    Telugu, Hindi and Tamil text, and MySQL mangles it on the way in without
    utf8mb4.
    """
    credentials = quote_plus(_VALUES["DB_USER"])
    if _VALUES["DB_PASSWORD"]:
        credentials += f":{quote_plus(_VALUES['DB_PASSWORD'])}"
    url = (
        f"mysql+pymysql://{credentials}@"
        f"{_VALUES['DB_HOST']}:{_VALUES['DB_PORT']}/{name}"
    )
    charset = _VALUES["DB_CHARSET"]
    return f"{url}?charset={charset}" if charset else url


def _database_uri():
    """The database the app runs against.

    A complete DATABASE_URL wins when one is given -- a managed host hands out
    a single connection string, and taking it apart just to rebuild it would
    lose anything in it we do not model.
    """
    return _VALUES["DATABASE_URL"] or _build_database_url(_VALUES["DB_NAME"])


def _test_database_uri():
    """The database TestingConfig points at.

    Uses an explicit test URL when one is written down. Otherwise it appends
    `_test` to the configured database name, so a test run can never be
    pointed at live patient records by forgetting to set a second URL.
    """
    explicit = _VALUES["TEST_DATABASE_URL"]
    if explicit:
        return explicit
    if not _VALUES["DB_NAME"]:
        # Nothing to suffix -- better to hand back something obviously
        # unusable than a URL a test suite might drop real tables in.
        return ""
    return _build_database_url(f"{_VALUES['DB_NAME']}_test")


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
    SQLALCHEMY_DATABASE_URI = _database_uri()
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
