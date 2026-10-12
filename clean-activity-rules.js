import Database from "better-sqlite3";

const db =
    new Database("campus.db");


/*
 * 删除明显太宽泛的学习规则。
 */
const deleteRules =
    db.prepare(`
        DELETE FROM activity_learned_rules

        WHERE keyword IN (
            '中国',
            '音乐',
            '爷爷',
            '强化班',
            '第1讲',
            '第2讲'
        )
    `).run();


/*
 * 很重要：
 *
 * 以前如果某个窗口因为 learned_rule
 * 被错误分类，
 * 完整标题也已经缓存了。
 *
 * 所以把 learned_rule 产生的完整缓存
 * 一起清掉。
 *
 * 下次 base-test.js 会重新判断。
 */
const deleteCache =
    db.prepare(`
        DELETE FROM activity_resolution_cache

        WHERE source = 'learned_rule'
    `).run();


console.log(
    "删除学习规则：",
    deleteRules.changes
);


console.log(
    "删除 learned_rule 缓存：",
    deleteCache.changes
);


db.close();