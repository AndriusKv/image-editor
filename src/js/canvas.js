import { getRotation, resetRotation } from "./rotation.js";
import { applyScaleMultiplier, scaleImageToFitCanvas } from "./zoom.js";
import { getFlip } from "./flip.js";
import { getUniqueImageName, renderAddedFolderImage } from "./image-folder.js";
import { getImages, getActiveImage, readImages, setActiveImage } from "./uploaded-images.js";
import { getArea, resetArea, isInsideArea, setDirection, getDirection } from "./area.js";
import { setTransformContext, getTransform, setTransform, translateContext, getTransformedPoint } from "./transform.js";
import { resetCropPanelInputs } from "./crop-panel";
import { isPanelVisible } from "./top-bar";

const canvasImage = new Image();
const editorElement = document.getElementById("js-editor");
const cropBtnElement = document.getElementById("js-crop-btn");
const selectionToggleBtn = document.getElementById("js-selection-toggle-btn");
const isMobile = window.orientation !== undefined;
let canvas = null;
let canvasWidth = 0;
let canvasHeight = 0;
let pointerPosition = null;
let eventToEnable = "";
let keepMask = false;
let selectionDisabled = false;
let snapArea = false;
let cutModeEnabled = false;
let handlingMove = false;

function initCanvasElement(blobUrl) {
  canvas = document.getElementById("js-canvas");
  setTransformContext(canvas.getContext("2d"));
  resetCanvasDimensions();
  loadImageFile(blobUrl);
  canvas.addEventListener("wheel", handleScroll, { passive: true });
  canvas.addEventListener("pointerdown", handlePointerdown);
  canvas.addEventListener("dblclick", handleDoubleClick);
}

function initCanvas(blobUrl) {
  editorElement.insertAdjacentHTML("beforeend", `<canvas id="js-canvas"></canvas>`);
  editorElement.classList.remove("hidden");
  document.getElementById("js-intro").remove();
  initCanvasElement(blobUrl);
  enableViewportResizeHandler();
  selectionToggleBtn.classList.toggle("visible", isMobile);
}

function getCanvasElement() {
  return canvas;
}

function getCanvasDimensions() {
  return { canvasWidth, canvasHeight };
}

function resetCanvasDimensions() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  canvasWidth = w;
  canvasHeight = h;
}

function clearCanvas(ctx) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

function addMask(ctx) {
  ctx.fillStyle = "rgba(0, 0, 0, .4)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function drawImage(ctx, image = canvasImage) {
  const radians = getRotation();
  const { flipH, flipV } = getFlip();

  clearCanvas(ctx);
  ctx.save();

  if (radians) {
    const centerX = image.width / 2;
    const centerY = image.height / 2;

    ctx.translate(centerX, centerY);
    ctx.rotate(radians);
    ctx.translate(-centerX, -centerY);
  }
  ctx.scale(flipH, flipV);
  ctx.translate(flipH === -1 ? -image.width : 0, flipV === -1 ? -image.height : 0);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  ctx.restore();
}

function drawArea(ctx) {
  const area = getArea();
  const areaWidth = Math.round(area.width);
  const areaHeight = Math.round(area.height);
  let x = Math.round(area.x);
  let y = Math.round(area.y);
  let imageData;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#006494";
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (areaWidth && areaHeight) {
    imageData = ctx.getImageData(x, y, areaWidth, areaHeight);

    if (areaWidth < 0) {
      x += areaWidth;
    }

    if (areaHeight < 0) {
      y += areaHeight;
    }
  }

  if (areaWidth || areaHeight || keepMask) {
    addMask(ctx);
  }

  if (imageData) {
    ctx.putImageData(imageData, x, y);
  }
  ctx.strokeRect(area.x + 0.5, area.y + 0.5, areaWidth, areaHeight);
  ctx.restore();
}

function drawCanvas() {
  const ctx = canvas.getContext("2d");

  drawImage(ctx);
  drawArea(ctx);
}

function setCanvasCursor(name = "default") {
  canvas.style.cursor = name;
}

function resetCanvasProperties() {
  const t = getTransform();

  resetCanvasDimensions();
  setTransform(t.a, t.b, t.c, t.d, t.e, t.f);
}

function handleScroll(event) {
  applyScaleMultiplier(event.deltaY > 0 ? 0.8 : 1.25, event.clientX, event.clientY);
}

function handlePointerdown(event) {
  if (event.which !== 1 || isPanelVisible()) {
    return;
  }
  if (cutModeEnabled) {
    eventToEnable = "resize";

    window.addEventListener("pointermove", handlePointermove);
    window.addEventListener("pointerup", handlePointerup);
    window.removeEventListener("pointermove", changeCursor);
    return;
  }
  const { clientX: x, clientY: y } = event;
  const area = getArea();
  const areaDrawn = area.width && area.height;
  const direction = setDirection(x, y);
  eventToEnable = "select";
  keepMask = areaDrawn;

  if (event.shiftKey || selectionDisabled) {
    pointerPosition = getTransformedPoint(x, y);
    eventToEnable = "drag";
  }
  else if ((event.ctrlKey || isMobile) && areaDrawn && isInsideArea(x, y)) {
    pointerPosition = {
      x: x - area.x,
      y: y - area.y
    };
    eventToEnable = "move";
  }
  else if (direction && areaDrawn) {
    eventToEnable = "resize";
  }
  else {
    resetArea({ x, y });
  }
  requestAnimationFrame(drawCanvas);
  cropBtnElement.classList.remove("visible");
  editorElement.style.userSelect = "none";
  window.addEventListener("pointermove", handlePointermove);
  window.addEventListener("pointerup", handlePointerup);
  window.removeEventListener("pointermove", changeCursor);
}

function handlePointermove({ clientX, clientY }) {
  if (handlingMove) {
    return;
  }
  handlingMove = true;

  const x = clientX > 0 ? clientX : 0;
  const y = clientY > 0 ? clientY : 0;

  switch (eventToEnable) {
    case "select":
      selectArea(x, y);
      break;
    case "resize":
      resizeArea(x, y);
      break;
    case "move":
      moveArea(x, y);
      break;
    case "drag":
      dragImage(x, y);
      break;
  }
  requestAnimationFrame(() => {
    drawCanvas();
    handlingMove = false;
  });
}

function handlePointerup() {
  const area = getArea();
  eventToEnable = "";
  editorElement.style.userSelect = "auto";

  if (area.width && area.height) {
    allowCropAreaModification();
  }
  else {
    keepMask = false;
    drawImage(canvas.getContext("2d"));
    setCanvasCursor();
    resetCropPanelInputs();
  }
  window.removeEventListener("pointermove", handlePointermove);
  window.removeEventListener("pointerup", handlePointerup);
}

function handleDoubleClick() {
  const area = getArea();
  const areaDrawn = area.width && area.height;

  if (!areaDrawn) {
    return;
  }
  const { a: scale, e, f } = getTransform();
  const { width, height } = canvasImage;
  const direction = getDirection().split("");

  if (area.height > 0) {
    if (direction.includes("n")) {
      area.height = area.height + area.y - f;
      area.y = f;
    }
    else if (direction.includes("s")) {
      area.height = f + area.height + height * scale - (area.y + area.height);
    }
  }
  else {
    const scaledHeight = height * scale;

    if (direction.includes("n")) {
      area.height = area.height - (scaledHeight - area.y) - f;
      area.y = scaledHeight + f;
    }
    else if (direction.includes("s")) {
      area.height = area.height + f - (area.y + area.height);
    }
  }

  if (area.width > 0) {
    if (direction.includes("w")) {
      area.width = area.width + area.x - e;
      area.x = e;
    }
    else if (direction.includes("e")) {
      area.width = e + area.width + width * scale - (area.x + area.width);
    }
  }
  else {
    if (direction.includes("w")) {
      const scaledWidth = width * scale;

      area.width = area.width - (scaledWidth - area.x) - e;
      area.x = scaledWidth + e;
    }
    else if (direction.includes("e")) {
      area.width = area.width + e - (area.x + area.width);
    }
  }
  requestAnimationFrame(drawCanvas);
}

function allowCropAreaModification() {
  cropBtnElement.classList.add("visible");
  window.addEventListener("pointermove", changeCursor);
}

function changeCursor(event) {
  const { clientX: x, clientY: y } = event;

  if (event.ctrlKey) {
    setCanvasCursor(isInsideArea(x, y) ? "move" : "default");
  }
  else {
    const direction = setDirection(x, y);

    setCanvasCursor(direction ? `${direction}-resize` : "default");
  }
}

function selectArea(x, y) {
  const area = getArea();
  area.width = x - area.x;
  area.height = y - area.y;
}

function resizeArea(x, y) {
  const area = getArea();
  const direction = getDirection();

  if (direction[0] === "n") {
    area.height = area.y - y + area.height;
    area.y = y;
  }
  else if (direction[0] === "s") {
    area.height = y - area.y;
  }

  if (direction.includes("w")) {
    area.width = area.x - x + area.width;
    area.x = x;
  }
  else if (direction.includes("e")) {
    area.width = x - area.x;
  }
}

function updatePoint(point, pointName, dimensionName, offset, scale) {
  const area = getArea();
  const diff = point - pointerPosition[pointName];
  const dimension = canvasImage[dimensionName];
  const scaledDimension = dimension * scale;
  const areaDimension = area[dimensionName];

  if (areaDimension > 0) {
    if (offset + 8 > diff && offset - 8 < diff) {
      area[pointName] = offset;
    }
    else if (offset + 8 + scaledDimension > diff + areaDimension && offset - 8 + scaledDimension < diff + areaDimension) {
      area[pointName] = offset + scaledDimension - areaDimension;
    }
    else {
      area[pointName] = diff;
    }
  }
  else {
    const diff2 = diff + areaDimension;

    if (offset + 8 > diff2 && offset - 8 < diff2) {
      area[pointName] = offset - areaDimension;
    }
    else if (offset + 8 + scaledDimension > diff && offset - 8 + scaledDimension < diff) {
      area[pointName] = offset + scaledDimension;
    }
    else {
      area[pointName] = diff;
    }
  }
}

function moveArea(x, y) {
  if (snapArea) {
    const { a: scale, e, f } = getTransform();

    updatePoint(x, "x", "width", e, scale);
    updatePoint(y, "y", "height", f, scale);
  }
  else {
    const area = getArea();

    area.x = x - pointerPosition.x;
    area.y = y - pointerPosition.y;
  }
}

function dragImage(x, y) {
  if (pointerPosition) {
    const pt = getTransformedPoint(x, y);

    translateContext(pt.x - pointerPosition.x, pt.y - pointerPosition.y);
  }
}

function disableCutMode() {
  cutModeEnabled = false;
  document.getElementById("js-cut-mode-btn").lastElementChild.textContent = "Enable Cut Mode";
}

function loadImageFile(blobUrl) {
  keepMask = false;
  cropBtnElement.classList.remove("visible");

  resetRotation();
  resetArea();

  canvasImage.onload = function() {
    scaleImageToFitCanvas(canvasImage);
  };
  canvasImage.src = blobUrl;
  disableCutMode();
}

function getImageData(image, area, ctx) {
  drawImage(ctx, image);
  return ctx.getImageData(area.x, area.y, area.width, area.height);
}

function getCroppedCanvas(image) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const { a: scale, e: x, f: y } = getTransform();
  const translated = {
    x: x / scale,
    y: y / scale
  };
  const area = getArea();
  const transformedArea = {
    x: Math.round(area.x / scale),
    y: Math.round(area.y / scale),
    width: Math.round(area.width / scale),
    height: Math.round(area.height / scale)
  };
  canvas.width = Math.round(canvasWidth / scale);
  canvas.height = Math.round(canvasHeight / scale);
  ctx.translate(translated.x, translated.y);

  const imageData = getImageData(image, transformedArea, ctx);
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function getCanvasSlice(image, type) {
  return new Promise(resolve => {
    const croppedCanvas = getCroppedCanvas(image);

    croppedCanvas.toBlob(blob => {
      resolve({
        file: blob,
        width: croppedCanvas.width,
        height: croppedCanvas.height
      });
    }, type);
  });
}

function enableViewportResizeHandler() {
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      resetCanvasProperties();
      drawCanvas();
    });
  });
}

cropBtnElement.addEventListener("click", () => {
  const { file, blobUrl } = getActiveImage();
  const image = new Image();

  image.onload = async function() {
    if (cutModeEnabled) {
      const canvasSlice = await getCanvasSlice(image, file.type);
      const newFile = new File([canvasSlice.file], getUniqueImageName(file.name), { type: file.type });

      await readImages([newFile]);

      const images = getImages();
      const index = images.length - 1;
      const { blobUrl } = images[index];

      loadImageFile(blobUrl);
      setActiveImage(index);
      disableCutMode();
    }
    else {
      renderAddedFolderImage({
        name: getUniqueImageName(file.name),
        type: file.type,
        ...await getCanvasSlice(image, file.type)
      });
    }
  };
  image.src = blobUrl;
});

selectionToggleBtn.addEventListener("click", ({ currentTarget }) => {
  selectionDisabled = !selectionDisabled;

  if (selectionDisabled) {
    currentTarget.textContent = "Enable Selection";
  }
  else {
    currentTarget.textContent = "Disabled Selection";
  }
});

document.getElementById("js-cut-mode-btn").addEventListener("click", ({ currentTarget }) => {
  cutModeEnabled = !cutModeEnabled;

  if (cutModeEnabled) {
    const area = getArea();
    const { a: scale, e: x, f: y } = getTransform();
    const { width, height } = canvasImage;

    area.x = x;
    area.y = y;
    area.width = width * scale;
    area.height = height * scale;

    allowCropAreaModification();
    currentTarget.lastElementChild.textContent = "Disable Cut Mode";
  }
  else {
    resetArea();
    currentTarget.lastElementChild.textContent = "Enable Cut Mode";
  }
  requestAnimationFrame(drawCanvas);
});

document.getElementById("js-snap-checkbox").addEventListener("change", event => {
  snapArea = event.target.checked;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "a" && event.ctrlKey) {
    const area = getArea();
    const { a: scale, e: x, f: y } = getTransform();
    const { width, height } = canvasImage;

    area.x = x;
    area.y = y;
    area.width = width * scale;
    area.height = height * scale;

    requestAnimationFrame(drawCanvas);
    allowCropAreaModification();
    event.preventDefault();
  }
});

export {
  initCanvas,
  getCanvasElement,
  getCanvasDimensions,
  resetCanvasDimensions,
  drawCanvas,
  allowCropAreaModification,
  loadImageFile
};
