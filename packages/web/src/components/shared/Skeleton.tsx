import { cn } from '../../lib/cn'

interface SkeletonProps {
  className?: string
}

/**
 * Generic loading skeleton with pulse animation.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse bg-surface-hover rounded-md', className)} />
  )
}

/**
 * Text-shaped skeleton placeholder.
 */
export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} />
}

/**
 * Circle-shaped skeleton placeholder (avatars, dots).
 */
export function SkeletonCircle({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-8 w-8 rounded-full', className)} />
}
