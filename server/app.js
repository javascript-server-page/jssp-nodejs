const Koa = require('koa')
const app = new Koa()
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')

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
