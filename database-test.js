import Database from "better-sqlite3";

const db = new Database("campus.db");


const sessions = db
    .prepare(`
        SELECT id, participant_id, app_name, duration_seconds
        FROM app_sessions
        ORDER BY id DESC
        LIMIT 10
    `)
    .all();

console.log(sessions);