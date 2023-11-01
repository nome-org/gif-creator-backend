import { minify } from "html-minifier";

export const buildGifHTML = <
    ordinalImageData extends {
        duration: number;
        tx_id: string;
        ordinal_index: number;
    }
>(
    title: string,
    files: ordinalImageData[]
) => {
    return minify(
        `
<html>
    <head>
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
            body > div > img {
                display: none;
                max-width: 100%;
                width: 400px;
                image-rendering: pixelated;
                object-fit: cover;
            }
        </style>
        <script>
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            document.addEventListener("DOMContentLoaded", async () => {
                const images = document.querySelector("body > div").children;
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

    <body>
        <div>
            ${files
                .map(
                    (file) =>
                        `<img src="/content/${file.tx_id}i${file.ordinal_index}">`
                )
                .join("\n")}
        </div>
    </body>
</html>
`,
        {
            minifyCSS: true,
            minifyJS: true,
            preserveLineBreaks: false,
            collapseWhitespace: true,
        }
    );
};
