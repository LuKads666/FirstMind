import Database from "better-sqlite3";

import {
    resolveActivity,
    closeActivityResolver
} from "./activity-resolver.js";


const appName = "Microsoft Edge";

const title1 =
    "李永乐线代强化班 第1讲 - 哔哩哔哩";

const title2 =
    "李永乐线代强化班 第2讲 - 哔哩哔哩";


/*
 * =============================
 * 先清理上一次测试留下的数据
 * =============================
 */
function cleanOldTestData() {

    const db =
        new Database("campus.db");


    db.prepare(`
        DELETE FROM activity_resolution_cache

        WHERE app_name = ?

        AND window_title IN (?, ?)
    `).run(
        appName,
        title1,
        title2
    );


    db.prepare(`
        DELETE FROM activity_learned_rules

        WHERE app_name = ?

        AND (
            keyword LIKE '%李永乐%'
            OR keyword LIKE '%线代%'
            OR keyword = '强化班'
            OR keyword = '第1讲'
            OR keyword = '第2讲'
        )
    `).run(
        appName
    );


    db.close();
}


/*
 * =============================
 * 看看最后到底学进去了什么规则
 * =============================
 */
function showLearnedRules() {

    const db =
        new Database("campus.db");


    const rules =
        db.prepare(`
            SELECT
                keyword,
                category,
                confidence,
                hit_count

            FROM activity_learned_rules

            WHERE app_name = ?

            ORDER BY id DESC
        `).all(
            appName
        );


    console.log(
        "\n===== 当前学到的规则 ====="
    );


    for (const rule of rules) {

        console.log(
            rule
        );
    }


    db.close();
}


/*
 * =============================
 * 正式测试
 * =============================
 */
async function test() {

    cleanOldTestData();


    console.log(
        "\n===== 第一次：应该调用 LLM ====="
    );


    const result1 =
        await resolveActivity(
            appName,
            title1
        );


    console.log(
        "第一次结果：",
        result1
    );


    console.log(
        "\n===== 第二次：应该使用 learned_rule ====="
    );


    const result2 =
        await resolveActivity(
            appName,
            title2
        );


    console.log(
        "第二次结果：",
        result2
    );


    closeActivityResolver();


    showLearnedRules();
}


test();