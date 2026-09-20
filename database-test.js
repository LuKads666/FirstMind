import Database from "better-sqlite3";

const db = new Database("campus.db");

const events = db
    .prepare(`
        SELECT id, participant_id, event_time, event_type, file_name, extension
        FROM file_events
        ORDER BY id DESC
        LIMIT 20
    `)
    .all();

console.log(events);