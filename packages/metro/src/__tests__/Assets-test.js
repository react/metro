/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall react_native
 */

'use strict';

jest.mock('node:fs', () => new (require('metro-memory-fs'))());
jest.mock('image-size');

jest.useRealTimers();

const {getAsset, getAssetData} = require('../Assets');
const crypto = require('node:crypto');
const path = require('node:path');

const fs = jest.requireMock('node:fs');

const mockImageWidth = 300;
const mockImageHeight = 200;

require('image-size').mockReturnValue({
  width: mockImageWidth,
  height: mockImageHeight,
});

describe('getAsset', () => {
  beforeEach(() => {
    fs.reset();
    fs.mkdirSync('/root/imgs', {recursive: true});
  });

  test('should fail if the extension is not registerd', async () => {
    writeImages({'b.png': 'b image', 'b@2x.png': 'b2 image'});

    await expect(
      getAssetStr('imgs/b.png', '/root', [], ['jpg']),
    ).rejects.toThrow(Error);
  });

  test('should work for the simple case', () => {
    writeImages({'b.png': 'b image', 'b@2x.png': 'b2 image'});

    return Promise.all([
      getAssetStr('imgs/b.png', '/root', [], null, ['png']),
      getAssetStr('imgs/b@1x.png', '/root', [], null, ['png']),
    ]).then(resp => resp.forEach(data => expect(data).toBe('b image')));
  });

  test('should work for the simple case with platform ext', async () => {
    writeImages({
      'b.ios.png': 'b ios image',
      'b.android.png': 'b android image',
      'c.png': 'c general image',
      'c.android.png': 'c android image',
    });

    expect(
      await Promise.all([
        getAssetStr('imgs/b.png', '/root', [], 'ios', ['png']),
        getAssetStr('imgs/b.png', '/root', [], 'android', ['png']),
        getAssetStr('imgs/c.png', '/root', [], 'android', ['png']),
        getAssetStr('imgs/c.png', '/root', [], 'ios', ['png']),
        getAssetStr('imgs/c.png', '/root', [], null, ['png']),
      ]),
    ).toEqual([
      'b ios image',
      'b android image',
      'c android image',
      'c general image',
      'c general image',
    ]);
  });

  test('should work for the simple case with jpg', () => {
    writeImages({
      'b.png': 'png image',
      'b.jpg': 'jpeg image',
    });

    return Promise.all([
      getAssetStr('imgs/b.jpg', '/root', [], null, ['jpg']),
      getAssetStr('imgs/b.png', '/root', [], null, ['png']),
    ]).then(data => expect(data).toEqual(['jpeg image', 'png image']));
  });

  test('should pick the bigger one', async () => {
    writeImages({
      'b@1x.png': 'b1 image',
      'b@2x.png': 'b2 image',
      'b@4x.png': 'b4 image',
      'b@4.5x.png': 'b4.5 image',
    });

    expect(await getAssetStr('imgs/b@3x.png', '/root', [], null, ['png'])).toBe(
      'b4 image',
    );
  });

  test('should pick the bigger one with platform ext', async () => {
    writeImages({
      'b@1x.png': 'b1 image',
      'b@2x.png': 'b2 image',
      'b@4x.png': 'b4 image',
      'b@4.5x.png': 'b4.5 image',
      'b@1x.ios.png': 'b1 ios image',
      'b@2x.ios.png': 'b2 ios image',
      'b@4x.ios.png': 'b4 ios image',
      'b@4.5x.ios.png': 'b4.5 ios image',
    });

    expect(
      await Promise.all([
        getAssetStr('imgs/b@3x.png', '/root', [], null, ['png']),
        getAssetStr('imgs/b@3x.png', '/root', [], 'ios', ['png']),
      ]),
    ).toEqual(['b4 image', 'b4 ios image']);
  });

  test('should find an image located on a watchFolder', async () => {
    fs.mkdirSync('/anotherfolder', {recursive: true});

    writeImages({
      '../../anotherfolder/b.png': 'b image',
    });

    expect(
      await getAssetStr(
        '../anotherfolder/b.png',
        '/root',
        ['/anotherfolder'],
        null,
        ['png'],
      ),
    ).toBe('b image');
  });

  test('should throw an error if an image is not located on any watchFolder', async () => {
    fs.mkdirSync('/anotherfolder', {recursive: true});

    writeImages({
      '../../anotherfolder/b.png': 'b image',
    });

    await expect(
      getAssetStr('../anotherfolder/b.png', '/root', [], null, ['png']),
    ).rejects.toBeInstanceOf(Error);
  });

  test('should find an image when fileExistsInFileMap returns true', async () => {
    writeImages({'b.png': 'b image'});

    expect(
      await getAssetStr('imgs/b.png', '/root', [], null, ['png'], () => true),
    ).toBe('b image');
  });

  test('should throw an error when fileExistsInFileMap returns false', async () => {
    writeImages({'b.png': 'b image'});

    await expect(
      getAssetStr('imgs/b.png', '/root', [], null, ['png'], () => false),
    ).rejects.toBeInstanceOf(Error);
  });

  test('should serve scale variant when only scale variants exist and fileExistsInFileMap is provided', async () => {
    writeImages({
      'b@2x.png': 'b2 image',
      'b@3x.png': 'b3 image',
    });

    expect(
      await getAssetStr(
        'imgs/b@2x.png',
        '/root',
        [],
        null,
        ['png'],
        () => true,
      ),
    ).toBe('b2 image');
  });

  test('should throw when fileExistsInFileMap rejects the resolved scale variant', async () => {
    writeImages({
      'b@2x.png': 'b2 image',
      'b@3x.png': 'b3 image',
    });

    await expect(
      getAssetStr('imgs/b@2x.png', '/root', [], null, ['png'], () => false),
    ).rejects.toBeInstanceOf(Error);
  });

  test('should check fileExistsInFileMap against the resolved file, not the base path', async () => {
    writeImages({
      'b@2x.png': 'b2 image',
      'b@3x.png': 'b3 image',
    });

    const checkedPaths = [];
    const result = await getAssetStr(
      'imgs/b@2x.png',
      '/root',
      [],
      null,
      ['png'],
      filePath => {
        checkedPaths.push(filePath);
        return true;
      },
    );

    expect(result).toBe('b2 image');
    expect(checkedPaths).toEqual(['/root/imgs/b@2x.png']);
  });

  test('should check fileExistsInFileMap for the fallback (highest scale) file', async () => {
    writeImages({
      'b@1x.png': 'b1 image',
      'b@2x.png': 'b2 image',
    });

    const checkedPaths = [];
    const result = await getAssetStr(
      'imgs/b@3x.png',
      '/root',
      [],
      null,
      ['png'],
      filePath => {
        checkedPaths.push(filePath);
        return true;
      },
    );

    expect(result).toBe('b2 image');
    expect(checkedPaths).toEqual(['/root/imgs/b@2x.png']);
  });
});

describe('getAssetData', () => {
  beforeEach(() => {
    fs.reset();
    fs.mkdirSync('/root/imgs', {recursive: true});
  });

  test('should get assetData', () => {
    writeImages({
      'b@1x.png': 'b1 image',
      'b@2x.png': 'b2 image',
      'b@4x.png': 'b4 image',
      'b@4.5x.png': 'b4.5 image',
    });

    return getAssetData(
      '/root/imgs/b.png',
      'imgs/b.png',
      [],
      null,
      '/assets',
    ).then(data => {
      expect(data).toEqual(
        expect.objectContaining({
          __packager_asset: true,
          type: 'png',
          name: 'b',
          scales: [1, 2, 4, 4.5],
          fileSystemLocation: '/root/imgs',
          httpServerLocation: '/assets/imgs',
          files: [
            '/root/imgs/b@1x.png',
            '/root/imgs/b@2x.png',
            '/root/imgs/b@4x.png',
            '/root/imgs/b@4.5x.png',
          ],
        }),
      );
    });
  });

  test('should get assetData for non-png images', async () => {
    writeImages({
      'b@1x.jpg': 'b1 image',
      'b@2x.jpg': 'b2 image',
      'b@4x.jpg': 'b4 image',
      'b@4.5x.jpg': 'b4.5 image',
    });

    const data = await getAssetData(
      '/root/imgs/b.jpg',
      'imgs/b.jpg',
      [],
      null,
      '/assets',
    );

    expect(data).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        type: 'jpg',
        name: 'b',
        scales: [1, 2, 4, 4.5],
        fileSystemLocation: '/root/imgs',
        httpServerLocation: '/assets/imgs',
        files: [
          '/root/imgs/b@1x.jpg',
          '/root/imgs/b@2x.jpg',
          '/root/imgs/b@4x.jpg',
          '/root/imgs/b@4.5x.jpg',
        ],
      }),
    );
  });

  test('respects `options.publicPath` for output httpServerLocation', async () => {
    writeImages({
      'b@1x.jpg': 'b1 image',
      'b@2x.jpg': 'b2 image',
      'b@4x.jpg': 'b4 image',
      'b@4.5x.jpg': 'b4.5 image',
    });

    const data = await getAssetData(
      '/root/imgs/b.jpg',
      'imgs/b.jpg',
      [],
      null,
      '/public_paths/foo-boar/',
    );

    expect(data).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        type: 'jpg',
        name: 'b',
        scales: [1, 2, 4, 4.5],
        fileSystemLocation: '/root/imgs',
        httpServerLocation: '/public_paths/foo-boar/imgs',
        files: [
          '/root/imgs/b@1x.jpg',
          '/root/imgs/b@2x.jpg',
          '/root/imgs/b@4x.jpg',
          '/root/imgs/b@4.5x.jpg',
        ],
      }),
    );
  });

  test('loads and runs asset plugins', async () => {
    jest.mock(
      'mockPlugin1',
      () => {
        return asset => {
          asset.extraReverseHash = asset.hash.split('').reverse().join('');
          return asset;
        };
      },
      {virtual: true},
    );

    jest.mock(
      'asyncMockPlugin2',
      () => {
        return async asset => {
          expect(asset.extraReverseHash).toBeDefined();
          asset.extraPixelCount = asset.width * asset.height;
          return asset;
        };
      },
      {virtual: true},
    );

    writeImages({
      'b@1x.png': 'b1 image',
      'b@2x.png': 'b2 image',
      'b@3x.png': 'b3 image',
    });

    const data = await getAssetData(
      '/root/imgs/b.png',
      'imgs/b.png',
      ['mockPlugin1', 'asyncMockPlugin2'],
      null,
      '/assets',
    );

    expect(data).toEqual(
      expect.objectContaining({
        __packager_asset: true,
        type: 'png',
        name: 'b',
        scales: [1, 2, 3],
        fileSystemLocation: '/root/imgs',
        httpServerLocation: '/assets/imgs',
        files: [
          '/root/imgs/b@1x.png',
          '/root/imgs/b@2x.png',
          '/root/imgs/b@3x.png',
        ],
        extraPixelCount: mockImageWidth * mockImageHeight,
      }),
    );
    expect(typeof data.extraReverseHash).toBe('string');
  });

  describe('hash:', () => {
    beforeEach(() => {
      writeImages({
        'b@1x.jpg': 'b1 image',
        'b@2x.jpg': 'b2 image',
        'b@4x.jpg': 'b4 image',
        'b@4.5x.jpg': 'b4.5 image',
      });
    });

    test('uses the file contents to build the hash', async () => {
      const hash = crypto.createHash('md5');

      for (const name of fs.readdirSync('/root/imgs')) {
        hash.update(fs.readFileSync(path.join('/root/imgs', name), 'utf8'));
      }

      expect(
        await getAssetData(
          '/root/imgs/b.jpg',
          'imgs/b.jpg',
          [],
          null,
          '/assets',
        ),
      ).toEqual(expect.objectContaining({hash: hash.digest('hex')}));
    });

    test('changes the hash when the passed-in file watcher emits an `all` event', async () => {
      const initialData = await getAssetData(
        '/root/imgs/b.jpg',
        'imgs/b.jpg',
        [],
        null,
        '/assets',
      );

      fs.writeFileSync('/root/imgs/b@4x.jpg', 'updated data');

      const data = await getAssetData(
        '/root/imgs/b.jpg',
        'imgs/b.jpg',
        [],
        null,
        '/assets',
      );
      expect(data.hash).not.toEqual(initialData.hash);
    });
  });
});

function writeImages(imgMap) {
  for (const fileName in imgMap) {
    fs.writeFileSync(path.join('/root/imgs', fileName), imgMap[fileName]);
  }
}

async function getAssetStr(...args) {
  const buffer = await getAsset(...args);
  return buffer.toString('utf8');
}
