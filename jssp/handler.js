const vm = require("vm");
const send = require('koa-send')
const fs = require('fs')
const path = require('path')

/**
 *
 * @param opts 参数 koa-jssp
 */
module.exports = function (opts) {
    const dir = path.resolve(opts.dir)

    return async function (ctx) {

        const fullPath = path.join(dir, ctx.path)
        const {fileType, fileExt} = getFileInfo(fullPath)
        switch (fileType) {
            case "jssp":
            case "jsjs":
                renderJsCode(ctx, fullPath, fileType, fileExt);
                break
            case "file":
                await send(ctx, ctx.path, {index: false, root: dir})
                break
            case "dir":

                break
            default:
                break
        }
    }
}

function makeSandBoxContextObject(ctx) {
    let buf = [];
    return {ctx, require, echo: function (str) {
            buf.push(str)
            // ctx.res.write(str);
        }, print: function (obj) {
            buf.push(JSON.stringify(obj))
            // ctx.res.write(JSON.stringify(obj));
        }, end: function () {
            ctx.body = buf.join('')
        }};
}

function renderJsCode(ctx, fullPath, fileType, fileExt) {
    ctx.response.type = fileExt;
    let buffer = fs.readFileSync(fullPath);
    let jsCode;
    if (fileType === 'jssp') {
        jsCode = jsspTemplateToJsCode(buffer.toString());
    } else {
        jsCode = buffer.toString();
    }
    const sandbox = makeSandBoxContextObject(ctx);
    const script = new vm.Script(jsCode);
    const context = new vm.createContext(sandbox);
    script.runInContext(context);
    sandbox.end();
}

function getFileInfo(filepath) {
    try {
        const stat = fs.statSync(filepath)
        if (stat.isDirectory()) {
            return {fileType: "dir"}
        }
        if (stat.isFile()) {
            let extname = path.extname(filepath)
            let basename = path.basename(filepath)
            if (basename.endsWith(".jssp" + extname)) {
                return {fileType: "jssp", fileExt: extname}
            }
            if (basename.endsWith(".jsjs" + extname)) {
                return {fileType: "jsjs", fileExt: extname}
            }
            return {fileType: "file", fileExt: extname}
        }
        return {fileType: "notfound"}
    } catch (e) {
        return {fileType: "notfound", error: e}
    }
}


/**
 * jssp html template convert to js code
 * @param data {string}
 * @returns {string}
 */
function jsspTemplateToJsCode(data) {
    const buf = []
    buf.push(`echo("`)
    let isJsjs = false
    let isPrint = false
    for (let i = 0, n = data.length; i < n; i++) {
        let c = data[i]
        if (isJsjs) {
            if (c === '%' && data[i + 1] === '>') {
                if (isPrint) {
                    isPrint = false
                    buf.push(`);echo("`)
                } else {
                    buf.push(`;echo("`)
                }
                i++
                isJsjs = false
            } else {
                buf.push(c)
            }
        } else {
            if (c === '<' && data[i + 1] === '%') {
                buf.push(`");`)
                if (data[i + 2] === '=') {
                    i++
                    isPrint = true
                    buf.push(`echo(`)
                }
                i++
                isJsjs = true
            } else {
                switch (c) {
                    case '\n':
                        buf.push("\\n")
                        break
                    case '\r':
                        continue
                    case '"':
                        buf.push(`\\\"`)
                        break
                    default:
                        buf.push(c)
                        break
                }
            }
        }
    }
    buf.push(`");`)
    return buf.join('')
}