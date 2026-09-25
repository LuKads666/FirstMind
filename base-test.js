import Database from "better-sqlite3";

const db = new Database("campus.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS behavior_windows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        participant_id TEXT NOT NULL,

        window_start_ms INTEGER NOT NULL,
        window_end_ms INTEGER NOT NULL,

        has_data INTEGER NOT NULL,

        coverage_ratio REAL,

        session_count INTEGER NOT NULL,
        switch_count INTEGER NOT NULL,

        activity_ratio REAL,
        max_idle_seconds REAL,

        app_durations_json TEXT NOT NULL,

        UNIQUE (
            participant_id,
            window_start_ms
        )
    )
`);

db.exec(`
    CREATE TABLE IF NOT EXISTS behavior_gaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        participant_id TEXT NOT NULL,

        gap_start_ms INTEGER NOT NULL,
        gap_end_ms INTEGER NOT NULL,

        missing_window_count INTEGER NOT NULL,

        UNIQUE (
            participant_id,
            gap_start_ms
        )
    )
`);

db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
    idx_behavior_gaps_participant_start
    ON behavior_gaps (
        participant_id,
        gap_start_ms
    )
`);

const participantRow = db
    .prepare(`
        SELECT value
        FROM app_meta
        WHERE key = ?
    `)
    .get("participant_id");

if (!participantRow) {
    console.log("没有找到 participant_id");
    process.exit(0);
}

const participantId =
    participantRow.value;

const saveBehaviorWindow = db.prepare(`
    INSERT INTO behavior_windows (
        participant_id,
        window_start_ms,
        window_end_ms,
        has_data,
        coverage_ratio,
        session_count,
        switch_count,
        activity_ratio,
        max_idle_seconds,
        app_durations_json
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT (
        participant_id,
        window_start_ms
    )
    DO UPDATE SET
        window_end_ms = excluded.window_end_ms,
        has_data = excluded.has_data,
        coverage_ratio = excluded.coverage_ratio,
        session_count = excluded.session_count,
        switch_count = excluded.switch_count,
        activity_ratio = excluded.activity_ratio,
        max_idle_seconds = excluded.max_idle_seconds,
        app_durations_json = excluded.app_durations_json
`);

const saveBehaviorGap = db.prepare(`
    INSERT INTO behavior_gaps (
        participant_id,
        gap_start_ms,
        gap_end_ms,
        missing_window_count
    )
    VALUES (?, ?, ?, ?)

    ON CONFLICT (
        participant_id,
        gap_start_ms
    )
    DO UPDATE SET
        gap_end_ms = excluded.gap_end_ms,
        missing_window_count = excluded.missing_window_count
`);

function buildBehaviorWindow(windowStart, windowEnd) {

    // 查询和当前时间窗口有重叠的 Session
    const sessions = db
        .prepare(`
            SELECT *
            FROM app_sessions
            WHERE ended_at_ms > ?
              AND started_at_ms < ?
            ORDER BY started_at_ms
        `)
        .all(
            windowStart,
            windowEnd
        );


    // =========================
    // 这个时间窗口完全没有数据
    // =========================
    if (sessions.length === 0) {
        return {
            window_start: windowStart,
            window_end: windowEnd,

            has_data: false,

            coverage_ratio: 0,

            session_count: 0,
            switch_count: 0,

            activity_ratio: null,
            max_idle_seconds: null,

            app_durations: {}
        };
    }


    // =========================
    // 开始统计窗口数据
    // =========================

    const appDurations = {};

    let totalObservedMs = 0;
    let totalActiveMs = 0;

    let windowMaxIdleSeconds = 0;


    for (const session of sessions) {

        // Session 真正落在当前窗口里的开始位置
        const overlapStart = Math.max(
            session.started_at_ms,
            windowStart
        );


        // Session 真正落在当前窗口里的结束位置
        const overlapEnd = Math.min(
            session.ended_at_ms,
            windowEnd
        );


        // Session 和窗口实际重叠了多久
        const overlapMs =
            overlapEnd - overlapStart;


        // 理论上不应该出现，但保险处理
        if (overlapMs <= 0) {
            continue;
        }


        // 累加实际记录时间
        totalObservedMs += overlapMs;


        // 根据 Session 活跃率估算活跃时间
        totalActiveMs +=
            overlapMs *
            session.activity_ratio;


        const overlapSeconds =
            overlapMs / 1000;


        // 当前 Session 在本窗口内最多可能空闲多久
        const sessionIdleInWindow =
            Math.min(
                session.max_idle_seconds,
                overlapSeconds
            );


        if (
            sessionIdleInWindow >
            windowMaxIdleSeconds
        ) {
            windowMaxIdleSeconds =
                sessionIdleInWindow;
        }


        // 如果第一次遇到这个软件
        if (
            !appDurations[
                session.app_name
            ]
        ) {
            appDurations[
                session.app_name
            ] = 0;
        }


        // 累加这个软件在窗口里的时间
        appDurations[
            session.app_name
        ] += overlapMs;
    }


    // =========================
    // 计算窗口覆盖率
    // =========================

    const windowDurationMs =
        windowEnd - windowStart;


    const coverageRatio =
        totalObservedMs /
        windowDurationMs;


    // =========================
    // Session 数量
    // =========================

    const sessionCount =
        sessions.length;


    // =========================
    // 窗口切换次数
    // =========================

    let switchCount = 0;


    for (
        let i = 1;
        i < sessions.length;
        i++
    ) {

        const previousSession =
            sessions[i - 1];

        const currentSession =
            sessions[i];


        const gapMs =
            currentSession.started_at_ms -
            previousSession.ended_at_ms;


        if (gapMs <= 2000) {
            switchCount++;
        }
    }


    // =========================
    // 整体数字活跃率
    // =========================

    const overallActivityRatio =
        totalObservedMs > 0
            ? totalActiveMs /
              totalObservedMs
            : 0;


    // =========================
    // 最终行为窗口
    // =========================

    const behaviorWindow = {

        window_start:
            windowStart,

        window_end:
            windowEnd,

        has_data:
            true,

        coverage_ratio:
            coverageRatio,

        session_count:
            sessionCount,

        switch_count:
            switchCount,

        activity_ratio:
            overallActivityRatio,

        max_idle_seconds:
            windowMaxIdleSeconds,

        app_durations:
            appDurations
    };


    return behaviorWindow;
}

// ==================================================
// 批量生成 5 分钟行为窗口
// ==================================================

const fiveMinutesMs =
    5 * 60 * 1000;


const timeRange = db
    .prepare(`
        SELECT
            MIN(started_at_ms) AS earliestTime,
            MAX(ended_at_ms) AS latestTime
        FROM app_sessions
        WHERE started_at_ms IS NOT NULL
          AND ended_at_ms IS NOT NULL
    `)
    .get();


if (
    timeRange.earliestTime === null ||
    timeRange.latestTime === null
) {
    console.log(
        "数据库中还没有可用的 Session 数据。"
    );

    process.exit(0);
}


const batchStart =
    Math.floor(
        timeRange.earliestTime /
        fiveMinutesMs
    ) * fiveMinutesMs;


const batchEnd =
    Math.ceil(
        timeRange.latestTime /
        fiveMinutesMs
    ) * fiveMinutesMs;

let gapStart = null;
let missingWindowCount = 0;


// 从开始时间一直往后，每次增加 5 分钟
for (
    let currentStart = batchStart;
    currentStart < batchEnd;
    currentStart += fiveMinutesMs
) {

    const currentEnd =
        currentStart + fiveMinutesMs;


    const result =
        buildBehaviorWindow(
            currentStart,
            currentEnd
        );


    // 当前 5 分钟没有数据
    if (!result.has_data) {

        // 如果这是连续空白的第一格
        if (gapStart === null) {
            gapStart = currentStart;
        }

        missingWindowCount++;

        continue;
    }


    // 当前窗口有数据
    // 如果前面有连续空白，先保存空白区间
    if (gapStart !== null) {

        saveBehaviorGap.run(
            participantId,
            gapStart,
            currentStart,
            missingWindowCount
        );

        gapStart = null;
        missingWindowCount = 0;
    }


    // 保存当前有数据的窗口
    saveBehaviorWindow.run(
        participantId,

        result.window_start,
        result.window_end,

        1,

        result.coverage_ratio,

        result.session_count,
        result.switch_count,

        result.activity_ratio,
        result.max_idle_seconds,

        JSON.stringify(
            result.app_durations
        )
    );
}


// 如果最后刚好是一段连续空白，也要保存
if (gapStart !== null) {

    saveBehaviorGap.run(
        participantId,
        gapStart,
        batchEnd,
        missingWindowCount
    );
}


console.log(
    "行为窗口和空白区间保存完成。"
);
