def to_utc_iso(dt):
    """Serializes a naive UTC datetime (as stored by db.func.now()/utcnow()) with an
    explicit 'Z' suffix so JS `new Date(...)` parses it as UTC instead of local time."""
    if dt is None:
        return None
    return dt.isoformat() + "Z"
