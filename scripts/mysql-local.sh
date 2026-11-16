#!/usr/bin/env bash
# A MySQL 8 for machines where Docker is not available or not usable by the current user.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_DIR="${MYSQL_BASE_DIR:-$ROOT/.mysql}"
FALLBACK_BASE="${TMPDIR:-/tmp}/elimuar-mysql"

# Windows (Git Bash / MSYS / Cygwin) has no Unix sockets, so the server is told to listen on TCP and the
# client talks to it that way.
IS_WINDOWS=""
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;;
esac

PORT="${MYSQL_PORT:-3306}"
DB_NAME="${MYSQL_DATABASE:-elimuar}"
DB_USER="${MYSQL_USER:-elimuar}"
DB_PASS="${MYSQL_PASSWORD:-elimuar_dev}"

MYSQLD="$(command -v mysqld || echo /usr/sbin/mysqld)"
MYSQL="$(command -v mysql || echo /usr/bin/mysql)"

DATA_DIR=""
RUN_DIR=""
SOCKET=""
PID_FILE=""
LOG_FILE=""

say() { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Every path is derived from one base directory, so the fallback moves the lot.
use_base() {
  DATA_DIR="$1/data"
  RUN_DIR="$1/run"
  SOCKET="$RUN_DIR/mysql.sock"
  PID_FILE="$RUN_DIR/mysqld.pid"
  LOG_FILE="$RUN_DIR/mysqld.log"
}

# One place that knows how to reach the server, so the socket/TCP split lives
# here rather than in a dozen call sites.
mysql_client() {
  if [ -n "$IS_WINDOWS" ]; then
    "$MYSQL" --protocol=TCP --host=127.0.0.1 --port="$PORT" "$@"
  else
    "$MYSQL" --socket="$SOCKET" "$@"
  fi
}

# "Is the server up?" is answered by talking to it, not by inspecting a pid.
running() {
  [ -f "$PID_FILE" ] || return 1
  mysql_client -uroot -e "select 1" >/dev/null 2>&1
}

[ -x "$MYSQLD" ] || fail "mysqld not found. Install mysql-server (apt install mysql-server), or on Windows 'scoop install mysql-lts', or use Docker."

# --no-defaults keeps /etc/mysql/my.cnf out of it: that file points datadir,
# socket and the error log at the system installation's own paths.
initialise() {
  mkdir -p "$RUN_DIR"
  if [ -d "$DATA_DIR/mysql" ]; then return 0; fi
  say "Initialising a new data directory in $DATA_DIR"
  if "$MYSQLD" --no-defaults --initialize-insecure --datadir="$DATA_DIR" --log-error="$RUN_DIR/init.log" >/dev/null 2>&1; then
    return 0
  fi
  tail -20 "$RUN_DIR/init.log" >&2 2>/dev/null || true
  return 1
}

start() {
  use_base "$BASE_DIR"
  if running; then say "Already running on port $PORT (data in $DATA_DIR)"; return 0; fi

  if ! initialise; then
    if [ -d "$DATA_DIR/mysql" ]; then
      fail "$DATA_DIR holds data that this MySQL cannot use. Move it aside, or set MYSQL_BASE_DIR."
    fi
    say "Could not use $DATA_DIR — a MySQL AppArmor profile may forbid writing there."
    say "Falling back to $FALLBACK_BASE (set MYSQL_BASE_DIR to choose another path)."
    use_base "$FALLBACK_BASE"
    initialise || fail "could not initialise $DATA_DIR either. See $RUN_DIR/init.log"
  fi

  # Setsid detaches it from this shell: a server that dies with the shell that started it is no use as a
  # database.
  local launcher=()
  command -v setsid >/dev/null 2>&1 && launcher=(setsid)

  local server_args=(
    --no-defaults
    --datadir="$DATA_DIR"
    --port="$PORT"
    --bind-address=127.0.0.1
    --pid-file="$PID_FILE"
    --log-error="$LOG_FILE"
    --character-set-server=utf8mb4
    --collation-server=utf8mb4_unicode_ci
    --mysqlx=0
  )
  [ -n "$IS_WINDOWS" ] || server_args+=(--socket="$SOCKET")

  "${launcher[@]}" "$MYSQLD" \
    "${server_args[@]}" \
    >/dev/null 2>&1 < /dev/null &
  local spawn=$!
  disown 2>/dev/null || true

  # First start can take a few seconds (InnoDB, TLS certificates), so poll for a connection rather than for
  # the process: the pid file only appears once the server is nearly ready.
  local up=""
  for _ in $(seq 1 60); do
    sleep 0.5
    if mysql_client -uroot -e "select 1" >/dev/null 2>&1; then up="yes"; break; fi
    if [ -f "$PID_FILE" ]; then
      kill -0 "$(cat "$PID_FILE")" 2>/dev/null || :
    elif ! kill -0 "$spawn" 2>/dev/null; then
      break
    fi
  done
  if [ -z "$up" ]; then
    tail -20 "$LOG_FILE" >&2 2>/dev/null || true
    fail "mysqld did not come up. Full log: $LOG_FILE"
  fi

  mysql_client -uroot <<SQL
create database if not exists \`$DB_NAME\` character set utf8mb4 collate utf8mb4_unicode_ci;
create user if not exists '$DB_USER'@'127.0.0.1' identified by '$DB_PASS';
create user if not exists '$DB_USER'@'localhost' identified by '$DB_PASS';
grant all privileges on \`$DB_NAME\`.* to '$DB_USER'@'127.0.0.1';
grant all privileges on \`$DB_NAME\`.* to '$DB_USER'@'localhost';
flush privileges;
SQL

  say "MySQL is up on 127.0.0.1:$PORT (database $DB_NAME, user $DB_USER, data in $DATA_DIR)."
  say "Next: npm run db:migrate && npm run db:seed"
}

stop() {
  stop_at() {
    use_base "$1"
    running || return 0
    # A clean shutdown first: it flushes InnoDB, which a signal may not.
    mysql_client -uroot -e "shutdown" >/dev/null 2>&1 || true
    for _ in $(seq 1 30); do
      running || break
      sleep 0.5
    done
    if running; then
      kill "$(cat "$PID_FILE")" 2>/dev/null || true
      sleep 2
    fi
    rm -f "$PID_FILE"
  }
  stop_at "$BASE_DIR"
  stop_at "$FALLBACK_BASE"
  say "Stopped."
}

status() {
  for base in "$BASE_DIR" "$FALLBACK_BASE"; do
    use_base "$base"
    if running; then
      say "Running on port $PORT, data in $DATA_DIR"
      return 0
    fi
  done
  say "Not running."
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  reset)
    stop
    rm -rf "$BASE_DIR/data" "$FALLBACK_BASE/data"
    start
    ;;
  *) say "usage: $0 {start|stop|restart|status|reset}"; exit 1 ;;
esac
