import type { WorkspaceDto } from "./dto/workspace.dto"

export function toWorkspaceDto(row: any): WorkspaceDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

