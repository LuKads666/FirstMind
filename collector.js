import { activeWindow } from "get-windows";
import koffi from "koffi";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const db = new Database("campus.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )
`);

let participantRow = db
    .prepare(`
        SELECT value
        FROM app_meta
        WHERE key = ?
    `)
    .get("participant_id");

    let participantId;

if (participantRow) {
    participantId = participantRow.value;
} else {
    participantId = randomUUID();

     db.prepare(`
        INSERT INTO app_meta (key, value)
        VALUES (?, ?)
    `).run(
        "participant_id",
        participantId
    );
}

db.exec(`
    CREATE TABLE IF NOT EXISTS app_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT,
        duration_seconds REAL NOT NULL,
        activity_ratio REAL,
        max_idle_seconds REAL
    )
`);

const sessionColumns = db
    .prepare(`
        PRAGMA table_info(app_sessions)
    `)
    .all();

const hasParticipantId = sessionColumns.some(
    column => column.name === "participant_id"
);

if (!hasParticipantId) {
    db.exec(`
        ALTER TABLE app_sessions
        ADD COLUMN participant_id TEXT
    `);
}

db.prepare(`
    UPDATE app_sessions
    SET participant_id = ?
    WHERE participant_id IS NULL
`).run(participantId);

const insertSession = db.prepare(`
    INSERT INTO app_sessions (
        participant_id,
        started_at,
        ended_at,
        app_name,
        window_title,
        duration_seconds,
        activity_ratio,
        max_idle_seconds
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
const LASTINPUTINFO = koffi.struct("LASTINPUTINFO", {
    cbSize: "uint",
    dwTime: "uint32"
});

const GetLastInputInfo = user32.func(
    "bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO *plii)"
);

const GetTickCount = kernel32.func(
    "uint32 __stdcall GetTickCount()"
);

function getIdleSeconds() {
    const info = {
        cbSize: koffi.sizeof(LASTINPUTINFO),
        dwTime: 0
    };

    const success = GetLastInputInfo(info);

    if (!success) {
        return null;
    }

    const currentTick = GetTickCount();

    const idleMilliseconds =
        (currentTick - info.dwTime) >>> 0;

    return idleMilliseconds / 1000;
}

let sessionStartTime = null;

let sessionApp = "";
let sessionTitle = "";

let digitalActiveSeconds = 0;
let maxIdleSeconds = 0;

let lastCheckTime = Date.now();
function startSession(appName, windowTitle) {
    sessionStartTime = Date.now();

    sessionApp = appName;
    sessionTitle = windowTitle;

    digitalActiveSeconds = 0;
    maxIdleSeconds = 0;

    lastCheckTime = Date.now();
}

function updateSessionStats(idleSeconds) {
    const now = Date.now();

    const elapsedSeconds =
        (now - lastCheckTime) / 1000;

    // 如果最后一次键鼠输入发生在本次采样间隔内，
    // 说明这一小段时间内确实发生过输入
    if (idleSeconds <= elapsedSeconds) {
        digitalActiveSeconds += elapsedSeconds;
    }

    // 更新这一整个 Session 中最长的无输入时间
    if (idleSeconds > maxIdleSeconds) {
        maxIdleSeconds = idleSeconds;
    }

    lastCheckTime = now;
}

function formatDateTime(timestamp) {
    const date = new Date(timestamp);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function finishSession() {
    if (sessionStartTime === null) {
        return;
    }

    const endTime = Date.now();

    const durationSeconds =
        (endTime - sessionStartTime) / 1000;

    const activityRatio =
        durationSeconds > 0
            ? digitalActiveSeconds / durationSeconds
            : 0;

    insertSession.run(
    participantId,
    formatDateTime(sessionStartTime),
    formatDateTime(endTime),
    sessionApp,
    sessionTitle,
    durationSeconds,
    activityRatio,
    maxIdleSeconds
);

    console.log("Session 已保存：");
    console.log("软件：", sessionApp);
    console.log("窗口：", sessionTitle);
    console.log(
        "持续时间：",
        durationSeconds.toFixed(1),
        "秒"
    );
    console.log(
        "数字活跃率：",
        (activityRatio * 100).toFixed(1) + "%"
    );
    console.log(
        "最长无输入：",
        maxIdleSeconds.toFixed(1),
        "秒"
    );
    console.log("====================");

    sessionStartTime = null;
}

async function collectBehavior() {
    const window = await activeWindow();
    const idleSeconds = getIdleSeconds();

    if (!window || idleSeconds === null) {
        return;
    }
        // 第一次运行，还没有正在记录的 Session
    if (sessionStartTime === null) {
    startSession(
        window.owner.name,
        window.title
    );

    return;
    }


// 判断当前窗口是否和正在记录的 Session 不一样
    const windowChanged =
       window.owner.name !== sessionApp ||
       window.title !== sessionTitle;


// 如果窗口没有变化，就继续统计当前 Session
    if (!windowChanged) {
    updateSessionStats(
        idleSeconds
    );

    return;
}
updateSessionStats(
    idleSeconds
);
// 结束旧 Session，并写入数据库
finishSession();


// 开始新的 Session
    startSession(
    window.owner.name,
    window.title
);

}

collectBehavior();

setInterval(collectBehavior, 500);
console.log("participantId:", participantId);