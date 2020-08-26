import { dispatch, getActions, getState, STATE_CHANGE, } from '../store/store.js';
import { getBuffer } from '../audio/audio.js';
import addWindowResizeCallback from './windowresize.js';

const padding = 10;
const addReducer = (accumulator, currentValue) => accumulator + currentValue;
let rootEl,
  canvasEl,
  canvasRect,
  ctx, 
  channelData, 
  numBlocks, 
  blockSize, 
  previousClientX, 
  previousClientY, 
  firstSample,
  numSamples,
  maxBlockSize;

function addEventListeners() {
  document.addEventListener(STATE_CHANGE, handleStateChanges);
  canvasEl.addEventListener('mousedown', handleMouseDown);
  addWindowResizeCallback(handleWindowResize);
}

function handleMouseDown(e) {
  previousClientX = e.clientX;
  previousClientY = e.clientY;
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  // check if mouse is on the startOffset dragger
}

function handleMouseMove(e) {
  if (e.clientY !== previousClientY) {
    const distanceInPixels = previousClientY - e.clientY;
    previousClientY = e.clientY;
    let newBlockSize = blockSize * ( 1 + (distanceInPixels / 100) );

    // at least a minimum zoom out amount to not get stuck zoomed in
    if (distanceInPixels > 0 && Math.floor(newBlockSize) === blockSize) {
      newBlockSize = blockSize + 1;
    }

    // minimum zoom: whole file visible
    // maximum zoom: 1 sample per pixel
    newBlockSize = Math.max(1, Math.min(newBlockSize, maxBlockSize));
    const newNumSamples = newBlockSize * numBlocks;

    // get the new first sample in view
    const mouseXNormalized = (e.clientX - canvasRect.left) / canvasRect.width;
    const numSampleChange = newNumSamples - numSamples;
    let newFirstSample = firstSample - (mouseXNormalized * numSampleChange);
    const maxNewFirstSample = channelData.length - newNumSamples;
    newFirstSample = Math.max(0, Math.min(newFirstSample, maxNewFirstSample));
    
    dispatch(getActions().setWaveformZoom(newFirstSample, newNumSamples));
  }


  // const distanceInBlocks = distanceInPixels;
  // const startOffset = distanceInBlocks * numBlocks;
  // console.log('handleMouseMove', startOffset);
  // dispatch(getActions().setAudioOffset(startOffset));
}

function handleMouseUp(e) {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

function handleStateChanges(e) {
  const { state, action, actions, } = e.detail;
  switch (action.type) {

    case actions.AUDIOFILE_DECODED:
    case actions.SELECT_SOUND:
      showWaveform(state);
      break;
    
    case actions.SET_WAVEFORM_ZOOM:
      setZoom(state);
      break;
  }
}

/**
 * Window resize event handler.
 * @param {Boolean} isFirstRun True if function is called as part of app setup.
 */
function handleWindowResize() {
	canvasEl.height = rootEl.clientHeight;
  canvasEl.width = rootEl.clientWidth;
  canvasRect = canvasEl.getBoundingClientRect();
  drawWaveform();
}

/**
 * General module setup.
 */
export function setup() {
  rootEl = document.querySelector('#waveform');
  canvasEl = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
  rootEl.appendChild(canvasEl);
	canvasEl.height = rootEl.clientHeight;
  canvasEl.width = rootEl.clientWidth;
  canvasRect = canvasEl.getBoundingClientRect();
  ctx = canvasEl.getContext('2d');

  addEventListeners();
}

/**
 * 
 * @param {Object} state Application state.
 */
function showWaveform(state) {
  const { pads, selectedIndex } = state;
  const { firstWaveformSample, numWaveformSamples, } = pads[selectedIndex];
  const buffer = getBuffer(selectedIndex);

  if (!buffer) {
    return;
  }

  firstSample = firstWaveformSample;
  numSamples = numWaveformSamples;
  channelData = buffer.getChannelData(0);
  drawWaveform();
}

/**
 * Draw waveform, filled or line based on blockSize.
 */
function drawWaveform() {
  if (!channelData) {
    return;
  }

  numBlocks = canvasEl.width;
  maxBlockSize = Math.floor(channelData.length / numBlocks);
  blockSize = Math.floor(numSamples / numBlocks);

  if (blockSize < 1) {
    drawWaveformLine();
  } else {
    drawWaveformFilled();
  }
}

/**
 * Draw waveform as a single line. Best for short samples.
 */
function drawWaveformLine() {
  let blocksMax = 0;
  let blocksMin = 0;
  const blocks = [];
  for (let i = 0; i < numBlocks; i++) {
    const blockStart = blockSize * i;
    const blockValues = [];
    for (let j = 0; j < blockSize; j++) {
      const value = channelData[blockStart + j];
      blockValues.push(value);
    }
    const blockAverage = blockValues.reduce(addReducer, 0) / blockValues.length;
    blocks.push(blockAverage);
    blocksMax = Math.max(blockAverage, blocksMax);
    blocksMin = Math.min(blockAverage, blocksMin);
  }
  const max = Math.max(blocksMax, -blocksMin);

  // normalize
  const blocksNormalized = blocks.map(value => value / max);

  // draw
  const amplitude = canvasEl.offsetHeight / 2;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.save();
  ctx.translate(0, amplitude);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#aaa';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  blocksNormalized.forEach((value, index) => {
    ctx.lineTo(index, value * (amplitude - padding));
  });
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw waveform as a filled shape. Best for long samples.
 */
function drawWaveformFilled() {
  let blocksMax = 0;
  let blocksMin = 0;
  const blocksNeg = [];
  const blocksPos = [];
  for (let i = 0; i < numBlocks; i++) {
    const blockStart = Math.floor(firstSample) + (blockSize * i);
    const blockNegValues = [0];
    const blockPosValues = [0];
    for (let j = 0; j < blockSize; j++) {
      const value = channelData[blockStart + j];
      if (value < 0) {;
        blockNegValues.push(value);
      }
      if (value > 0) {;
        blockPosValues.push(value);
      }
    }
    const blockNegAverage = blockNegValues.reduce(addReducer, 0) / blockNegValues.length;
    const blockPosAverage = blockPosValues.reduce(addReducer, 0) / blockPosValues.length;
    blocksNeg.push(blockNegAverage);
    blocksPos.push(blockPosAverage);
    blocksMax = Math.max(blockPosAverage, blocksMax);
    blocksMin = Math.min(blockNegAverage, blocksMin);
  }
  const max = Math.max(blocksMax, -blocksMin);

  // normalize
  const blocksNegNormalized = blocksNeg.map(value => value / max);
  const blocksPosNormalized = blocksPos.map(value => value / max);

  // draw
  const amplitude = canvasEl.offsetHeight / 2;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.save();
  ctx.translate(0, amplitude);
  ctx.lineWidth = 2;
  ctx.fillStyle = '#eee';
  ctx.strokeStyle = '#aaa';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.moveTo(0, 0);
  blocksPosNormalized.forEach((value, index) => {
    ctx.lineTo(index, value * (amplitude - padding));
  });
  for (let i = blocksNegNormalized.length - 1; i >= 0; i--) {
    ctx.lineTo(i, blocksNegNormalized[i] * (amplitude - padding));
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function setZoom(state) {
  const { pads, selectedIndex } = state;
  const { firstWaveformSample, numWaveformSamples } = pads[selectedIndex];
  firstSample = firstWaveformSample;
  numSamples = numWaveformSamples;
  drawWaveform();
}
