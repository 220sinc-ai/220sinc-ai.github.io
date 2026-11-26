// Показывает размер картинки
const fs = require('fs');
const b = fs.readFileSync('C:\\Users\\SINC\\Documents\\pda-proj\\map.jpg');
let i = 2;
while (i < b.length) {
  if (b[i] !== 0xff) { i++; continue; }
  const m = b[i + 1];
  if (m === 0xd8 || m === 0xd9) { i += 2; continue; }
  const len = b.readUInt16BE(i + 2);
  if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
    const h = b.readUInt16BE(i + 5);
    const w = b.readUInt16BE(i + 7);
    console.log('map.jpg:', w + 'x' + h, 'bytes:' + b.length);
    break;
  }
  i += 2 + len;
}
