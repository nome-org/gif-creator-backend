import { Ordinal } from "@prisma/client";

export const buildGifHTMLFull = (title: string, files: Ordinal[]) => {
    return `
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .grid-item {
                display: none;
                max-width: 100%;
                height: auto;
                object-fit: cover;
            }
        </style>
        <script>
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            document.addEventListener("DOMContentLoaded", async () => {
                const images = document.querySelector(".grid-container").children;
                const times = [${files.map((file) => file.duration).join(",")}];
                let currentInDisplay = 0;
                while (true) {
                    const currentImage = images.item(currentInDisplay);
                    const previousImage = images.item((currentInDisplay || images.length) - 1);
                    await delay(times[currentInDisplay] || 1000);
                    previousImage.style.setProperty("display", "none");
                    currentImage.style.setProperty("display", "block");
                    if (currentInDisplay === images.length - 1) {
                        currentInDisplay = 0;
                    } else {
                        currentInDisplay += 1;
                    }
                }
            });
        </script>
    </head>

    <body style="margin: 0px; isolation: isolate;">
        <div class="grid-container">
            ${files
                .map(
                    (file) =>
                        `<img class="grid-item" src="/content/${file.tx_id}i0">`
                )
                .join("\n")}
        </div>
    </body>
</html>
`;
};

export const buildGifHTMLMini = (title: string, files: Ordinal[]) => {
    return `<html lang=en><meta charset=UTF-8><meta content="width=device-width,initial-scale=1"name=viewport><title>${title}</title><style>body{display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.grid-item{display:none;max-width:100%;height:auto;object-fit:cover}</style><script>const e=e=>new Promise(t=>setTimeout(t,e));document.addEventListener("DOMContentLoaded",async()=>{const t=document.querySelector(".grid-container").children,n=[${files
        .map((file) => file.duration)
        .join(
            ","
        )}];let o=0;for(;;){const s=t.item(o),i=t.item((o||t.length)-1);await e(n[o]||1e3),i.style.setProperty("display","none"),s.style.setProperty("display","block"),o===t.length-1?o=0:o+=1}})</script><body style=margin:0;isolation:isolate><div class=grid-container>${files
        .map((file) => `<img class=grid-item src=/content/${file.tx_id}i0>`)
        .join("\n")}</div>    </body></html>`;
};
