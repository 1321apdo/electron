import { NativeImage, nativeImage } from 'electron/common';
import { BrowserWindow, screen } from 'electron/main';

import { AssertionError, expect } from 'chai';

import path = require('node:path');

import { createArtifact } from './lib/artifacts';
import { closeAllWindows } from './lib/window-helpers';

const FIXTURE_PATH = path.resolve(
  __dirname,
  'fixtures',
  'api',
  'corner-smoothing'
);

async function capturePageWithNormalizedScale (w: BrowserWindow): Promise<NativeImage> {
  // Determine the scale factor for the window.
  const [x, y] = w.getPosition();
  const display = screen.getDisplayNearestPoint({ x, y });
  const rescaleFactor = 1.0 / display.scaleFactor;

  const img = await w.webContents.capturePage();

  // Don't rescale if it's unnecessary.
  if (img.isEmpty() || rescaleFactor === 1) {
    return img;
  }

  const { width, height } = img.getSize();
  return img.resize({
    width: width / 2.0,
    height: height / 2.0
  });
}

/**
 * Recipe for tests.
 *
 * The page is rendered, captured as an image, then compared to an expected
 * result image.
 */
async function pageCaptureTestRecipe (
  pagePath: string,
  expectedImgPath: string,
  artifactName: string,
  cornerSmoothingAvailable: boolean = true
): Promise<void> {
  const w = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    useContentSize: true,
    webPreferences: {
      cornerSmoothingCSS: cornerSmoothingAvailable
    }
  });
  await w.loadFile(pagePath);
  w.show();

  // Wait for a render frame to prepare the page.
  await w.webContents.executeJavaScript(
    'new Promise((resolve) => { requestAnimationFrame(() => resolve()); })'
  );

  const actualImg = await capturePageWithNormalizedScale(w);
  expect(actualImg.isEmpty()).to.be.false('Failed to capture page image');

  const expectedImg = nativeImage.createFromPath(expectedImgPath);
  expect(expectedImg.isEmpty()).to.be.false(
    'Failed to read expected reference image'
  );

  // Compare the actual page image to the expected reference image, creating an
  // artifact if they do not match.
  const matches = actualImg.toBitmap().equals(expectedImg.toBitmap());
  if (!matches) {
    const artifactFileName = `corner-rounding-expected-${artifactName}.png`;
    await createArtifact(artifactFileName, actualImg.toPNG());

    throw new AssertionError(
      `Actual image did not match expected reference image. Actual: "${artifactFileName}" in artifacts, Expected: "${path.relative(
        path.resolve(__dirname, '..'),
        expectedImgPath
      )}" in source`
    );
  }
}

describe('-electron-corner-smoothing', () => {
  afterEach(async () => {
    await closeAllWindows();
  });

  describe('shape', () => {
    for (const available of [true, false]) {
      it(`matches the reference with web preference = ${available}`, async () => {
        await pageCaptureTestRecipe(
          path.join(FIXTURE_PATH, 'shape', 'test.html'),
          path.join(FIXTURE_PATH, 'shape', `expected-${available}.png`),
          `shape-${available}`,
          available
        );
      });
    }
  });

  describe('system-ui keyword', () => {
    const { platform } = process;
    it(`matches the reference for platform = ${platform}`, async () => {
      await pageCaptureTestRecipe(
        path.join(FIXTURE_PATH, 'system-ui-keyword', 'test.html'),
        path.join(
          FIXTURE_PATH,
          'system-ui-keyword',
          `expected-${platform}.png`
        ),
        `system-ui-${platform}`
      );
    });
  });
});
