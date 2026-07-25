/**
 * 生成 TabBar 图标脚本
 * 生成 40x40 像素的简单 PNG 图标
 * 不依赖任何第三方库，纯 Node.js 内置 API
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICONS_DIR = path.join(__dirname, 'miniprogram', 'images');

// 确保目录存在
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

/**
 * 创建简单的 PNG 图片
 * PNG 格式: 签名 + IHDR + IDAT + IEND
 * 使用调色板模式（索引颜色），每个像素一个字节
 */
function createPNG(width, height, pixelData) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // 宽度
  ihdrData.writeUInt32BE(height, 4);  // 高度
  ihdrData.writeUInt8(8, 8);          // 位深度 8
  ihdrData.writeUInt8(3, 9);          // 颜色类型：索引颜色
  ihdrData.writeUInt8(0, 10);         // 压缩方法
  ihdrData.writeUInt8(0, 11);         // 过滤方法
  ihdrData.writeUInt8(0, 12);         // 隔行扫描

  const ihdr = createChunk('IHDR', ihdrData);

  // PLTE chunk - 调色板
  // 0: 透明, 1: 浅灰(#CCCCCC), 2: 粉色(#FF6B81), 3: 白色
  const plteData = Buffer.alloc(4 * 3);
  // Color 0: transparent (will be ignored in indexed mode, but set to white)
  plteData[0] = 255; plteData[1] = 255; plteData[2] = 255;
  // Color 1: light gray #CCCCCC
  plteData[3] = 0xCC; plteData[4] = 0xCC; plteData[5] = 0xCC;
  // Color 2: pink #FF6B81
  plteData[6] = 0xFF; plteData[7] = 0x6B; plteData[8] = 0x81;
  // Color 3: white
  plteData[9] = 0xFF; plteData[10] = 0xFF; plteData[11] = 0xFF;

  const plte = createChunk('PLTE', plteData);

  // tRNS chunk - 透明度（让颜色0透明）
  const trnsData = Buffer.from([255, 255, 255, 255]);
  const trns = createChunk('tRNS', trnsData);

  // 构建原始像素数据（每个像素一个字节，索引颜色）
  // PNG 需要每行前面加一个过滤类型字节(0=None)
  const rawData = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width)] = 0; // 过滤类型：None
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      rawData[y * (1 + width) + 1 + x] = pixelData[idx] || 0;
    }
  }

  // 压缩
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, plte, trns, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');

  // CRC: type + data
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 计算
const crcTable = [];
function makeCRCTable() {
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
}
makeCRCTable();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 绘制图标到像素数组
 * 40x40 像素，索引颜色
 */
function drawIcon(shape, colorIndex) {
  const size = 40;
  const pixels = new Uint8Array(size * size);
  // 默认透明（索引0）

  switch (shape) {
    case 'calendar':
      // 日历图标：顶部横条 + 日期数字
      // 顶部横条
      for (let y = 4; y <= 8; y++) {
        for (let x = 6; x <= 33; x++) {
          pixels[y * size + x] = colorIndex;
        }
      }
      // 主体框
      for (let y = 8; y <= 35; y++) {
        for (let x = 6; x <= 33; x++) {
          if (x === 6 || x === 33 || y === 8 || y === 35) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      // 两个挂钉
      pixels[5 * size + 10] = colorIndex;
      pixels[5 * size + 11] = colorIndex;
      pixels[5 * size + 28] = colorIndex;
      pixels[5 * size + 29] = colorIndex;
      // 日期数字 "17" 简化
      for (let y = 16; y <= 28; y++) {
        // 数字1
        for (let x = 13; x <= 15; x++) {
          pixels[y * size + x] = colorIndex;
        }
        // 数字7
        if (y === 16) {
          for (let x = 19; x <= 25; x++) pixels[y * size + x] = colorIndex;
        }
        if (y >= 16 && y <= 28) {
          for (let x = 24; x <= 26; x++) pixels[y * size + x] = colorIndex;
        }
      }
      break;

    case 'diary':
      // 日记图标：书本/笔记本
      // 封面
      for (let y = 5; y <= 34; y++) {
        for (let x = 8; x <= 32; x++) {
          if (x === 8 || x === 32 || y === 5 || y === 34) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      // 书脊
      for (let y = 5; y <= 34; y++) {
        pixels[y * size + 20] = colorIndex;
      }
      // 左侧横线（文字模拟）
      for (let line = 0; line < 5; line++) {
        const ly = 12 + line * 5;
        for (let x = 10; x <= 18; x++) {
          pixels[ly * size + x] = colorIndex;
        }
      }
      // 右侧横线
      for (let line = 0; line < 5; line++) {
        const ly = 12 + line * 5;
        for (let x = 22; x <= 30; x++) {
          pixels[ly * size + x] = colorIndex;
        }
      }
      break;

    case 'heart':
      // 爱心图标
      const cx = 20, cy = 20;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = (x - cx) / 12;
          const dy = (y - cy) / 14;
          // 爱心公式近似: (x^2 + y^2 - 1)^3 - x^2*y^3 < 0
          const val = Math.pow(dx * dx + dy * dy - 1.0, 3) - dx * dx * Math.pow(dy, 3) * 0.6;
          if (val < 0.05 && val < 0.1) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      break;

    case 'mine':
      // 人物图标：圆形头 + 身体
      // 头
      const headCx = 20, headCy = 11, headR = 7;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dist = Math.sqrt((x - headCx) ** 2 + (y - headCy) ** 2);
          if (dist <= headR && dist >= headR - 1.5) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      // 身体
      for (let y = 19; y <= 24; y++) {
        for (let x = 13; x <= 27; x++) {
          if (x === 13 || x === 27 || y === 19) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      // 身体下半部分（梯形）
      for (let y = 25; y <= 34; y++) {
        const left = 13 + (y - 25);
        const right = 27 - (y - 25);
        for (let x = left; x <= right; x++) {
          if (x === left || x === right) {
            pixels[y * size + x] = colorIndex;
          }
        }
      }
      // 底部横线
      for (let x = 20; x <= 22; x++) {
        pixels[34 * size + x] = colorIndex;
      }
      break;
  }

  return pixels;
}

// 生成图标
const icons = [
  { name: 'calendar.png', shape: 'calendar', color: 1 },        // 灰色（未选中）
  { name: 'calendar-active.png', shape: 'calendar', color: 2 },  // 粉色（选中）
  { name: 'diary.png', shape: 'diary', color: 1 },
  { name: 'diary-active.png', shape: 'diary', color: 2 },
  { name: 'heart.png', shape: 'heart', color: 1 },
  { name: 'heart-active.png', shape: 'heart', color: 2 },
  { name: 'mine.png', shape: 'mine', color: 1 },
  { name: 'mine-active.png', shape: 'mine', color: 2 },
];

icons.forEach(({ name, shape, color }) => {
  const pixels = drawIcon(shape, color);
  const pngBuffer = createPNG(40, 40, pixels);
  const filePath = path.join(ICONS_DIR, name);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`✅ 已生成: ${name} (${pngBuffer.length} bytes)`);
});

console.log('\n🎉 所有图标生成完成！');
console.log(`📁 路径: ${ICONS_DIR}`);