import { DatabaseSync } from 'node:sqlite'
import type { PrDetail, PrRow } from '../../shared/postrail-run'

// SQLite's empty filename selects a private temporary database, removed on close.
// Store summaries separately so opening the log never fetches response bodies.
export class PostRailResults {
  private readonly db = new DatabaseSync('')
  constructor() {
    try {
      this.db.exec(`PRAGMA cache_size=-2048;
        CREATE TABLE results (iteration TEXT PRIMARY KEY, summary TEXT NOT NULL, body TEXT NOT NULL, headers TEXT NOT NULL) WITHOUT ROWID`)
    } catch (error) {
      this.db.close()
      throw error
    }
  }

  put(detail: PrDetail) {
    const { body, headers, ...summary } = detail
    this.db.prepare('INSERT INTO results VALUES (?, ?, ?, ?)').run(detail.iteration, JSON.stringify(summary), body, JSON.stringify(headers))
  }
  summary(iteration: string): PrRow | null {
    const row = this.db.prepare('SELECT summary FROM results WHERE iteration = ?').get(iteration)
    return row ? JSON.parse(String(row.summary)) : null
  }
  detail(iteration: string): PrDetail | null {
    const row = this.db.prepare('SELECT * FROM results WHERE iteration = ?').get(iteration)
    return row ? { ...JSON.parse(String(row.summary)), body:String(row.body), headers:JSON.parse(String(row.headers)) } : null
  }
  close() { this.db.close() }
}
