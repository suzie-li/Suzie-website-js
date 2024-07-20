// js/src/utils/utils.js
function throwWarning() {
  if (warningThrown > 100) {
    return;
  } else if (warningThrown === 100) {
    console.warn("Curtains: too many warnings thrown, stop logging.");
  } else {
    const args = Array.prototype.slice.call(arguments);
    console.warn.apply(console, args);
  }
  warningThrown++;
}
function throwError() {
  const args = Array.prototype.slice.call(arguments);
  console.error.apply(console, args);
}
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    let r = Math.random() * 16 | 0, v = c === "x" ? r : r & 3 | 8;
    return v.toString(16).toUpperCase();
  });
}
function isPowerOf2(value) {
  return (value & value - 1) === 0;
}
function lerp(start, end, amount) {
  return (1 - amount) * start + amount * end;
}
var warningThrown = 0;

// js/src/core/Scene.js
class Scene {
  constructor(renderer) {
    this.type = "Scene";
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      throwError(this.type + ": Renderer WebGL context is undefined", renderer);
      return;
    }
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.initStacks();
  }
  initStacks() {
    this.stacks = {
      pingPong: [],
      renderTargets: [],
      opaque: [],
      transparent: [],
      renderPasses: [],
      scenePasses: []
    };
  }
  resetPlaneStacks() {
    this.stacks.pingPong = [];
    this.stacks.renderTargets = [];
    this.stacks.opaque = [];
    this.stacks.transparent = [];
    for (let i = 0;i < this.renderer.planes.length; i++) {
      this.addPlane(this.renderer.planes[i]);
    }
  }
  resetShaderPassStacks() {
    this.stacks.scenePasses = [];
    this.stacks.renderPasses = [];
    for (let i = 0;i < this.renderer.shaderPasses.length; i++) {
      this.renderer.shaderPasses[i].index = i;
      if (this.renderer.shaderPasses[i]._isScenePass) {
        this.stacks.scenePasses.push(this.renderer.shaderPasses[i]);
      } else {
        this.stacks.renderPasses.push(this.renderer.shaderPasses[i]);
      }
    }
    if (this.stacks.scenePasses.length === 0) {
      this.renderer.state.scenePassIndex = null;
    }
  }
  addToRenderTargetsStack(plane) {
    const renderTargetsPlanes = this.renderer.planes.filter((el) => el.type !== "PingPongPlane" && el.target && el.uuid !== plane.uuid);
    let siblingPlaneIndex = -1;
    if (plane.target._depth) {
      for (let i = renderTargetsPlanes.length - 1;i >= 0; i--) {
        if (renderTargetsPlanes[i].target.uuid === plane.target.uuid) {
          siblingPlaneIndex = i + 1;
          break;
        }
      }
    } else {
      siblingPlaneIndex = renderTargetsPlanes.findIndex((el) => el.target.uuid === plane.target.uuid);
    }
    siblingPlaneIndex = Math.max(0, siblingPlaneIndex);
    renderTargetsPlanes.splice(siblingPlaneIndex, 0, plane);
    if (plane.target._depth) {
      renderTargetsPlanes.sort((a, b) => a.index - b.index);
      renderTargetsPlanes.sort((a, b) => b.renderOrder - a.renderOrder);
    } else {
      renderTargetsPlanes.sort((a, b) => b.index - a.index);
      renderTargetsPlanes.sort((a, b) => a.renderOrder - b.renderOrder);
    }
    renderTargetsPlanes.sort((a, b) => a.target.index - b.target.index);
    this.stacks.renderTargets = renderTargetsPlanes;
  }
  addToRegularPlaneStack(plane) {
    const planeStack = this.renderer.planes.filter((el) => el.type !== "PingPongPlane" && !el.target && el._transparent === plane._transparent && el.uuid !== plane.uuid);
    let siblingPlaneIndex = -1;
    for (let i = planeStack.length - 1;i >= 0; i--) {
      if (planeStack[i]._geometry.definition.id === plane._geometry.definition.id) {
        siblingPlaneIndex = i + 1;
        break;
      }
    }
    siblingPlaneIndex = Math.max(0, siblingPlaneIndex);
    planeStack.splice(siblingPlaneIndex, 0, plane);
    planeStack.sort((a, b) => a.index - b.index);
    return planeStack;
  }
  addPlane(plane) {
    if (plane.type === "PingPongPlane") {
      this.stacks.pingPong.push(plane);
    } else if (plane.target) {
      this.addToRenderTargetsStack(plane);
    } else {
      if (plane._transparent) {
        const planeStack = this.addToRegularPlaneStack(plane);
        planeStack.sort((a, b) => b.relativeTranslation.z - a.relativeTranslation.z);
        planeStack.sort((a, b) => b.renderOrder - a.renderOrder);
        this.stacks.transparent = planeStack;
      } else {
        const planeStack = this.addToRegularPlaneStack(plane);
        planeStack.sort((a, b) => b.renderOrder - a.renderOrder);
        this.stacks.opaque = planeStack;
      }
    }
  }
  removePlane(plane) {
    if (plane.type === "PingPongPlane") {
      this.stacks.pingPong = this.stacks.pingPong.filter((el) => el.uuid !== plane.uuid);
    } else if (plane.target) {
      this.stacks.renderTargets = this.stacks.renderTargets.filter((el) => el.uuid !== plane.uuid);
    } else {
      if (plane._transparent) {
        this.stacks.transparent = this.stacks.transparent.filter((el) => el.uuid !== plane.uuid);
      } else {
        this.stacks.opaque = this.stacks.opaque.filter((el) => el.uuid !== plane.uuid);
      }
    }
  }
  setPlaneRenderOrder(plane) {
    if (plane.type === "ShaderPass") {
      this.sortShaderPassStack(plane._isScenePass ? this.stacks.scenePasses : this.stacks.renderPasses);
    } else if (plane.type === "PingPongPlane") {
      return;
    }
    if (plane.target) {
      if (plane.target._depth) {
        this.stacks.renderTargets.sort((a, b) => a.index - b.index);
        this.stacks.renderTargets.sort((a, b) => b.renderOrder - a.renderOrder);
      } else {
        this.stacks.renderTargets.sort((a, b) => b.index - a.index);
        this.stacks.renderTargets.sort((a, b) => a.renderOrder - b.renderOrder);
      }
      this.stacks.renderTargets.sort((a, b) => a.target.index - b.target.index);
    } else {
      const planeStack = plane._transparent ? this.stacks.transparent : this.stacks.opaque;
      const scenePassWithoutDepth = this.stacks.scenePasses.find((pass, index) => pass._isScenePass && !pass._depth && index === 0);
      if (!this.renderer.depth || scenePassWithoutDepth) {
        planeStack.sort((a, b) => b.index - a.index);
        if (plane._transparent) {
          planeStack.sort((a, b) => a.relativeTranslation.z - b.relativeTranslation.z);
        }
        planeStack.sort((a, b) => a.renderOrder - b.renderOrder);
      } else {
        planeStack.sort((a, b) => a.index - b.index);
        if (plane._transparent) {
          planeStack.sort((a, b) => b.relativeTranslation.z - a.relativeTranslation.z);
        }
        planeStack.sort((a, b) => b.renderOrder - a.renderOrder);
      }
    }
  }
  addShaderPass(shaderPass) {
    if (!shaderPass._isScenePass) {
      this.stacks.renderPasses.push(shaderPass);
      this.sortShaderPassStack(this.stacks.renderPasses);
    } else {
      this.stacks.scenePasses.push(shaderPass);
      this.sortShaderPassStack(this.stacks.scenePasses);
    }
  }
  removeShaderPass(shaderPass) {
    this.resetShaderPassStacks();
  }
  sortShaderPassStack(passStack) {
    passStack.sort((a, b) => a.index - b.index);
    passStack.sort((a, b) => a.renderOrder - b.renderOrder);
  }
  enableShaderPass() {
    if (this.stacks.scenePasses.length && this.stacks.renderPasses.length === 0 && this.renderer.planes.length) {
      this.renderer.state.scenePassIndex = 0;
      this.renderer.bindFrameBuffer(this.stacks.scenePasses[0].target);
    }
  }
  drawRenderPasses() {
    if (this.stacks.scenePasses.length && this.stacks.renderPasses.length && this.renderer.planes.length) {
      this.renderer.state.scenePassIndex = 0;
      this.renderer.bindFrameBuffer(this.stacks.scenePasses[0].target);
    }
    for (let i = 0;i < this.stacks.renderPasses.length; i++) {
      this.stacks.renderPasses[i]._startDrawing();
      this.renderer.clearDepth();
    }
  }
  drawScenePasses() {
    for (let i = 0;i < this.stacks.scenePasses.length; i++) {
      this.stacks.scenePasses[i]._startDrawing();
    }
  }
  drawPingPongStack() {
    for (let i = 0;i < this.stacks.pingPong.length; i++) {
      const plane = this.stacks.pingPong[i];
      if (plane) {
        plane._startDrawing();
      }
    }
  }
  drawStack(stackType) {
    for (let i = 0;i < this.stacks[stackType].length; i++) {
      const plane = this.stacks[stackType][i];
      if (plane) {
        plane._startDrawing();
      }
    }
  }
  draw() {
    this.drawPingPongStack();
    this.enableShaderPass();
    this.drawStack("renderTargets");
    this.drawRenderPasses();
    this.renderer.setBlending(false);
    this.drawStack("opaque");
    if (this.stacks.transparent.length) {
      this.renderer.setBlending(true);
      this.drawStack("transparent");
    }
    this.drawScenePasses();
  }
}

// js/src/utils/CacheManager.js
class CacheManager {
  constructor() {
    this.geometries = [];
    this.clear();
  }
  clear() {
    this.textures = [];
    this.programs = [];
  }
  getGeometryFromID(definitionID) {
    return this.geometries.find((element) => element.id === definitionID);
  }
  addGeometry(definitionID, vertices, uvs) {
    this.geometries.push({
      id: definitionID,
      vertices,
      uvs
    });
  }
  isSameShader(firstShader, secondShader) {
    return firstShader.localeCompare(secondShader) === 0;
  }
  getProgramFromShaders(vsCode, fsCode) {
    return this.programs.find((element) => {
      return this.isSameShader(element.vsCode, vsCode) && this.isSameShader(element.fsCode, fsCode);
    });
  }
  addProgram(program) {
    this.programs.push(program);
  }
  getTextureFromSource(source) {
    const src = typeof source === "string" ? source : source.src;
    return this.textures.find((element) => element.source && element.source.src === src);
  }
  addTexture(texture) {
    const cachedTexture = this.getTextureFromSource(texture.source);
    if (!cachedTexture) {
      this.textures.push(texture);
    }
  }
  removeTexture(texture) {
    this.textures = this.textures.filter((element) => element.uuid !== texture.uuid);
  }
}

// js/src/utils/CallbackQueueManager.js
class CallbackQueueManager {
  constructor() {
    this.clear();
  }
  clear() {
    this.queue = [];
  }
  add(callback, keep = false) {
    const queueItem = {
      callback,
      keep,
      timeout: null
    };
    queueItem.timeout = setTimeout(() => {
      this.queue.push(queueItem);
    }, 0);
    return queueItem;
  }
  execute() {
    this.queue.map((entry) => {
      if (entry.callback) {
        entry.callback();
      }
      clearTimeout(this.queue.timeout);
    });
    this.queue = this.queue.filter((entry) => entry.keep);
  }
}

// js/src/core/Renderer.js
class Renderer {
  constructor({
    alpha,
    antialias,
    premultipliedAlpha,
    depth,
    failIfMajorPerformanceCaveat,
    preserveDrawingBuffer,
    stencil,
    container,
    pixelRatio,
    renderingScale,
    production,
    onError,
    onSuccess,
    onContextLost,
    onContextRestored,
    onDisposed,
    onSceneChange
  }) {
    this.type = "Renderer";
    this.alpha = alpha;
    this.antialias = antialias;
    this.premultipliedAlpha = premultipliedAlpha;
    this.depth = depth;
    this.failIfMajorPerformanceCaveat = failIfMajorPerformanceCaveat;
    this.preserveDrawingBuffer = preserveDrawingBuffer;
    this.stencil = stencil;
    this.container = container;
    this.pixelRatio = pixelRatio;
    this._renderingScale = renderingScale;
    this.production = production;
    this.onError = onError;
    this.onSuccess = onSuccess;
    this.onContextLost = onContextLost;
    this.onContextRestored = onContextRestored;
    this.onDisposed = onDisposed;
    this.onSceneChange = onSceneChange;
    this.initState();
    this.canvas = document.createElement("canvas");
    const glAttributes = {
      alpha: this.alpha,
      premultipliedAlpha: this.premultipliedAlpha,
      antialias: this.antialias,
      depth: this.depth,
      failIfMajorPerformanceCaveat: this.failIfMajorPerformanceCaveat,
      preserveDrawingBuffer: this.preserveDrawingBuffer,
      stencil: this.stencil
    };
    this.gl = this.canvas.getContext("webgl2", glAttributes);
    this._isWebGL2 = !!this.gl;
    if (!this.gl) {
      this.gl = this.canvas.getContext("webgl", glAttributes) || this.canvas.getContext("experimental-webgl", glAttributes);
    }
    if (!this.gl) {
      if (!this.production)
        throwWarning(this.type + ": WebGL context could not be created");
      this.state.isActive = false;
      if (this.onError) {
        this.onError();
      }
      return;
    } else if (this.onSuccess) {
      this.onSuccess();
    }
    this.initRenderer();
  }
  initState() {
    this.state = {
      isActive: true,
      isContextLost: true,
      drawingEnabled: true,
      forceRender: false,
      currentProgramID: null,
      currentGeometryID: null,
      forceBufferUpdate: false,
      depthTest: null,
      blending: null,
      cullFace: null,
      frameBufferID: null,
      scenePassIndex: null,
      activeTexture: null,
      unpackAlignment: null,
      flipY: null,
      premultiplyAlpha: null
    };
  }
  initCallbackQueueManager() {
    this.nextRender = new CallbackQueueManager;
  }
  initRenderer() {
    this.planes = [];
    this.renderTargets = [];
    this.shaderPasses = [];
    this.state.isContextLost = false;
    this.state.maxTextureSize = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    this.initCallbackQueueManager();
    this.setBlendFunc();
    this.setDepthFunc();
    this.setDepthTest(true);
    this.cache = new CacheManager;
    this.scene = new Scene(this);
    this.getExtensions();
    this._contextLostHandler = this.contextLost.bind(this);
    this.canvas.addEventListener("webglcontextlost", this._contextLostHandler, false);
    this._contextRestoredHandler = this.contextRestored.bind(this);
    this.canvas.addEventListener("webglcontextrestored", this._contextRestoredHandler, false);
  }
  getExtensions() {
    this.extensions = [];
    if (this._isWebGL2) {
      this.extensions["EXT_color_buffer_float"] = this.gl.getExtension("EXT_color_buffer_float");
      this.extensions["OES_texture_float_linear"] = this.gl.getExtension("OES_texture_float_linear");
      this.extensions["EXT_texture_filter_anisotropic"] = this.gl.getExtension("EXT_texture_filter_anisotropic");
      this.extensions["WEBGL_lose_context"] = this.gl.getExtension("WEBGL_lose_context");
    } else {
      this.extensions["OES_vertex_array_object"] = this.gl.getExtension("OES_vertex_array_object");
      this.extensions["OES_texture_float"] = this.gl.getExtension("OES_texture_float");
      this.extensions["OES_texture_float_linear"] = this.gl.getExtension("OES_texture_float_linear");
      this.extensions["OES_texture_half_float"] = this.gl.getExtension("OES_texture_half_float");
      this.extensions["OES_texture_half_float_linear"] = this.gl.getExtension("OES_texture_half_float_linear");
      this.extensions["EXT_texture_filter_anisotropic"] = this.gl.getExtension("EXT_texture_filter_anisotropic");
      this.extensions["OES_element_index_uint"] = this.gl.getExtension("OES_element_index_uint");
      this.extensions["OES_standard_derivatives"] = this.gl.getExtension("OES_standard_derivatives");
      this.extensions["EXT_sRGB"] = this.gl.getExtension("EXT_sRGB");
      this.extensions["WEBGL_depth_texture"] = this.gl.getExtension("WEBGL_depth_texture");
      this.extensions["WEBGL_draw_buffers"] = this.gl.getExtension("WEBGL_draw_buffers");
      this.extensions["WEBGL_lose_context"] = this.gl.getExtension("WEBGL_lose_context");
    }
  }
  contextLost(event) {
    this.state.isContextLost = true;
    if (!this.state.isActive)
      return;
    event.preventDefault();
    this.nextRender.add(() => this.onContextLost && this.onContextLost());
  }
  restoreContext() {
    if (!this.state.isActive)
      return;
    this.initState();
    if (this.gl && this.extensions["WEBGL_lose_context"]) {
      this.extensions["WEBGL_lose_context"].restoreContext();
    } else {
      if (!this.gl && !this.production) {
        throwWarning(this.type + ": Could not restore the context because the context is not defined");
      } else if (!this.extensions["WEBGL_lose_context"] && !this.production) {
        throwWarning(this.type + ": Could not restore the context because the restore context extension is not defined");
      }
      if (this.onError) {
        this.onError();
      }
    }
  }
  isContextexFullyRestored() {
    let isRestored = true;
    for (let i = 0;i < this.renderTargets.length; i++) {
      if (!this.renderTargets[i].textures[0]._canDraw) {
        isRestored = false;
      }
      break;
    }
    if (isRestored) {
      for (let i = 0;i < this.planes.length; i++) {
        if (!this.planes[i]._canDraw) {
          isRestored = false;
          break;
        } else {
          for (let j = 0;j < this.planes[i].textures.length; j++) {
            if (!this.planes[i].textures[j]._canDraw) {
              isRestored = false;
              break;
            }
          }
        }
      }
    }
    if (isRestored) {
      for (let i = 0;i < this.shaderPasses.length; i++) {
        if (!this.shaderPasses[i]._canDraw) {
          isRestored = false;
          break;
        } else {
          for (let j = 0;j < this.shaderPasses[i].textures.length; j++) {
            if (!this.shaderPasses[i].textures[j]._canDraw) {
              isRestored = false;
              break;
            }
          }
        }
      }
    }
    return isRestored;
  }
  contextRestored() {
    this.getExtensions();
    this.setBlendFunc();
    this.setDepthFunc();
    this.setDepthTest(true);
    this.cache.clear();
    this.scene.initStacks();
    for (let i = 0;i < this.renderTargets.length; i++) {
      this.renderTargets[i]._restoreContext();
    }
    for (let i = 0;i < this.planes.length; i++) {
      this.planes[i]._restoreContext();
    }
    for (let i = 0;i < this.shaderPasses.length; i++) {
      this.shaderPasses[i]._restoreContext();
    }
    const isRestoredQueue = this.nextRender.add(() => {
      const isRestored = this.isContextexFullyRestored();
      if (isRestored) {
        isRestoredQueue.keep = false;
        this.state.isContextLost = false;
        if (this.onContextRestored) {
          this.onContextRestored();
        }
        this.onSceneChange();
        this.needRender();
      }
    }, true);
  }
  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
  }
  setSize() {
    if (!this.gl)
      return;
    const containerBoundingRect = this.container.getBoundingClientRect();
    this._boundingRect = {
      width: containerBoundingRect.width * this.pixelRatio,
      height: containerBoundingRect.height * this.pixelRatio,
      top: containerBoundingRect.top * this.pixelRatio,
      left: containerBoundingRect.left * this.pixelRatio
    };
    const isSafari = !!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/);
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isSafari && iOS) {
      let getTopOffset = function(el) {
        let topOffset = 0;
        while (el && !isNaN(el.offsetTop)) {
          topOffset += el.offsetTop - el.scrollTop;
          el = el.offsetParent;
        }
        return topOffset;
      };
      this._boundingRect.top = getTopOffset(this.container) * this.pixelRatio;
    }
    this.canvas.style.width = Math.floor(this._boundingRect.width / this.pixelRatio) + "px";
    this.canvas.style.height = Math.floor(this._boundingRect.height / this.pixelRatio) + "px";
    this.canvas.width = Math.floor(this._boundingRect.width * this._renderingScale);
    this.canvas.height = Math.floor(this._boundingRect.height * this._renderingScale);
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
  }
  resize() {
    for (let i = 0;i < this.planes.length; i++) {
      if (this.planes[i]._canDraw) {
        this.planes[i].resize();
      }
    }
    for (let i = 0;i < this.shaderPasses.length; i++) {
      if (this.shaderPasses[i]._canDraw) {
        this.shaderPasses[i].resize();
      }
    }
    for (let i = 0;i < this.renderTargets.length; i++) {
      this.renderTargets[i].resize();
    }
    this.needRender();
  }
  clear() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }
  clearDepth() {
    this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
  }
  clearColor() {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
  bindFrameBuffer(frameBuffer, cancelClear) {
    let bufferId = null;
    if (frameBuffer) {
      bufferId = frameBuffer.index;
      if (bufferId !== this.state.frameBufferID) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, frameBuffer._frameBuffer);
        this.gl.viewport(0, 0, frameBuffer._size.width, frameBuffer._size.height);
        if (frameBuffer._shouldClear && !cancelClear) {
          this.clear();
        }
      }
    } else if (this.state.frameBufferID !== null) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    }
    this.state.frameBufferID = bufferId;
  }
  setDepthTest(depthTest) {
    if (depthTest && !this.state.depthTest) {
      this.state.depthTest = depthTest;
      this.gl.enable(this.gl.DEPTH_TEST);
    } else if (!depthTest && this.state.depthTest) {
      this.state.depthTest = depthTest;
      this.gl.disable(this.gl.DEPTH_TEST);
    }
  }
  setDepthFunc() {
    this.gl.depthFunc(this.gl.LEQUAL);
  }
  setBlending(enableBlending = false) {
    if (enableBlending && !this.state.blending) {
      this.state.blending = enableBlending;
      this.gl.enable(this.gl.BLEND);
    } else if (!enableBlending && this.state.blending) {
      this.state.blending = enableBlending;
      this.gl.disable(this.gl.BLEND);
    }
  }
  setBlendFunc() {
    this.gl.enable(this.gl.BLEND);
    if (this.premultipliedAlpha) {
      this.gl.blendFuncSeparate(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA, this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    } else {
      this.gl.blendFuncSeparate(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA, this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    }
  }
  setFaceCulling(cullFace) {
    if (this.state.cullFace !== cullFace) {
      this.state.cullFace = cullFace;
      if (cullFace === "none") {
        this.gl.disable(this.gl.CULL_FACE);
      } else {
        const faceCulling = cullFace === "front" ? this.gl.FRONT : this.gl.BACK;
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(faceCulling);
      }
    }
  }
  useProgram(program) {
    if (this.state.currentProgramID === null || this.state.currentProgramID !== program.id) {
      this.gl.useProgram(program.program);
      this.state.currentProgramID = program.id;
    }
  }
  removePlane(plane) {
    if (!this.gl)
      return;
    this.planes = this.planes.filter((element) => element.uuid !== plane.uuid);
    this.scene.removePlane(plane);
    plane = null;
    if (this.gl)
      this.clear();
    this.onSceneChange();
  }
  removeRenderTarget(renderTarget) {
    if (!this.gl)
      return;
    let hasPlane = this.planes.find((plane) => plane.type !== "PingPongPlane" && plane.target && plane.target.uuid === renderTarget.uuid);
    for (let i = 0;i < this.planes.length; i++) {
      if (this.planes[i].target && this.planes[i].target.uuid === renderTarget.uuid) {
        this.planes[i].target = null;
      }
    }
    this.renderTargets = this.renderTargets.filter((element) => element.uuid !== renderTarget.uuid);
    for (let i = 0;i < this.renderTargets.length; i++) {
      this.renderTargets[i].index = i;
    }
    renderTarget = null;
    if (this.gl)
      this.clear();
    if (hasPlane) {
      this.scene.resetPlaneStacks();
    }
    this.onSceneChange();
  }
  removeShaderPass(shaderPass) {
    if (!this.gl)
      return;
    this.shaderPasses = this.shaderPasses.filter((element) => element.uuid !== shaderPass.uuid);
    this.scene.removeShaderPass(shaderPass);
    shaderPass = null;
    if (this.gl)
      this.clear();
    this.onSceneChange();
  }
  enableDrawing() {
    this.state.drawingEnabled = true;
  }
  disableDrawing() {
    this.state.drawingEnabled = false;
  }
  needRender() {
    this.state.forceRender = true;
  }
  render() {
    if (!this.gl)
      return;
    this.clear();
    this.state.currentGeometryID = null;
    this.scene.draw();
  }
  deletePrograms() {
    for (let i = 0;i < this.cache.programs.length; i++) {
      const program = this.cache.programs[i];
      this.gl.deleteProgram(program.program);
    }
  }
  dispose() {
    if (!this.gl)
      return;
    this.state.isActive = false;
    while (this.planes.length > 0) {
      this.removePlane(this.planes[0]);
    }
    while (this.shaderPasses.length > 0) {
      this.removeShaderPass(this.shaderPasses[0]);
    }
    while (this.renderTargets.length > 0) {
      this.removeRenderTarget(this.renderTargets[0]);
    }
    let disposeQueue = this.nextRender.add(() => {
      if (this.planes.length === 0 && this.shaderPasses.length === 0 && this.renderTargets.length === 0) {
        disposeQueue.keep = false;
        this.deletePrograms();
        this.clear();
        this.canvas.removeEventListener("webgllost", this._contextLostHandler, false);
        this.canvas.removeEventListener("webglrestored", this._contextRestoredHandler, false);
        if (this.gl && this.extensions["WEBGL_lose_context"]) {
          this.extensions["WEBGL_lose_context"].loseContext();
        }
        this.canvas.width = this.canvas.width;
        this.gl = null;
        this.container.removeChild(this.canvas);
        this.container = null;
        this.canvas = null;
        this.onDisposed && this.onDisposed();
      }
    }, true);
  }
}

// js/src/utils/ScrollManager.js
class ScrollManager {
  constructor({
    xOffset = 0,
    yOffset = 0,
    lastXDelta = 0,
    lastYDelta = 0,
    shouldWatch = true,
    onScroll = () => {
    }
  } = {}) {
    this.xOffset = xOffset;
    this.yOffset = yOffset;
    this.lastXDelta = lastXDelta;
    this.lastYDelta = lastYDelta;
    this.shouldWatch = shouldWatch;
    this.onScroll = onScroll;
    this.handler = this.scroll.bind(this, true);
    if (this.shouldWatch) {
      window.addEventListener("scroll", this.handler, {
        passive: true
      });
    }
  }
  scroll() {
    this.updateScrollValues(window.pageXOffset, window.pageYOffset);
  }
  updateScrollValues(x, y) {
    const lastScrollXValue = this.xOffset;
    this.xOffset = x;
    this.lastXDelta = lastScrollXValue - this.xOffset;
    const lastScrollYValue = this.yOffset;
    this.yOffset = y;
    this.lastYDelta = lastScrollYValue - this.yOffset;
    if (this.onScroll) {
      this.onScroll(this.lastXDelta, this.lastYDelta);
    }
  }
  dispose() {
    if (this.shouldWatch) {
      window.removeEventListener("scroll", this.handler, {
        passive: true
      });
    }
  }
}

// js/src/core/Curtains.js
var version = "8.1.6";

class Curtains {
  constructor({
    container,
    alpha = true,
    premultipliedAlpha = false,
    antialias = true,
    depth = true,
    failIfMajorPerformanceCaveat = true,
    preserveDrawingBuffer = false,
    stencil = false,
    autoResize = true,
    autoRender = true,
    watchScroll = true,
    pixelRatio = window.devicePixelRatio || 1,
    renderingScale = 1,
    production = false
  } = {}) {
    this.type = "Curtains";
    this._autoResize = autoResize;
    this._autoRender = autoRender;
    this._watchScroll = watchScroll;
    this.pixelRatio = pixelRatio;
    renderingScale = isNaN(renderingScale) ? 1 : parseFloat(renderingScale);
    this._renderingScale = Math.max(0.25, Math.min(1, renderingScale));
    this.premultipliedAlpha = premultipliedAlpha;
    this.alpha = alpha;
    this.antialias = antialias;
    this.depth = depth;
    this.failIfMajorPerformanceCaveat = failIfMajorPerformanceCaveat;
    this.preserveDrawingBuffer = preserveDrawingBuffer;
    this.stencil = stencil;
    this.production = production;
    this.errors = false;
    if (container) {
      this.setContainer(container);
    } else if (!this.production) {
      throwWarning(this.type + ": no container provided in the initial parameters. Use setContainer() method to set one later and initialize the WebGL context");
    }
  }
  setContainer(container) {
    if (!container) {
      let container2 = document.createElement("div");
      container2.setAttribute("id", "curtains-canvas");
      document.body.appendChild(container2);
      this.container = container2;
      if (!this.production)
        throwWarning('Curtains: no valid container HTML element or ID provided, created a div with "curtains-canvas" ID instead');
    } else {
      if (typeof container === "string") {
        container = document.getElementById(container);
        if (!container) {
          let container2 = document.createElement("div");
          container2.setAttribute("id", "curtains-canvas");
          document.body.appendChild(container2);
          this.container = container2;
          if (!this.production)
            throwWarning('Curtains: no valid container HTML element or ID provided, created a div with "curtains-canvas" ID instead');
        } else {
          this.container = container;
        }
      } else if (container instanceof Element) {
        this.container = container;
      }
    }
    this._initCurtains();
  }
  _initCurtains() {
    this.planes = [];
    this.renderTargets = [];
    this.shaderPasses = [];
    this._initRenderer();
    if (!this.gl)
      return;
    this._initScroll();
    this._setSize();
    this._addListeners();
    this.container.appendChild(this.canvas);
    console.log("curtains.js - v" + version);
    this._animationFrameID = null;
    if (this._autoRender) {
      this._animate();
    }
  }
  _initRenderer() {
    this.renderer = new Renderer({
      alpha: this.alpha,
      antialias: this.antialias,
      premultipliedAlpha: this.premultipliedAlpha,
      depth: this.depth,
      failIfMajorPerformanceCaveat: this.failIfMajorPerformanceCaveat,
      preserveDrawingBuffer: this.preserveDrawingBuffer,
      stencil: this.stencil,
      container: this.container,
      pixelRatio: this.pixelRatio,
      renderingScale: this._renderingScale,
      production: this.production,
      onError: () => this._onRendererError(),
      onSuccess: () => this._onRendererSuccess(),
      onContextLost: () => this._onRendererContextLost(),
      onContextRestored: () => this._onRendererContextRestored(),
      onDisposed: () => this._onRendererDisposed(),
      onSceneChange: () => this._keepSync()
    });
    this.gl = this.renderer.gl;
    this.canvas = this.renderer.canvas;
  }
  restoreContext() {
    this.renderer.restoreContext();
  }
  _animate() {
    this.render();
    this._animationFrameID = window.requestAnimationFrame(this._animate.bind(this));
  }
  enableDrawing() {
    this.renderer.enableDrawing();
  }
  disableDrawing() {
    this.renderer.disableDrawing();
  }
  needRender() {
    this.renderer.needRender();
  }
  nextRender(callback, keep = false) {
    return this.renderer.nextRender.add(callback, keep);
  }
  clear() {
    this.renderer && this.renderer.clear();
  }
  clearDepth() {
    this.renderer && this.renderer.clearDepth();
  }
  clearColor() {
    this.renderer && this.renderer.clearColor();
  }
  isWebGL2() {
    return this.gl ? this.renderer._isWebGL2 : false;
  }
  render() {
    this.renderer.nextRender.execute();
    if (!this.renderer.state.drawingEnabled && !this.renderer.state.forceRender) {
      return;
    }
    if (this.renderer.state.forceRender) {
      this.renderer.state.forceRender = false;
    }
    if (this._onRenderCallback) {
      this._onRenderCallback();
    }
    this.renderer.render();
  }
  _addListeners() {
    this._resizeHandler = null;
    if (this._autoResize) {
      this._resizeHandler = this.resize.bind(this, true);
      window.addEventListener("resize", this._resizeHandler, false);
    }
  }
  setPixelRatio(pixelRatio, triggerCallback) {
    this.pixelRatio = parseFloat(Math.max(pixelRatio, 1)) || 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.resize(triggerCallback);
  }
  _setSize() {
    this.renderer.setSize();
    if (this._scrollManager.shouldWatch) {
      this._scrollManager.xOffset = window.pageXOffset;
      this._scrollManager.yOffset = window.pageYOffset;
    }
  }
  getBoundingRect() {
    return this.renderer._boundingRect;
  }
  resize(triggerCallback) {
    if (!this.gl)
      return;
    this._setSize();
    this.renderer.resize();
    this.nextRender(() => {
      if (this._onAfterResizeCallback && triggerCallback) {
        this._onAfterResizeCallback();
      }
    });
  }
  _initScroll() {
    this._scrollManager = new ScrollManager({
      xOffset: window.pageXOffset,
      yOffset: window.pageYOffset,
      lastXDelta: 0,
      lastYDelta: 0,
      shouldWatch: this._watchScroll,
      onScroll: (lastXDelta, lastYDelta) => this._updateScroll(lastXDelta, lastYDelta)
    });
  }
  _updateScroll(lastXDelta, lastYDelta) {
    for (let i = 0;i < this.planes.length; i++) {
      if (this.planes[i].watchScroll) {
        this.planes[i].updateScrollPosition(lastXDelta, lastYDelta);
      }
    }
    this.renderer.needRender();
    this._onScrollCallback && this._onScrollCallback();
  }
  updateScrollValues(x, y) {
    this._scrollManager.updateScrollValues(x, y);
  }
  getScrollDeltas() {
    return {
      x: this._scrollManager.lastXDelta,
      y: this._scrollManager.lastYDelta
    };
  }
  getScrollValues() {
    return {
      x: this._scrollManager.xOffset,
      y: this._scrollManager.yOffset
    };
  }
  _keepSync() {
    this.planes = this.renderer.planes;
    this.shaderPasses = this.renderer.shaderPasses;
    this.renderTargets = this.renderer.renderTargets;
  }
  lerp(start, end, amount) {
    return lerp(start, end, amount);
  }
  onAfterResize(callback) {
    if (callback) {
      this._onAfterResizeCallback = callback;
    }
    return this;
  }
  onError(callback) {
    if (callback) {
      this._onErrorCallback = callback;
    }
    return this;
  }
  _onRendererError() {
    setTimeout(() => {
      if (this._onErrorCallback && !this.errors) {
        this._onErrorCallback();
      }
      this.errors = true;
    }, 0);
  }
  onSuccess(callback) {
    if (callback) {
      this._onSuccessCallback = callback;
    }
    return this;
  }
  _onRendererSuccess() {
    setTimeout(() => {
      this._onSuccessCallback && this._onSuccessCallback();
    }, 0);
  }
  onContextLost(callback) {
    if (callback) {
      this._onContextLostCallback = callback;
    }
    return this;
  }
  _onRendererContextLost() {
    this._onContextLostCallback && this._onContextLostCallback();
  }
  onContextRestored(callback) {
    if (callback) {
      this._onContextRestoredCallback = callback;
    }
    return this;
  }
  _onRendererContextRestored() {
    this._onContextRestoredCallback && this._onContextRestoredCallback();
  }
  onRender(callback) {
    if (callback) {
      this._onRenderCallback = callback;
    }
    return this;
  }
  onScroll(callback) {
    if (callback) {
      this._onScrollCallback = callback;
    }
    return this;
  }
  dispose() {
    this.renderer.dispose();
  }
  _onRendererDisposed() {
    this._animationFrameID && window.cancelAnimationFrame(this._animationFrameID);
    this._resizeHandler && window.removeEventListener("resize", this._resizeHandler, false);
    this._scrollManager && this._scrollManager.dispose();
  }
}
// js/src/core/Uniforms.js
class Uniforms {
  constructor(renderer, program, uniforms) {
    this.type = "Uniforms";
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      throwError(this.type + ": Renderer WebGL context is undefined", renderer);
      return;
    }
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.program = program;
    this.uniforms = {};
    if (uniforms) {
      for (const key in uniforms) {
        const uniform = uniforms[key];
        this.uniforms[key] = {
          name: uniform.name,
          type: uniform.type,
          value: uniform.value.clone && typeof uniform.value.clone === "function" ? uniform.value.clone() : uniform.value,
          update: null
        };
      }
    }
  }
  handleUniformSetting(uniform) {
    switch (uniform.type) {
      case "1i":
        uniform.update = this.setUniform1i.bind(this);
        break;
      case "1iv":
        uniform.update = this.setUniform1iv.bind(this);
        break;
      case "1f":
        uniform.update = this.setUniform1f.bind(this);
        break;
      case "1fv":
        uniform.update = this.setUniform1fv.bind(this);
        break;
      case "2i":
        uniform.update = this.setUniform2i.bind(this);
        break;
      case "2iv":
        uniform.update = this.setUniform2iv.bind(this);
        break;
      case "2f":
        uniform.update = this.setUniform2f.bind(this);
        break;
      case "2fv":
        uniform.update = this.setUniform2fv.bind(this);
        break;
      case "3i":
        uniform.update = this.setUniform3i.bind(this);
        break;
      case "3iv":
        uniform.update = this.setUniform3iv.bind(this);
        break;
      case "3f":
        uniform.update = this.setUniform3f.bind(this);
        break;
      case "3fv":
        uniform.update = this.setUniform3fv.bind(this);
        break;
      case "4i":
        uniform.update = this.setUniform4i.bind(this);
        break;
      case "4iv":
        uniform.update = this.setUniform4iv.bind(this);
        break;
      case "4f":
        uniform.update = this.setUniform4f.bind(this);
        break;
      case "4fv":
        uniform.update = this.setUniform4fv.bind(this);
        break;
      case "mat2":
        uniform.update = this.setUniformMatrix2fv.bind(this);
        break;
      case "mat3":
        uniform.update = this.setUniformMatrix3fv.bind(this);
        break;
      case "mat4":
        uniform.update = this.setUniformMatrix4fv.bind(this);
        break;
      default:
        if (!this.renderer.production)
          throwWarning(this.type + ": This uniform type is not handled : ", uniform.type);
    }
  }
  setInternalFormat(uniform) {
    if (uniform.value.type === "Vec2") {
      uniform._internalFormat = "Vec2";
      uniform.lastValue = uniform.value.clone();
    } else if (uniform.value.type === "Vec3") {
      uniform._internalFormat = "Vec3";
      uniform.lastValue = uniform.value.clone();
    } else if (uniform.value.type === "Mat4") {
      uniform._internalFormat = "Mat4";
      uniform.lastValue = uniform.value.clone();
    } else if (uniform.value.type === "Quat") {
      uniform._internalFormat = "Quat";
      uniform.lastValue = uniform.value.clone();
    } else if (Array.isArray(uniform.value)) {
      uniform._internalFormat = "array";
      uniform.lastValue = Array.from(uniform.value);
    } else if (uniform.value.constructor === Float32Array) {
      uniform._internalFormat = "mat";
      uniform.lastValue = uniform.value;
    } else {
      uniform._internalFormat = "float";
      uniform.lastValue = uniform.value;
    }
  }
  setUniforms() {
    if (this.uniforms) {
      for (const key in this.uniforms) {
        let uniform = this.uniforms[key];
        uniform.location = this.gl.getUniformLocation(this.program, uniform.name);
        if (!uniform._internalFormat) {
          this.setInternalFormat(uniform);
        }
        if (!uniform.type) {
          if (uniform._internalFormat === "Vec2") {
            uniform.type = "2f";
          } else if (uniform._internalFormat === "Vec3") {
            uniform.type = "3f";
          } else if (uniform._internalFormat === "Mat4") {
            uniform.type = "mat4";
          } else if (uniform._internalFormat === "array") {
            if (uniform.value.length === 4) {
              uniform.type = "4f";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a 4f (array of 4 floats) uniform type");
            } else if (uniform.value.length === 3) {
              uniform.type = "3f";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a 3f (array of 3 floats) uniform type");
            } else if (uniform.value.length === 2) {
              uniform.type = "2f";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a 2f (array of 2 floats) uniform type");
            }
          } else if (uniform._internalFormat === "mat") {
            if (uniform.value.length === 16) {
              uniform.type = "mat4";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a mat4 (4x4 matrix array) uniform type");
            } else if (uniform.value.length === 9) {
              uniform.type = "mat3";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a mat3 (3x3 matrix array) uniform type");
            } else if (uniform.value.length === 4) {
              uniform.type = "mat2";
              if (!this.renderer.production)
                throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a mat2 (2x2 matrix array) uniform type");
            }
          } else {
            uniform.type = "1f";
            if (!this.renderer.production)
              throwWarning(this.type + ": No uniform type declared for " + uniform.name + ", applied a 1f (float) uniform type");
          }
        }
        this.handleUniformSetting(uniform);
        uniform.update && uniform.update(uniform);
      }
    }
  }
  updateUniforms() {
    if (this.uniforms) {
      for (const key in this.uniforms) {
        const uniform = this.uniforms[key];
        let shouldUpdate = false;
        if (uniform._internalFormat === "Vec2") {
          if (!uniform.value.equals(uniform.lastValue)) {
            shouldUpdate = true;
            uniform.lastValue.copy(uniform.value);
          }
        } else if (uniform._internalFormat === "Vec3") {
          if (!uniform.value.equals(uniform.lastValue)) {
            shouldUpdate = true;
            uniform.lastValue.copy(uniform.value);
          }
        } else if (uniform._internalFormat === "Quat") {
          if (!uniform.value.equals(uniform.lastValue)) {
            shouldUpdate = true;
            uniform.lastValue.copy(uniform.value);
          }
        } else if (!uniform.value.length) {
          if (uniform.value !== uniform.lastValue) {
            shouldUpdate = true;
            uniform.lastValue = uniform.value;
          }
        } else if (JSON.stringify(uniform.value) !== JSON.stringify(uniform.lastValue)) {
          shouldUpdate = true;
          uniform.lastValue = Array.from(uniform.value);
        }
        if (shouldUpdate) {
          uniform.update && uniform.update(uniform);
        }
      }
    }
  }
  setUniform1i(uniform) {
    this.gl.uniform1i(uniform.location, uniform.value);
  }
  setUniform1iv(uniform) {
    this.gl.uniform1iv(uniform.location, uniform.value);
  }
  setUniform1f(uniform) {
    this.gl.uniform1f(uniform.location, uniform.value);
  }
  setUniform1fv(uniform) {
    this.gl.uniform1fv(uniform.location, uniform.value);
  }
  setUniform2i(uniform) {
    uniform._internalFormat === "Vec2" ? this.gl.uniform2i(uniform.location, uniform.value.x, uniform.value.y) : this.gl.uniform2i(uniform.location, uniform.value[0], uniform.value[1]);
  }
  setUniform2iv(uniform) {
    uniform._internalFormat === "Vec2" ? this.gl.uniform2iv(uniform.location, [uniform.value.x, uniform.value.y]) : this.gl.uniform2iv(uniform.location, uniform.value);
  }
  setUniform2f(uniform) {
    uniform._internalFormat === "Vec2" ? this.gl.uniform2f(uniform.location, uniform.value.x, uniform.value.y) : this.gl.uniform2f(uniform.location, uniform.value[0], uniform.value[1]);
  }
  setUniform2fv(uniform) {
    uniform._internalFormat === "Vec2" ? this.gl.uniform2fv(uniform.location, [uniform.value.x, uniform.value.y]) : this.gl.uniform2fv(uniform.location, uniform.value);
  }
  setUniform3i(uniform) {
    uniform._internalFormat === "Vec3" ? this.gl.uniform3i(uniform.location, uniform.value.x, uniform.value.y, uniform.value.z) : this.gl.uniform3i(uniform.location, uniform.value[0], uniform.value[1], uniform.value[2]);
  }
  setUniform3iv(uniform) {
    uniform._internalFormat === "Vec3" ? this.gl.uniform3iv(uniform.location, [uniform.value.x, uniform.value.y, uniform.value.z]) : this.gl.uniform3iv(uniform.location, uniform.value);
  }
  setUniform3f(uniform) {
    uniform._internalFormat === "Vec3" ? this.gl.uniform3f(uniform.location, uniform.value.x, uniform.value.y, uniform.value.z) : this.gl.uniform3f(uniform.location, uniform.value[0], uniform.value[1], uniform.value[2]);
  }
  setUniform3fv(uniform) {
    uniform._internalFormat === "Vec3" ? this.gl.uniform3fv(uniform.location, [uniform.value.x, uniform.value.y, uniform.value.z]) : this.gl.uniform3fv(uniform.location, uniform.value);
  }
  setUniform4i(uniform) {
    uniform._internalFormat === "Quat" ? this.gl.uniform4i(uniform.location, uniform.value.elements[0], uniform.value.elements[1], uniform.value.elements[2], uniform.value[3]) : this.gl.uniform4i(uniform.location, uniform.value[0], uniform.value[1], uniform.value[2], uniform.value[3]);
  }
  setUniform4iv(uniform) {
    uniform._internalFormat === "Quat" ? this.gl.uniform4iv(uniform.location, [uniform.value.elements[0], uniform.value.elements[1], uniform.value.elements[2], uniform.value[3]]) : this.gl.uniform4iv(uniform.location, uniform.value);
  }
  setUniform4f(uniform) {
    uniform._internalFormat === "Quat" ? this.gl.uniform4f(uniform.location, uniform.value.elements[0], uniform.value.elements[1], uniform.value.elements[2], uniform.value[3]) : this.gl.uniform4f(uniform.location, uniform.value[0], uniform.value[1], uniform.value[2], uniform.value[3]);
  }
  setUniform4fv(uniform) {
    uniform._internalFormat === "Quat" ? this.gl.uniform4fv(uniform.location, [uniform.value.elements[0], uniform.value.elements[1], uniform.value.elements[2], uniform.value[3]]) : this.gl.uniform4fv(uniform.location, uniform.value);
  }
  setUniformMatrix2fv(uniform) {
    this.gl.uniformMatrix2fv(uniform.location, false, uniform.value);
  }
  setUniformMatrix3fv(uniform) {
    this.gl.uniformMatrix3fv(uniform.location, false, uniform.value);
  }
  setUniformMatrix4fv(uniform) {
    uniform._internalFormat === "Mat4" ? this.gl.uniformMatrix4fv(uniform.location, false, uniform.value.elements) : this.gl.uniformMatrix4fv(uniform.location, false, uniform.value);
  }
}

// js/src/shaders/chunks/precision.medium.glsl.js
var precisionMedium = `
precision mediump float;
`;
var precision_medium_glsl_default = precisionMedium.replace(/\n/g, "");

// js/src/shaders/chunks/default.attributes.glsl.js
var defaultAttributes = `
attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;
`;
var default_attributes_glsl_default = defaultAttributes.replace(/\n/g, "");

// js/src/shaders/chunks/default.varyings.glsl.js
var defaultVaryings = `
varying vec3 vVertexPosition;
varying vec2 vTextureCoord;
`;
var default_varyings_glsl_default = defaultVaryings.replace(/\n/g, "");

// js/src/shaders/plane.vertex.glsl.js
var planeVS = precision_medium_glsl_default + default_attributes_glsl_default + default_varyings_glsl_default + `
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

void main() {
    vTextureCoord = aTextureCoord;
    vVertexPosition = aVertexPosition;
    
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
}
`;
var plane_vertex_glsl_default = planeVS.replace(/\n/g, "");

// js/src/shaders/plane.fragment.glsl.js
var planeFS = precision_medium_glsl_default + default_varyings_glsl_default + `
void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;
var plane_fragment_glsl_default = planeFS.replace(/\n/g, "");

// js/src/shaders/shaderpass.vertex.glsl.js
var shaderPassVS = precision_medium_glsl_default + default_attributes_glsl_default + default_varyings_glsl_default + `
void main() {
    vTextureCoord = aTextureCoord;
    vVertexPosition = aVertexPosition;
    
    gl_Position = vec4(aVertexPosition, 1.0);
}
`;
var shaderpass_vertex_glsl_default = shaderPassVS.replace(/\n/g, "");

// js/src/shaders/shaderpass.fragment.glsl.js
var shaderPassFS = precision_medium_glsl_default + default_varyings_glsl_default + `
uniform sampler2D uRenderTexture;

void main() {
    gl_FragColor = texture2D(uRenderTexture, vTextureCoord);
}
`;
var shaderpass_fragment_glsl_default = shaderPassFS.replace(/\n/g, "");

// js/src/core/Program.js
var id = 0;

class Program {
  constructor(renderer, {
    parent,
    vertexShader,
    fragmentShader
  } = {}) {
    this.type = "Program";
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      throwError(this.type + ": Renderer WebGL context is undefined", renderer);
      return;
    }
    this.renderer = renderer;
    this.gl = this.renderer.gl;
    this.parent = parent;
    this.defaultVsCode = this.parent.type === "Plane" ? plane_vertex_glsl_default : shaderpass_vertex_glsl_default;
    this.defaultFsCode = this.parent.type === "Plane" ? plane_fragment_glsl_default : shaderpass_fragment_glsl_default;
    if (!vertexShader) {
      if (!this.renderer.production && this.parent.type === "Plane") {
        throwWarning(this.parent.type + ": No vertex shader provided, will use a default one");
      }
      this.vsCode = this.defaultVsCode;
    } else {
      this.vsCode = vertexShader;
    }
    if (!fragmentShader) {
      if (!this.renderer.production) {
        throwWarning(this.parent.type + ": No fragment shader provided, will use a default one");
      }
      this.fsCode = this.defaultFsCode;
    } else {
      this.fsCode = fragmentShader;
    }
    this.compiled = true;
    this.setupProgram();
  }
  createShader(shaderCode, shaderType) {
    const shader = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, shaderCode);
    this.gl.compileShader(shader);
    if (!this.renderer.production) {
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const shaderTypeString = shaderType === this.gl.VERTEX_SHADER ? "vertex shader" : "fragment shader";
        const shaderSource = this.gl.getShaderSource(shader);
        let shaderLines = shaderSource.split("\n");
        for (let i = 0;i < shaderLines.length; i++) {
          shaderLines[i] = i + 1 + ": " + shaderLines[i];
        }
        shaderLines = shaderLines.join("\n");
        throwWarning(this.type + ": Errors occurred while compiling the", shaderTypeString, ":\n", this.gl.getShaderInfoLog(shader));
        throwError(shaderLines);
        throwWarning(this.type + ": Will use a default", shaderTypeString);
        return this.createShader(shaderType === this.gl.VERTEX_SHADER ? this.defaultVsCode : this.defaultFsCode, shaderType);
      }
    }
    return shader;
  }
  useNewShaders() {
    this.vertexShader = this.createShader(this.vsCode, this.gl.VERTEX_SHADER);
    this.fragmentShader = this.createShader(this.fsCode, this.gl.FRAGMENT_SHADER);
    if (!this.vertexShader || !this.fragmentShader) {
      if (!this.renderer.production)
        throwWarning(this.type + ": Unable to find or compile the vertex or fragment shader");
    }
  }
  setupProgram() {
    let existingProgram = this.renderer.cache.getProgramFromShaders(this.vsCode, this.fsCode);
    if (existingProgram) {
      this.vertexShader = existingProgram.vertexShader;
      this.fragmentShader = existingProgram.fragmentShader;
      this.activeUniforms = existingProgram.activeUniforms;
      this.activeAttributes = existingProgram.activeAttributes;
      this.createProgram();
    } else {
      this.useNewShaders();
      if (this.compiled) {
        this.createProgram();
        this.renderer.cache.addProgram(this);
      }
    }
  }
  createProgram() {
    id++;
    this.id = id;
    this.program = this.gl.createProgram();
    this.gl.attachShader(this.program, this.vertexShader);
    this.gl.attachShader(this.program, this.fragmentShader);
    this.gl.linkProgram(this.program);
    if (!this.renderer.production) {
      if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
        throwWarning(this.type + ": Unable to initialize the shader program: " + this.gl.getProgramInfoLog(this.program));
        throwWarning(this.type + ": Will use default vertex and fragment shaders");
        this.vertexShader = this.createShader(this.defaultVsCode, this.gl.VERTEX_SHADER);
        this.fragmentShader = this.createShader(this.defaultFsCode, this.gl.FRAGMENT_SHADER);
        this.createProgram();
        return;
      }
    }
    this.gl.deleteShader(this.vertexShader);
    this.gl.deleteShader(this.fragmentShader);
    if (!this.activeUniforms || !this.activeAttributes) {
      this.activeUniforms = {
        textures: [],
        textureMatrices: []
      };
      const numUniforms = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
      for (let i = 0;i < numUniforms; i++) {
        const activeUniform = this.gl.getActiveUniform(this.program, i);
        if (activeUniform.type === this.gl.SAMPLER_2D) {
          this.activeUniforms.textures.push(activeUniform.name);
        }
        if (activeUniform.type === this.gl.FLOAT_MAT4 && activeUniform.name !== "uMVMatrix" && activeUniform.name !== "uPMatrix") {
          this.activeUniforms.textureMatrices.push(activeUniform.name);
        }
      }
      this.activeAttributes = [];
      const numAttributes = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_ATTRIBUTES);
      for (let i = 0;i < numAttributes; i++) {
        const activeAttribute = this.gl.getActiveAttrib(this.program, i);
        this.activeAttributes.push(activeAttribute.name);
      }
    }
  }
  createUniforms(uniforms) {
    this.uniformsManager = new Uniforms(this.renderer, this.program, uniforms);
    this.setUniforms();
  }
  setUniforms() {
    this.renderer.useProgram(this);
    this.uniformsManager.setUniforms();
  }
  updateUniforms() {
    this.renderer.useProgram(this);
    this.uniformsManager.updateUniforms();
  }
}

// js/src/core/Geometry.js
class Geometry {
  constructor(renderer, {
    program = null,
    width = 1,
    height = 1
  } = {}) {
    this.type = "Geometry";
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      throwError(this.type + ": Renderer WebGL context is undefined", renderer);
      return;
    }
    this.renderer = renderer;
    this.gl = this.renderer.gl;
    this.definition = {
      id: width * height + width,
      width,
      height
    };
    this.setDefaultAttributes();
    this.setVerticesUVs();
  }
  restoreContext(program) {
    this.program = null;
    this.setDefaultAttributes();
    this.setVerticesUVs();
    this.setProgram(program);
  }
  setDefaultAttributes() {
    this.attributes = {
      vertexPosition: {
        name: "aVertexPosition",
        size: 3,
        isActive: false
      },
      textureCoord: {
        name: "aTextureCoord",
        size: 3,
        isActive: false
      }
    };
  }
  setVerticesUVs() {
    const cachedGeometry = this.renderer.cache.getGeometryFromID(this.definition.id);
    if (cachedGeometry) {
      this.attributes.vertexPosition.array = cachedGeometry.vertices;
      this.attributes.textureCoord.array = cachedGeometry.uvs;
    } else {
      this.computeVerticesUVs();
      this.renderer.cache.addGeometry(this.definition.id, this.attributes.vertexPosition.array, this.attributes.textureCoord.array);
    }
  }
  setProgram(program) {
    this.program = program;
    this.initAttributes();
    if (this.renderer._isWebGL2) {
      this._vao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this._vao);
    } else if (this.renderer.extensions["OES_vertex_array_object"]) {
      this._vao = this.renderer.extensions["OES_vertex_array_object"].createVertexArrayOES();
      this.renderer.extensions["OES_vertex_array_object"].bindVertexArrayOES(this._vao);
    }
    this.initializeBuffers();
  }
  initAttributes() {
    for (const key in this.attributes) {
      this.attributes[key].isActive = this.program.activeAttributes.includes(this.attributes[key].name);
      if (!this.attributes[key].isActive) {
        return;
      }
      this.attributes[key].location = this.gl.getAttribLocation(this.program.program, this.attributes[key].name);
      this.attributes[key].buffer = this.gl.createBuffer();
      this.attributes[key].numberOfItems = this.definition.width * this.definition.height * this.attributes[key].size * 2;
    }
  }
  computeVerticesUVs() {
    this.attributes.vertexPosition.array = [];
    this.attributes.textureCoord.array = [];
    const vertices = this.attributes.vertexPosition.array;
    const uvs = this.attributes.textureCoord.array;
    for (let y = 0;y < this.definition.height; y++) {
      const v = y / this.definition.height;
      for (let x = 0;x < this.definition.width; x++) {
        const u = x / this.definition.width;
        uvs.push(u);
        uvs.push(v);
        uvs.push(0);
        vertices.push((u - 0.5) * 2);
        vertices.push((v - 0.5) * 2);
        vertices.push(0);
        uvs.push(u + 1 / this.definition.width);
        uvs.push(v);
        uvs.push(0);
        vertices.push((u + 1 / this.definition.width - 0.5) * 2);
        vertices.push((v - 0.5) * 2);
        vertices.push(0);
        uvs.push(u);
        uvs.push(v + 1 / this.definition.height);
        uvs.push(0);
        vertices.push((u - 0.5) * 2);
        vertices.push((v + 1 / this.definition.height - 0.5) * 2);
        vertices.push(0);
        uvs.push(u);
        uvs.push(v + 1 / this.definition.height);
        uvs.push(0);
        vertices.push((u - 0.5) * 2);
        vertices.push((v + 1 / this.definition.height - 0.5) * 2);
        vertices.push(0);
        uvs.push(u + 1 / this.definition.width);
        uvs.push(v);
        uvs.push(0);
        vertices.push((u + 1 / this.definition.width - 0.5) * 2);
        vertices.push((v - 0.5) * 2);
        vertices.push(0);
        uvs.push(u + 1 / this.definition.width);
        uvs.push(v + 1 / this.definition.height);
        uvs.push(0);
        vertices.push((u + 1 / this.definition.width - 0.5) * 2);
        vertices.push((v + 1 / this.definition.height - 0.5) * 2);
        vertices.push(0);
      }
    }
  }
  initializeBuffers() {
    if (!this.attributes)
      return;
    for (const key in this.attributes) {
      if (!this.attributes[key].isActive)
        return;
      this.gl.enableVertexAttribArray(this.attributes[key].location);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributes[key].buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.attributes[key].array), this.gl.STATIC_DRAW);
      this.gl.vertexAttribPointer(this.attributes[key].location, this.attributes[key].size, this.gl.FLOAT, false, 0, 0);
    }
    this.renderer.state.currentGeometryID = this.definition.id;
  }
  bindBuffers() {
    if (this._vao) {
      if (this.renderer._isWebGL2) {
        this.gl.bindVertexArray(this._vao);
      } else {
        this.renderer.extensions["OES_vertex_array_object"].bindVertexArrayOES(this._vao);
      }
    } else {
      for (const key in this.attributes) {
        if (!this.attributes[key].isActive)
          return;
        this.gl.enableVertexAttribArray(this.attributes[key].location);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributes[key].buffer);
        this.gl.vertexAttribPointer(this.attributes[key].location, this.attributes[key].size, this.gl.FLOAT, false, 0, 0);
      }
    }
    this.renderer.state.currentGeometryID = this.definition.id;
  }
  draw() {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, this.attributes.vertexPosition.numberOfItems);
  }
  dispose() {
    if (this._vao) {
      if (this.renderer._isWebGL2) {
        this.gl.deleteVertexArray(this._vao);
      } else {
        this.renderer.extensions["OES_vertex_array_object"].deleteVertexArrayOES(this._vao);
      }
    }
    for (const key in this.attributes) {
      if (!this.attributes[key].isActive)
        return;
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.attributes[key].buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, 1, this.gl.STATIC_DRAW);
      this.gl.deleteBuffer(this.attributes[key].buffer);
    }
    this.attributes = null;
    this.renderer.state.currentGeometryID = null;
  }
}

// js/src/math/Mat4.js
class Mat4 {
  constructor(elements = new Float32Array([
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  ])) {
    this.type = "Mat4";
    this.elements = elements;
  }
  setFromArray(array) {
    for (let i = 0;i < this.elements.length; i++) {
      this.elements[i] = array[i];
    }
    return this;
  }
  copy(matrix) {
    const array = matrix.elements;
    this.elements[0] = array[0];
    this.elements[1] = array[1];
    this.elements[2] = array[2];
    this.elements[3] = array[3];
    this.elements[4] = array[4];
    this.elements[5] = array[5];
    this.elements[6] = array[6];
    this.elements[7] = array[7];
    this.elements[8] = array[8];
    this.elements[9] = array[9];
    this.elements[10] = array[10];
    this.elements[11] = array[11];
    this.elements[12] = array[12];
    this.elements[13] = array[13];
    this.elements[14] = array[14];
    this.elements[15] = array[15];
    return this;
  }
  clone() {
    return new Mat4().copy(this);
  }
  multiply(matrix) {
    const a = this.elements;
    const b = matrix.elements;
    let result = new Mat4;
    result.elements[0] = b[0] * a[0] + b[1] * a[4] + b[2] * a[8] + b[3] * a[12];
    result.elements[1] = b[0] * a[1] + b[1] * a[5] + b[2] * a[9] + b[3] * a[13];
    result.elements[2] = b[0] * a[2] + b[1] * a[6] + b[2] * a[10] + b[3] * a[14];
    result.elements[3] = b[0] * a[3] + b[1] * a[7] + b[2] * a[11] + b[3] * a[15];
    result.elements[4] = b[4] * a[0] + b[5] * a[4] + b[6] * a[8] + b[7] * a[12];
    result.elements[5] = b[4] * a[1] + b[5] * a[5] + b[6] * a[9] + b[7] * a[13];
    result.elements[6] = b[4] * a[2] + b[5] * a[6] + b[6] * a[10] + b[7] * a[14];
    result.elements[7] = b[4] * a[3] + b[5] * a[7] + b[6] * a[11] + b[7] * a[15];
    result.elements[8] = b[8] * a[0] + b[9] * a[4] + b[10] * a[8] + b[11] * a[12];
    result.elements[9] = b[8] * a[1] + b[9] * a[5] + b[10] * a[9] + b[11] * a[13];
    result.elements[10] = b[8] * a[2] + b[9] * a[6] + b[10] * a[10] + b[11] * a[14];
    result.elements[11] = b[8] * a[3] + b[9] * a[7] + b[10] * a[11] + b[11] * a[15];
    result.elements[12] = b[12] * a[0] + b[13] * a[4] + b[14] * a[8] + b[15] * a[12];
    result.elements[13] = b[12] * a[1] + b[13] * a[5] + b[14] * a[9] + b[15] * a[13];
    result.elements[14] = b[12] * a[2] + b[13] * a[6] + b[14] * a[10] + b[15] * a[14];
    result.elements[15] = b[12] * a[3] + b[13] * a[7] + b[14] * a[11] + b[15] * a[15];
    return result;
  }
  getInverse() {
    const te = this.elements;
    const out = new Mat4;
    const oe = out.elements;
    let a00 = te[0], a01 = te[1], a02 = te[2], a03 = te[3];
    let a10 = te[4], a11 = te[5], a12 = te[6], a13 = te[7];
    let a20 = te[8], a21 = te[9], a22 = te[10], a23 = te[11];
    let a30 = te[12], a31 = te[13], a32 = te[14], a33 = te[15];
    let b00 = a00 * a11 - a01 * a10;
    let b01 = a00 * a12 - a02 * a10;
    let b02 = a00 * a13 - a03 * a10;
    let b03 = a01 * a12 - a02 * a11;
    let b04 = a01 * a13 - a03 * a11;
    let b05 = a02 * a13 - a03 * a12;
    let b06 = a20 * a31 - a21 * a30;
    let b07 = a20 * a32 - a22 * a30;
    let b08 = a20 * a33 - a23 * a30;
    let b09 = a21 * a32 - a22 * a31;
    let b10 = a21 * a33 - a23 * a31;
    let b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) {
      return null;
    }
    det = 1 / det;
    oe[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    oe[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    oe[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    oe[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    oe[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    oe[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    oe[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    oe[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    oe[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    oe[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    oe[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    oe[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    oe[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    oe[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    oe[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    oe[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }
  scale(vector) {
    let a = this.elements;
    a[0] *= vector.x;
    a[1] *= vector.x;
    a[2] *= vector.x;
    a[3] *= vector.x;
    a[4] *= vector.y;
    a[5] *= vector.y;
    a[6] *= vector.y;
    a[7] *= vector.y;
    a[8] *= vector.z;
    a[9] *= vector.z;
    a[10] *= vector.z;
    a[11] *= vector.z;
    return this;
  }
  compose(translation, quaternion, scale2) {
    let matrix = this.elements;
    const x = quaternion.elements[0], y = quaternion.elements[1], z = quaternion.elements[2], w = quaternion.elements[3];
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const sx = scale2.x;
    const sy = scale2.y;
    const sz = scale2.z;
    matrix[0] = (1 - (yy + zz)) * sx;
    matrix[1] = (xy + wz) * sx;
    matrix[2] = (xz - wy) * sx;
    matrix[3] = 0;
    matrix[4] = (xy - wz) * sy;
    matrix[5] = (1 - (xx + zz)) * sy;
    matrix[6] = (yz + wx) * sy;
    matrix[7] = 0;
    matrix[8] = (xz + wy) * sz;
    matrix[9] = (yz - wx) * sz;
    matrix[10] = (1 - (xx + yy)) * sz;
    matrix[11] = 0;
    matrix[12] = translation.x;
    matrix[13] = translation.y;
    matrix[14] = translation.z;
    matrix[15] = 1;
    return this;
  }
  composeFromOrigin(translation, quaternion, scale2, origin) {
    let matrix = this.elements;
    const x = quaternion.elements[0], y = quaternion.elements[1], z = quaternion.elements[2], w = quaternion.elements[3];
    const x2 = x + x;
    const y2 = y + y;
    const z2 = z + z;
    const xx = x * x2;
    const xy = x * y2;
    const xz = x * z2;
    const yy = y * y2;
    const yz = y * z2;
    const zz = z * z2;
    const wx = w * x2;
    const wy = w * y2;
    const wz = w * z2;
    const sx = scale2.x;
    const sy = scale2.y;
    const sz = scale2.z;
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const out0 = (1 - (yy + zz)) * sx;
    const out1 = (xy + wz) * sx;
    const out2 = (xz - wy) * sx;
    const out4 = (xy - wz) * sy;
    const out5 = (1 - (xx + zz)) * sy;
    const out6 = (yz + wx) * sy;
    const out8 = (xz + wy) * sz;
    const out9 = (yz - wx) * sz;
    const out10 = (1 - (xx + yy)) * sz;
    matrix[0] = out0;
    matrix[1] = out1;
    matrix[2] = out2;
    matrix[3] = 0;
    matrix[4] = out4;
    matrix[5] = out5;
    matrix[6] = out6;
    matrix[7] = 0;
    matrix[8] = out8;
    matrix[9] = out9;
    matrix[10] = out10;
    matrix[11] = 0;
    matrix[12] = translation.x + ox - (out0 * ox + out4 * oy + out8 * oz);
    matrix[13] = translation.y + oy - (out1 * ox + out5 * oy + out9 * oz);
    matrix[14] = translation.z + oz - (out2 * ox + out6 * oy + out10 * oz);
    matrix[15] = 1;
    return this;
  }
}

// js/src/math/Vec2.js
class Vec2 {
  constructor(x = 0, y = x) {
    this.type = "Vec2";
    this._x = x;
    this._y = y;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  set x(value) {
    const changed = value !== this._x;
    this._x = value;
    changed && this._onChangeCallback && this._onChangeCallback();
  }
  set y(value) {
    const changed = value !== this._y;
    this._y = value;
    changed && this._onChangeCallback && this._onChangeCallback();
  }
  onChange(callback) {
    if (callback) {
      this._onChangeCallback = callback;
    }
    return this;
  }
  set(x, y) {
    this._x = x;
    this._y = y;
    return this;
  }
  add(vector) {
    this._x += vector.x;
    this._y += vector.y;
    return this;
  }
  addScalar(value) {
    this._x += value;
    this._y += value;
    return this;
  }
  sub(vector) {
    this._x -= vector.x;
    this._y -= vector.y;
    return this;
  }
  subScalar(value) {
    this._x -= value;
    this._y -= value;
    return this;
  }
  multiply(vector) {
    this._x *= vector.x;
    this._y *= vector.y;
    return this;
  }
  multiplyScalar(value) {
    this._x *= value;
    this._y *= value;
    return this;
  }
  copy(vector) {
    this._x = vector.x;
    this._y = vector.y;
    return this;
  }
  clone() {
    return new Vec2(this._x, this._y);
  }
  sanitizeNaNValuesWith(vector) {
    this._x = isNaN(this._x) ? vector.x : parseFloat(this._x);
    this._y = isNaN(this._y) ? vector.y : parseFloat(this._y);
    return this;
  }
  max(vector) {
    this._x = Math.max(this._x, vector.x);
    this._y = Math.max(this._y, vector.y);
    return this;
  }
  min(vector) {
    this._x = Math.min(this._x, vector.x);
    this._y = Math.min(this._y, vector.y);
    return this;
  }
  equals(vector) {
    return this._x === vector.x && this._y === vector.y;
  }
  normalize() {
    let len = this._x * this._x + this._y * this._y;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
    }
    this._x *= len;
    this._y *= len;
    return this;
  }
  dot(vector) {
    return this._x * vector.x + this._y * vector.y;
  }
}

// js/src/math/Vec3.js
class Vec3 {
  constructor(x = 0, y = x, z = x) {
    this.type = "Vec3";
    this._x = x;
    this._y = y;
    this._z = z;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  get z() {
    return this._z;
  }
  set x(value) {
    const changed = value !== this._x;
    this._x = value;
    changed && this._onChangeCallback && this._onChangeCallback();
  }
  set y(value) {
    const changed = value !== this._y;
    this._y = value;
    changed && this._onChangeCallback && this._onChangeCallback();
  }
  set z(value) {
    const changed = value !== this._z;
    this._z = value;
    changed && this._onChangeCallback && this._onChangeCallback();
  }
  onChange(callback) {
    if (callback) {
      this._onChangeCallback = callback;
    }
    return this;
  }
  set(x, y, z) {
    this._x = x;
    this._y = y;
    this._z = z;
    return this;
  }
  add(vector) {
    this._x += vector.x;
    this._y += vector.y;
    this._z += vector.z;
    return this;
  }
  addScalar(value) {
    this._x += value;
    this._y += value;
    this._z += value;
    return this;
  }
  sub(vector) {
    this._x -= vector.x;
    this._y -= vector.y;
    this._z -= vector.z;
    return this;
  }
  subScalar(value) {
    this._x -= value;
    this._y -= value;
    this._z -= value;
    return this;
  }
  multiply(vector) {
    this._x *= vector.x;
    this._y *= vector.y;
    this._z *= vector.z;
    return this;
  }
  multiplyScalar(value) {
    this._x *= value;
    this._y *= value;
    this._z *= value;
    return this;
  }
  copy(vector) {
    this._x = vector.x;
    this._y = vector.y;
    this._z = vector.z;
    return this;
  }
  clone() {
    return new Vec3(this._x, this._y, this._z);
  }
  sanitizeNaNValuesWith(vector) {
    this._x = isNaN(this._x) ? vector.x : parseFloat(this._x);
    this._y = isNaN(this._y) ? vector.y : parseFloat(this._y);
    this._z = isNaN(this._z) ? vector.z : parseFloat(this._z);
    return this;
  }
  max(vector) {
    this._x = Math.max(this._x, vector.x);
    this._y = Math.max(this._y, vector.y);
    this._z = Math.max(this._z, vector.z);
    return this;
  }
  min(vector) {
    this._x = Math.min(this._x, vector.x);
    this._y = Math.min(this._y, vector.y);
    this._z = Math.min(this._z, vector.z);
    return this;
  }
  equals(vector) {
    return this._x === vector.x && this._y === vector.y && this._z === vector.z;
  }
  normalize() {
    let len = this._x * this._x + this._y * this._y + this._z * this._z;
    if (len > 0) {
      len = 1 / Math.sqrt(len);
    }
    this._x *= len;
    this._y *= len;
    this._z *= len;
    return this;
  }
  dot(vector) {
    return this._x * vector.x + this._y * vector.y + this._z * vector.z;
  }
  applyMat4(matrix) {
    const x = this._x, y = this._y, z = this._z;
    const mArray = matrix.elements;
    let w = mArray[3] * x + mArray[7] * y + mArray[11] * z + mArray[15];
    w = w || 1;
    this._x = (mArray[0] * x + mArray[4] * y + mArray[8] * z + mArray[12]) / w;
    this._y = (mArray[1] * x + mArray[5] * y + mArray[9] * z + mArray[13]) / w;
    this._z = (mArray[2] * x + mArray[6] * y + mArray[10] * z + mArray[14]) / w;
    return this;
  }
  applyQuat(quaternion) {
    const x = this._x, y = this._y, z = this._z;
    const qx = quaternion.elements[0], qy = quaternion.elements[1], qz = quaternion.elements[2], qw = quaternion.elements[3];
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this._x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this._y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this._z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
  project(camera) {
    this.applyMat4(camera.viewMatrix).applyMat4(camera.projectionMatrix);
    return this;
  }
  unproject(camera) {
    this.applyMat4(camera.projectionMatrix.getInverse()).applyMat4(camera.worldMatrix);
    return this;
  }
}

// js/src/core/Texture.js
var tempVec2 = new Vec2;
var tempVec3 = new Vec3;
var textureTranslation = new Mat4;

class Texture {
  constructor(renderer, {
    isFBOTexture = false,
    fromTexture = false,
    loader,
    sampler,
    floatingPoint = "none",
    premultiplyAlpha = false,
    anisotropy = 1,
    generateMipmap = null,
    wrapS,
    wrapT,
    minFilter,
    magFilter
  } = {}) {
    this.type = "Texture";
    renderer = renderer && renderer.renderer || renderer;
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      if (!renderer.production)
        throwError(this.type + ": Unable to create a " + this.type + " because the Renderer WebGL context is not defined");
      return;
    }
    this.renderer = renderer;
    this.gl = this.renderer.gl;
    this.uuid = generateUUID();
    this._globalParameters = {
      unpackAlignment: 4,
      flipY: !isFBOTexture,
      premultiplyAlpha: false,
      shouldPremultiplyAlpha: premultiplyAlpha,
      floatingPoint,
      type: this.gl.UNSIGNED_BYTE,
      internalFormat: this.gl.RGBA,
      format: this.gl.RGBA
    };
    this.parameters = {
      anisotropy,
      generateMipmap,
      wrapS: wrapS || this.gl.CLAMP_TO_EDGE,
      wrapT: wrapT || this.gl.CLAMP_TO_EDGE,
      minFilter: minFilter || this.gl.LINEAR,
      magFilter: magFilter || this.gl.LINEAR,
      _shouldUpdate: true
    };
    this._initState();
    this.sourceType = isFBOTexture ? "fbo" : "empty";
    this._useCache = true;
    this._samplerName = sampler;
    this._sampler = {
      isActive: false,
      isTextureBound: false,
      texture: this.gl.createTexture()
    };
    this._textureMatrix = {
      matrix: new Mat4,
      isActive: false
    };
    this._size = {
      width: 1,
      height: 1
    };
    this.scale = new Vec2(1);
    this.scale.onChange(() => this.resize());
    this.offset = new Vec2;
    this.offset.onChange(() => this.resize());
    this._loader = loader;
    this._sourceLoaded = false;
    this._uploaded = false;
    this._willUpdate = false;
    this.shouldUpdate = false;
    this._forceUpdate = false;
    this.userData = {};
    this._canDraw = false;
    if (fromTexture) {
      this._copyOnInit = true;
      this._copiedFrom = fromTexture;
      return;
    }
    this._copyOnInit = false;
    this._initTexture();
  }
  _initState() {
    this._state = {
      anisotropy: 1,
      generateMipmap: false,
      wrapS: null,
      wrapT: null,
      minFilter: null,
      magFilter: this.gl.LINEAR
    };
  }
  _initTexture() {
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._sampler.texture);
    if (this.sourceType === "empty") {
      this._globalParameters.flipY = false;
      this._updateGlobalTexParameters();
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      this._canDraw = true;
    }
  }
  _restoreFromTexture() {
    if (!this._copyOnInit) {
      this._initTexture();
    }
    if (this._parent) {
      this._setTextureUniforms();
      this._setSize();
    }
    this.copy(this._copiedFrom);
    this._canDraw = true;
  }
  _restoreContext() {
    this._canDraw = false;
    this._sampler.texture = this.gl.createTexture();
    this._sampler.isActive = false;
    this._sampler.isTextureBound = false;
    this._textureMatrix.isActive = false;
    this._initState();
    this._state.generateMipmap = false;
    this.parameters._shouldUpdate = true;
    if (!this._copiedFrom) {
      this._initTexture();
      if (this._parent) {
        this._setParent();
      }
      if (this.source) {
        this.setSource(this.source);
        if (this.sourceType === "image") {
          this.renderer.cache.addTexture(this);
        } else {
          this.needUpdate();
        }
      }
      this._canDraw = true;
    } else {
      const queue = this.renderer.nextRender.add(() => {
        if (this._copiedFrom._canDraw) {
          this._restoreFromTexture();
          queue.keep = false;
        }
      }, true);
    }
  }
  addParent(parent) {
    if (!parent || parent.type !== "Plane" && parent.type !== "PingPongPlane" && parent.type !== "ShaderPass" && parent.type !== "RenderTarget") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": cannot add texture as a child of ", parent, " because it is not a valid parent");
      }
      return;
    }
    this._parent = parent;
    this.index = this._parent.textures.length;
    this._parent.textures.push(this);
    this._setParent();
  }
  _setParent() {
    this._sampler.name = this._samplerName || "uSampler" + this.index;
    this._textureMatrix.name = this._samplerName ? this._samplerName + "Matrix" : "uTextureMatrix" + this.index;
    if (this._parent._program) {
      if (!this._parent._program.compiled) {
        if (!this.renderer.production) {
          throwWarning(this.type + ": Unable to create the texture because the program is not valid");
        }
        return;
      }
      this._setTextureUniforms();
      if (this._copyOnInit) {
        const waitForOriginalTexture = this.renderer.nextRender.add(() => {
          if (this._copiedFrom._canDraw && this._copiedFrom._uploaded) {
            this.copy(this._copiedFrom);
            waitForOriginalTexture.keep = false;
          }
        }, true);
        return;
      }
      if (!this.source) {
        this._size = {
          width: this._parent._boundingRect.document.width,
          height: this._parent._boundingRect.document.height
        };
      } else if (this._parent.loader) {
        this._parent.loader._addSourceToParent(this.source, this.sourceType);
      }
      this._setSize();
    } else if (this._parent.type === "RenderTarget") {
      this._size = {
        width: this._parent._size && this._parent._size.width || this.renderer._boundingRect.width,
        height: this._parent._size && this._parent._size.height || this.renderer._boundingRect.height
      };
      this._upload();
      this._updateTexParameters();
      this._canDraw = true;
    }
  }
  hasParent() {
    return !!this._parent;
  }
  _setTextureUniforms() {
    const activeUniforms = this._parent._program.activeUniforms;
    for (let i = 0;i < activeUniforms.textures.length; i++) {
      if (activeUniforms.textures[i] === this._sampler.name) {
        this._sampler.isActive = true;
        this.renderer.useProgram(this._parent._program);
        this._sampler.location = this.gl.getUniformLocation(this._parent._program.program, this._sampler.name);
        const isTextureMatrixActive = activeUniforms.textureMatrices.find((textureMatrix) => textureMatrix === this._textureMatrix.name);
        if (isTextureMatrixActive) {
          this._textureMatrix.isActive = true;
          this._textureMatrix.location = this.gl.getUniformLocation(this._parent._program.program, this._textureMatrix.name);
        }
        this.gl.uniform1i(this._sampler.location, this.index);
      }
    }
  }
  copy(texture) {
    if (!texture || texture.type !== "Texture") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Unable to set the texture from texture:", texture);
      }
      return;
    }
    this._globalParameters = Object.assign({}, texture._globalParameters);
    this._state = Object.assign({}, texture._state);
    this.parameters.generateMipmap = texture.parameters.generateMipmap;
    this._state.generateMipmap = null;
    this._size = texture._size;
    if (!this._sourceLoaded && texture._sourceLoaded) {
      this._onSourceLoadedCallback && this._onSourceLoadedCallback();
    }
    this._sourceLoaded = texture._sourceLoaded;
    if (!this._uploaded && texture._uploaded) {
      this._onSourceUploadedCallback && this._onSourceUploadedCallback();
    }
    this._uploaded = texture._uploaded;
    this.sourceType = texture.sourceType;
    this.source = texture.source;
    this._videoFrameCallbackID = texture._videoFrameCallbackID;
    this._sampler.texture = texture._sampler.texture;
    this._copiedFrom = texture;
    if (this._parent && this._parent._program && (!this._canDraw || !this._textureMatrix.matrix)) {
      this._setSize();
      this._canDraw = true;
    }
    this._updateTexParameters();
    this.renderer.needRender();
  }
  setSource(source) {
    if (!this._sourceLoaded) {
      this.renderer.nextRender.add(() => this._onSourceLoadedCallback && this._onSourceLoadedCallback());
    }
    const sourceType = source.tagName.toUpperCase() === "IMG" ? "image" : source.tagName.toLowerCase();
    if (sourceType === "video" || sourceType === "canvas") {
      this._useCache = false;
    }
    if (this._useCache) {
      const cachedTexture = this.renderer.cache.getTextureFromSource(source);
      if (cachedTexture && cachedTexture.uuid !== this.uuid) {
        if (!this._uploaded) {
          this.renderer.nextRender.add(() => this._onSourceUploadedCallback && this._onSourceUploadedCallback());
          this._uploaded = true;
        }
        this.copy(cachedTexture);
        this.resize();
        return;
      }
    }
    if (this.sourceType === "empty" || this.sourceType !== sourceType) {
      if (sourceType === "video") {
        this._willUpdate = false;
        this.shouldUpdate = true;
      } else if (sourceType === "canvas") {
        this._willUpdate = true;
        this.shouldUpdate = true;
      } else if (sourceType === "image") {
        this._willUpdate = false;
        this.shouldUpdate = false;
      } else {
        if (!this.renderer.production) {
          throwWarning(this.type + ": this HTML tag could not be converted into a texture:", source.tagName);
        }
        return;
      }
    }
    this.source = source;
    this.sourceType = sourceType;
    this._size = {
      width: this.source.naturalWidth || this.source.width || this.source.videoWidth,
      height: this.source.naturalHeight || this.source.height || this.source.videoHeight
    };
    this._sourceLoaded = true;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this._sampler.texture);
    this.resize();
    this._globalParameters.flipY = true;
    this._globalParameters.premultiplyAlpha = this._globalParameters.shouldPremultiplyAlpha;
    if (this.sourceType === "image") {
      this.parameters.generateMipmap = this.parameters.generateMipmap || this.parameters.generateMipmap === null;
      this.parameters._shouldUpdate = this.parameters.generateMipmap;
      this._state.generateMipmap = false;
      this._upload();
    }
    this.renderer.needRender();
  }
  _updateGlobalTexParameters() {
    if (this.renderer.state.unpackAlignment !== this._globalParameters.unpackAlignment) {
      this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, this._globalParameters.unpackAlignment);
      this.renderer.state.unpackAlignment = this._globalParameters.unpackAlignment;
    }
    if (this.renderer.state.flipY !== this._globalParameters.flipY) {
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, this._globalParameters.flipY);
      this.renderer.state.flipY = this._globalParameters.flipY;
    }
    if (this.renderer.state.premultiplyAlpha !== this._globalParameters.premultiplyAlpha) {
      this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, this._globalParameters.premultiplyAlpha);
      this.renderer.state.premultiplyAlpha = this._globalParameters.premultiplyAlpha;
    }
    if (this._globalParameters.floatingPoint === "half-float") {
      if (this.renderer._isWebGL2 && this.renderer.extensions["EXT_color_buffer_float"]) {
        this._globalParameters.internalFormat = this.gl.RGBA16F;
        this._globalParameters.type = this.gl.HALF_FLOAT;
      } else if (this.renderer.extensions["OES_texture_half_float"]) {
        this._globalParameters.type = this.renderer.extensions["OES_texture_half_float"].HALF_FLOAT_OES;
      } else if (!this.renderer.production) {
        throwWarning(this.type + ": could not use half-float textures because the extension is not available");
      }
    } else if (this._globalParameters.floatingPoint === "float") {
      if (this.renderer._isWebGL2 && this.renderer.extensions["EXT_color_buffer_float"]) {
        this._globalParameters.internalFormat = this.gl.RGBA16F;
        this._globalParameters.type = this.gl.FLOAT;
      } else if (this.renderer.extensions["OES_texture_float"]) {
        this._globalParameters.type = this.renderer.extensions["OES_texture_half_float"].FLOAT;
      } else if (!this.renderer.production) {
        throwWarning(this.type + ": could not use float textures because the extension is not available");
      }
    }
  }
  _updateTexParameters() {
    if (this.index && this.renderer.state.activeTexture !== this.index) {
      this._bindTexture();
    }
    if (this.parameters.wrapS !== this._state.wrapS) {
      if (!this.renderer._isWebGL2 && (!isPowerOf2(this._size.width) || !isPowerOf2(this._size.height))) {
        this.parameters.wrapS = this.gl.CLAMP_TO_EDGE;
      }
      if (this.parameters.wrapS !== this.gl.REPEAT && this.parameters.wrapS !== this.gl.CLAMP_TO_EDGE && this.parameters.wrapS !== this.gl.MIRRORED_REPEAT) {
        if (!this.renderer.production) {
          throwWarning(this.type + ": Wrong wrapS value", this.parameters.wrapS, "for this texture:", this, "\ngl.CLAMP_TO_EDGE wrapping will be used instead");
        }
        this.parameters.wrapS = this.gl.CLAMP_TO_EDGE;
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.parameters.wrapS);
      this._state.wrapS = this.parameters.wrapS;
    }
    if (this.parameters.wrapT !== this._state.wrapT) {
      if (!this.renderer._isWebGL2 && (!isPowerOf2(this._size.width) || !isPowerOf2(this._size.height))) {
        this.parameters.wrapT = this.gl.CLAMP_TO_EDGE;
      }
      if (this.parameters.wrapT !== this.gl.REPEAT && this.parameters.wrapT !== this.gl.CLAMP_TO_EDGE && this.parameters.wrapT !== this.gl.MIRRORED_REPEAT) {
        if (!this.renderer.production) {
          throwWarning(this.type + ": Wrong wrapT value", this.parameters.wrapT, "for this texture:", this, "\ngl.CLAMP_TO_EDGE wrapping will be used instead");
        }
        this.parameters.wrapT = this.gl.CLAMP_TO_EDGE;
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.parameters.wrapT);
      this._state.wrapT = this.parameters.wrapT;
    }
    if (this.parameters.generateMipmap && !this._state.generateMipmap && this.source) {
      if (!this.renderer._isWebGL2 && (!isPowerOf2(this._size.width) || !isPowerOf2(this._size.height))) {
        this.parameters.generateMipmap = false;
      } else {
        this.gl.generateMipmap(this.gl.TEXTURE_2D);
      }
      this._state.generateMipmap = this.parameters.generateMipmap;
    }
    if (this.parameters.minFilter !== this._state.minFilter) {
      if (!this.renderer._isWebGL2 && (!isPowerOf2(this._size.width) || !isPowerOf2(this._size.height))) {
        this.parameters.minFilter = this.gl.LINEAR;
      }
      if (!this.parameters.generateMipmap && this.parameters.generateMipmap !== null) {
        this.parameters.minFilter = this.gl.LINEAR;
      }
      if (this.parameters.minFilter !== this.gl.LINEAR && this.parameters.minFilter !== this.gl.NEAREST && this.parameters.minFilter !== this.gl.NEAREST_MIPMAP_NEAREST && this.parameters.minFilter !== this.gl.LINEAR_MIPMAP_NEAREST && this.parameters.minFilter !== this.gl.NEAREST_MIPMAP_LINEAR && this.parameters.minFilter !== this.gl.LINEAR_MIPMAP_LINEAR) {
        if (!this.renderer.production) {
          throwWarning(this.type + ": Wrong minFilter value", this.parameters.minFilter, "for this texture:", this, "\ngl.LINEAR filtering will be used instead");
        }
        this.parameters.minFilter = this.gl.LINEAR;
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.parameters.minFilter);
      this._state.minFilter = this.parameters.minFilter;
    }
    if (this.parameters.magFilter !== this._state.magFilter) {
      if (!this.renderer._isWebGL2 && (!isPowerOf2(this._size.width) || !isPowerOf2(this._size.height))) {
        this.parameters.magFilter = this.gl.LINEAR;
      }
      if (this.parameters.magFilter !== this.gl.LINEAR && this.parameters.magFilter !== this.gl.NEAREST) {
        if (!this.renderer.production) {
          throwWarning(this.type + ": Wrong magFilter value", this.parameters.magFilter, "for this texture:", this, "\ngl.LINEAR filtering will be used instead");
        }
        this.parameters.magFilter = this.gl.LINEAR;
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.parameters.magFilter);
      this._state.magFilter = this.parameters.magFilter;
    }
    const anisotropyExt = this.renderer.extensions["EXT_texture_filter_anisotropic"];
    if (anisotropyExt && this.parameters.anisotropy !== this._state.anisotropy) {
      const max = this.gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      this.parameters.anisotropy = Math.max(1, Math.min(this.parameters.anisotropy, max));
      this.gl.texParameterf(this.gl.TEXTURE_2D, anisotropyExt.TEXTURE_MAX_ANISOTROPY_EXT, this.parameters.anisotropy);
      this._state.anisotropy = this.parameters.anisotropy;
    }
  }
  setWrapS(wrapS) {
    if (this.parameters.wrapS !== wrapS) {
      this.parameters.wrapS = wrapS;
      this.parameters._shouldUpdate = true;
    }
  }
  setWrapT(wrapT) {
    if (this.parameters.wrapT !== wrapT) {
      this.parameters.wrapT = wrapT;
      this.parameters._shouldUpdate = true;
    }
  }
  setMinFilter(minFilter) {
    if (this.parameters.minFilter !== minFilter) {
      this.parameters.minFilter = minFilter;
      this.parameters._shouldUpdate = true;
    }
  }
  setMagFilter(magFilter) {
    if (this.parameters.magFilter !== magFilter) {
      this.parameters.magFilter = magFilter;
      this.parameters._shouldUpdate = true;
    }
  }
  setAnisotropy(anisotropy) {
    anisotropy = isNaN(anisotropy) ? this.parameters.anisotropy : anisotropy;
    if (this.parameters.anisotropy !== anisotropy) {
      this.parameters.anisotropy = anisotropy;
      this.parameters._shouldUpdate = true;
    }
  }
  needUpdate() {
    this._forceUpdate = true;
  }
  _videoFrameCallback() {
    this._willUpdate = true;
    if (!this.source) {
      const waitForSource = this.renderer.nextRender.add(() => {
        if (this.source) {
          waitForSource.keep = false;
          this.source.requestVideoFrameCallback(() => this._videoFrameCallback());
        }
      }, true);
    } else {
      this.source.requestVideoFrameCallback(() => this._videoFrameCallback());
    }
  }
  _upload() {
    this._updateGlobalTexParameters();
    if (this.source) {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this._globalParameters.internalFormat, this._globalParameters.format, this._globalParameters.type, this.source);
    } else if (this.sourceType === "fbo") {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this._globalParameters.internalFormat, this._size.width, this._size.height, 0, this._globalParameters.format, this._globalParameters.type, this.source || null);
    }
    if (!this._uploaded) {
      this.renderer.nextRender.add(() => this._onSourceUploadedCallback && this._onSourceUploadedCallback());
      this._uploaded = true;
    }
  }
  _getSizes() {
    if (this.sourceType === "fbo") {
      return {
        parentWidth: this._parent._boundingRect.document.width,
        parentHeight: this._parent._boundingRect.document.height,
        sourceWidth: this._parent._boundingRect.document.width,
        sourceHeight: this._parent._boundingRect.document.height,
        xOffset: 0,
        yOffset: 0
      };
    }
    const scale2 = this._parent.scale ? tempVec2.set(this._parent.scale.x, this._parent.scale.y) : tempVec2.set(1, 1);
    const parentWidth = this._parent._boundingRect.document.width * scale2.x;
    const parentHeight = this._parent._boundingRect.document.height * scale2.y;
    const sourceWidth = this._size.width;
    const sourceHeight = this._size.height;
    const sourceRatio = sourceWidth / sourceHeight;
    const parentRatio = parentWidth / parentHeight;
    let xOffset = 0;
    let yOffset = 0;
    if (parentRatio > sourceRatio) {
      yOffset = Math.min(0, parentHeight - parentWidth * (1 / sourceRatio));
    } else if (parentRatio < sourceRatio) {
      xOffset = Math.min(0, parentWidth - parentHeight * sourceRatio);
    }
    return {
      parentWidth,
      parentHeight,
      sourceWidth,
      sourceHeight,
      xOffset,
      yOffset
    };
  }
  setScale(scale2) {
    if (!scale2.type || scale2.type !== "Vec2") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set scale because the parameter passed is not of Vec2 type:", scale2);
      }
      return;
    }
    scale2.sanitizeNaNValuesWith(this.scale).max(tempVec2.set(0.001, 0.001));
    if (!scale2.equals(this.scale)) {
      this.scale.copy(scale2);
      this.resize();
    }
  }
  setOffset(offset) {
    if (!offset.type || offset.type !== "Vec2") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set offset because the parameter passed is not of Vec2 type:", scale);
      }
      return;
    }
    offset.sanitizeNaNValuesWith(this.offset);
    if (!offset.equals(this.offset)) {
      this.offset.copy(offset);
      this.resize();
    }
  }
  _setSize() {
    if (this._parent && this._parent._program) {
      const sizes = this._getSizes();
      this._updateTextureMatrix(sizes);
    }
  }
  resize() {
    if (this.sourceType === "fbo") {
      this._size = {
        width: this._parent._size && this._parent._size.width || this._parent._boundingRect.document.width,
        height: this._parent._size && this._parent._size.height || this._parent._boundingRect.document.height
      };
      if (!this._copiedFrom) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._sampler.texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this._globalParameters.internalFormat, this._size.width, this._size.height, 0, this._globalParameters.format, this._globalParameters.type, null);
      }
    } else if (this.source) {
      this._size = {
        width: this.source.naturalWidth || this.source.width || this.source.videoWidth,
        height: this.source.naturalHeight || this.source.height || this.source.videoHeight
      };
    }
    this._setSize();
  }
  _updateTextureMatrix(sizes) {
    const textureScale = tempVec3.set(sizes.parentWidth / (sizes.parentWidth - sizes.xOffset), sizes.parentHeight / (sizes.parentHeight - sizes.yOffset), 1);
    textureScale.x /= this.scale.x;
    textureScale.y /= this.scale.y;
    this._textureMatrix.matrix = textureTranslation.setFromArray([
      textureScale.x,
      0,
      0,
      0,
      0,
      textureScale.y,
      0,
      0,
      0,
      0,
      1,
      0,
      (1 - textureScale.x) / 2 + this.offset.x,
      (1 - textureScale.y) / 2 + this.offset.y,
      0,
      1
    ]);
    this._updateMatrixUniform();
  }
  _updateMatrixUniform() {
    if (this._textureMatrix.isActive) {
      this.renderer.useProgram(this._parent._program);
      this.gl.uniformMatrix4fv(this._textureMatrix.location, false, this._textureMatrix.matrix.elements);
    }
  }
  _onSourceLoaded(source) {
    this.setSource(source);
    if (this.sourceType === "image") {
      this.renderer.cache.addTexture(this);
    }
  }
  _bindTexture() {
    if (this._canDraw) {
      if (this.renderer.state.activeTexture !== this.index) {
        this.gl.activeTexture(this.gl.TEXTURE0 + this.index);
        this.renderer.state.activeTexture = this.index;
      }
      this.gl.bindTexture(this.gl.TEXTURE_2D, this._sampler.texture);
      if (!this._sampler.isTextureBound) {
        this._sampler.isTextureBound = !!this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        this._sampler.isTextureBound && this.renderer.needRender();
      }
    }
  }
  _draw() {
    if (this._sampler.isActive) {
      this._bindTexture();
      if (this.sourceType === "video" && this.source && !this._videoFrameCallbackID && this.source.readyState >= this.source.HAVE_CURRENT_DATA && !this.source.paused) {
        this._willUpdate = true;
      }
      if (this._forceUpdate || this._willUpdate && this.shouldUpdate) {
        this._state.generateMipmap = false;
        this._upload();
      }
      if (this.sourceType === "video") {
        this._willUpdate = false;
      }
      this._forceUpdate = false;
    }
    if (this.parameters._shouldUpdate) {
      this._updateTexParameters();
      this.parameters._shouldUpdate = false;
    }
  }
  onSourceLoaded(callback) {
    if (callback) {
      this._onSourceLoadedCallback = callback;
    }
    return this;
  }
  onSourceUploaded(callback) {
    if (callback) {
      this._onSourceUploadedCallback = callback;
    }
    return this;
  }
  _dispose(force = false) {
    if (this.sourceType === "video" || this.sourceType === "image" && !this.renderer.state.isActive) {
      if (this._loader) {
        this._loader._removeSource(this);
      }
      this.source = null;
    } else if (this.sourceType === "canvas") {
      this.source.width = this.source.width;
      this.source = null;
    }
    this._parent = null;
    const shouldDelete = this.gl && !this._copiedFrom && (force || this.sourceType !== "image" || !this.renderer.state.isActive);
    if (shouldDelete) {
      this._canDraw = false;
      this.renderer.cache.removeTexture(this);
      this.gl.activeTexture(this.gl.TEXTURE0 + this.index);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
      this.gl.deleteTexture(this._sampler.texture);
    }
  }
}

// js/src/loaders/TextureLoader.js
class TextureLoader {
  constructor(renderer, crossOrigin = "anonymous") {
    this.type = "TextureLoader";
    renderer = renderer && renderer.renderer || renderer;
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Renderer not passed as first argument", renderer);
    } else if (!renderer.gl) {
      throwError(this.type + ": Renderer WebGL context is undefined", renderer);
      return;
    }
    this.renderer = renderer;
    this.gl = this.renderer.gl;
    this.crossOrigin = crossOrigin;
    this.elements = [];
  }
  _addElement(source, texture, successCallback, errorCallback) {
    const el = {
      source,
      texture,
      load: this._sourceLoaded.bind(this, source, texture, successCallback),
      error: this._sourceLoadError.bind(this, source, errorCallback)
    };
    this.elements.push(el);
    return el;
  }
  _sourceLoadError(source, callback, error) {
    if (callback) {
      callback(source, error);
    }
  }
  _sourceLoaded(source, texture, callback) {
    if (!texture._sourceLoaded) {
      texture._onSourceLoaded(source);
      if (this._parent) {
        this._increment && this._increment();
        this.renderer.nextRender.add(() => this._parent._onLoadingCallback && this._parent._onLoadingCallback(texture));
      }
      if (callback) {
        callback(texture);
      }
    }
  }
  _getSourceType(source) {
    let sourceType;
    if (typeof source === "string") {
      if (source.match(/\.(jpeg|jpg|jfif|pjpeg|pjp|gif|bmp|png|webp|svg|avif|apng)$/) !== null) {
        sourceType = "image";
      } else if (source.match(/\.(webm|mp4|mpg|mpeg|avi|ogg|ogm|ogv|mov|av1)$/) !== null) {
        sourceType = "video";
      }
    } else {
      if (source.tagName.toUpperCase() === "IMG") {
        sourceType = "image";
      } else if (source.tagName.toUpperCase() === "VIDEO") {
        sourceType = "video";
      } else if (source.tagName.toUpperCase() === "CANVAS") {
        sourceType = "canvas";
      }
    }
    return sourceType;
  }
  _createImage(source) {
    if (typeof source === "string" || !source.hasAttribute("crossOrigin")) {
      const image = new Image;
      image.crossOrigin = this.crossOrigin;
      if (typeof source === "string") {
        image.src = source;
      } else {
        image.src = source.src;
        source.hasAttribute("data-sampler") && image.setAttribute("data-sampler", source.getAttribute("data-sampler"));
      }
      return image;
    } else {
      return source;
    }
  }
  _createVideo(source) {
    if (typeof source === "string" || source.getAttribute("crossOrigin") === null) {
      const video = document.createElement("video");
      video.crossOrigin = this.crossOrigin;
      if (typeof source === "string") {
        video.src = source;
      } else {
        video.src = source.src;
        source.hasAttribute("data-sampler") && video.setAttribute("data-sampler", source.getAttribute("data-sampler"));
      }
      return video;
    } else {
      return source;
    }
  }
  loadSource(source, textureOptions, successCallback, errorCallback) {
    const sourceType = this._getSourceType(source);
    switch (sourceType) {
      case "image":
        this.loadImage(source, textureOptions, successCallback, errorCallback);
        break;
      case "video":
        this.loadVideo(source, textureOptions, successCallback, errorCallback);
        break;
      case "canvas":
        this.loadCanvas(source, textureOptions, successCallback);
        break;
      default:
        this._sourceLoadError(source, errorCallback, "this source could not be converted into a texture: " + source);
        break;
    }
  }
  loadSources(sources, texturesOptions, successCallback, errorCallback) {
    for (let i = 0;i < sources.length; i++) {
      this.loadSource(sources[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadImage(source, textureOptions = {}, successCallback, errorCallback) {
    const cachedTexture = this.renderer.cache.getTextureFromSource(source);
    let options = Object.assign({}, textureOptions);
    if (this._parent) {
      options = Object.assign(options, this._parent._texturesOptions);
    }
    options.loader = this;
    if (cachedTexture) {
      options.sampler = typeof source !== "string" && source.hasAttribute("data-sampler") ? source.getAttribute("data-sampler") : options.sampler;
      options.fromTexture = cachedTexture;
      const texture2 = new Texture(this.renderer, options);
      this._sourceLoaded(cachedTexture.source, texture2, successCallback);
      this._parent && this._addToParent(texture2, cachedTexture.source, "image");
      return;
    }
    const image = this._createImage(source);
    options.sampler = image.hasAttribute("data-sampler") ? image.getAttribute("data-sampler") : options.sampler;
    const texture = new Texture(this.renderer, options);
    const el = this._addElement(image, texture, successCallback, errorCallback);
    if (image.complete) {
      this._sourceLoaded(image, texture, successCallback);
    } else if (image.decode) {
      image.decode().then(this._sourceLoaded.bind(this, image, texture, successCallback)).catch(() => {
        image.addEventListener("load", el.load, false);
        image.addEventListener("error", el.error, false);
      });
    } else {
      image.addEventListener("load", el.load, false);
      image.addEventListener("error", el.error, false);
    }
    this._parent && this._addToParent(texture, image, "image");
  }
  loadImages(sources, texturesOptions, successCallback, errorCallback) {
    for (let i = 0;i < sources.length; i++) {
      this.loadImage(sources[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadVideo(source, textureOptions = {}, successCallback, errorCallback) {
    const video = this._createVideo(source);
    video.preload = true;
    video.muted = true;
    video.loop = true;
    video.setAttribute("playsinline", "");
    video.crossOrigin = this.crossOrigin;
    let options = Object.assign({}, textureOptions);
    if (this._parent) {
      options = Object.assign(textureOptions, this._parent._texturesOptions);
    }
    options.loader = this;
    options.sampler = video.hasAttribute("data-sampler") ? video.getAttribute("data-sampler") : options.sampler;
    const texture = new Texture(this.renderer, options);
    const el = this._addElement(video, texture, successCallback, errorCallback);
    video.addEventListener("canplaythrough", el.load, false);
    video.addEventListener("error", el.error, false);
    if (video.readyState >= video.HAVE_FUTURE_DATA && successCallback) {
      this._sourceLoaded(video, texture, successCallback);
    }
    video.load();
    this._addToParent && this._addToParent(texture, video, "video");
    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      el.videoFrameCallback = texture._videoFrameCallback.bind(texture);
      texture._videoFrameCallbackID = video.requestVideoFrameCallback(el.videoFrameCallback);
    }
  }
  loadVideos(sources, texturesOptions, successCallback, errorCallback) {
    for (let i = 0;i < sources.length; i++) {
      this.loadVideo(sources[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadCanvas(source, textureOptions = {}, successCallback) {
    let options = Object.assign({}, textureOptions);
    if (this._parent) {
      options = Object.assign(textureOptions, this._parent._texturesOptions);
    }
    options.loader = this;
    options.sampler = source.hasAttribute("data-sampler") ? source.getAttribute("data-sampler") : options.sampler;
    const texture = new Texture(this.renderer, options);
    this._addElement(source, texture, successCallback, null);
    this._sourceLoaded(source, texture, successCallback);
    this._parent && this._addToParent(texture, source, "canvas");
  }
  loadCanvases(sources, texturesOptions, successCallback) {
    for (let i = 0;i < sources.length; i++) {
      this.loadCanvas(sources[i], texturesOptions, successCallback);
    }
  }
  _removeSource(texture) {
    const el = this.elements.find((element) => element.texture.uuid === texture.uuid);
    if (el) {
      if (texture.sourceType === "image") {
        el.source.removeEventListener("load", el.load, false);
      } else if (texture.sourceType === "video") {
        if (el.videoFrameCallback && texture._videoFrameCallbackID) {
          el.source.cancelVideoFrameCallback(texture._videoFrameCallbackID);
        }
        el.source.removeEventListener("canplaythrough", el.load, false);
        el.source.pause();
        el.source.removeAttribute("src");
        el.source.load();
      }
      el.source.removeEventListener("error", el.error, false);
    }
  }
}

// js/src/loaders/PlaneTextureLoader.js
class PlaneTextureLoader extends TextureLoader {
  constructor(renderer, parent, {
    sourcesLoaded = 0,
    sourcesToLoad = 0,
    complete = false,
    onComplete = () => {
    }
  } = {}) {
    super(renderer, parent.crossOrigin);
    this.type = "PlaneTextureLoader";
    this._parent = parent;
    if (this._parent.type !== "Plane" && this._parent.type !== "PingPongPlane" && this._parent.type !== "ShaderPass") {
      throwWarning(this.type + ": Wrong parent type assigned to this loader");
      this._parent = null;
    }
    this.sourcesLoaded = sourcesLoaded;
    this.sourcesToLoad = sourcesToLoad;
    this.complete = complete;
    this.onComplete = onComplete;
  }
  _setLoaderSize(size) {
    this.sourcesToLoad = size;
    if (this.sourcesToLoad === 0) {
      this.complete = true;
      this.renderer.nextRender.add(() => this.onComplete && this.onComplete());
    }
  }
  _increment() {
    this.sourcesLoaded++;
    if (this.sourcesLoaded >= this.sourcesToLoad && !this.complete) {
      this.complete = true;
      this.renderer.nextRender.add(() => this.onComplete && this.onComplete());
    }
  }
  _addSourceToParent(source, sourceType) {
    if (sourceType === "image") {
      const parentAssetArray = this._parent["images"];
      const isInParent = parentAssetArray.find((element) => element.src === source.src);
      !isInParent && parentAssetArray.push(source);
    } else if (sourceType === "video") {
      const parentAssetArray = this._parent["videos"];
      const isInParent = parentAssetArray.find((element) => element.src === source.src);
      !isInParent && parentAssetArray.push(source);
    } else if (sourceType === "canvas") {
      const parentAssetArray = this._parent["canvases"];
      const isInParent = parentAssetArray.find((element) => element.isSameNode(source));
      !isInParent && parentAssetArray.push(source);
    }
  }
  _addToParent(texture, source, sourceType) {
    this._addSourceToParent(source, sourceType);
    this._parent && texture.addParent(this._parent);
  }
}

// js/src/core/Mesh.js
class Mesh {
  constructor(renderer, type = "Mesh", {
    vertexShaderID,
    fragmentShaderID,
    vertexShader,
    fragmentShader,
    uniforms = {},
    widthSegments = 1,
    heightSegments = 1,
    renderOrder = 0,
    depthTest = true,
    cullFace = "back",
    texturesOptions = {},
    crossOrigin = "anonymous"
  } = {}) {
    this.type = type;
    renderer = renderer && renderer.renderer || renderer;
    if (!renderer || renderer.type !== "Renderer") {
      throwError(this.type + ": Curtains not passed as first argument or Curtains Renderer is missing", renderer);
      setTimeout(() => {
        if (this._onErrorCallback) {
          this._onErrorCallback();
        }
      }, 0);
    }
    this.renderer = renderer;
    this.gl = this.renderer.gl;
    if (!this.gl) {
      if (!this.renderer.production)
        throwError(this.type + ": Unable to create a " + this.type + " because the Renderer WebGL context is not defined");
      setTimeout(() => {
        if (this._onErrorCallback) {
          this._onErrorCallback();
        }
      }, 0);
      return;
    }
    this._canDraw = false;
    this.renderOrder = renderOrder;
    this._depthTest = depthTest;
    this.cullFace = cullFace;
    if (this.cullFace !== "back" && this.cullFace !== "front" && this.cullFace !== "none") {
      this.cullFace = "back";
    }
    this.textures = [];
    this._texturesOptions = Object.assign({
      premultiplyAlpha: false,
      anisotropy: 1,
      floatingPoint: "none",
      wrapS: this.gl.CLAMP_TO_EDGE,
      wrapT: this.gl.CLAMP_TO_EDGE,
      minFilter: this.gl.LINEAR,
      magFilter: this.gl.LINEAR
    }, texturesOptions);
    this.crossOrigin = crossOrigin;
    if (!vertexShader && vertexShaderID && document.getElementById(vertexShaderID)) {
      vertexShader = document.getElementById(vertexShaderID).innerHTML;
    }
    if (!fragmentShader && fragmentShaderID && document.getElementById(fragmentShaderID)) {
      fragmentShader = document.getElementById(fragmentShaderID).innerHTML;
    }
    this._initMesh();
    widthSegments = parseInt(widthSegments);
    heightSegments = parseInt(heightSegments);
    this._geometry = new Geometry(this.renderer, {
      width: widthSegments,
      height: heightSegments
    });
    this._program = new Program(this.renderer, {
      parent: this,
      vertexShader,
      fragmentShader
    });
    if (this._program.compiled) {
      this._program.createUniforms(uniforms);
      this.uniforms = this._program.uniformsManager.uniforms;
      this._geometry.setProgram(this._program);
      this.renderer.onSceneChange();
    } else {
      this.renderer.nextRender.add(() => this._onErrorCallback && this._onErrorCallback());
    }
  }
  _initMesh() {
    this.uuid = generateUUID();
    this.loader = new PlaneTextureLoader(this.renderer, this, {
      sourcesLoaded: 0,
      initSourcesToLoad: 0,
      complete: false,
      onComplete: () => {
        this._onReadyCallback && this._onReadyCallback();
        this.renderer.needRender();
      }
    });
    this.images = [];
    this.videos = [];
    this.canvases = [];
    this.userData = {};
    this._canDraw = true;
  }
  _restoreContext() {
    this._canDraw = false;
    if (this._matrices) {
      this._matrices = null;
    }
    this._program = new Program(this.renderer, {
      parent: this,
      vertexShader: this._program.vsCode,
      fragmentShader: this._program.fsCode
    });
    if (this._program.compiled) {
      this._geometry.restoreContext(this._program);
      this._program.createUniforms(this.uniforms);
      this.uniforms = this._program.uniformsManager.uniforms;
      this._programRestored();
    }
  }
  setRenderTarget(renderTarget) {
    if (!renderTarget || renderTarget.type !== "RenderTarget") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Could not set the render target because the argument passed is not a RenderTarget class object", renderTarget);
      }
      return;
    }
    if (this.type === "Plane") {
      this.renderer.scene.removePlane(this);
    }
    this.target = renderTarget;
    if (this.type === "Plane") {
      this.renderer.scene.addPlane(this);
    }
  }
  setRenderOrder(renderOrder = 0) {
    renderOrder = isNaN(renderOrder) ? this.renderOrder : parseInt(renderOrder);
    if (renderOrder !== this.renderOrder) {
      this.renderOrder = renderOrder;
      this.renderer.scene.setPlaneRenderOrder(this);
    }
  }
  createTexture(textureOptions = {}) {
    const texture = new Texture(this.renderer, Object.assign(textureOptions, this._texturesOptions));
    texture.addParent(this);
    return texture;
  }
  addTexture(texture) {
    if (!texture || texture.type !== "Texture") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": cannot add ", texture, " to this " + this.type + " because it is not a valid texture");
      }
      return;
    }
    texture.addParent(this);
  }
  loadSources(sourcesArray, texturesOptions = {}, successCallback, errorCallback) {
    for (let i = 0;i < sourcesArray.length; i++) {
      this.loadSource(sourcesArray[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadSource(source, textureOptions = {}, successCallback, errorCallback) {
    this.loader.loadSource(source, Object.assign(textureOptions, this._texturesOptions), (texture) => {
      successCallback && successCallback(texture);
    }, (source2, error) => {
      if (!this.renderer.production) {
        throwWarning(this.type + ": this HTML tag could not be converted into a texture:", source2.tagName);
      }
      errorCallback && errorCallback(source2, error);
    });
  }
  loadImage(source, textureOptions = {}, successCallback, errorCallback) {
    this.loader.loadImage(source, Object.assign(textureOptions, this._texturesOptions), (texture) => {
      successCallback && successCallback(texture);
    }, (source2, error) => {
      if (!this.renderer.production) {
        throwWarning(this.type + ": There has been an error:\n", error, "\nwhile loading this image:\n", source2);
      }
      errorCallback && errorCallback(source2, error);
    });
  }
  loadVideo(source, textureOptions = {}, successCallback, errorCallback) {
    this.loader.loadVideo(source, Object.assign(textureOptions, this._texturesOptions), (texture) => {
      successCallback && successCallback(texture);
    }, (source2, error) => {
      if (!this.renderer.production) {
        throwWarning(this.type + ": There has been an error:\n", error, "\nwhile loading this video:\n", source2);
      }
      errorCallback && errorCallback(source2, error);
    });
  }
  loadCanvas(source, textureOptions = {}, successCallback) {
    this.loader.loadCanvas(source, Object.assign(textureOptions, this._texturesOptions), (texture) => {
      successCallback && successCallback(texture);
    });
  }
  loadImages(imagesArray, texturesOptions = {}, successCallback, errorCallback) {
    for (let i = 0;i < imagesArray.length; i++) {
      this.loadImage(imagesArray[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadVideos(videosArray, texturesOptions = {}, successCallback, errorCallback) {
    for (let i = 0;i < videosArray.length; i++) {
      this.loadVideo(videosArray[i], texturesOptions, successCallback, errorCallback);
    }
  }
  loadCanvases(canvasesArray, texturesOptions = {}, successCallback) {
    for (let i = 0;i < canvasesArray.length; i++) {
      this.loadCanvas(canvasesArray[i], texturesOptions, successCallback);
    }
  }
  playVideos() {
    for (let i = 0;i < this.textures.length; i++) {
      const texture = this.textures[i];
      if (texture.sourceType === "video") {
        const playPromise = texture.source.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            if (!this.renderer.production)
              throwWarning(this.type + ": Could not play the video : ", error);
          });
        }
      }
    }
  }
  _draw() {
    this.renderer.setDepthTest(this._depthTest);
    this.renderer.setFaceCulling(this.cullFace);
    this._program.updateUniforms();
    this._geometry.bindBuffers();
    this.renderer.state.forceBufferUpdate = false;
    for (let i = 0;i < this.textures.length; i++) {
      this.textures[i]._draw();
      if (this.textures[i]._sampler.isActive && !this.textures[i]._sampler.isTextureBound) {
        return;
      }
    }
    this._geometry.draw();
    this.renderer.state.activeTexture = null;
    this._onAfterRenderCallback && this._onAfterRenderCallback();
  }
  onError(callback) {
    if (callback) {
      this._onErrorCallback = callback;
    }
    return this;
  }
  onLoading(callback) {
    if (callback) {
      this._onLoadingCallback = callback;
    }
    return this;
  }
  onReady(callback) {
    if (callback) {
      this._onReadyCallback = callback;
    }
    return this;
  }
  onRender(callback) {
    if (callback) {
      this._onRenderCallback = callback;
    }
    return this;
  }
  onAfterRender(callback) {
    if (callback) {
      this._onAfterRenderCallback = callback;
    }
    return this;
  }
  remove() {
    this._canDraw = false;
    if (this.target) {
      this.renderer.bindFrameBuffer(null);
    }
    this._dispose();
    if (this.type === "Plane") {
      this.renderer.removePlane(this);
    } else if (this.type === "ShaderPass") {
      if (this.target) {
        this.target._shaderPass = null;
        this.target.remove();
        this.target = null;
      }
      this.renderer.removeShaderPass(this);
    }
  }
  _dispose() {
    if (this.gl) {
      this._geometry && this._geometry.dispose();
      if (this.target && this.type === "ShaderPass") {
        this.renderer.removeRenderTarget(this.target);
        this.textures.shift();
      }
      for (let i = 0;i < this.textures.length; i++) {
        this.textures[i]._dispose();
      }
      this.textures = [];
    }
  }
}

// js/src/core/DOMMesh.js
var tempVec2a = new Vec2;
var tempVec2b = new Vec2;

class DOMMesh extends Mesh {
  constructor(renderer, htmlElement, type = "DOMMesh", {
    widthSegments,
    heightSegments,
    renderOrder,
    depthTest,
    cullFace,
    uniforms,
    vertexShaderID,
    fragmentShaderID,
    vertexShader,
    fragmentShader,
    texturesOptions,
    crossOrigin
  } = {}) {
    vertexShaderID = vertexShaderID || htmlElement && htmlElement.getAttribute("data-vs-id");
    fragmentShaderID = fragmentShaderID || htmlElement && htmlElement.getAttribute("data-fs-id");
    super(renderer, type, {
      widthSegments,
      heightSegments,
      renderOrder,
      depthTest,
      cullFace,
      uniforms,
      vertexShaderID,
      fragmentShaderID,
      vertexShader,
      fragmentShader,
      texturesOptions,
      crossOrigin
    });
    if (!this.gl) {
      return;
    }
    this.htmlElement = htmlElement;
    if (!this.htmlElement || this.htmlElement.length === 0) {
      if (!this.renderer.production)
        throwWarning(this.type + ": The HTML element you specified does not currently exists in the DOM");
    }
    this._setDocumentSizes();
  }
  _setDocumentSizes() {
    let planeBoundingRect = this.htmlElement.getBoundingClientRect();
    if (!this._boundingRect)
      this._boundingRect = {};
    this._boundingRect.document = {
      width: planeBoundingRect.width * this.renderer.pixelRatio,
      height: planeBoundingRect.height * this.renderer.pixelRatio,
      top: planeBoundingRect.top * this.renderer.pixelRatio,
      left: planeBoundingRect.left * this.renderer.pixelRatio
    };
  }
  getBoundingRect() {
    return {
      width: this._boundingRect.document.width,
      height: this._boundingRect.document.height,
      top: this._boundingRect.document.top,
      left: this._boundingRect.document.left,
      right: this._boundingRect.document.left + this._boundingRect.document.width,
      bottom: this._boundingRect.document.top + this._boundingRect.document.height
    };
  }
  resize() {
    this._setDocumentSizes();
    if (this.type === "Plane") {
      this.setPerspective(this.camera.fov, this.camera.near, this.camera.far);
      this._setWorldSizes();
      this._applyWorldPositions();
    }
    for (let i = 0;i < this.textures.length; i++) {
      this.textures[i].resize();
    }
    this.renderer.nextRender.add(() => this._onAfterResizeCallback && this._onAfterResizeCallback());
  }
  mouseToPlaneCoords(mouseCoordinates) {
    const scale2 = this.scale ? this.scale : tempVec2b.set(1, 1);
    const scaleAdjustment = tempVec2a.set((this._boundingRect.document.width - this._boundingRect.document.width * scale2.x) / 2, (this._boundingRect.document.height - this._boundingRect.document.height * scale2.y) / 2);
    const planeBoundingRect = {
      width: this._boundingRect.document.width * scale2.x / this.renderer.pixelRatio,
      height: this._boundingRect.document.height * scale2.y / this.renderer.pixelRatio,
      top: (this._boundingRect.document.top + scaleAdjustment.y) / this.renderer.pixelRatio,
      left: (this._boundingRect.document.left + scaleAdjustment.x) / this.renderer.pixelRatio
    };
    return tempVec2a.set((mouseCoordinates.x - planeBoundingRect.left) / planeBoundingRect.width * 2 - 1, 1 - (mouseCoordinates.y - planeBoundingRect.top) / planeBoundingRect.height * 2);
  }
  onAfterResize(callback) {
    if (callback) {
      this._onAfterResizeCallback = callback;
    }
    return this;
  }
}

// js/src/camera/Camera.js
class Camera {
  constructor({
    fov = 50,
    near = 0.1,
    far = 150,
    width,
    height,
    pixelRatio = 1
  } = {}) {
    this.position = new Vec3;
    this.projectionMatrix = new Mat4;
    this.worldMatrix = new Mat4;
    this.viewMatrix = new Mat4;
    this._shouldUpdate = false;
    this.setSize();
    this.setPerspective(fov, near, far, width, height, pixelRatio);
  }
  setFov(fov) {
    fov = isNaN(fov) ? this.fov : parseFloat(fov);
    fov = Math.max(1, Math.min(fov, 179));
    if (fov !== this.fov) {
      this.fov = fov;
      this.setPosition();
      this._shouldUpdate = true;
    }
    this.setCSSPerspective();
  }
  setNear(near) {
    near = isNaN(near) ? this.near : parseFloat(near);
    near = Math.max(near, 0.01);
    if (near !== this.near) {
      this.near = near;
      this._shouldUpdate = true;
    }
  }
  setFar(far) {
    far = isNaN(far) ? this.far : parseFloat(far);
    far = Math.max(far, 50);
    if (far !== this.far) {
      this.far = far;
      this._shouldUpdate = true;
    }
  }
  setPixelRatio(pixelRatio) {
    if (pixelRatio !== this.pixelRatio) {
      this._shouldUpdate = true;
    }
    this.pixelRatio = pixelRatio;
  }
  setSize(width, height) {
    if (width !== this.width || height !== this.height) {
      this._shouldUpdate = true;
    }
    this.width = width;
    this.height = height;
  }
  setPerspective(fov, near, far, width, height, pixelRatio) {
    this.setPixelRatio(pixelRatio);
    this.setSize(width, height);
    this.setFov(fov);
    this.setNear(near);
    this.setFar(far);
    if (this._shouldUpdate) {
      this.updateProjectionMatrix();
    }
  }
  setPosition() {
    this.position.set(0, 0, 1);
    this.worldMatrix.setFromArray([
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
      0,
      this.position.x,
      this.position.y,
      this.position.z,
      1
    ]);
    this.viewMatrix = this.viewMatrix.copy(this.worldMatrix).getInverse();
  }
  setCSSPerspective() {
    this.CSSPerspective = Math.pow(Math.pow(this.width / (2 * this.pixelRatio), 2) + Math.pow(this.height / (2 * this.pixelRatio), 2), 0.5) / Math.tan(this.fov * 0.5 * Math.PI / 180);
  }
  getScreenRatiosFromFov(depth = 0) {
    const cameraOffset = this.position.z;
    if (depth < cameraOffset) {
      depth -= cameraOffset;
    } else {
      depth += cameraOffset;
    }
    const vFOV = this.fov * Math.PI / 180;
    const height = 2 * Math.tan(vFOV / 2) * Math.abs(depth);
    return {
      width: height * this.width / this.height,
      height
    };
  }
  updateProjectionMatrix() {
    const aspect = this.width / this.height;
    const top = this.near * Math.tan(Math.PI / 180 * 0.5 * this.fov);
    const height = 2 * top;
    const width = aspect * height;
    const left = -0.5 * width;
    const right = left + width;
    const bottom = top - height;
    const x = 2 * this.near / (right - left);
    const y = 2 * this.near / (top - bottom);
    const a = (right + left) / (right - left);
    const b = (top + bottom) / (top - bottom);
    const c = -(this.far + this.near) / (this.far - this.near);
    const d = -2 * this.far * this.near / (this.far - this.near);
    this.projectionMatrix.setFromArray([
      x,
      0,
      0,
      0,
      0,
      y,
      0,
      0,
      a,
      b,
      c,
      -1,
      0,
      0,
      d,
      0
    ]);
  }
  forceUpdate() {
    this._shouldUpdate = true;
  }
  cancelUpdate() {
    this._shouldUpdate = false;
  }
}

// js/src/math/Quat.js
class Quat {
  constructor(elements = new Float32Array([0, 0, 0, 1]), axisOrder = "XYZ") {
    this.type = "Quat";
    this.elements = elements;
    this.axisOrder = axisOrder;
  }
  setFromArray(array) {
    this.elements[0] = array[0];
    this.elements[1] = array[1];
    this.elements[2] = array[2];
    this.elements[3] = array[3];
    return this;
  }
  setAxisOrder(axisOrder) {
    axisOrder = axisOrder.toUpperCase();
    switch (axisOrder) {
      case "XYZ":
      case "YXZ":
      case "ZXY":
      case "ZYX":
      case "YZX":
      case "XZY":
        this.axisOrder = axisOrder;
        break;
      default:
        this.axisOrder = "XYZ";
    }
    return this;
  }
  copy(quaternion) {
    this.elements = quaternion.elements;
    this.axisOrder = quaternion.axisOrder;
    return this;
  }
  clone() {
    return new Quat().copy(this);
  }
  equals(quaternion) {
    return this.elements[0] === quaternion.elements[0] && this.elements[1] === quaternion.elements[1] && this.elements[2] === quaternion.elements[2] && this.elements[3] === quaternion.elements[3] && this.axisOrder === quaternion.axisOrder;
  }
  setFromVec3(vector) {
    const ax = vector.x * 0.5;
    const ay = vector.y * 0.5;
    const az = vector.z * 0.5;
    const cosx = Math.cos(ax);
    const cosy = Math.cos(ay);
    const cosz = Math.cos(az);
    const sinx = Math.sin(ax);
    const siny = Math.sin(ay);
    const sinz = Math.sin(az);
    if (this.axisOrder === "XYZ") {
      this.elements[0] = sinx * cosy * cosz + cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz - sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz + sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz - sinx * siny * sinz;
    } else if (this.axisOrder === "YXZ") {
      this.elements[0] = sinx * cosy * cosz + cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz - sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz - sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz + sinx * siny * sinz;
    } else if (this.axisOrder === "ZXY") {
      this.elements[0] = sinx * cosy * cosz - cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz + sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz + sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz - sinx * siny * sinz;
    } else if (this.axisOrder === "ZYX") {
      this.elements[0] = sinx * cosy * cosz - cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz + sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz - sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz + sinx * siny * sinz;
    } else if (this.axisOrder === "YZX") {
      this.elements[0] = sinx * cosy * cosz + cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz + sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz - sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz - sinx * siny * sinz;
    } else if (this.axisOrder === "XZY") {
      this.elements[0] = sinx * cosy * cosz - cosx * siny * sinz;
      this.elements[1] = cosx * siny * cosz - sinx * cosy * sinz;
      this.elements[2] = cosx * cosy * sinz + sinx * siny * cosz;
      this.elements[3] = cosx * cosy * cosz + sinx * siny * sinz;
    }
    return this;
  }
}

// js/src/core/Plane.js
var tempScale = new Vec2;
var tempWorldPos1 = new Vec3;
var tempWorldPos2 = new Vec3;
var tempCorner1 = new Vec3;
var tempCorner2 = new Vec3;
var tempCorner3 = new Vec3;
var tempCorner4 = new Vec3;
var tempCulledCorner1 = new Vec3;
var tempCulledCorner2 = new Vec3;
var identityQuat = new Quat;
var defaultTransformOrigin = new Vec3(0.5, 0.5, 0);
var tempRayDirection = new Vec3;
var tempNormals = new Vec3;
var tempRotatedOrigin = new Vec3;
var tempRaycast = new Vec3;
var castedMouseCoords = new Vec2;

class Plane extends DOMMesh {
  constructor(renderer, htmlElement, {
    widthSegments,
    heightSegments,
    renderOrder,
    depthTest,
    cullFace,
    uniforms,
    vertexShaderID,
    fragmentShaderID,
    vertexShader,
    fragmentShader,
    texturesOptions,
    crossOrigin,
    alwaysDraw = false,
    visible = true,
    transparent = false,
    drawCheckMargins = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    },
    autoloadSources = true,
    watchScroll = true,
    fov = 50
  } = {}) {
    super(renderer, htmlElement, "Plane", {
      widthSegments,
      heightSegments,
      renderOrder,
      depthTest,
      cullFace,
      uniforms,
      vertexShaderID,
      fragmentShaderID,
      vertexShader,
      fragmentShader,
      texturesOptions,
      crossOrigin
    });
    if (!this.gl) {
      return;
    }
    this.index = this.renderer.planes.length;
    this.target = null;
    this.alwaysDraw = alwaysDraw;
    this._shouldDraw = true;
    this.visible = visible;
    this._transparent = transparent;
    this.drawCheckMargins = drawCheckMargins;
    this.autoloadSources = autoloadSources;
    this.watchScroll = watchScroll;
    this._updateMVMatrix = false;
    this.camera = new Camera({
      fov,
      width: this.renderer._boundingRect.width,
      height: this.renderer._boundingRect.height,
      pixelRatio: this.renderer.pixelRatio
    });
    if (this._program.compiled) {
      this._initPlane();
      this.renderer.scene.addPlane(this);
      this.renderer.planes.push(this);
    }
  }
  _programRestored() {
    if (this.target) {
      this.setRenderTarget(this.renderer.renderTargets[this.target.index]);
    }
    this._initMatrices();
    this.setPerspective(this.camera.fov, this.camera.near, this.camera.far);
    this._setWorldSizes();
    this._applyWorldPositions();
    this.renderer.scene.addPlane(this);
    for (let i = 0;i < this.textures.length; i++) {
      this.textures[i]._parent = this;
      this.textures[i]._restoreContext();
    }
    this._canDraw = true;
  }
  _initPlane() {
    this._initTransformValues();
    this._initPositions();
    this.setPerspective(this.camera.fov, this.camera.near, this.camera.far);
    this._initSources();
  }
  _initTransformValues() {
    this.rotation = new Vec3;
    this.rotation.onChange(() => this._applyRotation());
    this.quaternion = new Quat;
    this.relativeTranslation = new Vec3;
    this.relativeTranslation.onChange(() => this._setTranslation());
    this._translation = new Vec3;
    this.scale = new Vec3(1);
    this.scale.onChange(() => {
      this.scale.z = 1;
      this._applyScale();
    });
    this.transformOrigin = new Vec3(0.5, 0.5, 0);
    this.transformOrigin.onChange(() => {
      this._setWorldTransformOrigin();
      this._updateMVMatrix = true;
    });
  }
  resetPlane(htmlElement) {
    this._initTransformValues();
    this._setWorldTransformOrigin();
    if (htmlElement !== null && !!htmlElement) {
      this.htmlElement = htmlElement;
      this.resize();
    } else if (!htmlElement && !this.renderer.production) {
      throwWarning(this.type + ": You are trying to reset a plane with a HTML element that does not exist. The old HTML element will be kept instead.");
    }
  }
  removeRenderTarget() {
    if (this.target) {
      this.renderer.scene.removePlane(this);
      this.target = null;
      this.renderer.scene.addPlane(this);
    }
  }
  _initPositions() {
    this._initMatrices();
    this._setWorldSizes();
    this._applyWorldPositions();
  }
  _initMatrices() {
    const matrix = new Mat4;
    this._matrices = {
      world: {
        matrix
      },
      modelView: {
        name: "uMVMatrix",
        matrix,
        location: this.gl.getUniformLocation(this._program.program, "uMVMatrix")
      },
      projection: {
        name: "uPMatrix",
        matrix,
        location: this.gl.getUniformLocation(this._program.program, "uPMatrix")
      },
      modelViewProjection: {
        matrix
      }
    };
  }
  _setPerspectiveMatrix() {
    if (this.camera._shouldUpdate) {
      this.renderer.useProgram(this._program);
      this.gl.uniformMatrix4fv(this._matrices.projection.location, false, this._matrices.projection.matrix.elements);
    }
    this.camera.cancelUpdate();
  }
  setPerspective(fov, near, far) {
    this.camera.setPerspective(fov, near, far, this.renderer._boundingRect.width, this.renderer._boundingRect.height, this.renderer.pixelRatio);
    if (this.renderer.state.isContextLost) {
      this.camera.forceUpdate();
    }
    this._matrices.projection.matrix = this.camera.projectionMatrix;
    if (this.camera._shouldUpdate) {
      this._setWorldSizes();
      this._applyWorldPositions();
      this._translation.z = this.relativeTranslation.z / this.camera.CSSPerspective;
    }
    this._updateMVMatrix = this.camera._shouldUpdate;
  }
  _setMVMatrix() {
    if (this._updateMVMatrix) {
      this._matrices.world.matrix = this._matrices.world.matrix.composeFromOrigin(this._translation, this.quaternion, this.scale, this._boundingRect.world.transformOrigin);
      this._matrices.world.matrix.scale({
        x: this._boundingRect.world.width,
        y: this._boundingRect.world.height,
        z: 1
      });
      this._matrices.modelView.matrix.copy(this._matrices.world.matrix);
      this._matrices.modelView.matrix.elements[14] -= this.camera.position.z;
      this._matrices.modelViewProjection.matrix = this._matrices.projection.matrix.multiply(this._matrices.modelView.matrix);
      if (!this.alwaysDraw) {
        this._shouldDrawCheck();
      }
      this.renderer.useProgram(this._program);
      this.gl.uniformMatrix4fv(this._matrices.modelView.location, false, this._matrices.modelView.matrix.elements);
    }
    this._updateMVMatrix = false;
  }
  _setWorldTransformOrigin() {
    this._boundingRect.world.transformOrigin = new Vec3((this.transformOrigin.x * 2 - 1) * this._boundingRect.world.width, -(this.transformOrigin.y * 2 - 1) * this._boundingRect.world.height, this.transformOrigin.z);
  }
  _documentToWorldSpace(vector) {
    return tempWorldPos2.set(vector.x * this.renderer.pixelRatio / this.renderer._boundingRect.width * this._boundingRect.world.ratios.width, -(vector.y * this.renderer.pixelRatio / this.renderer._boundingRect.height) * this._boundingRect.world.ratios.height, vector.z);
  }
  _setWorldSizes() {
    const ratios = this.camera.getScreenRatiosFromFov();
    this._boundingRect.world = {
      width: this._boundingRect.document.width / this.renderer._boundingRect.width * ratios.width / 2,
      height: this._boundingRect.document.height / this.renderer._boundingRect.height * ratios.height / 2,
      ratios
    };
    this._setWorldTransformOrigin();
  }
  _setWorldPosition() {
    const planeCenter = {
      x: this._boundingRect.document.width / 2 + this._boundingRect.document.left,
      y: this._boundingRect.document.height / 2 + this._boundingRect.document.top
    };
    const containerCenter = {
      x: this.renderer._boundingRect.width / 2 + this.renderer._boundingRect.left,
      y: this.renderer._boundingRect.height / 2 + this.renderer._boundingRect.top
    };
    this._boundingRect.world.top = (containerCenter.y - planeCenter.y) / this.renderer._boundingRect.height * this._boundingRect.world.ratios.height;
    this._boundingRect.world.left = (planeCenter.x - containerCenter.x) / this.renderer._boundingRect.width * this._boundingRect.world.ratios.width;
  }
  setScale(scale2) {
    if (!scale2.type || scale2.type !== "Vec2") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set scale because the parameter passed is not of Vec2 type:", scale2);
      }
      return;
    }
    scale2.sanitizeNaNValuesWith(this.scale).max(tempScale.set(0.001, 0.001));
    if (scale2.x !== this.scale.x || scale2.y !== this.scale.y) {
      this.scale.set(scale2.x, scale2.y, 1);
      this._applyScale();
    }
  }
  _applyScale() {
    for (let i = 0;i < this.textures.length; i++) {
      this.textures[i].resize();
    }
    this._updateMVMatrix = true;
  }
  setRotation(rotation) {
    if (!rotation.type || rotation.type !== "Vec3") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set rotation because the parameter passed is not of Vec3 type:", rotation);
      }
      return;
    }
    rotation.sanitizeNaNValuesWith(this.rotation);
    if (!rotation.equals(this.rotation)) {
      this.rotation.copy(rotation);
      this._applyRotation();
    }
  }
  _applyRotation() {
    this.quaternion.setFromVec3(this.rotation);
    this._updateMVMatrix = true;
  }
  setTransformOrigin(origin) {
    if (!origin.type || origin.type !== "Vec3") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set transform origin because the parameter passed is not of Vec3 type:", origin);
      }
      return;
    }
    origin.sanitizeNaNValuesWith(this.transformOrigin);
    if (!origin.equals(this.transformOrigin)) {
      this.transformOrigin.copy(origin);
      this._setWorldTransformOrigin();
      this._updateMVMatrix = true;
    }
  }
  _setTranslation() {
    let worldPosition = tempWorldPos1.set(0, 0, 0);
    if (!this.relativeTranslation.equals(worldPosition)) {
      worldPosition = this._documentToWorldSpace(this.relativeTranslation);
    }
    this._translation.set(this._boundingRect.world.left + worldPosition.x, this._boundingRect.world.top + worldPosition.y, this.relativeTranslation.z / this.camera.CSSPerspective);
    this._updateMVMatrix = true;
  }
  setRelativeTranslation(translation) {
    if (!translation.type || translation.type !== "Vec3") {
      if (!this.renderer.production) {
        throwWarning(this.type + ": Cannot set translation because the parameter passed is not of Vec3 type:", translation);
      }
      return;
    }
    translation.sanitizeNaNValuesWith(this.relativeTranslation);
    if (!translation.equals(this.relativeTranslation)) {
      this.relativeTranslation.copy(translation);
      this._setTranslation();
    }
  }
  _applyWorldPositions() {
    this._setWorldPosition();
    this._setTranslation();
  }
  updatePosition() {
    this._setDocumentSizes();
    this._applyWorldPositions();
  }
  updateScrollPosition(lastXDelta, lastYDelta) {
    if (lastXDelta || lastYDelta) {
      this._boundingRect.document.top += lastYDelta * this.renderer.pixelRatio;
      this._boundingRect.document.left += lastXDelta * this.renderer.pixelRatio;
      this._applyWorldPositions();
    }
  }
  _getIntersection(refPoint, secondPoint) {
    let direction = secondPoint.clone().sub(refPoint);
    let intersection = refPoint.clone();
    while (intersection.z > -1) {
      intersection.add(direction);
    }
    return intersection;
  }
  _getNearPlaneIntersections(corners, mvpCorners, clippedCorners) {
    const mVPMatrix = this._matrices.modelViewProjection.matrix;
    if (clippedCorners.length === 1) {
      if (clippedCorners[0] === 0) {
        mvpCorners[0] = this._getIntersection(mvpCorners[1], tempCulledCorner1.set(0.95, 1, 0).applyMat4(mVPMatrix));
        mvpCorners.push(this._getIntersection(mvpCorners[3], tempCulledCorner2.set(-1, -0.95, 0).applyMat4(mVPMatrix)));
      } else if (clippedCorners[0] === 1) {
        mvpCorners[1] = this._getIntersection(mvpCorners[0], tempCulledCorner1.set(-0.95, 1, 0).applyMat4(mVPMatrix));
        mvpCorners.push(this._getIntersection(mvpCorners[2], tempCulledCorner2.set(1, -0.95, 0).applyMat4(mVPMatrix)));
      } else if (clippedCorners[0] === 2) {
        mvpCorners[2] = this._getIntersection(mvpCorners[3], tempCulledCorner1.set(-0.95, -1, 0).applyMat4(mVPMatrix));
        mvpCorners.push(this._getIntersection(mvpCorners[1], tempCulledCorner2.set(1, 0.95, 0).applyMat4(mVPMatrix)));
      } else if (clippedCorners[0] === 3) {
        mvpCorners[3] = this._getIntersection(mvpCorners[2], tempCulledCorner1.set(0.95, -1, 0).applyMat4(mVPMatrix));
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner2.set(-1, 0.95, 0).applyMat4(mVPMatrix)));
      }
    } else if (clippedCorners.length === 2) {
      if (clippedCorners[0] === 0 && clippedCorners[1] === 1) {
        mvpCorners[0] = this._getIntersection(mvpCorners[3], tempCulledCorner1.set(-1, -0.95, 0).applyMat4(mVPMatrix));
        mvpCorners[1] = this._getIntersection(mvpCorners[2], tempCulledCorner2.set(1, -0.95, 0).applyMat4(mVPMatrix));
      } else if (clippedCorners[0] === 1 && clippedCorners[1] === 2) {
        mvpCorners[1] = this._getIntersection(mvpCorners[0], tempCulledCorner1.set(-0.95, 1, 0).applyMat4(mVPMatrix));
        mvpCorners[2] = this._getIntersection(mvpCorners[3], tempCulledCorner2.set(-0.95, -1, 0).applyMat4(mVPMatrix));
      } else if (clippedCorners[0] === 2 && clippedCorners[1] === 3) {
        mvpCorners[2] = this._getIntersection(mvpCorners[1], tempCulledCorner1.set(1, 0.95, 0).applyMat4(mVPMatrix));
        mvpCorners[3] = this._getIntersection(mvpCorners[0], tempCulledCorner2.set(-1, 0.95, 0).applyMat4(mVPMatrix));
      } else if (clippedCorners[0] === 0 && clippedCorners[1] === 3) {
        mvpCorners[0] = this._getIntersection(mvpCorners[1], tempCulledCorner1.set(0.95, 1, 0).applyMat4(mVPMatrix));
        mvpCorners[3] = this._getIntersection(mvpCorners[2], tempCulledCorner2.set(0.95, -1, 0).applyMat4(mVPMatrix));
      }
    } else if (clippedCorners.length === 3) {
      let nonClippedCorner = 0;
      for (let i = 0;i < corners.length; i++) {
        if (!clippedCorners.includes(i)) {
          nonClippedCorner = i;
        }
      }
      mvpCorners = [
        mvpCorners[nonClippedCorner]
      ];
      if (nonClippedCorner === 0) {
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner1.set(-0.95, 1, 0).applyMat4(mVPMatrix)));
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner2.set(-1, 0.95, 0).applyMat4(mVPMatrix)));
      } else if (nonClippedCorner === 1) {
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner1.set(0.95, 1, 0).applyMat4(mVPMatrix)));
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner2.set(1, 0.95, 0).applyMat4(mVPMatrix)));
      } else if (nonClippedCorner === 2) {
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner1.set(0.95, -1, 0).applyMat4(mVPMatrix)));
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner2.set(1, -0.95, 0).applyMat4(mVPMatrix)));
      } else if (nonClippedCorner === 3) {
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner1.set(-0.95, -1, 0).applyMat4(mVPMatrix)));
        mvpCorners.push(this._getIntersection(mvpCorners[0], tempCulledCorner2.set(-1 - 0.95, 0).applyMat4(mVPMatrix)));
      }
    } else {
      for (let i = 0;i < corners.length; i++) {
        mvpCorners[i][0] = 1e4;
        mvpCorners[i][1] = 1e4;
      }
    }
    return mvpCorners;
  }
  _getWorldCoords() {
    const corners = [
      tempCorner1.set(-1, 1, 0),
      tempCorner2.set(1, 1, 0),
      tempCorner3.set(1, -1, 0),
      tempCorner4.set(-1, -1, 0)
    ];
    let mvpCorners = [];
    let clippedCorners = [];
    for (let i = 0;i < corners.length; i++) {
      const mvpCorner = corners[i].applyMat4(this._matrices.modelViewProjection.matrix);
      mvpCorners.push(mvpCorner);
      if (Math.abs(mvpCorner.z) > 1) {
        clippedCorners.push(i);
      }
    }
    if (clippedCorners.length) {
      mvpCorners = this._getNearPlaneIntersections(corners, mvpCorners, clippedCorners);
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0;i < mvpCorners.length; i++) {
      const corner = mvpCorners[i];
      if (corner.x < minX) {
        minX = corner.x;
      }
      if (corner.x > maxX) {
        maxX = corner.x;
      }
      if (corner.y < minY) {
        minY = corner.y;
      }
      if (corner.y > maxY) {
        maxY = corner.y;
      }
    }
    return {
      top: maxY,
      right: maxX,
      bottom: minY,
      left: minX
    };
  }
  _computeWebGLBoundingRect() {
    const worldBBox = this._getWorldCoords();
    let screenBBox = {
      top: 1 - (worldBBox.top + 1) / 2,
      right: (worldBBox.right + 1) / 2,
      bottom: 1 - (worldBBox.bottom + 1) / 2,
      left: (worldBBox.left + 1) / 2
    };
    screenBBox.width = screenBBox.right - screenBBox.left;
    screenBBox.height = screenBBox.bottom - screenBBox.top;
    this._boundingRect.worldToDocument = {
      width: screenBBox.width * this.renderer._boundingRect.width,
      height: screenBBox.height * this.renderer._boundingRect.height,
      top: screenBBox.top * this.renderer._boundingRect.height + this.renderer._boundingRect.top,
      left: screenBBox.left * this.renderer._boundingRect.width + this.renderer._boundingRect.left,
      right: screenBBox.left * this.renderer._boundingRect.width + this.renderer._boundingRect.left + screenBBox.width * this.renderer._boundingRect.width,
      bottom: screenBBox.top * this.renderer._boundingRect.height + this.renderer._boundingRect.top + screenBBox.height * this.renderer._boundingRect.height
    };
  }
  getWebGLBoundingRect() {
    if (!this._matrices.modelViewProjection) {
      return this._boundingRect.document;
    } else if (!this._boundingRect.worldToDocument || this.alwaysDraw) {
      this._computeWebGLBoundingRect();
    }
    return this._boundingRect.worldToDocument;
  }
  _getWebGLDrawRect() {
    this._computeWebGLBoundingRect();
    return {
      top: this._boundingRect.worldToDocument.top - this.drawCheckMargins.top,
      right: this._boundingRect.worldToDocument.right + this.drawCheckMargins.right,
      bottom: this._boundingRect.worldToDocument.bottom + this.drawCheckMargins.bottom,
      left: this._boundingRect.worldToDocument.left - this.drawCheckMargins.left
    };
  }
  _shouldDrawCheck() {
    const actualPlaneBounds = this._getWebGLDrawRect();
    if (Math.round(actualPlaneBounds.right) <= this.renderer._boundingRect.left || Math.round(actualPlaneBounds.left) >= this.renderer._boundingRect.left + this.renderer._boundingRect.width || Math.round(actualPlaneBounds.bottom) <= this.renderer._boundingRect.top || Math.round(actualPlaneBounds.top) >= this.renderer._boundingRect.top + this.renderer._boundingRect.height) {
      if (this._shouldDraw) {
        this._shouldDraw = false;
        this.renderer.nextRender.add(() => this._onLeaveViewCallback && this._onLeaveViewCallback());
      }
    } else {
      if (!this._shouldDraw) {
        this.renderer.nextRender.add(() => this._onReEnterViewCallback && this._onReEnterViewCallback());
      }
      this._shouldDraw = true;
    }
  }
  isDrawn() {
    return this._canDraw && this.visible && (this._shouldDraw || this.alwaysDraw);
  }
  enableDepthTest(shouldEnableDepthTest) {
    this._depthTest = shouldEnableDepthTest;
  }
  _initSources() {
    let loaderSize = 0;
    if (this.autoloadSources) {
      const images = this.htmlElement.getElementsByTagName("img");
      const videos = this.htmlElement.getElementsByTagName("video");
      const canvases = this.htmlElement.getElementsByTagName("canvas");
      if (images.length) {
        this.loadImages(images);
      }
      if (videos.length) {
        this.loadVideos(videos);
      }
      if (canvases.length) {
        this.loadCanvases(canvases);
      }
      loaderSize = images.length + videos.length + canvases.length;
    }
    this.loader._setLoaderSize(loaderSize);
    this._canDraw = true;
  }
  _startDrawing() {
    if (this._canDraw) {
      if (this._onRenderCallback) {
        this._onRenderCallback();
      }
      if (this.target) {
        this.renderer.bindFrameBuffer(this.target);
      } else if (this.renderer.state.scenePassIndex === null) {
        this.renderer.bindFrameBuffer(null);
      }
      this._setPerspectiveMatrix();
      this._setMVMatrix();
      if ((this.alwaysDraw || this._shouldDraw) && this.visible) {
        this._draw();
      }
    }
  }
  mouseToPlaneCoords(mouseCoordinates) {
    identityQuat.setAxisOrder(this.quaternion.axisOrder);
    if (identityQuat.equals(this.quaternion) && defaultTransformOrigin.equals(this.transformOrigin)) {
      return super.mouseToPlaneCoords(mouseCoordinates);
    } else {
      const worldMouse = {
        x: 2 * (mouseCoordinates.x / (this.renderer._boundingRect.width / this.renderer.pixelRatio)) - 1,
        y: 2 * (1 - mouseCoordinates.y / (this.renderer._boundingRect.height / this.renderer.pixelRatio)) - 1
      };
      const rayOrigin = this.camera.position.clone();
      const rayDirection = tempRayDirection.set(worldMouse.x, worldMouse.y, -0.5);
      rayDirection.unproject(this.camera);
      rayDirection.sub(rayOrigin).normalize();
      const planeNormals = tempNormals.set(0, 0, -1);
      planeNormals.applyQuat(this.quaternion).normalize();
      const result = tempRaycast.set(0, 0, 0);
      const denominator = planeNormals.dot(rayDirection);
      if (Math.abs(denominator) >= 0.0001) {
        const inverseViewMatrix = this._matrices.world.matrix.getInverse().multiply(this.camera.viewMatrix);
        const planeOrigin = this._boundingRect.world.transformOrigin.clone().add(this._translation);
        const rotatedOrigin = tempRotatedOrigin.set(this._translation.x - planeOrigin.x, this._translation.y - planeOrigin.y, this._translation.z - planeOrigin.z);
        rotatedOrigin.applyQuat(this.quaternion);
        planeOrigin.add(rotatedOrigin);
        const distance = planeNormals.dot(planeOrigin.clone().sub(rayOrigin)) / denominator;
        result.copy(rayOrigin.add(rayDirection.multiplyScalar(distance)));
        result.applyMat4(inverseViewMatrix);
      } else {
        result.set(Infinity, Infinity, Infinity);
      }
      return castedMouseCoords.set(result.x, result.y);
    }
  }
  onReEnterView(callback) {
    if (callback) {
      this._onReEnterViewCallback = callback;
    }
    return this;
  }
  onLeaveView(callback) {
    if (callback) {
      this._onLeaveViewCallback = callback;
    }
    return this;
  }
}
// js/video-plane.js
window.addEventListener("load", () => {
  const mousePosition = new Vec2;
  const mouseLastPosition = new Vec2;
  const deltas = {
    max: 0,
    applied: 0
  };
  const curtains = new Curtains({
    container: "canvas",
    watchScroll: false,
    pixelRatio: Math.min(1.5, window.devicePixelRatio)
  });
  curtains.onError(() => {
    document.body.classList.add("no-curtains", "curtains-ready");
    document.getElementById("enter-site").addEventListener("click", () => {
      document.body.classList.add("video-started");
      planeElements[0].getElementsByTagName("video")[0].play();
    }, false);
  }).onContextLost(() => {
    curtains.restoreContext();
  });
  const planeElements = document.getElementsByClassName("curtain");
  const vs = `
        precision mediump float;

        // default mandatory variables
        attribute vec3 aVertexPosition;
        attribute vec2 aTextureCoord;

        uniform mat4 uMVMatrix;
        uniform mat4 uPMatrix;
        
        // our texture matrix uniform
        uniform mat4 simplePlaneVideoTextureMatrix;

        // custom variables
        varying vec3 vVertexPosition;
        varying vec2 vTextureCoord;

        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uMousePosition;
        uniform float uMouseMoveStrength;


        void main() {

            vec3 vertexPosition = aVertexPosition;

            // get the distance between our vertex and the mouse position
            float distanceFromMouse = distance(uMousePosition, vec2(vertexPosition.x, vertexPosition.y));

            // calculate our wave effect
            float waveSinusoid = cos(5.0 * (distanceFromMouse - (uTime / 75.0)));

            // attenuate the effect based on mouse distance
            float distanceStrength = (0.4 / (distanceFromMouse + 0.4));

            // calculate our distortion effect
            float distortionEffect = distanceStrength * waveSinusoid * uMouseMoveStrength;

            // apply it to our vertex position
            vertexPosition.z +=  distortionEffect / 30.0;
            vertexPosition.x +=  (distortionEffect / 50.0 * (uResolution.x / uResolution.y) * (uMousePosition.x - vertexPosition.x));
            vertexPosition.y +=  distortionEffect / 50.0 * (uMousePosition.y - vertexPosition.y);

            gl_Position = uPMatrix * uMVMatrix * vec4(vertexPosition, 1.0);

            // varyings
            vTextureCoord = (simplePlaneVideoTextureMatrix * vec4(aTextureCoord, 0.0, 1.0)).xy;
            vVertexPosition = vertexPosition;
        }
    `;
  const fs = `
        precision mediump float;

        varying vec3 vVertexPosition;
        varying vec2 vTextureCoord;

        uniform sampler2D simplePlaneVideoTexture;

        void main() {
            // apply our texture
            vec4 finalColor = texture2D(simplePlaneVideoTexture, vTextureCoord);

            // fake shadows based on vertex position along Z axis
            finalColor.rgb -= clamp(-vVertexPosition.z, 0.0, 1.0);
            // fake lights based on vertex position along Z axis
            finalColor.rgb += clamp(vVertexPosition.z, 0.0, 1.0);

            // handling premultiplied alpha (useful if we were using a png with transparency)
            finalColor = vec4(finalColor.rgb * finalColor.a, finalColor.a);

            gl_FragColor = finalColor;
        }
    `;
  const params = {
    vertexShader: vs,
    fragmentShader: fs,
    widthSegments: 20,
    heightSegments: 20,
    uniforms: {
      resolution: {
        name: "uResolution",
        type: "2f",
        value: [planeElements[0].clientWidth, planeElements[0].clientHeight]
      },
      time: {
        name: "uTime",
        type: "1f",
        value: 0
      },
      mousePosition: {
        name: "uMousePosition",
        type: "2f",
        value: mousePosition
      },
      mouseMoveStrength: {
        name: "uMouseMoveStrength",
        type: "1f",
        value: 0
      }
    }
  };
  const simplePlane = new Plane(curtains, planeElements[0], params);
  simplePlane.onReady(() => {
    document.body.classList.add("curtains-ready");
    simplePlane.setPerspective(35);
    const wrapper = document.getElementById("page-wrap");
    wrapper.addEventListener("mousemove", (e) => {
      handleMovement(e, simplePlane);
    });
    wrapper.addEventListener("touchmove", (e) => {
      handleMovement(e, simplePlane);
    }, {
      passive: true
    });
    document.body.classList.add("video-started");
    deltas.max = 2;
    simplePlane.playVideos();
  }).onRender(() => {
    simplePlane.uniforms.time.value++;
    deltas.applied += (deltas.max - deltas.applied) * 0.02;
    deltas.max += (0 - deltas.max) * 0.01;
    simplePlane.uniforms.mouseMoveStrength.value = deltas.applied;
  }).onAfterResize(() => {
    const planeBoundingRect = simplePlane.getBoundingRect();
    simplePlane.uniforms.resolution.value = [planeBoundingRect.width, planeBoundingRect.height];
  }).onError(() => {
    document.body.classList.add("no-curtains", "curtains-ready");
    document.getElementById("enter-site").addEventListener("click", () => {
      document.body.classList.add("video-started");
      planeElements[0].getElementsByTagName("video")[0].play();
    }, false);
  });
  function handleMovement(e, plane) {
    mouseLastPosition.copy(mousePosition);
    const mouse = new Vec2;
    if (e.targetTouches) {
      mouse.set(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
    } else {
      mouse.set(e.clientX, e.clientY);
    }
    mousePosition.set(curtains.lerp(mousePosition.x, mouse.x, 0.3), curtains.lerp(mousePosition.y, mouse.y, 0.3));
    plane.uniforms.mousePosition.value = plane.mouseToPlaneCoords(mousePosition);
    if (mouseLastPosition.x && mouseLastPosition.y) {
      let delta = Math.sqrt(Math.pow(mousePosition.x - mouseLastPosition.x, 2) + Math.pow(mousePosition.y - mouseLastPosition.y, 2)) / 30;
      delta = Math.min(4, delta);
      if (delta >= deltas.max) {
        deltas.max = delta;
      }
    }
  }
});
