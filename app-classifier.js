import Database from "better-sqlite3";

const db = new Database("campus.db");


/*
 * ========================================
 * 1. 基础配置
 * ========================================
 */

// LLM 连续判断多少次一致，才算正式确认
const VERIFICATION_TARGET = 3;


// 系统允许出现的分类
const allowedCategories = [
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
 * ========================================
 * 2. 创建 app_category_map
 * ========================================
 */

db.exec(`
    CREATE TABLE IF NOT EXISTS app_category_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        app_name TEXT NOT NULL UNIQUE,

        category TEXT NOT NULL,

        confidence REAL NOT NULL,

        source TEXT NOT NULL,

        verified INTEGER NOT NULL DEFAULT 0,

        verification_count INTEGER NOT NULL DEFAULT 0,

        evidence_key TEXT
    )
`);


/*
 * ========================================
 * 3. 给旧数据库补新字段
 *
 * 因为 CREATE TABLE IF NOT EXISTS
 * 不会自动修改已经存在的旧表。
 * ========================================
 */

const existingColumns = db
    .prepare(`
        PRAGMA table_info(app_category_map)
    `)
    .all();


function hasColumn(columnName) {
    return existingColumns.some(
        column => column.name === columnName
    );
}


if (!hasColumn("verified")) {
    db.exec(`
        ALTER TABLE app_category_map

        ADD COLUMN verified
        INTEGER NOT NULL DEFAULT 0
    `);
}


if (!hasColumn("verification_count")) {
    db.exec(`
        ALTER TABLE app_category_map

        ADD COLUMN verification_count
        INTEGER NOT NULL DEFAULT 0
    `);
}


if (!hasColumn("evidence_key")) {
    db.exec(`
        ALTER TABLE app_category_map

        ADD COLUMN evidence_key TEXT
    `);
}


/*
 * ========================================
 * 4. 已经明确知道的软件
 *
 * 这些直接作为系统内置知识。
 * 不需要每次重新判断。
 * ========================================
 */

const knownApps = [
    ["Calculator", "system"],

    ["Clash Verge", "network"],

    ["Codex", "development"],

    ["Google Chrome for Testing", "browser"],

    ["LockApp.exe", "system"],

    ["Microsoft Edge", "browser"],

    ["QQ", "communication"],

    ["SearchHost.exe", "system"],

    ["ShellHost", "system"],

    ["Visual Studio Code", "development"],

    ["WeChatAppEx", "communication"],

    ["Weixin", "communication"],

    [
        "Windows Shell Experience Host",
        "system"
    ],

    [
        "Windows 资源管理器",
        "file"
    ],

    ["腾讯会议", "communication"],

    ["课程播放器", "study"]
];


/*
 * 把内置软件写进数据库。
 *
 * builtin：
 * 我们已经明确知道它是什么，
 * 所以直接 verified = 1。
 */

const saveBuiltinApp = db.prepare(`
    INSERT INTO app_category_map (
        app_name,
        category,
        confidence,
        source,
        verified,
        verification_count,
        evidence_key
    )

    VALUES (?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(app_name)

    DO UPDATE SET
        category = excluded.category,
        confidence = excluded.confidence,
        source = excluded.source,
        verified = excluded.verified,
        verification_count =
            excluded.verification_count,
        evidence_key =
            excluded.evidence_key
`);


for (const [
    appName,
    category
] of knownApps) {

    saveBuiltinApp.run(
        appName,
        category,
        1,
        "builtin",
        1,
        VERIFICATION_TARGET,
        null
    );
}


/*
 * ========================================
 * 5. 少量通用规则
 *
 * 这里只保存真正有泛化能力的规则。
 *
 * 不再写：
 * QQ === communication
 * VS Code === development
 *
 * 因为这些已经在数据库里。
 * ========================================
 */

function classifyByRule(appName) {

    const name =
        appName.toLowerCase();


    /*
     * 浏览器的名字可能存在不同版本
     */
    if (
        name.includes("chrome") ||
        name.includes("firefox") ||
        name.includes("microsoft edge")
    ) {
        return "browser";
    }


    /*
     * 常见开发工具家族
     */
    if (
        name.includes("visual studio") ||
        name.includes("pycharm") ||
        name.includes("intellij") ||
        name.includes("webstorm")
    ) {
        return "development";
    }


    /*
     * 微信可能存在不同进程名称
     */
    if (
        name.includes("wechat") ||
        name.includes("weixin")
    ) {
        return "communication";
    }


    /*
     * 没有命中通用规则
     */
    return null;
}


/*
 * ========================================
 * 6. 调用本地 Qwen
 * ========================================
 */

async function classifyWithLLM(
    appName,
    windowTitles
) {

    try {

        /*
         * 把多个窗口标题组合起来。
         */
        const titleText =
            windowTitles.length > 0

                ? windowTitles
                    .map(
                        (title, index) =>
                            `${index + 1}. ${title}`
                    )
                    .join("\n")

                : "没有可用窗口标题";


        const response = await fetch(
            "http://localhost:11434/api/generate",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    model:
                        "qwen3:4b-instruct",

                    prompt: `
你正在给桌面应用进行分类。

请根据软件名称和它最近出现过的窗口标题，
判断这个软件最符合哪一个类别。

只回答一个类别名称。
不要解释。
不要输出其他文字。

软件名称：
${appName}

最近出现过的窗口标题：
${titleText}

可选类别：

development
study
office
browser
communication
entertainment
game
media
file
system
network
unknown
                    `,

                    stream: false,

                    keep_alive: "30m",

                    options: {
                        temperature: 0
                    }
                })
            }
        );


        /*
         * Ollama 本身返回了 HTTP 错误
         */
        if (!response.ok) {

            console.log(
                `LLM请求失败：HTTP ${response.status}`
            );

            return null;
        }


        const result =
            await response.json();


        const category =
            result.response
                .trim()
                .toLowerCase();


        /*
         * 防止模型回答：
         *
         * "我认为是 network"
         *
         * 这种不符合要求的内容。
         */
        if (
            !allowedCategories.includes(
                category
            )
        ) {

            console.log(
                `LLM返回了非法分类：${result.response}`
            );

            return "unknown";
        }


        return category;

    } catch (error) {

        console.log(
            `无法调用本地LLM：${error.message}`
        );

        return null;
    }
}


/*
 * ========================================
 * 7. 准备数据库查询
 * ========================================
 */


/*
 * 找所有真正出现过的软件
 */
const findAllApps = db.prepare(`
    SELECT DISTINCT app_name

    FROM app_sessions

    WHERE app_name IS NOT NULL

      AND TRIM(app_name) != ''

    ORDER BY app_name
`);


/*
 * 查询应用已经存在的分类
 */
const findCategory = db.prepare(`
    SELECT *

    FROM app_category_map

    WHERE app_name = ?
`);


/*
 * 取这个软件最近出现过的
 * 5 个不同窗口标题。
 *
 * 这样 Qwen 不再只看一个标题。
 */
const findRecentTitles = db.prepare(`
    SELECT
        window_title,
        MAX(id) AS latest_id

    FROM app_sessions

    WHERE app_name = ?

      AND window_title IS NOT NULL

      AND TRIM(window_title) != ''

    GROUP BY window_title

    ORDER BY latest_id DESC

    LIMIT 5
`);


/*
 * 保存任何一种分类结果。
 */
const saveCategory = db.prepare(`
    INSERT INTO app_category_map (
        app_name,
        category,
        confidence,
        source,
        verified,
        verification_count,
        evidence_key
    )

    VALUES (?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(app_name)

    DO UPDATE SET
        category = excluded.category,
        confidence = excluded.confidence,
        source = excluded.source,
        verified = excluded.verified,
        verification_count =
            excluded.verification_count,
        evidence_key =
            excluded.evidence_key
`);


/*
 * ========================================
 * 8. 生成“证据标识”
 *
 * 用来判断：
 * 这次是不是出现了新的窗口标题。
 * ========================================
 */

function buildEvidenceKey(windowTitles) {

    /*
     * 排序之后再 JSON.stringify，
     * 避免只是顺序变化就被当成新证据。
     */

    const sortedTitles =
        [...windowTitles].sort();


    return JSON.stringify(
        sortedTitles
    );
}


/*
 * ========================================
 * 9. 主程序
 * ========================================
 */

async function main() {

    try {

        const apps =
            findAllApps.all();


        for (const app of apps) {

            /*
             * 每一个应用都有自己的 try/catch。
             *
             * 某一个软件出错，
             * 不会影响其他软件。
             */
            try {

                const appName =
                    app.app_name;


                const existing =
                    findCategory.get(
                        appName
                    );


                /*
                 * 已经正式确认的分类，
                 * 不需要再处理。
                 */
                if (
                    existing &&
                    existing.verified === 1
                ) {
                    continue;
                }


                /*
                 * 先尝试通用规则。
                 */
                const ruleCategory =
                    classifyByRule(
                        appName
                    );


                /*
                 * 通用规则命中，
                 * 直接认为是高可信结果。
                 */
                if (ruleCategory) {

                    saveCategory.run(
                        appName,
                        ruleCategory,
                        1,
                        "rule",
                        1,
                        VERIFICATION_TARGET,
                        null
                    );


                    console.log(
                        `${appName} → ${ruleCategory}（规则确认）`
                    );


                    continue;
                }


                /*
                 * 规则也不知道，
                 * 开始收集最近窗口标题。
                 */
                const titleRows =
                    findRecentTitles.all(
                        appName
                    );


                const windowTitles =
                    titleRows.map(
                        row =>
                            row.window_title
                    );


                /*
                 * 根据当前证据生成一个标识。
                 */
                const evidenceKey =
                    buildEvidenceKey(
                        windowTitles
                    );


                /*
                 * 如果上一次已经用完全相同的
                 * 证据判断过，就不要重复问 Qwen。
                 *
                 * 必须等出现新的窗口标题以后，
                 * 才进行下一次验证。
                 */
                if (
                    existing &&
                    existing.evidence_key ===
                        evidenceKey
                ) {

                    console.log(
                        `${appName}：没有新证据，暂不重复验证`
                    );

                    continue;
                }


                console.log(
                    `正在让LLM判断：${appName}`
                );


                const llmCategory =
                    await classifyWithLLM(
                        appName,
                        windowTitles
                    );


                /*
                 * Ollama 本身出错。
                 *
                 * 不修改数据库，
                 * 等下次再尝试。
                 */
                if (llmCategory === null) {

                    console.log(
                        `${appName}：LLM调用失败，本次跳过`
                    );

                    continue;
                }


                /*
                 * Qwen 自己认为无法判断。
                 */
                if (
                    llmCategory === "unknown"
                ) {

                    saveCategory.run(
                        appName,
                        "unknown",
                        0,
                        "llm",
                        0,
                        0,
                        evidenceKey
                    );


                    console.log(
                        `${appName} → unknown（证据不足）`
                    );


                    continue;
                }


                /*
                 * ====================================
                 * 多次一致性验证
                 * ====================================
                 */

                let verificationCount = 1;


                /*
                 * 如果：
                 *
                 * 上一次也是 LLM 判断，
                 * 并且分类结果和这一次相同
                 *
                 * 才给验证次数 +1。
                 */
                if (
                    existing &&
                    existing.source === "llm" &&
                    existing.category ===
                        llmCategory
                ) {

                    verificationCount =
                        existing
                            .verification_count
                        + 1;
                }


                /*
                 * 如果分类发生变化：
                 *
                 * development
                 * ↓
                 * entertainment
                 *
                 * verificationCount 自动重新变成 1。
                 */


                const verified =
                    verificationCount >=
                    VERIFICATION_TARGET

                        ? 1
                        : 0;


                /*
                 * confidence 在这一版里
                 * 不再表示所谓“模型概率”。
                 *
                 * 这里只表示：
                 *
                 * 已验证 = 1
                 * 未验证 = 0
                 */
                const confidence =
                    verified === 1
                        ? 1
                        : 0;


                saveCategory.run(
                    appName,
                    llmCategory,
                    confidence,
                    "llm",
                    verified,
                    verificationCount,
                    evidenceKey
                );


                /*
                 * 输出结果
                 */
                if (verified === 1) {

                    console.log(
                        `${appName} → ${llmCategory}`
                        + `（LLM连续验证`
                        + `${verificationCount}次，已确认）`
                    );

                } else {

                    console.log(
                        `${appName} → ${llmCategory}`
                        + `（LLM验证 `
                        + `${verificationCount}`
                        + `/${VERIFICATION_TARGET}）`
                    );
                }


            } catch (error) {

                /*
                 * ====================================
                 * 单个应用的保险丝
                 * ====================================
                 */

                console.log(
                    `处理应用 ${app.app_name} 时出错：`
                );

                console.log(
                    error.message
                );


                /*
                 * 不退出程序。
                 *
                 * for 循环继续处理下一个应用。
                 */
                continue;
            }
        }


        /*
         * ========================================
         * 10. 输出最终结果
         * ========================================
         */

        const categories = db
            .prepare(`
                SELECT
                    app_name,
                    category,
                    source,
                    verified,
                    verification_count

                FROM app_category_map

                ORDER BY app_name
            `)
            .all();


        console.log(
            "\n最终应用分类结果："
        );


        console.log(
            categories
        );


    } finally {

        /*
         * 不管程序正常结束还是发生意外，
         * 最后都关闭数据库。
         */
        db.close();
    }
}


await main();