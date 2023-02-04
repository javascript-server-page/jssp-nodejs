const vm = require("vm");
const send = require('koa-send')
const fs = require('fs')
const path = require('path')
const ts = require('typescript')

/**
 *
 * @param opts 参数 koa-jssp
 */
module.exports = function (opts) {
    const dir = path.resolve(opts.dir)

    return async function (ctx) {

        const fullPath = path.join(dir, ctx.path)
        const {fileType, fileExt, fileLastDate} = getFileInfo(fullPath)
        switch (fileType) {
            case "jssp":
            case "js":
            case "tssp":
            case "ts":
                await renderCode(ctx, fullPath, fileType, fileExt, fileLastDate);
                break
            case "file":
                await send(ctx, ctx.path, {index: false, root: dir})
                break
            case "dir":
                renderDir(ctx, fullPath, opts.isRenderDir);
                break
            default:
                break
        }
    }
}


function renderDir(ctx, fullPath, isRenderDir) {
    const indexFiles = ['index.jssp.html', 'index.tssp.html', 'index.js.html', 'index.ts.html', 'index.html']
    for (let indexFile of indexFiles) {
        let {fileType} = getFileInfo(path.join(fullPath, indexFile))
        if (fileType !== 'notfound' && fileType !== 'dir') {
            let url = path.join(ctx.path, indexFile);
            ctx.redirect(url.replace(/\\/g, "/"))
            return
        }
    }
    isRenderDir = true
    if (!isRenderDir) { // 403
        ctx.status = 403
        return
    }

    let html = []
    html.push("<pre>\n")
    let hasSuffix = ctx.path[ctx.path.length-1] === '/'

    for (let name of fs.readdirSync(fullPath)) {
        let {fileType} = getFileInfo(path.join(fullPath, name));
        if (fileType === 'notfound') {
            continue
        }
        if (hasSuffix) {
            html.push("<a href='" + name)
        } else {
            html.push("<a href='" + path.basename(ctx.path) + "/" + name)
        }
        if (fileType === 'dir') {
            html.push("/'>" + name + "</a>\n")
        } else {
            html.push("'>" + name + "</a>\n")
        }
    }
    html.push("</pre>\n")
    ctx.body = html.join('')
}

function makeSandBoxContextObject(ctx, fullPath) {
    let __buf = [];
    let __promise;
    let __resolve;
    return {
        context: ctx, require, include: function (filename) {
            let dir = path.dirname(fullPath);
            let fileContent = fs.readFileSync(path.join(dir, filename)).toString();
            __buf.push(fileContent);
        }, global, echo: function () {
            for (var i in arguments) {
                var str = String(arguments[i])
                if (str.length === 0) {
                    continue
                }
                __buf.push(str);
            }
        }, print: function () {
            if (arguments.length === 0) return
            if (arguments.length === 1) {
                __buf.push(JSON.stringify(arguments[0]))
            } else {
                __buf.push(JSON.stringify(arguments))
            }
        }, render: function () {
            ctx.body = __buf.join('')
        }, promise: function () {
            return __promise;
        }, end: async function () {
            if (__resolve) {
                __resolve()
            }
        }, wait: function () {
            __promise = new Promise((resolve, reject) => {
                __resolve = resolve;
            });
        }
    };
}

const LRU = require('lru-cache');

const cache = new LRU({
    max: 500,
    // maxAge: 1000 * 60 * 60
});


async function renderCode(ctx, fullPath, fileType, fileExt, fileLastDate) {
    ctx.response.type = fileExt;
    let fileCache = cache.get(fullPath);
    if (!fileCache || fileCache.fileLastDate !== fileLastDate) {
        let fileContent = fs.readFileSync(fullPath).toString();
        let jsCode;

        const start = new Date()

        if (fileType === 'jssp') {
            jsCode = templateToCode(fileContent);
        }
        if (fileType === 'tssp') {
            let tsCode = templateToCode(fileContent);
            const {outputText} = ts.transpileModule(tsCode, {});
            jsCode = outputText;
        }
        if (fileType === 'ts') {
            const {outputText} = ts.transpileModule(fileContent, {});
            jsCode = outputText;
        }
        if (fileType === 'js') {
            jsCode = fileContent;
        }
        const ms = new Date() - start
        console.log(`------------${ctx.url} - ${ms}ms`)

        fileCache = {fileLastDate, script: new vm.Script(jsCode)}
        cache.set(fullPath, fileCache)
    }

    const sandbox = makeSandBoxContextObject(ctx, fullPath);
    const context = new vm.createContext(sandbox);
    fileCache.script.runInContext(context);
    let promise = sandbox.promise();
    if (promise) {
        await promise;
    }
    sandbox.render();
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
                return {fileType: "jssp", fileExt: extname, fileLastDate: stat.mtime}
            }
            if (basename.endsWith(".js" + extname)) {
                return {fileType: "js", fileExt: extname, fileLastDate: stat.mtime}
            }
            if (basename.endsWith(".tssp" + extname)) {
                return {fileType: "tssp", fileExt: extname, fileLastDate: stat.mtime}
            }
            if (basename.endsWith(".ts" + extname)) {
                return {fileType: "ts", fileExt: extname, fileLastDate: stat.mtime}
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
function templateToCode(data) {
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