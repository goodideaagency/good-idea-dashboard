// Good Idea starburst mark. Inherits the current text color (fill=currentColor).
export function BrandMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1 L13.38 8.67 L19.78 4.22 L15.33 10.62 L23 12 L15.33 13.38 L19.78 19.78 L13.38 15.33 L12 23 L10.62 15.33 L4.22 19.78 L8.67 13.38 L1 12 L8.67 10.62 L4.22 4.22 L10.62 8.67 Z" />
    </svg>
  )
}
