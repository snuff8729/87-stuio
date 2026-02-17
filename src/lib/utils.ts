import { useRef } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function useStableArray<T>(arr: T[]): T[] {
  const ref = useRef(arr)
  if (
    arr.length !== ref.current.length ||
    arr.some((item, i) => item !== ref.current[i])
  ) {
    ref.current = arr
  }
  return ref.current
}
