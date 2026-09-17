import Database from "better-sqlite3";

const db = new Database("campus.db");

const sessions = db
    .prepare(`
        SELECT *
        FROM app_sessions
        ORDER BY id DESC
        LIMIT 10
    `)
    .all();

console.log(sessions);