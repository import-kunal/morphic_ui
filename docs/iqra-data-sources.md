# Configure the PostgreSQL database

> **CURRENT 2026-08-26.** Applies to the read-only mutual-fund agent in MorphicUI.

## Outcome

MorphicUI reads factual mutual-fund data only from PostgreSQL. There is no JSON, JSONL, CSV, or
automatic local-file fallback in the runtime.

The agent has three bounded functions:

- `search_iqra_entities` resolves fund, scheme, manager, AMC, security, and benchmark names.
- `query_iqra_data` reads allow-listed fields with validated filters, ordering, and row limits.
- `analyze_iqra_data` calculates latest-portfolio overlap, common holdings, allocation, and
  concentration.

The model never receives database credentials and cannot submit arbitrary SQL.

## Local configuration

Copy `.env.example` to `.env.local` and set:

```dotenv
DATABASE_URL=postgresql://mf_saarthi:<url-encoded-password>@127.0.0.1:5432/iqra_local
POSTGRES_SSL_MODE=disable
QUERY_TIMEOUT_MS=20000
```

Use `POSTGRES_SSL_MODE=require` for a remote server unless its administrator gives different
instructions. Restart `bun run dev` after changing environment variables.

## Restore the supplied SQL dump

The file `database/data_20260826T101122Z.sql` is a plain PostgreSQL dump of about 2.81 GiB. It starts
with cleanup statements, so restore it only into a new, empty database. Do not open it in pgAdmin's
Query Tool; loading a file this large into the editor can exhaust memory.

1. In pgAdmin, connect to `PostgreSQL 17` with the `postgres` password created during installation.
2. Create an empty database named `iqra_local`, initially owned by `postgres`.
3. Run this in PowerShell. `-W` asks for the password privately:

   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" `
     -X -v ON_ERROR_STOP=1 -W `
     -h 127.0.0.1 -p 5432 -U postgres -d iqra_local `
     -f "C:\Development\Saarthi\morphic_ui\database\data_20260826T101122Z.sql"
   ```

4. If the command fails, preserve its first error. Because the dump contains cleanup statements,
   drop and recreate only `iqra_local` before retrying; do not replay it into a partly restored
   database.

The application dump directory is ignored by Git, so the multi-gigabyte file is not committed.

## Create the application login

Connect as `postgres`, then create a login without superuser or database-creation privileges. Let
PostgreSQL prompt for the password so it does not enter shell history:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -W -h 127.0.0.1 -U postgres -d iqra_local
```

At the `psql` prompt:

```sql
CREATE ROLE mf_saarthi LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
\password mf_saarthi
GRANT CONNECT ON DATABASE iqra_local TO mf_saarthi;
GRANT USAGE ON SCHEMA public TO mf_saarthi;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mf_saarthi;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mf_saarthi;
```

The last line protects future tables created by the current owner. If another owner creates tables,
that owner must set its own default privileges.

## View and verify in pgAdmin

In the Browser tree, expand:

```text
Servers > PostgreSQL 17 > Databases > iqra_local > Schemas > public > Tables
```

Right-click `Tables` and choose **Refresh** after the import. Use **View/Edit Data > First 100 Rows**
on a table, or open Query Tool and run:

```sql
SELECT count(*) AS public_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

SELECT pg_size_pretty(pg_database_size('iqra_local')) AS database_size;
SELECT count(*) AS funds FROM mfi360_funds;
SELECT count(*) AS holdings FROM mfi360_fund_portfolio_holdings;
SELECT count(*) AS nav_rows FROM mfi360_fund_plans_norm_nav_history;
```

The reviewed dump defines 28 public tables. Row counts depend on the dump contents.

## Application verification

After `.env.local` is complete:

```powershell
bun run test:database
```

Expected output includes `PASS PostgreSQL connection and allow-listed fund query`.

## Query and safety boundaries

- Table and field identifiers come from `lib/research/catalog.ts`; unknown identifiers are rejected.
- Values are parameterized and never concatenated into SQL.
- Tool reads are limited to 100 rows; latest-portfolio analysis reads at most 2,000 holdings per fund.
- `QUERY_TIMEOUT_MS` becomes PostgreSQL's `statement_timeout` for every pooled connection.
- The pool has an internal maximum of four connections.
- The runtime performs no migrations, writes, deletes, or schema changes.
- The database includes normalized NAV and dividend history, but raw NAV rows are not precomputed
  investment-return figures.

## Failure recovery

| Symptom | Check |
| --- | --- |
| `DATABASE_URL is required` | Add the generic database variables to `.env.local`, then restart. |
| PostgreSQL `28P01` | Correct or reset the `mf_saarthi` password. Do not paste it into chat or logs. |
| PostgreSQL `3D000` | Create or restore `iqra_local`; verify the database name in the URL. |
| `relation ... does not exist` | The restore is incomplete or targeted the wrong database. |
| Query timeout | Narrow the query, inspect indexes with the database owner, or carefully raise the timeout. |

Do not commit `.env.local`, passwords, SQL dumps, database backups, or customer information.
