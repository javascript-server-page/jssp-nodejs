const Koa = require('koa')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')

const app = new Koa()

// error handler
onerror(app)

// middlewares
app.use(bodyparser({
  enableTypes:['json', 'form', 'text']
}))
app.use(logger())

// logger
app.use(async (ctx, next) => {
  const start = new Date()
  await next()
  const ms = new Date() - start
  console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

const handler = require('../jssp/handler.js')({dir: "./demo"})

// server handler
app.use(async (ctx, next) => {
  await handler(ctx)
  await next()
})

// error-handling
app.on('error', (err, ctx) => {
  console.error('server error', err, ctx)
});

app.port = 3000

module.exports = app

const path = require('path');
const ts = require('typescript');
const fs = require('fs');


require.extensions['.ts'] = function(module, filename) {
  const fileFullPath = path.resolve(__dirname, filename);
  const content = fs.readFileSync(fileFullPath, 'utf-8');

  const { outputText } = ts.transpileModule(content, {});
  //{
  //     compilerOptions: require('./tsconfig.json')
  //   }
  module._compile(outputText, filename);
}
// require('../jssp/111.ts');