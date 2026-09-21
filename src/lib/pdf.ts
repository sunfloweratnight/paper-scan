import { PDFDocument } from 'pdf-lib'

export async function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('画像を書き出せませんでした')
  return blob
}

export async function pagesToPdf(pages: { blob: Blob }[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  for (const page of pages) {
    const bytes = new Uint8Array(await page.blob.arrayBuffer())
    const image = await pdf.embedJpg(bytes)
    const sheet = pdf.addPage([image.width, image.height])
    sheet.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
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
