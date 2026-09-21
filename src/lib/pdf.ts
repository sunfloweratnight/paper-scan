import { PDFDocument } from 'pdf-lib'

const JPEG_QUALITY = 0.97

export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('画像を書き出せませんでした')
  return blob
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('画像を書き出せませんでした')
  return blob
}

export async function pagesToPdf(pages: { blob: Blob }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const page of pages) {
    const bytes = new Uint8Array(await page.blob.arrayBuffer())
    const image = page.blob.type === 'image/png'
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes)
    // Embed full-resolution pixels; size the page around ~200 DPI for print.
    const dpi = 200
    const width = (image.width * 72) / dpi
    const height = (image.height * 72) / dpi
    const sheet = pdf.addPage([width, height])
    sheet.drawImage(image, { x: 0, y: 0, width, height })
  }
  return pdf.save()
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
