const https = require("https");
const readline = require("readline");
const fs = require('fs');

// Instructions:
//
//     * Login to slack
//     * Visit https://rapid7.slack.com/customize/emoji
//     * Open the network tab in your browser's devtools console
//     * Refresh the page and search for adminList in the requests
//     * Right click one of the adminList requests > copy > copy as CURL
//     * Paste the result into the curlCommand below and save this file
//     * Run node generateSlackEmojiGallery.js

const curlCommand = `PASTE_CURL_COMMAND_HERE`;
const numberOfEmojisToFetchPerPage = 3000; // reduce this if it keeps failing to parse response
const outputFileName = "index.html";
const lazyLoad = true; // Set whether images in the html file should lazy load


// Helper function to extract data from the curl command using regex
function extractCurlData(curlCommand) {
    const data = {};

    // Normalize the cURL command
    const normalizedCommand = curlCommand
        .replace(/\\\n/g, "") // Remove line continuation backslashes
        .replace(/\s+/g, " ") // Collapse excess whitespace
        .trim();

    // Extract URL
    const urlMatch = normalizedCommand.match(/curl\s+(?:'([^']+)'|"([^"]+)")/);
    data.url = urlMatch ? urlMatch[1] || urlMatch[2] : null;

    // Extract Cookie
    const cookieMatch = normalizedCommand.match(/-H\s+'(?:cookie|Cookie):\s*([^']+)'|-H\s+"(?:cookie|Cookie):\s*([^"]+)"/);
    data.cookie = cookieMatch ? cookieMatch[1] || cookieMatch[2] : null;

    // Extract CSRF token
    const tokenMatch = normalizedCommand.match(/name="token"\\r\\n\\r\\n(.*?)\\r\\n|name="token"\r\n\r\n(.*?)\r\n/);
    data.csrfToken = tokenMatch ? tokenMatch[1] || tokenMatch[2] : null;

    // Extract boundary for form-data
    const boundaryMatch = normalizedCommand.match(/boundary=(\S+)/);
    data.boundary = boundaryMatch ? boundaryMatch[1] : null;

    return data;
}


// Helper function to fetch JSON data
function fetchEmojis(data, page = 1, emojis = [], callback) {
    const postData = `--${data.boundary}\r\n` +
        `Content-Disposition: form-data; name="token"\r\n\r\n${data.csrfToken}\r\n` +
        `--${data.boundary}\r\n` +
        `Content-Disposition: form-data; name="page"\r\n\r\n${page}\r\n` +
        `--${data.boundary}\r\n` +
        `Content-Disposition: form-data; name="count"\r\n\r\n${numberOfEmojisToFetchPerPage}\r\n` +
        `--${data.boundary}\r\n` +
        `Content-Disposition: form-data; name="_x_reason"\r\n\r\ncustomize-emoji-new-query\r\n` +
        `--${data.boundary}\r\n` +
        `Content-Disposition: form-data; name="_x_mode"\r\n\r\nonline\r\n` +
        `--${data.boundary}--\r\n`;

    const options = {
        hostname: new URL(data.url).hostname,
        path: new URL(data.url).pathname,
        method: "POST",
        headers: {
            "Content-Type": `multipart/form-data; boundary=${data.boundary}`,
            "Cookie": data.cookie,
            "Content-Length": Buffer.byteLength(postData),
        },
    };

    const req = https.request(options, (res) => {
        let body = "";

        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
            try {
                const responseData = JSON.parse(body);
                const pageInfo = responseData?.paging;

                console.log(`Fetched page ${pageInfo?.page} of ${pageInfo?.pages}. (${pageInfo?.total} emojis in total)`);

                if (responseData.ok && responseData.emoji) {
                    emojis.push(...responseData.emoji);

                    // Calculate total pages based on count and total
                    const totalPages = pageInfo.pages;

                    if (page < totalPages) {
                        // Fetch the next page
                        fetchEmojis(data, page + 1, emojis, callback);
                    } else {
                        // We've fetched all pages, call the callback with the full emoji list
                        callback(emojis);
                    }
                } else {
                    console.error("Failed to fetch data:", responseData.error || "Unknown error");
                }
            } catch (error) {
                console.error("Failed to parse response:", error.message);
                console.log("Press ctrl+c and try again. This is pretty common, Slack can be a bit flaky. But make sure the curl command is recent, just in case. numberOfEmojisToFetchPerPage can be reduced if this keeps happening.")
            }
        });
    });

    req.on("error", (err) => {
        console.error("Request failed:", err.message);
    });

    req.write(postData);
    req.end();
}

function extractBaseUrl(url) {
    const match = url.match(/^(https:\/\/emoji\.slack-edge\.com\/[^/]+\/)/);
    return match ? match[1] : null;
}

function generateHtml(emojiData){
    console.log("Generating HTML...");

    try {

        if (!Array.isArray(emojiData)) {
            console.error('Invalid JSON format. Expected an array of emoji data.');
            return;
        }

        if (emojiData.length === 0) {
            console.error('No emoji data found in the JSON file.');
            return;
        }

        const baseUrl = extractBaseUrl(emojiData[0].url);

        // Create the HTML content manually
        let htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <base href="${baseUrl}" />
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Emoji Gallery</title>
    <style>
        /* CSS for the responsive grid */
        .container {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            gap: 0;
        }

        .i-c {
            display: flex;
            justify-content: center; /* Center horizontally */
            align-items: center; /* Center vertically */
            height: 100%; /* Make sure the container takes up the full grid square height */
        }

        .i {
            max-width: 100%;
            max-height: 100%;
            cursor: pointer;
            position: relative;
        }

        .t {
            visibility: hidden;
            position: absolute;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px;
            border-radius: 4px;
            font-size: 12px;
            bottom: -25px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1;
        }

        .i:hover .t {
            visibility: visible;
        }
        
/* CSS for the notification banner at the top */
.notification {
    position: fixed;
    top: 0; /* Display at the top */
    left: 0;
    display: block;
    right: 0;
    background-color: green;
    color: white;
    text-align: center;
    padding: 10px;
    z-index: 2;
    animation: slide-up 0.5s ease-in-out; /* Add animation for sliding up */
}
/* Animation keyframes */
@keyframes slide-up {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

    </style>
</head>
<body>
    <div class="container" id="container">
`;

        emojiData.forEach((emoji) => {
            htmlContent += `<div class="i-c">
            <div class="i" onclick="cC(this)">
                <img src="${emoji.url.replace(baseUrl, "")}" class="i"${lazyLoad ? ' loading="lazy"' : ''}>
                <div class="t">${emoji.name}</div>
            </div>
        </div>`;
        });
        // Complete the HTML content
        htmlContent += `
    </div>

    <script>
        // Copy the filename to clipboard (without extension)
        let numberOfClipboardUses = 0;
        function cC(e) {
            numberOfClipboardUses += 1;
            const filename = e.querySelector("div.t").textContent;
            const textToCopy = ":" + filename + ":";
            if(navigator.clipboard) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            popUpClipboardNotification(textToCopy + " copied to clipboard");
        })
    }
            else{
                let dummyTextArea = document.createElement('textarea');
            dummyTextArea.value = textToCopy;
            document.body.appendChild(dummyTextArea);
            dummyTextArea.select();
            document.execCommand('copy');
            document.body.removeChild(dummyTextArea);
            popUpClipboardNotification(textToCopy + " copied to clipboard");
            }
            
        }
        function popUpClipboardNotification(text){
            
        // Create a notification banner element
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.style.zIndex = (numberOfClipboardUses + 2).toString();
        notification.textContent = text;

        // Append the notification to the body
        document.body.append(notification);

        //Automatically remove the notification after 5 seconds
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 5000);
        }
    </script>
</body>
</html>
`;

        // Write the HTML content to a file
        fs.writeFile(outputFileName, htmlContent, (err) => {
            if (err) {
                console.error('Error writing HTML file:', err);
                return;
            }
            console.log(`HTML file generated successfully: ${outputFileName}`);
        });
    } catch (jsonParseError) {
        console.error('Error parsing JSON:', jsonParseError);
    }
}

// Prompt user for curl input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function go(){
    const data = extractCurlData(curlCommand);
    if (!data.url || !data.cookie || !data.csrfToken || !data.boundary) {
        console.error("Failed to parse cURL command. Open this script and follow the instructions at the top");
        rl.close();
        return;
    }
    console.log("Fetching first page of emoji urls, please wait...")
    fetchEmojis(data, 1, [], (emojis) => {
        console.log(`Fetched image URLs for ${emojis.length} emojis`);
        generateHtml(emojis);
        rl.close();
    });
}

go();

