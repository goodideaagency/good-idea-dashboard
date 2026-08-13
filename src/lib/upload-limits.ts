// Shared across every upload route -- none of them validated file size
// before proxying straight through to ClickUp/Storage, relying entirely on
// Vercel's platform-level request body cap with no app-level check or
// friendly error message.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 // 20MB

export function fileTooLarge(file: File): boolean {
  return file.size > MAX_UPLOAD_BYTES
}
