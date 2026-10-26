export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'complete'
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type ProjectColor = 'sage' | 'terracotta' | 'butter' | 'tomato' | 'blueberry' | 'thyme' | 'candy' | 'citrus'

export interface Tag {
  id: number
  name: string
  color: ProjectColor
  created_at: string
}

export interface Project {
  id: number
  name: string
  description: string | null
  status: ProjectStatus
  color: ProjectColor
  due_date: string | null
  created_at: string
  task_count?: number
  completed_task_count?: number
  tags?: Tag[]
}

export interface Task {
  id: number
  project_id: number | null
  parent_task_id: number | null
  title: string
  description: string | null
  notes: string | null
  recipe_data: string | null
  task_group: string | null
  status: TaskStatus
  priority: TaskPriority
  start_date: string | null
  due_date: string | null
  created_at: string
  project_name?: string | null
  project_color?: string | null
  subtask_count?: number
  completed_subtask_count?: number
  subtasks?: Subtask[]
  tags?: Tag[]
  children?: Task[]
}

export interface Subtask {
  id: number
  task_id: number
  title: string
  notes: string | null
  start_date: string | null
  due_date: string | null
  completed: boolean
  status: TaskStatus
  created_at: string
  tags?: Tag[]
  task_title?: string
  project_id?: number | null
  project_name?: string | null
  project_color?: string | null
  subitem_count?: number
  completed_subitem_count?: number
}

export interface Product {
  id: number
  name: string
  slug: string
  description: string | null
  wholesale_price: number
  retail_price: number
  accent_color: ProjectColor
  active: boolean
}

export interface InventoryItem {
  id: number
  product_id: number
  quantity_on_hand: number
  reorder_threshold: number
  last_updated: string
  product?: Product
}

export interface Contact {
  id: number
  name: string
  type: 'wholesale' | 'lead' | 'customer'
  email: string | null
  phone: string | null
  store_name: string | null
  address: string | null
  notes: string | null
  created_at: string
}
