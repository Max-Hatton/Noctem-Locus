(function (global) {
  'use strict';

  // Screen dimensions are physical canvas pixels. The overlay uses the same
  // center/radius and rotates clockwise; mirroring happens before rotation.
  const TAU = Math.PI * 2;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D u_texture;
    uniform vec2 u_size;
    uniform vec2 u_center;
    uniform float u_radius;
    uniform vec2 u_rotation;
    uniform float u_mirror;
    uniform vec3 u_east;
    uniform vec3 u_north;
    uniform vec3 u_view;
    uniform vec3 u_sun;
    uniform float u_phase;
    uniform float u_floor;
    uniform float u_night;
    const float PI = 3.141592653589793;
    void main() {
      vec2 screen = (vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y) - u_center) / u_radius;
      vec2 disk = vec2(
        (u_rotation.x * screen.x + u_rotation.y * screen.y) * u_mirror,
        u_rotation.y * screen.x - u_rotation.x * screen.y
      );
      float r2 = dot(disk, disk);
      if (r2 >= 1.0) { gl_FragColor = vec4(0.0); return; }
      vec3 p = normalize(u_east * disk.x + u_north * disk.y + u_view * sqrt(1.0-r2));
      vec2 uv = vec2(fract(atan(p.y, p.x) / (2.0 * PI) + 0.5), 0.5 - asin(clamp(p.z,-1.0,1.0)) / PI);
      vec3 source = texture2D(u_texture, uv).rgb;
      float terrain = clamp((dot(source, vec3(0.2126, 0.7152, 0.0722)) - 0.5) * 1.12 + 0.5, 0.025, 0.98);
      float mu = dot(p, u_sun);
      // Broad surface illumination only: source relief shadows are fixed.
      float daylight = 0.34 + 0.66 * pow(max(0.0, mu), 0.30);
      float lit = mix(u_floor, daylight, smoothstep(-0.012, 0.025, mu));
      float value = terrain * mix(1.0, lit, u_phase);
      vec3 color = mix(vec3(value), vec3(value, 0.0, 0.0), u_night);
      float coverage = 1.0 - smoothstep(max(0.0, 1.0 - 2.0/u_radius), 1.0, r2);
      gl_FragColor = vec4(color, coverage);
    }
  `;

  function makeGpu(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false }) ||
      canvas.getContext('experimental-webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    let program;
    const shaders = [];
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        gl.shaderSource(shader, type === gl.FRAGMENT_SHADER && (!precision || !precision.precision)
          ? source.replace('precision highp float', 'precision mediump float') : source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'Moon shader compilation failed');
      }
      program = gl.createProgram();
      shaders.forEach(shader => gl.attachShader(program, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Moon shader linking failed');
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const uniforms = {};
      ['texture','size','center','radius','rotation','mirror','east','north','view','sun','phase','floor','night'].forEach(name => {
        uniforms[name] = gl.getUniformLocation(program, 'u_' + name);
      });
      const position = gl.getAttribLocation(program, 'a_position');
      return { gl, program, buffer, texture, uniforms, position };
    } catch (error) {
      if (program) gl.deleteProgram(program);
      return null;
    } finally {
      shaders.forEach(shader => gl.deleteShader(shader));
    }
  }

  function releaseGpu(gpu) {
    if (!gpu) return;
    gpu.gl.deleteTexture(gpu.texture);
    gpu.gl.deleteBuffer(gpu.buffer);
    gpu.gl.deleteProgram(gpu.program);
  }

  function upload(gpu, image) {
    const gl = gpu.gl;
    let source = image;
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (image.naturalWidth > limit || image.naturalHeight > limit) {
      const scale = Math.min(limit / image.naturalWidth, limit / image.naturalHeight);
      source = document.createElement('canvas');
      source.width = Math.max(1, Math.floor(image.naturalWidth * scale));
      source.height = Math.max(1, Math.floor(image.naturalHeight * scale));
      source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
    }
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Moon texture could not be uploaded to the graphics device');
  }

  function geometryIsValid(g) {
    return g && ['east', 'north', 'view', 'sun'].every(key => g[key] && g[key].length === 3 && Array.from(g[key]).every(Number.isFinite));
  }

  function shade(mu, floor) {
    const t = clamp((mu + 0.012) / 0.037, 0, 1);
    const transition = t * t * (3 - 2 * t);
    return floor + (0.34 + 0.66 * Math.pow(Math.max(0, mu), 0.30) - floor) * transition;
  }

  function create(canvas, config = {}) {
    if (!canvas || !canvas.getContext) throw new Error('Moon renderer requires a canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Moon map canvas is unavailable');
    // Keep the visible canvas in 2D so WebGL failures can recover in place.
    const gpuCanvas = document.createElement('canvas');
    let gpu = null;
    try { gpu = makeGpu(gpuCanvas); } catch (_) { /* Software rendering below. */ }
    let disposed = false;
    let loaded = false;
    let lastOptions = null;
    let sourcePixels = null;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let raster = null;
    let rasterKey = '';
    const textureImage = new Image();
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      rejectReady = reject;
      textureImage.onload = () => {
        if (disposed) return;
        try {
          if (!textureImage.naturalWidth || !textureImage.naturalHeight) throw new Error('The bundled Moon surface image is empty');
          loaded = true;
          if (gpu) upload(gpu, textureImage);
          if (lastOptions) draw(lastOptions);
          resolve(api);
        } catch (error) {
          // A failed GPU texture upload can still use the local image in 2D.
          if (loaded && gpu) {
            releaseGpu(gpu);
            gpu = null;
            try {
              if (lastOptions) draw(lastOptions);
              resolve(api);
            } catch (fallbackError) { reject(fallbackError); }
          } else reject(error);
        }
      };
      textureImage.onerror = () => {
        if (!disposed) reject(new Error('The bundled Moon surface image could not be loaded'));
      };
    });

    function normalizeOptions(options) {
      return {
        geometry: options.geometry,
        width: Math.max(1, Math.round(finite(options.width, canvas.width || 1))),
        height: Math.max(1, Math.round(finite(options.height, canvas.height || 1))),
        centerX: finite(options.centerX, canvas.width / 2),
        centerY: finite(options.centerY, canvas.height / 2),
        radius: Math.max(0, finite(options.radius, Math.min(canvas.width, canvas.height) * 0.45)),
        rotationDeg: finite(options.rotationDeg, 0),
        mirror: !!options.mirror,
        phase: options.phase !== false,
        nightTerrain: clamp(finite(options.nightTerrain, 0.12), 0, 0.35),
        nightMode: !!options.nightMode
      };
    }

    function drawGpu(options) {
      const { gl, program, buffer, texture, uniforms: u, position } = gpu;
      if (gpuCanvas.width !== options.width) gpuCanvas.width = options.width;
      if (gpuCanvas.height !== options.height) gpuCanvas.height = options.height;
      const rotation = options.rotationDeg * Math.PI / 180;
      gl.viewport(0, 0, options.width, options.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(u.texture, 0);
      gl.uniform2f(u.size, options.width, options.height);
      gl.uniform2f(u.center, options.centerX, options.centerY);
      gl.uniform1f(u.radius, options.radius);
      gl.uniform2f(u.rotation, Math.cos(rotation), Math.sin(rotation));
      gl.uniform1f(u.mirror, options.mirror ? -1 : 1);
      ['east','north','view','sun'].forEach(key => gl.uniform3fv(u[key], options.geometry[key]));
      gl.uniform1f(u.phase, options.phase ? 1 : 0);
      gl.uniform1f(u.floor, options.nightTerrain);
      gl.uniform1f(u.night, options.nightMode ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      context.drawImage(gpuCanvas, 0, 0);
    }

    function readSource() {
      if (sourcePixels) return;
      const source = document.createElement('canvas');
      // The bundled 4096px map remains full resolution for high magnification.
      sourceWidth = source.width = textureImage.naturalWidth;
      sourceHeight = source.height = textureImage.naturalHeight;
      const sourceContext = source.getContext('2d', { willReadFrequently: true });
      sourceContext.drawImage(textureImage, 0, 0);
      const rgba = sourceContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
      sourcePixels = new Float32Array(sourceWidth * sourceHeight);
      for (let index = 0; index < sourcePixels.length; index++) {
        const offset = index * 4;
        const value = (rgba[offset] * 0.2126 + rgba[offset + 1] * 0.7152 + rgba[offset + 2] * 0.0722) / 255;
        sourcePixels[index] = clamp((value - 0.5) * 1.12 + 0.5, 0.025, 0.98);
      }
    }

    function drawSoftware(options) {
      readSource();
      // Cache a north-up disk: panning, rotation, and mirror changes stay cheap.
      const size = Math.min(2048, Math.max(512, Math.pow(2, Math.ceil(Math.log2(options.radius * 2)))));
      const g = options.geometry;
      const key = [size, options.phase, options.nightTerrain, options.nightMode,
        ...g.east, ...g.north, ...g.view, ...g.sun].join(',');
      if (key !== rasterKey) {
        if (!raster) raster = document.createElement('canvas');
        raster.width = size;
        raster.height = size;
        const rasterContext = raster.getContext('2d');
        const pixels = rasterContext.createImageData(size, size);
        const output = pixels.data;
        const radius = size / 2;
        for (let row = 0; row < size; row++) {
          const y = 1 - (row + 0.5) / radius;
          const y2 = y * y;
          for (let col = 0; col < size; col++) {
            const x = (col + 0.5) / radius - 1;
            const r2 = x * x + y2;
            if (r2 >= 1) continue;
            const z = Math.sqrt(1 - r2);
            const px = g.east[0]*x + g.north[0]*y + g.view[0]*z;
            const py = g.east[1]*x + g.north[1]*y + g.view[1]*z;
            const pz = g.east[2]*x + g.north[2]*y + g.view[2]*z;
            const u = ((Math.atan2(py, px) / TAU + 0.5) % 1 + 1) % 1;
            const v = 0.5 - Math.asin(clamp(pz, -1, 1)) / Math.PI;
            const sx = u * sourceWidth - 0.5;
            const sy = clamp(v * sourceHeight - 0.5, 0, sourceHeight - 1);
            const ix = Math.floor(sx);
            const iy = Math.floor(sy);
            const fx = sx - ix;
            const fy = sy - iy;
            const x0 = (ix + sourceWidth) % sourceWidth;
            const x1 = (x0 + 1) % sourceWidth;
            const row0 = iy * sourceWidth;
            const row1 = Math.min(iy + 1, sourceHeight - 1) * sourceWidth;
            const top = sourcePixels[row0 + x0] * (1-fx) + sourcePixels[row0 + x1] * fx;
            const bottom = sourcePixels[row1 + x0] * (1-fx) + sourcePixels[row1 + x1] * fx;
            const mu = px*g.sun[0] + py*g.sun[1] + pz*g.sun[2];
            const value = Math.round(255 * (top*(1-fy) + bottom*fy) * (options.phase ? shade(mu, options.nightTerrain) : 1));
            const offset = (row * size + col) * 4;
            output[offset] = value;
            output[offset + 1] = options.nightMode ? 0 : value;
            output[offset + 2] = options.nightMode ? 0 : value;
            output[offset + 3] = Math.round(clamp((1-r2)*radius/2, 0, 1)*255);
          }
        }
        rasterContext.putImageData(pixels, 0, 0);
        rasterKey = key;
      }
      context.save();
      context.translate(options.centerX, options.centerY);
      context.rotate(options.rotationDeg * Math.PI / 180);
      context.scale(options.mirror ? -1 : 1, 1);
      context.imageSmoothingEnabled = true;
      context.drawImage(raster, -options.radius, -options.radius, options.radius * 2, options.radius * 2);
      context.restore();
    }

    function draw(options = {}) {
      if (disposed) return;
      lastOptions = options;
      const normalized = normalizeOptions(options);
      if (canvas.width !== normalized.width) canvas.width = normalized.width;
      if (canvas.height !== normalized.height) canvas.height = normalized.height;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!loaded || normalized.radius <= 0 || !geometryIsValid(normalized.geometry)) return;
      if (gpu && !gpu.gl.isContextLost()) {
        try { drawGpu(normalized); }
        catch (_) {
          releaseGpu(gpu);
          gpu = null;
          drawSoftware(normalized);
        }
      } else drawSoftware(normalized);
    }

    function contextLost(event) {
      event.preventDefault();
      if (lastOptions) draw(lastOptions);
    }

    function contextRestored() {
      if (disposed) return;
      try {
        gpu = makeGpu(gpuCanvas);
        if (gpu && loaded) upload(gpu, textureImage);
      } catch (_) {
        releaseGpu(gpu);
        gpu = null;
      }
      if (lastOptions) draw(lastOptions);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      textureImage.onload = textureImage.onerror = null;
      if (!loaded) rejectReady(new Error('Moon renderer was closed before its texture loaded'));
      gpuCanvas.removeEventListener('webglcontextlost', contextLost);
      gpuCanvas.removeEventListener('webglcontextrestored', contextRestored);
      releaseGpu(gpu);
      gpu = null;
      sourcePixels = null;
      raster = null;
      lastOptions = null;
    }

    const api = { draw, ready, dispose, get backend() { return gpu && !gpu.gl.isContextLost() ? 'webgl' : 'canvas2d'; } };
    gpuCanvas.addEventListener('webglcontextlost', contextLost);
    gpuCanvas.addEventListener('webglcontextrestored', contextRestored);
    textureImage.src = config.textureUrl || 'data/moon-surface.jpg';
    return api;
  }

  global.noctemMoonRenderer = { create };
})(window);
