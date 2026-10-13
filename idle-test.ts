import koffi from "koffi";

const user32 = koffi.load("user32.dll");

const LASTINPUTINFO = koffi.struct("LASTINPUTINFO", {
    cbSize: "uint",
    dwTime: "uint32"
});

const GetLastInputInfo = user32.func(
    "bool __stdcall GetLastInputInfo(_Inout_ LASTINPUTINFO *plii)"
);

const kernel32 = koffi.load("kernel32.dll");

const GetTickCount = kernel32.func(
    "uint32 __stdcall GetTickCount()"
);

function getIdleSeconds() {
    const info = {
    cbSize: koffi.sizeof(LASTINPUTINFO),
    dwTime: 0
};

    const success = GetLastInputInfo(info);

    if (!success) {
        return null;
    }

    const currentTick = GetTickCount();

    const idleMilliseconds =
        (currentTick - info.dwTime) >>> 0;

    return idleMilliseconds / 1000;
}

setInterval(() => {
    const idleSeconds = getIdleSeconds();

    if (idleSeconds === null) {
        console.log("获取失败");
        return;
    }

    console.log(
        "距离上一次键鼠操作：",
        idleSeconds.toFixed(1),
        "秒"
    );
}, 1000);