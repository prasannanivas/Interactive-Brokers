#!/usr/bin/env node
// Command-line Signal Audit: runs the exact same checks as the hidden /test page
// (src/utils/signalAudit.js) against the live services and exits 1 on any FAIL.
//
//   npm run audit:signals                              all pairs
//   npm run audit:signals -- --symbols USDCAD,EURUSD   some pairs
//   npm run audit:signals -- --out audit.json          save the full report
//   npm run audit:signals -- --watchlist file.json     audit a saved /api/watchlist response
//
// API base URLs: VITE_AUTH_API_URL / VITE_TRADING_API_URL (same defaults as src/api/api.js).
// Only Massive- and MongoDB-backed endpoints are called - never TradingEconomics; the run
// fails if any other endpoint is requested.

import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const AUTH = process.env.VITE_AUTH_API_URL || 'http://167.172.215.78:8001'
const TRADE = process.env.VITE_TRADING_API_URL || 'http://167.172.215.78:8000'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))

// Bundle the audit (Vite-style extensionless imports, import.meta.env) into one Node module
// (written under node_modules/.cache so the external axios import resolves to the installed one)
mkdirSync(join(here, '..', 'node_modules', '.cache'), { recursive: true })
const dir = mkdtempSync(join(here, '..', 'node_modules', '.cache', 'signal-audit-'))
const outfile = join(dir, 'audit.mjs')
await build({
  entryPoints: [join(here, '..', 'src', 'utils', 'signalAudit.js')],
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error', external: ['axios'],
  define: { 'import.meta.env': JSON.stringify({ VITE_AUTH_API_URL: AUTH, VITE_TRADING_API_URL: TRADE }) },
})
const { runSignalAudit } = await import(pathToFileURL(outfile).href)
rmSync(dir, { recursive: true, force: true })

const urls = []
const get = async (url) => {
  urls.push(url)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}
const api = {
  getStatus: () => get(`${TRADE}/`),
  getWatchlist: async () => (args.watchlist ? JSON.parse(readFileSync(args.watchlist, 'utf8')) : get(`${AUTH}/api/watchlist`)),
  getCandles: async (s, d, t) => (await get(`${AUTH}/api/history/price-data/${s}?days=${d}&timespan=${t}`)).candles || [],
  getSignalChanges: async (s, l) => (await get(`${TRADE}/api/signals/changes/${s}?limit=${l}`)).changes || [],
  getMACrossAlerts: async (l) => (await get(`${TRADE}/api/ma-cross-alerts?limit=${l}`)).alerts || [],
}

const symbols = typeof args.symbols === 'string'
  ? args.symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).map(s => (s.startsWith('C:') ? s : `C:${s}`))
  : null

const t0 = Date.now()
const res = await runSignalAudit({
  api, symbols, concurrency: Number(args.concurrency) || 4, getNetworkUrls: () => urls,
  onProgress: p => process.stderr.write(`\r${p.done}/${p.total} ${p.symbol.replace('C:', '')}        `),
})
process.stderr.write('\n')
if (typeof args.out === 'string') writeFileSync(args.out, JSON.stringify(res, null, 1))

const print = (who, c) => console.log(`${c.status.toUpperCase().padEnd(4)} ${who.padEnd(8)} ${c.group.padEnd(28)} ${c.name} | expected ${c.expected} | actual ${c.actual}${c.note ? ' | ' + c.note : ''}`)
for (const c of res.global) if (c.status !== 'pass') print('(global)', c)
for (const s of res.symbols) for (const c of s.checks) if (c.status === 'fail') print(s.symbol.replace('C:', ''), c)
const t = res.totals
console.log(`\n${res.symbols.length} pairs, ${t.pass + t.warn + t.fail + t.info} checks in ${Math.round((Date.now() - t0) / 1000)}s: ` +
  `${t.pass} pass, ${t.warn} warn, ${t.fail} FAIL, ${t.info} info`)
process.exit(t.fail ? 1 : 0)
