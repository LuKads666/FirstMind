const response = await fetch(
    "http://localhost:11434/api/generate",
    {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            model: "qwen3:4b-instruct",

            prompt: `
请判断下面的软件属于哪一类，只回答类别名称。

软件名：ViewTurboLite
窗口标题：ViewTurbo - (Fast & Stable VPN) - v1.13.0

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

            stream: false
        })
    }
);

const result = await response.json();

console.log(result.response);