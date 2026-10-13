import chokidar from "chokidar";
import path from "node:path";

const watcher = chokidar.watch("./watch-test", {
    ignoreInitial: true
});

watcher.on("add", filePath => {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath);

    console.log("新建：", filePath);
    console.log("文件名：", fileName);
    console.log("后缀：", extension);
});

watcher.on("change", path => {
    console.log("修改：", path);
});

watcher.on("unlink", path => {
    console.log("删除：", path);
});