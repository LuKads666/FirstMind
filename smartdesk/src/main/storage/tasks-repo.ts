import { getDatabase } from './database'

export interface TaskRow {
  id: number
  title: string
  source_type: string
  due_at: string | null
  estimated_minutes: number | null
  status: 'open' | 'in_progress' | 'done' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
  created_at: string
  updated_at: string
}

export interface CreateTaskInput {
  title: string
  due_at?: string | null
  estimated_minutes?: number | null
  priority?: 'high' | 'medium' | 'low'
}

export function listTasks(): TaskRow[] {
  return getDatabase()
    .prepare(
      `SELECT * FROM tasks
       WHERE status IN ('open', 'in_progress')
       ORDER BY (due_at IS NULL), due_at, priority DESC, id`
    )
    .all() as TaskRow[]
}

export function createTask(input: CreateTaskInput): TaskRow {
  const { lastInsertRowid } = getDatabase()
    .prepare(
      `INSERT INTO tasks (title, due_at, estimated_minutes, priority)
       VALUES (@title, @due_at, @estimated_minutes, @priority)`
    )
    .run({
      title: input.title,
      due_at: input.due_at ?? null,
      estimated_minutes: input.estimated_minutes ?? null,
      priority: input.priority ?? 'medium'
    })

  return getDatabase()
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(lastInsertRowid) as TaskRow
}

export function updateTask(
  id: number,
  patch: Partial<Pick<TaskRow, 'title' | 'status' | 'priority' | 'due_at' | 'estimated_minutes'>>
): TaskRow | null {
  const allowed = ['title', 'status', 'priority', 'due_at', 'estimated_minutes'] as const
  const sets: string[] = []
  const values: Record<string, unknown> = { id, updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key} = @${key}`)
      values[key] = patch[key]
    }
  }
  if (sets.length === 0) return getTask(id)

  sets.push('updated_at = @updated_at')
  const result = getDatabase()
    .prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`)
    .run(values)

  return result.changes > 0 ? getTask(id) : null
}

export function deleteTask(id: number): boolean {
  return getDatabase().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0
}

function getTask(id: number): TaskRow | null {
  return (getDatabase().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow) ?? null
}
