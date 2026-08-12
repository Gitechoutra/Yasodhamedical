# Forward schema changes

`backend/migrations/versions/` normally tracked the Alembic chain for changes
like these, but as of 2026-08-12 that directory's version files were removed
from git and `migrations/` was added to `.gitignore` — there is no usable
Alembic chain in this checkout. Until that's restored, a schema change ships
as a plain, dated `.sql` script here instead.

Each file is a hand-written set of `ALTER TABLE` statements (not a
`mysqldump`, unlike `database/archive/`). To apply one:

```bash
mysql -h 127.0.0.1 -u root -p hospital < 2026-08-12_appointments_payment_type.sql
```

After applying, `database/schema.sql` is hand-edited to match, so the tracked
dump stays a truthful snapshot of the live schema.
