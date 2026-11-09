/**
 * 名片分享海报生成器（Canvas 绘制，无第三方依赖）
 * 生成 750×1200 竖版分享图：品牌渐变头部 + 头像/姓名/职位 + 联系方式 + 二维码
 * 用途：业务员保存后直接发到微信聊天，效果类似小程序卡片，而非一串链接。
 * 图标全部矢量绘制（电话听筒 / 微信气泡），不依赖 emoji，跨设备渲染一致。
 */
import type { CardData } from './cardCodec';

const BRAND_500 = '#FF6B35';
const BRAND_600 = '#E8402A';
const BRAND_LIGHT = '#FFB53A';
const INK = '#1A1A1A';
const GRAY = '#8C8C8C';
const DARK = '#404040';
const WECHAT_GREEN = '#07C160';

const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';

/** 加载图片（dataURL） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 文本自动换行，返回行数组 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
        return lines;
      }
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * 电话图标：品牌色圆形 + 白色听筒（lucide phone 路径，Path2D 矢量描边）
 * lucide phone path（24×24 viewBox）
 */
const PHONE_PATH =
  'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z';

function drawPhoneIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // 圆形底（品牌渐变）
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, BRAND_500);
  grad.addColorStop(1, BRAND_LIGHT);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 听筒矢量描边
  const scale = (r * 1.15) / 12; // 24px 路径缩放到约 2.3r 宽
  ctx.save();
  ctx.translate(cx - 12 * scale, cy - 12 * scale);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(PHONE_PATH));
  ctx.restore();
}

/**
 * 微信图标：绿色圆形 + 白色对话气泡（带尾巴）+ 两颗绿点
 * 参考微信官方 logo 形态绘制，非 emoji。
 */
function drawWechatIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // 圆形底
  ctx.fillStyle = WECHAT_GREEN;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 白色大气泡（椭圆）
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(cx - 1, cy - 3.5, r * 0.52, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // 气泡尾巴（左下角小三角）
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.2);
  ctx.lineTo(cx - r * 0.58, cy + r * 0.48);
  ctx.lineTo(cx - r * 0.16, cy + r * 0.32);
  ctx.closePath();
  ctx.fill();
  // 气泡内两颗绿点（眼睛）
  ctx.fillStyle = WECHAT_GREEN;
  ctx.beginPath();
  ctx.arc(cx - r * 0.26, cy - r * 0.14, r * 0.085, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + r * 0.1, cy - r * 0.14, r * 0.085, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 生成分享海报
 * @param card 名片数据
 * @param qrCanvas 二维码 canvas（由隐藏的 QRCodeCanvas 渲染）
 * @returns dataURL（PNG）
 */
export async function generatePoster(
  card: CardData,
  qrCanvas: HTMLCanvasElement | null
): Promise<string> {
  const W = 750;
  const H = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 不可用');

  // ---------- 背景 ----------
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // ---------- 品牌渐变头部 ----------
  const HEADER_H = 320;
  const grad = ctx.createLinearGradient(0, 0, W, HEADER_H);
  grad.addColorStop(0, BRAND_500);
  grad.addColorStop(1, BRAND_LIGHT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, HEADER_H);

  // 装饰圆（柔和白色）
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(W - 50, 40, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(W - 130, 160, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(56, 268, 64, 0, Math.PI * 2);
  ctx.fill();

  // 头部品牌字（左上角）
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText('中聚人力', 60, 82);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Z H O N G J U   H R', 60, 112);

  // ---------- 头像（圆形，跨头部底边） ----------
  const avatarR = 68;
  const ax = W / 2;
  const ay = HEADER_H;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, ay, avatarR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  let avatarDrawn = false;
  if (card.avatar) {
    try {
      const img = await loadImage(card.avatar);
      ctx.drawImage(img, ax - avatarR, ay - avatarR, avatarR * 2, avatarR * 2);
      avatarDrawn = true;
    } catch {
      /* 忽略，回落到首字母 */
    }
  }
  if (!avatarDrawn) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(ax - avatarR, ay - avatarR, avatarR * 2, avatarR * 2);
    ctx.fillStyle = BRAND_500;
    ctx.font = `bold 74px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(card.name.charAt(0) || '聚', ax, ay);
  }
  ctx.restore();
  // 白色描边
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(ax, ay, avatarR + 5, 0, Math.PI * 2);
  ctx.stroke();

  // ---------- 姓名 / 职位 / 公司 ----------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `bold 46px ${FONT}`;
  ctx.fillText(card.name || '您的姓名', ax, 452);
  ctx.fillStyle = BRAND_600;
  ctx.font = `bold 27px ${FONT}`;
  ctx.fillText(card.title || '业务顾问', ax, 498);
  ctx.fillStyle = GRAY;
  ctx.font = `21px ${FONT}`;
  ctx.fillText('临邑中聚人力资源有限公司', ax, 540);

  // ---------- 一句话介绍（最多 2 行） ----------
  if (card.bio.trim()) {
    ctx.fillStyle = DARK;
    ctx.font = `23px ${FONT}`;
    const bioLines = wrapText(ctx, card.bio.trim(), 560, 2);
    bioLines.forEach((line, i) => {
      ctx.fillText(line, ax, 592 + i * 36);
    });
  }

  // ---------- 联系方式面板 ----------
  const panelX = 60;
  const panelY = 668;
  const panelW = W - 120;
  const panelH = 184;
  ctx.fillStyle = '#FFF7F2';
  drawRoundRect(ctx, panelX, panelY, panelW, panelH, 24);
  ctx.fill();

  const row1Y = panelY + 58;
  const row2Y = panelY + 130;
  const iconR = 26;

  // 第一行：电话
  drawPhoneIcon(ctx, panelX + 56, row1Y, iconR);
  ctx.fillStyle = INK;
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.phone, panelX + 102, row1Y + 1);
  ctx.fillStyle = GRAY;
  ctx.font = `19px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('电话', panelX + panelW - 44, row1Y + 1);

  // 第二行：微信
  drawWechatIcon(ctx, panelX + 56, row2Y, iconR);
  ctx.fillStyle = INK;
  ctx.font = `bold 30px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(card.wechat || '同手机号', panelX + 102, row2Y + 1);
  ctx.fillStyle = GRAY;
  ctx.font = `19px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('微信', panelX + panelW - 44, row2Y + 1);
  ctx.textBaseline = 'alphabetic';

  // ---------- 二维码 ----------
  if (qrCanvas) {
    const qrCardSize = 262;
    const qrCardX = W / 2 - qrCardSize / 2;
    const qrCardY = 906;
    ctx.save();
    drawRoundRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.10)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.clip();
    ctx.drawImage(qrCanvas, qrCardX + 24, qrCardY + 24, qrCardSize - 48, qrCardSize - 48);
    ctx.restore();

    ctx.fillStyle = GRAY;
    ctx.font = `22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('长按识别二维码 · 查看电子名片', ax, 1186);
  }

  // ---------- 底部品牌条 ----------
  const footGrad = ctx.createLinearGradient(0, H - 8, W, H);
  footGrad.addColorStop(0, BRAND_500);
  footGrad.addColorStop(1, BRAND_LIGHT);
  ctx.fillStyle = footGrad;
  ctx.fillRect(0, H - 8, W, 8);

  return canvas.toDataURL('image/png');
}
