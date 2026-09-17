import { activeWindow } from "get-windows";
import koffi from "koffi";

let lastApp = "";
let lastTitle = "";
let startTime = null;

async function checkWindow() {
    const window = await activeWindow();

    if (!window) {
        return;
    }

    const currentApp = window.owner.name;
    const currentTitle = window.title;

    // 如果窗口发生了变化
    if (currentApp !== lastApp || currentTitle !== lastTitle) {

        const now = Date.now();

        // 如果之前已经记录过一个窗口
        if (startTime !== null) {
            const duration = (now - startTime) / 1000;

            console.log("上一个软件：", lastApp);
            console.log("上一个窗口：", lastTitle);
            console.log("停留时间：", duration.toFixed(1), "秒");
            console.log("--------------------");
        }

        // 记录新的窗口
        lastApp = currentApp;
        lastTitle = currentTitle;
        startTime = now;

        console.log("切换到：", currentApp);
        console.log("窗口标题：", currentTitle);
        console.log("开始时间：", new Date().toLocaleTimeString());
        console.log("====================");
    }
}

checkWindow();

setInterval(checkWindow, 5000);