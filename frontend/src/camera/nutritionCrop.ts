export type CropSelection = { left: number; top: number; width: number; height: number }

export function sourceRectForCrop(sourceWidth: number, sourceHeight: number, crop: CropSelection): { x: number; y: number; width: number; height: number } {
  const left = Math.max(0, Math.min(1, crop.left))
  const top = Math.max(0, Math.min(1, crop.top))
  const right = Math.max(left, Math.min(1, crop.left + crop.width))
  const bottom = Math.max(top, Math.min(1, crop.top + crop.height))
  return {
    x: Math.round(sourceWidth * left),
    y: Math.round(sourceHeight * top),
    width: Math.max(1, Math.round(sourceWidth * (right - left))),
    height: Math.max(1, Math.round(sourceHeight * (bottom - top))),
  }
}
