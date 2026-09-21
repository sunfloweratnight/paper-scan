import { homography, outputSize, type Corners, type Homography } from './geometry.ts'

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform mat3 u_h;
uniform vec2 u_dst;
uniform vec2 u_src;
varying vec2 v_uv;
void main() {
  vec2 dst = vec2(v_uv.x * (u_dst.x - 1.0), (1.0 - v_uv.y) * (u_dst.y - 1.0));
  vec3 p = u_h * vec3(dst, 1.0);
  vec2 uv = (p.xy / p.z) / u_src;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  } else {
    gl_FragColor = texture2D(u_tex, vec2(uv.x, 1.0 - uv.y));
  }
}
`

export function warpDocument(source: HTMLCanvasElement, corners: Corners): HTMLCanvasElement {
  const prepared = fitSource(source, corners)
  const size = outputSize(prepared.corners)
  const destination: Corners = [
    { x: 0, y: 0 },
    { x: size.width - 1, y: 0 },
    { x: size.width - 1, y: size.height - 1 },
    { x: 0, y: size.height - 1 },
  ]
  const mapped = homography(destination, prepared.corners)
  const output = document.createElement('canvas')
  output.width = size.width
  output.height = size.height
  const gpu = document.createElement('canvas')
  gpu.width = size.width
  gpu.height = size.height
  if (warpWebgl(prepared.source, gpu, mapped)) {
    const ctx = output.getContext('2d')
    if (!ctx) throw new Error('Canvas を使えません')
    ctx.drawImage(gpu, 0, 0)
  } else {
    warpCpu(prepared.source, output, mapped)
  }
  return output
}

function fitSource(source: HTMLCanvasElement, corners: Corners): { source: HTMLCanvasElement; corners: Corners } {
  const limit = 4096
  const longest = Math.max(source.width, source.height)
  if (longest <= limit) return { source, corners }
  const scale = limit / longest
  const fitted = document.createElement('canvas')
  fitted.width = Math.max(2, Math.round(source.width * scale))
  fitted.height = Math.max(2, Math.round(source.height * scale))
  const ctx = fitted.getContext('2d')
  if (!ctx) return { source, corners }
  ctx.drawImage(source, 0, 0, fitted.width, fitted.height)
  return {
    source: fitted,
    corners: [
      { x: corners[0].x * scale, y: corners[0].y * scale },
      { x: corners[1].x * scale, y: corners[1].y * scale },
      { x: corners[2].x * scale, y: corners[2].y * scale },
      { x: corners[3].x * scale, y: corners[3].y * scale },
    ],
  }
}

function warpWebgl(source: HTMLCanvasElement, output: HTMLCanvasElement, mapped: Homography): boolean {
  const gl = output.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false })
  if (!gl) return false
  const program = createProgram(gl)
  if (!program) return false
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

  const columnMajor = new Float32Array([
    mapped[0], mapped[3], mapped[6],
    mapped[1], mapped[4], mapped[7],
    mapped[2], mapped[5], mapped[8],
  ])
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_h'), false, columnMajor)
  gl.uniform2f(gl.getUniformLocation(program, 'u_dst'), output.width, output.height)
  gl.uniform2f(gl.getUniformLocation(program, 'u_src'), source.width, source.height)
  gl.viewport(0, 0, output.width, output.height)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  return gl.getError() === gl.NO_ERROR
}

function warpCpu(source: HTMLCanvasElement, output: HTMLCanvasElement, mapped: Homography): void {
  const srcCtx = source.getContext('2d', { willReadFrequently: true })
  const dstCtx = output.getContext('2d', { willReadFrequently: true })
  if (!srcCtx || !dstCtx) throw new Error('Canvas を使えません')
  const src = srcCtx.getImageData(0, 0, source.width, source.height)
  const dst = dstCtx.createImageData(output.width, output.height)
  const sw = source.width
  const sh = source.height
  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const w = mapped[6] * x + mapped[7] * y + mapped[8]
      const sx = (mapped[0] * x + mapped[1] * y + mapped[2]) / w
      const sy = (mapped[3] * x + mapped[4] * y + mapped[5]) / w
      const dx = Math.floor((y * output.width + x) * 4)
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        dst.data[dx] = 255
        dst.data[dx + 1] = 255
        dst.data[dx + 2] = 255
        dst.data[dx + 3] = 255
        continue
      }
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const tx = sx - x0
      const ty = sy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = i00 + 4
      const i01 = i00 + sw * 4
      const i11 = i01 + 4
      for (let c = 0; c < 3; c++) {
        const top = src.data[i00 + c] * (1 - tx) + src.data[i10 + c] * tx
        const bottom = src.data[i01 + c] * (1 - tx) + src.data[i11 + c] * tx
        dst.data[dx + c] = Math.round(top * (1 - ty) + bottom * ty)
      }
      dst.data[dx + 3] = 255
    }
  }
  dstCtx.putImageData(dst, 0, 0)
}

function createProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}
