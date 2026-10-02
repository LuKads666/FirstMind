import Database from "better-sqlite3";
import fs from "node:fs";

const db = new Database("campus.db");


/*
 * Transformer 第一版使用的 12 个应用类别
 */
const categories = [
    "development",
    "study",
    "office",
    "browser",
    "communication",
    "entertainment",
    "game",
    "media",
    "file",
    "system",
    "network",
    "unknown"
];


/*
 * 先取最近一个有数据的 5 分钟窗口
 */
const windows = db
    .prepare(`
        SELECT *
        FROM behavior_windows
        WHERE has_data = 1
        ORDER BY window_start_ms ASC
    `)
    .all();


if (windows.length === 0) {
    console.log("没有找到行为窗口。");

    db.close();
    process.exit(0);
}


/*
 * behavior_windows 里的 app_durations_json
 * 目前还是 JSON 字符串。
 *
 * 把它重新变成 JavaScript 对象。
 */
const findCategory = db.prepare(`
    SELECT
        category,
        verified,
        verification_count
    FROM app_category_map
    WHERE app_name = ?
`);

function buildFeatureVector(window) {

    const appDurations =
        JSON.parse(
            window.app_durations_json
        );

    const categoryDurations = {};

    for (const category of categories) {
        categoryDurations[category] = 0;
    }

    for (
        const [appName, duration]
        of Object.entries(appDurations)
    ) {

        const categoryInfo =
            findCategory.get(appName);

        const category =
            categoryInfo?.category
            ?? "unknown";

        if (
            categoryDurations[category]
            !== undefined
        ) {

            categoryDurations[category]
                += duration;

        } else {

            categoryDurations.unknown
                += duration;
        }
    }

    const totalDuration =
        Object.values(categoryDurations)
            .reduce(
                (sum, duration) =>
                    sum + duration,
                0
            );

    const categoryRatios = {};

    for (const category of categories) {

        if (totalDuration > 0) {

            categoryRatios[category] =
                categoryDurations[category]
                / totalDuration;

        } else {

            categoryRatios[category] = 0;
        }
    }

    const categoryFeatureVector =
    categories.map(
        category =>
            categoryRatios[category]
    );

    const fullFeatureVector = [
    ...categoryFeatureVector,

    window.activity_ratio ?? 0,
    window.switch_count ?? 0,
    window.max_idle_seconds ?? 0,
    window.coverage_ratio ?? 0
];

return fullFeatureVector;
}

const FIVE_MINUTES_MS =
    5 * 60 * 1000;

const sequences = [];

let currentSequence = [];

let previousWindowStart = null;

for (const window of windows) {

    const featureVector =
        buildFeatureVector(window);


    /*
     * 如果不是第一个窗口，
     * 就判断当前窗口和上一个窗口
     * 是否还连续。
     */
    if (
        previousWindowStart !== null &&
        window.window_start_ms -
            previousWindowStart >
            FIVE_MINUTES_MS
    ) {

        /*
         * 说明中间出现了空白，
         * 先把上一段连续序列保存下来。
         */
        if (currentSequence.length > 0) {

            sequences.push(
                currentSequence
            );
        }


        /*
         * 开始新的连续序列。
         */
        currentSequence = [];
    }


    /*
     * 把当前窗口的 16 维特征
     * 放进当前行为序列。
     */
    currentSequence.push(
        featureVector
    );


    /*
     * 记住当前窗口时间，
     * 下一轮用来做比较。
     */
    previousWindowStart =
        window.window_start_ms;
}


/*
 * 循环结束以后，
 * 最后一段序列还没有被保存，
 * 所以这里补进去。
 */
if (currentSequence.length > 0) {

    sequences.push(
        currentSequence
    );
}


console.log(
    "有效行为窗口数量：",
    windows.length
);

console.log(
    "连续行为序列数量：",
    sequences.length
);


for (
    let i = 0;
    i < sequences.length;
    i++
) {

    console.log(
        `序列 ${i + 1}：`,
        sequences[i].length,
        "个窗口"
    );

    console.log(
        JSON.stringify(
            sequences[i]
        )
    );
}

const outputData = {

    feature_count: 16,

    feature_names: [
        ...categories,
        "activity_ratio",
        "switch_count",
        "max_idle_seconds",
        "coverage_ratio"
    ],

    sequence_count:
        sequences.length,

    sequences:
        sequences
};


fs.writeFileSync(
    "behavior-sequences.json",

    JSON.stringify(
        outputData,
        null,
        2
    ),

    "utf-8"
);


console.log(
    "行为序列已经保存到 behavior-sequences.json"
);

db.close();