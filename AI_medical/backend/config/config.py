import configparser
import os
from datetime import timedelta
from urllib.parse import quote_plus

import truststore

# This machine sits behind SSL-inspecting network security software: curl
# trusts it (via the Windows certificate store) but Python's default
# certifi bundle doesn't, so any https call (e.g. to the Gemini API) fails
# with CERTIFICATE_VERIFY_FAILED. truststore makes Python's ssl module
# defer to the OS trust store instead, matching curl's behavior.
truststore.inject_into_ssl()

CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))

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
    ("JWT_SECRET_KEY", "flask", "jwt_secret_key", ""),
    ("DB_HOST", "database", "host", "127.0.0.1"),
    ("DB_PORT", "database", "port", "3306"),
    ("DB_NAME", "database", "name", "hospital"),
    ("DB_USER", "database", "user", "root"),
    ("DB_PASSWORD", "database", "password", ""),
    ("GEMINI_API_KEY", "ai", "gemini_api_key", ""),
    ("GEMINI_MODEL", "ai", "gemini_model", "gemini-flash-latest"),
    ("WHISPER_MODEL", "ai", "whisper_model", "small"),
    ("WHISPER_LANGUAGE", "ai", "whisper_language", ""),
    ("CORS_ORIGINS", "server", "cors_origins", "http://localhost:5173"),
)

# Secrets a running app must not fall back to a placeholder for.
REQUIRED = ("SECRET_KEY", "JWT_SECRET_KEY")


def _read_ini(path):
    # interpolation=None: passwords and keys may contain '%' or '$', which
    # the default interpolating parser would try to expand and choke on.
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
    """Merge the ini file with the process environment.

    Precedence: real environment variable > ini file > built-in default.
    That order lets a deployment inject secrets without writing them to
    disk, while `config/dev.ini` stays the single place to edit locally.
    """
    values = {}
    for env_key, section, key, default in SETTINGS:
        value = os.environ.get(env_key)
        if value is None and _ini.has_option(section, key):
            value = _ini.get(section, key)
        values[env_key] = default if value is None else value.strip()
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
# settings straight from os.getenv, so mirror the resolved values back into
# the environment. setdefault, not assignment: a real environment variable
# already won above and must not be clobbered.
for _key, _value in _VALUES.items():
    os.environ.setdefault(_key, _value)
os.environ.setdefault("FLASK_ENV", APP_ENV)


class BaseConfig:
    ENV_NAME = APP_ENV

    SECRET_KEY = _VALUES["SECRET_KEY"]
    JWT_SECRET_KEY = _VALUES["JWT_SECRET_KEY"]
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    DB_HOST = _VALUES["DB_HOST"]
    DB_PORT = _VALUES["DB_PORT"]
    DB_NAME = _VALUES["DB_NAME"]
    DB_USER = _VALUES["DB_USER"]
    DB_PASSWORD = _VALUES["DB_PASSWORD"]

    # quote_plus so passwords containing @ : / # survive the URL.
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
        f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_recycle": 280}

    GEMINI_API_KEY = _VALUES["GEMINI_API_KEY"]
    GEMINI_MODEL = _VALUES["GEMINI_MODEL"]
    WHISPER_MODEL = _VALUES["WHISPER_MODEL"]
    CORS_ORIGINS = [o.strip() for o in _VALUES["CORS_ORIGINS"].split(",") if o.strip()]


class DevConfig(BaseConfig):
    DEBUG = True


class ProdConfig(BaseConfig):
    DEBUG = False


def get_config():
    return ProdConfig if IS_PRODUCTION else DevConfig
