import { app } from 'electron'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import schemaSql from './schema.sql?raw'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'smartdesk.db'))

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(schemaSql)

  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
