import Database from "better-sqlite3";

const db = new Database("campus.db");


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
 * 这些类别只看软件名不够准确。
 *
 * 比如：
 * Edge → 可能学习 / 娱乐 / 开发
 * Bilibili → 可能学习 / 娱乐
 */
const contextSensitiveCategories = new Set([
    "browser",
    "office",
    "entertainment",
    "media",
    "unknown"
]);


/*
 * 一些非常明确的内置规则。
 *
 * 这些不需要问 LLM。
 */
const titleRules = [
    {
        category: "study",

        keywords: [
            "课程",
            "学习",
            "高等数学",
            "概率论",
            "考研",
            "作业",
            "教学",
            "lecture",
            "course",
            "lesson",
            "mooc"
        ]
    },

    {
        category: "development",

        keywords: [
            "github",
            "gitlab",
            "stackoverflow",
            "node.js",
            "javascript",
            "typescript",
            "python",
            "pytorch",
            "transformer",
            "firstmind",
            "npm",
            "developer",
            "documentation",
            "docs"
        ]
    },

    {
        category: "entertainment",

        keywords: [
            "番剧",
            "电影",
            "电视剧",
            "综艺",
            "搞笑",
            "直播"
        ]
    }
];


/*
 * ==============================
 * 数据库表 1：
 * 完整标题缓存
 * ==============================
 *
 * 例如：
 *
 * Edge
 * + 高等数学第一章
 * → study
 *
 * 下次标题完全相同就直接使用。
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS
    activity_resolution_cache (

        app_name TEXT NOT NULL,

        window_title TEXT NOT NULL,

        category TEXT NOT NULL,

        source TEXT NOT NULL,

        PRIMARY KEY (
            app_name,
            window_title
        )
    )
`);


/*
 * ==============================
 * 数据库表 2：
 * LLM 自动学习出来的规则
 * ==============================
 *
 * 例如：
 *
 * 高等数学 → study
 *
 * 以后：
 *
 * 高等数学第二章
 * 高等数学极限
 * 高等数学复习
 *
 * 都可以直接识别。
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS
    activity_learned_rules (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        app_name TEXT NOT NULL,

        keyword TEXT NOT NULL,

        category TEXT NOT NULL,

        confidence REAL NOT NULL,

        hit_count INTEGER NOT NULL DEFAULT 0,

        source TEXT NOT NULL DEFAULT 'llm',

        UNIQUE (
            app_name,
            keyword
        )
    )
`);


/*
 * 查询软件原来的默认分类。
 *
 * 比如：
 *
 * Edge → browser
 * VS Code → development
 */
const findDefaultCategory = db.prepare(`
    SELECT category

    FROM app_category_map

    WHERE app_name = ?
`);


/*
 * 查询完整标题缓存。
 */
const findCache = db.prepare(`
    SELECT
        category,
        source

    FROM activity_resolution_cache

    WHERE app_name = ?
      AND window_title = ?
`);


/*
 * 保存完整标题缓存。
 */
const saveCache = db.prepare(`
    INSERT INTO activity_resolution_cache (
        app_name,
        window_title,
        category,
        source
    )

    VALUES (?, ?, ?, ?)

    ON CONFLICT (
        app_name,
        window_title
    )

    DO UPDATE SET
        category = excluded.category,
        source = excluded.source
`);


/*
 * 查找这个软件以前学到的全部规则。
 */
const findLearnedRules = db.prepare(`
    SELECT
        id,
        keyword,
        category,
        confidence,
        hit_count

    FROM activity_learned_rules

    WHERE app_name = ?

    ORDER BY
        confidence DESC,
        LENGTH(keyword) DESC
`);


/*
 * 判断某个关键词以前是否已经学习过。
 */
const findLearnedRule = db.prepare(`
    SELECT
        id,
        keyword,
        category,
        confidence

    FROM activity_learned_rules

    WHERE app_name = ?
      AND keyword = ?
`);


/*
 * 保存新的学习规则。
 */
const insertLearnedRule = db.prepare(`
    INSERT INTO activity_learned_rules (
        app_name,
        keyword,
        category,
        confidence,
        source
    )

    VALUES (?, ?, ?, ?, 'llm')
`);


/*
 * 如果规则已经存在，
 * 并且分类相同，
 * 可以更新它的置信度。
 */
const updateLearnedRule = db.prepare(`
    UPDATE activity_learned_rules

    SET confidence = ?

    WHERE id = ?
`);


/*
 * 每命中一次自动学习规则，
 * hit_count + 1。
 */
const increaseRuleHitCount = db.prepare(`
    UPDATE activity_learned_rules

    SET hit_count = hit_count + 1

    WHERE id = ?
`);


/*
 * ==============================
 * 内置关键词规则判断
 * ==============================
 */
function classifyByTitleRule(
    windowTitle
) {

    const text =
        (windowTitle ?? "")
            .trim()
            .toLowerCase();


    if (!text) {
        return null;
    }


    for (const rule of titleRules) {

        const matched =
            rule.keywords.some(
                keyword =>
                    text.includes(
                        keyword.toLowerCase()
                    )
            );


        if (matched) {
            return rule.category;
        }
    }


    return null;
}


/*
 * ==============================
 * 检查 LLM 以前学到的规则
 * ==============================
 */
function classifyByLearnedRule(
    appName,
    windowTitle
) {

    const text =
        (windowTitle ?? "")
            .trim()
            .toLowerCase();


    if (!text) {
        return null;
    }


    const rules =
        findLearnedRules.all(
            appName
        );


    for (const rule of rules) {

        const keyword =
            rule.keyword.toLowerCase();


        if (
            text.includes(keyword)
        ) {

            increaseRuleHitCount.run(
                rule.id
            );


            return {
                category:
                    rule.category,

                keyword:
                    rule.keyword,

                confidence:
                    rule.confidence
            };
        }
    }


    return null;
}


/*
 * ==============================
 * 判断 LLM 返回的关键词
 * 是否值得学习
 * ==============================
 */
function isValidLearnedKeyword(
    keyword,
    appName,
    windowTitle
) {

    if (
        typeof keyword !== "string"
    ) {
        return false;
    }


    const cleanKeyword =
        keyword
            .trim()
            .toLowerCase();


    const cleanWindowTitle =
        (windowTitle ?? "")
            .trim()
            .toLowerCase();


    /*
     * 太短 / 太长都不要。
     */
    if (
        cleanKeyword.length < 2 ||
        cleanKeyword.length > 30
    ) {
        return false;
    }


    /*
     * 很重要：
     *
     * LLM 提出来的关键词
     * 必须真的存在于当前标题中。
     *
     * 防止 LLM 自己“总结”出
     * 一个标题里根本不存在的词。
     */
    if (
        !cleanWindowTitle.includes(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 太宽泛的平台 / 软件 / 页面词。
     */
    const badKeywords = new Set([
        "microsoft edge",
        "edge",
        "chrome",
        "google chrome",

        "浏览器",
        "网页",
        "页面",
        "首页",
        "新建标签页",

        "哔哩哔哩",
        "bilibili",

        "视频",
        "直播",

        "www",
        "com"
    ]);


    if (
        badKeywords.has(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 这些词本身含义太宽，
     * 不能稳定代表某一种活动。
     */
    const genericKeywords = new Set([
        "中国",
        "音乐",
        "学习",
        "娱乐",
        "游戏",
        "工作",
        "资料",
        "内容",

        "强化班",
        "基础班",
        "冲刺班",
        "提高班",

        "第一讲",
        "第二讲",
        "第三讲",

        "第一章",
        "第二章",
        "第三章",

        "第一集",
        "第二集",
        "第三集"
    ]);


    if (
        genericKeywords.has(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 两个汉字的词默认比较危险。
     *
     * 比如：
     * 中国
     * 音乐
     * 爷爷
     *
     * 都太容易误命中。
     *
     * 只有我们明确允许的短词，
     * 才可以自动学习。
     */
    const trustedShortKeywords =
        new Set([
            "线代",
            "高数",
            "考研"
        ]);


    if (
        /^[\u4e00-\u9fff]{2}$/.test(
            cleanKeyword
        ) &&
        !trustedShortKeywords.has(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 纯数字不要。
     */
    if (
        /^\d+$/.test(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 第1讲、第2章、第10集……
     */
    if (
        /^第[0-9一二三四五六七八九十百零两]+[讲课章节集期季篇部]$/.test(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 1讲、10章、三集……
     */
    if (
        /^[0-9一二三四五六七八九十百零两]+[讲课章节集期季篇部]$/.test(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 时间本身也不要。
     */
    if (
        /^\d{1,2}[:：]\d{2}$/.test(
            cleanKeyword
        )
    ) {
        return false;
    }


    /*
     * 软件名本身不能当新规则。
     */
    const cleanAppName =
        (appName ?? "")
            .trim()
            .toLowerCase();


    if (
        cleanAppName ===
        cleanKeyword
    ) {
        return false;
    }


    return true;
}

/*
 * ==============================
 * 保存 LLM 学到的新关键词
 * ==============================
 */
function saveLearnedKeywords(
    appName,
    windowTitle,
    category,
    confidence,
    keywords
) {

    /*
     * 置信度低于 0.85 时，
     * 不允许它自动学习规则。
     *
     * 防止 LLM 猜错一次，
     * 以后一直跟着错。
     */
    if (
        confidence < 0.90
    ) {
        return;
    }


    if (
        !Array.isArray(keywords)
    ) {
        return;
    }


    /*
     * 最多学习 3 个关键词。
     */
    const safeKeywords =
        keywords
            .slice(0, 3)
            .map(
                keyword =>
                    String(keyword)
                        .trim()
                        .toLowerCase()
            )
            .filter(
                keyword =>
                    isValidLearnedKeyword(
                        keyword,
                        appName,
                        windowTitle
                    )
            );


    for (
        const keyword
        of safeKeywords
    ) {

        const existing =
            findLearnedRule.get(
                appName,
                keyword
            );


        /*
         * 以前没有这个规则：
         * 直接新增。
         */
        if (!existing) {

            insertLearnedRule.run(
                appName,
                keyword,
                category,
                confidence
            );


            console.log(
                `学到新规则：${appName} + "${keyword}" → ${category}`
            );


            continue;
        }


        /*
         * 如果以前的分类和这次一样，
         * 可以提高置信度。
         */
        if (
            existing.category
            === category
        ) {

            const newConfidence =
                Math.max(
                    existing.confidence,
                    confidence
                );


            updateLearnedRule.run(
                newConfidence,
                existing.id
            );
        }


        /*
         * 如果同一个关键词以前认为是 study，
         * 这次却认为是 entertainment，
         *
         * 暂时不自动覆盖。
         *
         * 防止错误规则污染数据库。
         */
    }
}


/*
 * ==============================
 * 调用本地 LLM
 * ==============================
 *
 * 现在不只是让它返回 category，
 * 还让它顺便告诉我们：
 *
 * 哪些关键词以后可以复用。
 */
async function classifyWithLLM(
    appName,
    windowTitle,
    fallbackCategory
) {

    try {

        const response =
            await fetch(
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

                        /*
                         * 要求 Ollama 返回 JSON。
                         */
                        format: "json",

                        prompt: `
你正在帮助一个个人电脑行为识别系统判断用户当前实际在做什么。

注意：
你判断的是“用户正在进行的活动”，
不是简单判断这个软件属于什么类型。

请根据：

1. 软件名称
2. 当前窗口标题
3. 软件原来的默认类别

判断实际活动。

可选类别只能是：

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

同时请从窗口标题中提取最多 3 个“以后还能用于判断相似标题”的稳定关键词。

关键词要求：

- 必须真正能代表活动含义
- 不要返回软件名称
- 不要返回 Microsoft Edge、Bilibili 这种平台名称
- 不要返回“视频”“网页”这种太宽泛的词
- 不确定时 keywords 返回空数组
- 如果无法可靠判断活动，category 返回 unknown

只输出 JSON，不要解释。

格式必须是：

{
  "category": "study",
  "keywords": ["高等数学", "函数极限"],
  "confidence": 0.95
}

软件名称：
${appName}

窗口标题：
${windowTitle}

软件原来的默认类别：
${fallbackCategory}
                        `,

                        stream: false,

                        keep_alive: "30m",

                        options: {
                            temperature: 0
                        }
                    })
                }
            );


        if (!response.ok) {
            return null;
        }


        const result =
            await response.json();


        let parsed;


        try {

            parsed =
                JSON.parse(
                    result.response
                );

        } catch {

            /*
             * 如果模型没有正常返回 JSON，
             * 就认为这次判断失败。
             */
            return null;
        }


        const category =
            String(
                parsed.category ?? ""
            )
                .trim()
                .toLowerCase();


        if (
            !allowedCategories.includes(
                category
            )
        ) {
            return null;
        }


        let confidence =
            Number(
                parsed.confidence
            );


        if (
            !Number.isFinite(
                confidence
            )
        ) {
            confidence = 0;
        }


        confidence =
            Math.max(
                0,
                Math.min(
                    1,
                    confidence
                )
            );


        const keywords =
            Array.isArray(
                parsed.keywords
            )

                ? parsed.keywords

                : [];


        return {
            category,
            confidence,
            keywords
        };


    } catch (error) {

        console.log(
            "Activity Resolver 无法调用 LLM：",
            error.message
        );


        return null;
    }
}


/*
 * =====================================
 * 最核心函数
 * =====================================
 */
export async function resolveActivity(
    appName,
    windowTitle
) {

    const safeAppName =
        appName ?? "";


    const safeWindowTitle =
        (windowTitle ?? "")
            .trim();


    /*
     * ① 先取得软件原来的默认分类。
     */
    const defaultRow =
        findDefaultCategory.get(
            safeAppName
        );


    const fallbackCategory =
        defaultRow?.category
        ?? "unknown";


    /*
     * 没有标题时，
     * 没办法继续分析。
     */
    if (!safeWindowTitle) {

        return {
            category:
                fallbackCategory,

            source:
                "app_default"
        };
    }


    /*
     * ② 完整标题以前见过吗？
     *
     * 如果见过：
     * 最快，直接返回。
     */
    const cached =
        findCache.get(
            safeAppName,
            safeWindowTitle
        );


    if (cached) {
        return cached;
    }


    /*
     * ③ 检查我们手写的内置规则。
     */
    const ruleCategory =
        classifyByTitleRule(
            safeWindowTitle
        );


    if (ruleCategory) {

        saveCache.run(
            safeAppName,
            safeWindowTitle,
            ruleCategory,
            "title_rule"
        );


        return {
            category:
                ruleCategory,

            source:
                "title_rule"
        };
    }


    /*
     * ④ 检查 LLM 以前学到的规则。
     */
    const learned =
        classifyByLearnedRule(
            safeAppName,
            safeWindowTitle
        );


    if (learned) {

        saveCache.run(
            safeAppName,
            safeWindowTitle,
            learned.category,
            "learned_rule"
        );


        return {
            category:
                learned.category,

            source:
                "learned_rule"
        };
    }


    /*
     * ⑤ 如果软件本身已经非常明确，
     * 不需要问 LLM。
     *
     * 比如：
     *
     * VS Code → development
     * 游戏 → game
     */
    if (
        !contextSensitiveCategories.has(
            fallbackCategory
        )
    ) {

        return {
            category:
                fallbackCategory,

            source:
                "app_default"
        };
    }


    /*
     * ⑥ 到这里说明：
     *
     * 完整标题没见过
     * 内置规则不知道
     * 学习规则也不知道
     * 软件本身又是多用途的
     *
     * → 问 LLM。
     */
    const llmResult =
        await classifyWithLLM(
            safeAppName,
            safeWindowTitle,
            fallbackCategory
        );


    let finalCategory =
        fallbackCategory;


    let source =
        "fallback";


    if (
        llmResult &&
        llmResult.category !== "unknown"
    ) {

        finalCategory =
            llmResult.category;


        source =
            "llm";


        /*
         * ==========================
         * 这里就是你刚才要的新功能
         * ==========================
         *
         * LLM 不只是回答一次。
         *
         * 它还会把可靠的关键词
         * 自动学进数据库。
         */
       saveLearnedKeywords(
        safeAppName,
     safeWindowTitle,
    llmResult.category,
    llmResult.confidence,
    llmResult.keywords
           );
    }


    /*
     * 保存完整标题缓存。
     */
    saveCache.run(
        safeAppName,
        safeWindowTitle,
        finalCategory,
        source
    );


    return {
        category:
            finalCategory,

        source:
            source
    };
}


/*
 * 程序结束时关闭数据库。
 */
export function closeActivityResolver() {
    db.close();
}