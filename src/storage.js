// storage.js — 本机存储的唯一入口
// 存档（走到哪一步）和档案（走完的每一局）都落在 localStorage 里：
// 不联网、不上传、没有账号。换来的是——换浏览器 / 换网址 / 清浏览数据就看不到旧记录。
// 所以这里做三件事：探测可用性、写入失败降级成内存、给「我的」页报状态。
export const KEYS = {
  save: 'life-restart-save-v1',
  archive: 'life-restart-archive-v1',
  sound: 'life-restart-sound-v1',
};

// 写不进 localStorage 时的兜底：至少这一局关掉页面前都在
const memory = new Map();
let mode = null; // 'local' | 'memory'

function probe() {
  if (mode) return mode;
  try {
    const k = '__lr_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    mode = 'local';
  } catch {
    mode = 'memory';
  }
  return mode;
}

export const storageOk = () => probe() === 'local';
export const storageMode = () => probe();

export function readRaw(key) {
  if (probe() === 'local') {
    try {
      const v = localStorage.getItem(key);
      if (v != null) return v;
    } catch { mode = 'memory'; }
  }
  return memory.has(key) ? memory.get(key) : null;
}

// 返回是否真的落到了磁盘（false = 只存在内存里，关页即失）
export function writeRaw(key, value) {
  memory.set(key, value);
  if (probe() !== 'local') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    mode = 'memory'; // 配额满 / 无痕模式中途被拒
    return false;
  }
}

export function removeRaw(key) {
  memory.delete(key);
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

// 「我的」页用：占了多少、存在哪个地址上
export function storageInfo(keys = [KEYS.save, KEYS.archive]) {
  let bytes = 0;
  keys.forEach(k => {
    const v = readRaw(k);
    // localStorage 按 UTF-16 存，中文一个字占两字节，这里只报个大概
    if (v) bytes += v.length * 2;
  });
  return {
    ok: storageOk(),
    mode: probe(),
    kb: Math.max(1, Math.round(bytes / 1024)),
    origin: typeof location !== 'undefined' ? location.origin : '',
    host: typeof location !== 'undefined' ? location.host : '',
  };
}
