import Regl from "regl";
import { mat4 } from "gl-matrix";
import Tweakpane from "tweakpane";

import { loadMesh } from "../common/geometry";
import { generatePencilTextures } from "../common/texture";
import { saveImage, loadImage } from "../common/utils";
import createCamera from "../common/camera";
import fragmentShader from "./frag.glsl?raw";
import vertexShader from "./vert.glsl?raw";
import pencilTexturesUrl from "../textures/texture_256_64_64.png";
import bunnyLargeUrl from "../models/bunny_1k_2_sub.json?url";
import bunnySmallUrl from "../models/bunny_1k.json?url";
import teapotUrl from "../models/clean_teapot.json?url";
import armadilloUrl from "../models/armadillo.json?url";
import csgUrl from "../models/clean_csg.json?url";
import torusUrl from "../models/torus.json?url";

const meshes = {
  "Bunny Large": bunnyLargeUrl,
  "Bunny Small": bunnySmallUrl,
  "Utah Teapot": teapotUrl,
  Armadillo: armadilloUrl,
  CSG: csgUrl,
  Torus: torusUrl,
};

const regl = Regl({ extensions: ["OES_standard_derivatives"] });

const camera = createCamera(document.getElementsByTagName("canvas")[0], {
  eye: [1.7, 1.5, 2.9],
  center: [0, 0, 0],
});

const [pane, params] = initPane();

let numTextures, pencilTextures, attributes, elements;

function initPane() {
  const pane = new Tweakpane({ title: "Parameters" });
  const params = {
    scale: 15,
    mesh: bunnyLargeUrl,
    style: "pencil",
    zoom: 0.8,
    height: 0.2,
    rotate: true,
    speed: 0.5,
    angle: 0,
    fps: "---",
  };

  // Art Style selector - prominent position
  pane.addInput(params, "style", {
    label: "Art Style",
    options: {
      Pencil: "pencil",
      Charcoal: "charcoal",
      Ink: "ink",
      Sketch: "sketch",
    }
  }).on("change", (ev) => {
    updateStyle(ev.value);
  });

  pane.addSeparator();
  pane.addInput(params, "scale", { min: 0, max: 50 });
  pane.addInput(params, "mesh", { options: meshes }).on("change", updateMesh);
  pane.addMonitor(params, "fps");

  const textures = pane.addFolder({ title: "Textures" });
  const texParams = {
    number: 64,
    logsize: 6,
    save: false,
    style: "pencil",
  };
  textures.addInput(texParams, "number", { min: 8, max: 256, step: 8 });
  textures.addInput(texParams, "logsize", { min: 4, max: 7, step: 1 });
  textures.addInput(texParams, "save");
  textures.addButton({ title: "Generate" }).on("click", () => {
    texParams.style = params.style;
    generateTextures(texParams);
  });

  return [pane, params];
}

async function initTextures() {
  const textures = regl.texture({
    data: await loadImage(pencilTexturesUrl),
    mag: "linear",
    min: "mipmap",
    mipmap: true,
  });
  numTextures = 256;
  pencilTextures = textures;
}

function generateTextures(texParams) {
  const size = Math.pow(2, texParams.logsize);
  const img = generatePencilTextures(texParams.number, size, size, texParams.style);
  const textures = regl.texture({
    data: img.data,
    width: size,
    height: size * texParams.number,
    mag: "linear",
    min: "mipmap",
    mipmap: true,
  });
  if (texParams.save) {
    saveImage("textures.png", img);
  }
  numTextures = texParams.number;
  pencilTextures = textures;
}

function updateStyle(style) {
  // Update the style parameter immediately so styleMode uniform updates
  params.style = style;

  // Update recommended scale for different styles
  switch(style) {
    case "charcoal":
      params.scale = 20;  // Charcoal looks better with larger scale
      break;
    case "ink":
      params.scale = 10;  // Ink needs finer detail
      break;
    case "sketch":
      params.scale = 12;  // Sketch moderate detail
      break;
    default:
      params.scale = 15;  // Pencil default
  }

  // Show loading message
  console.log(`Generating ${style} textures... This may take a few seconds.`);
  params.fps = "Generating...";

  // Use requestAnimationFrame to allow UI to update smoothly
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        // Regenerate textures with new style
        // Use aggressive optimization for all styles
        let size = 128;  // Reduced from 256 for all styles
        let number = 32; // Reduced from 64/48 for faster generation

        // Different sizes based on style needs
        if (style === "pencil") {
          size = 128;
          number = 48;  // Pencil needs more layers for smooth gradation
        } else if (style === "charcoal") {
          size = 128;
          number = 32;  // Charcoal is softer, needs fewer layers
        } else if (style === "ink") {
          size = 64;    // Ink is high contrast, smaller texture is fine
          number = 24;  // Fewer layers needed
        } else if (style === "sketch") {
          size = 64;    // Sketch is light, small texture works
          number = 24;  // Fewer layers
        }

        const startTime = performance.now();

        const img = generatePencilTextures(number, size, size, style);

        const endTime = performance.now();
        console.log(`${style}: ${(endTime - startTime).toFixed(0)}ms (${size}x${size}, ${number} layers)`);

        const textures = regl.texture({
          data: img.data,
          width: size,
          height: size * number,
          mag: "linear",
          min: "mipmap",
          mipmap: true,
        });
        numTextures = number;
        pencilTextures = textures;

        params.fps = "Ready";
      } catch (error) {
        console.error("Error generating textures:", error);
        params.fps = "Error!";
      }
    });
  });
}

async function updateMesh() {
  const resp = await fetch(params.mesh);
  const mesh = await resp.json();
  const data = loadMesh(mesh);
  attributes = data.attributes;
  elements = data.elements;
}

const draw = regl({
  frag: fragmentShader,
  vert: vertexShader,
  attributes: {
    position: () => attributes.position,
    normal: () => attributes.normal,
    indexInTriangle: () => attributes.indexInTriangle,
    curvature: () => attributes.curvature,
  },
  elements: () => elements,
  uniforms: {
    eye: regl.prop("eye"),
    view: (_, props) => {
      return mat4.lookAt([], props.eye, props.center, [0, 1, 0]);
    },
    projection: ({ viewportWidth, viewportHeight }) => {
      const ratio = viewportWidth / viewportHeight;
      return mat4.perspective([], Math.PI / 5, ratio, 0.01, 1000);
    },
    resolution: ({ drawingBufferWidth, drawingBufferHeight }) => [
      drawingBufferWidth,
      drawingBufferHeight,
      Math.min(drawingBufferWidth, drawingBufferHeight),
    ],
    pixelRatio: regl.context("pixelRatio"),
    scale: () => params.scale, // How large the textures are scaled in world space
    numTextures: () => numTextures,
    pencilTextures: () => pencilTextures,
    styleMode: () => {
      // Convert style string to integer for shader
      const styleMap = {
        pencil: 0,
        charcoal: 1,
        ink: 2,
        sketch: 3
      };
      return styleMap[params.style] || 0;
    },
  },
});

Promise.all([initTextures(), updateMesh()]).then(() => {
  const frameTimes = [...Array(60)].fill(0);
  regl.frame(() => {
    const lastTime = frameTimes.shift();
    const time = performance.now();
    frameTimes.push(time);
    if (lastTime !== 0) {
      params.fps = (1000 / ((time - lastTime) / frameTimes.length)).toFixed(2);
    }
    regl.clear({ color: [1, 1, 1, 1] });
    draw({
      eye: camera.eye,
      center: camera.center,
    });
  });
});
