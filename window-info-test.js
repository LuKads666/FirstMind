import { activeWindow } from "get-windows";

const windowInfo = await activeWindow();

console.dir(
    windowInfo,
    {
        depth: null
    }
);