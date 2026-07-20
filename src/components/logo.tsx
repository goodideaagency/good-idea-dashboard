import Image from 'next/image'

// Official Good Idea wordmark (star + "good idea"), pulled from itsgoodidea.com.
// Source is 500x105 (~4.76:1) — width scales automatically from the given height.
export function Logo({ height = 24, className = '' }: { height?: number; className?: string }) {
  const width = Math.round(height * (500 / 105))
  return (
    <Image
      src="/good-idea-logo-dark.png"
      alt="Good Idea"
      width={width}
      height={height}
      className={className}
      priority
    />
  )
}
