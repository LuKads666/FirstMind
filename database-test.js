import Database from "better-sqlite3";

const db = new Database("campus.db");


const windows = db
    .prepare(`
        SELECT *
        FROM behavior_windows
        ORDER BY window_start_ms DESC
        LIMIT 10
    `)
    .all();


const gaps = db
    .prepare(`
        SELECT *
        FROM behavior_gaps
        ORDER BY gap_start_ms DESC
        LIMIT 10
    `)
    .all();


console.log("正常行为窗口：");
console.log(windows);

console.log("====================");

console.log("连续空白区间：");
console.log(gaps);