import Database from "better-sqlite3";
import fs from "node:fs";


const db = new Database("campus.db");


/*
 * ==================================================
 * Transformer 第一版使用的 12 个活动类别
 * ==================================================
 *
 * 后面再加：
 *
 * activity_ratio
 * switch_count
 * max_idle_seconds
 * coverage_ratio
 *
 * 最终仍然是 16 维。
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
 * ==================================================
 * 读取所有有数据的 5 分钟窗口
 * ==================================================
 *
 * 先按 participant_id 排，
 * 再按时间排。
 *
 * 这样以后数据库里有多个人的数据时，
 * 不会因为时间相近而被错误拼成同一段行为序列。
 */
const windows = db
    .prepare(`
        SELECT *

        FROM behavior_windows

        WHERE has_data = 1

        ORDER BY
            participant_id ASC,
            window_start_ms ASC
    `)
    .all();


if (windows.length === 0) {

    console.log(
        "没有找到行为窗口。"
    );

    db.close();
    process.exit(0);
}


/*
 * ==================================================
 * 旧数据兼容
 * ==================================================
 *
 * 新版 base-test.js 会直接生成：
 * category_durations_json
 *
 * 但是为了兼容以前已经存在的旧窗口，
 * 如果某一条旧数据没有这个字段，
 * 或者这个字段还是空对象，
 * 就退回原来的：
 *
 * app_durations_json
 * +
 * app_category_map
 *
 * 来生成类别统计。
 */
const findCategory = db.prepare(`
    SELECT
        category,
        verified,
        verification_count

    FROM app_category_map

    WHERE app_name = ?
`);


/*
 * 安全地解析 JSON。
 *
 * 万一某条旧数据为空或格式不正确，
 * 就返回空对象，避免整个程序直接崩掉。
 */
function parseJsonObject(
    jsonText
) {

    if (
        typeof jsonText !== "string" ||
        jsonText.trim() === ""
    ) {
        return {};
    }


    try {

        const parsed =
            JSON.parse(
                jsonText
            );


        if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
        ) {
            return parsed;
        }


        return {};

    } catch {

        return {};
    }
}


/*
 * 判断类别统计里是否真的有有效时间。
 */
function hasUsefulDurations(
    durations
) {

    return Object.values(
        durations
    ).some(
        duration =>
            Number(duration) > 0
    );
}


/*
 * ==================================================
 * 用旧的软件统计回退生成类别统计
 * ==================================================
 */
function buildCategoryDurationsFromApps(
    appDurations
) {

    const categoryDurations = {};


    for (const category of categories) {
        categoryDurations[category] = 0;
    }


    for (
        const [appName, rawDuration]
        of Object.entries(
            appDurations
        )
    ) {

        const duration =
            Number(rawDuration) || 0;


        const categoryInfo =
            findCategory.get(
                appName
            );


        const category =
            categoryInfo?.category
            ?? "unknown";


        if (
            categoryDurations[
                category
            ] !== undefined
        ) {

            categoryDurations[
                category
            ] += duration;

        } else {

            categoryDurations.unknown +=
                duration;
        }
    }


    return categoryDurations;
}


/*
 * ==================================================
 * 获取一个窗口的活动类别统计
 * ==================================================
 *
 * 优先：
 * category_durations_json
 *
 * 回退：
 * app_durations_json + app_category_map
 */
function getCategoryDurations(
    window
) {

    const newCategoryDurations =
        parseJsonObject(
            window.category_durations_json
        );


    if (
        hasUsefulDurations(
            newCategoryDurations
        )
    ) {

        const normalizedDurations = {};


        for (const category of categories) {

            normalizedDurations[
                category
            ] = 0;
        }


        for (
            const [category, rawDuration]
            of Object.entries(
                newCategoryDurations
            )
        ) {

            const duration =
                Number(rawDuration) || 0;


            if (
                normalizedDurations[
                    category
                ] !== undefined
            ) {

                normalizedDurations[
                    category
                ] += duration;

            } else {

                /*
                 * 如果未来 Resolver 返回了
                 * 一个当前 12 类之外的类别，
                 * 先统一放进 unknown，
                 * 保证特征长度仍然是 16。
                 */
                normalizedDurations.unknown +=
                    duration;
            }
        }


        return normalizedDurations;
    }


    /*
     * 旧数据回退。
     */
    const appDurations =
        parseJsonObject(
            window.app_durations_json
        );


    return buildCategoryDurationsFromApps(
        appDurations
    );
}


/*
 * ==================================================
 * 构建一个 5 分钟窗口的 16 维特征
 * ==================================================
 */
function buildFeatureVector(
    window
) {

    const categoryDurations =
        getCategoryDurations(
            window
        );


    const totalDuration =
        Object.values(
            categoryDurations
        )
            .reduce(
                (sum, duration) =>
                    sum + duration,
                0
            );


    const categoryRatios = {};


    for (const category of categories) {

        if (totalDuration > 0) {

            categoryRatios[
                category
            ] =
                categoryDurations[
                    category
                ] /
                totalDuration;

        } else {

            categoryRatios[
                category
            ] = 0;
        }
    }


    /*
     * 前 12 维：
     * 各活动类别在当前窗口里的时间占比。
     */
    const categoryFeatureVector =
        categories.map(
            category =>
                categoryRatios[
                    category
                ]
        );


    /*
     * 后 4 维：
     *
     * activity_ratio
     * switch_count
     * max_idle_seconds
     * coverage_ratio
     *
     * 最终仍然是 16 维。
     */
    const fullFeatureVector = [
        ...categoryFeatureVector,

        window.activity_ratio ?? 0,
        window.switch_count ?? 0,
        window.max_idle_seconds ?? 0,
        window.coverage_ratio ?? 0
    ];


    return fullFeatureVector;
}


/*
 * ==================================================
 * 构建连续行为序列
 * ==================================================
 */
const FIVE_MINUTES_MS =
    5 * 60 * 1000;


const sequences = [];
const sequenceMetadata = [];


let currentSequence = [];
let currentSequenceMetadata = [];


let previousWindowStart = null;
let previousParticipantId = null;


/*
 * 先打印时间断点，方便人工检查。
 */
for (
    let i = 1;
    i < windows.length;
    i++
) {

    const previous =
        windows[i - 1];

    const current =
        windows[i];


    /*
     * 不同参与者之间不比较时间差。
     */
    if (
        previous.participant_id !==
        current.participant_id
    ) {
        continue;
    }


    const difference =
        current.window_start_ms -
        previous.window_start_ms;


    if (
        difference >
        FIVE_MINUTES_MS
    ) {

        console.log(
            "发现时间断点："
        );

        console.log(
            "参与者：",
            current.participant_id
        );

        console.log(
            "上一个窗口：",
            new Date(
                previous.window_start_ms
            ).toLocaleString()
        );

        console.log(
            "下一个窗口：",
            new Date(
                current.window_start_ms
            ).toLocaleString()
        );

        console.log(
            "相差：",
            difference / 60000,
            "分钟"
        );
    }
}


for (const window of windows) {

    const featureVector =
        buildFeatureVector(
            window
        );


    /*
     * 下面两种情况都必须开始一条新序列：
     *
     * 1. participant_id 变了
     * 2. 同一个人中间断开超过 5 分钟
     */
    const participantChanged =
        previousParticipantId !== null &&
        window.participant_id !==
            previousParticipantId;


    const timeBroken =
        previousWindowStart !== null &&
        !participantChanged &&
        window.window_start_ms -
            previousWindowStart >
            FIVE_MINUTES_MS;


    if (
        participantChanged ||
        timeBroken
    ) {

        /*
         * 先保存上一段连续序列。
         */
        if (
            currentSequence.length > 0
        ) {

            sequences.push(
                currentSequence
            );


            sequenceMetadata.push(
                currentSequenceMetadata
            );
        }


        /*
         * 开始新的连续序列。
         */
        currentSequence = [];
        currentSequenceMetadata = [];
    }


    /*
     * 把当前窗口的 16 维特征
     * 放进当前行为序列。
     */
    currentSequence.push(
        featureVector
    );


    currentSequenceMetadata.push({
        participant_id:
            window.participant_id,

        window_start_ms:
            window.window_start_ms,

        window_end_ms:
            window.window_end_ms
    });


    /*
     * 记住当前窗口，
     * 下一轮继续比较。
     */
    previousWindowStart =
        window.window_start_ms;


    previousParticipantId =
        window.participant_id;
}


/*
 * 循环结束以后，
 * 最后一段序列还没有保存，
 * 所以这里补进去。
 */
if (
    currentSequence.length > 0
) {

    sequences.push(
        currentSequence
    );


    sequenceMetadata.push(
        currentSequenceMetadata
    );
}


/*
 * ==================================================
 * 输出检查信息
 * ==================================================
 */
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


/*
 * ==================================================
 * 写入 behavior-sequences.json
 * ==================================================
 */
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
        sequences,

    sequence_metadata:
        sequenceMetadata
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