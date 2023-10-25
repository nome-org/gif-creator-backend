const fs = require("fs");
const path = require("path");



const getenv = () => {
    let filePath = path.join(__dirname, "..", ".env");
    let fileContent = fs.readFileSync(filePath, {encoding: 'utf-8'});

    fileContent = process.platform === 'win32' ? fileContent.split("\r\n") : fileContent.split("\n");
    for(c of fileContent){
        importenv(c);
    }
}


function importenv(env){
    if(!env) return;
    let [key, value] = env.split("=");
    if(!key.trim() || !value.trim()) return;
    process.env[key.trim()] = value.trim();
}


module.exports = getenv;