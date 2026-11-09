import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import BackToTop from '../components/BackToTop';
import Icon from '../components/Icon';
import { findMember, type Member } from '../data/members';
import { company, stats } from '../data/company';
import { copyText } from '../utils/clipboard';
import {
  encodeCard,
  isQrSafe,
  readCardFromHash,
  type CardData,
} from '../utils/cardCodec';
import {
  cardUrlOfCode,
  fetchCardAsync,
  type CardRecord,
} from '../utils/cardStore';
import { generatePoster } from '../utils/poster';

/** 名片页顶栏（返回官网） */
function CardTopBar() {
  return (
    <div className="border-b border-neutral-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            聚
          </span>
          <span className="font-bold text-neutral-900">{company.brandText}</span>
        </Link>
        <Link
          to="/"
          className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
        >
          <Icon name="back" className="h-4 w-4" />
          返回官网
        </Link>
      </div>
    </div>
  );
}

/**
 * 业务人员电子名片页（明亮版）
 * - /card#d=xxx：旧版链接（名片数据内嵌在链接中），保持兼容
 * - /card/:shortCode：新版短链名片（本地存储；服务端阶段改读数据库）
 * - /card/:id（wang/li/zhang/liu）：示例名片
 */
export default function CardPage() {
  const { id } = useParams<{ id: string }>();
  const [toast, setToast] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const hashCard: CardData | null = useMemo(() => readCardFromHash(), []);
  const sample: Member | undefined = useMemo(() => findMember(id), [id]);

  // 短码名片：本地模式读本机存储，服务端模式请求 API
  const [remote, setRemote] = useState<{
    status: 'loading' | 'active' | 'disabled' | 'notfound' | 'error';
    record?: CardRecord;
    error?: string;
  }>({ status: 'loading' });

  useEffect(() => {
    if (hashCard || sample || !id) return;
    let alive = true;
    setRemote({ status: 'loading' });
    fetchCardAsync(id).then((res) => {
      if (!alive) return;
      if (res.status === 'active') setRemote({ status: 'active', record: res.record });
      else if (res.status === 'disabled') setRemote({ status: 'disabled' });
      else if (res.status === 'notfound') setRemote({ status: 'notfound' });
      else setRemote({ status: 'error', error: res.error });
    });
    return () => {
      alive = false;
    };
  }, [id, hashCard, sample]);

  const record = remote.record ?? null;
  const member = useMemo<CardData | Member | null>(
    () => hashCard ?? record ?? sample ?? null,
    [hashCard, record, sample]
  );
  const isLoading = !hashCard && !sample && remote.status === 'loading';
  const isSample = !hashCard && !record && !!sample;
  const isDisabled = !hashCard && !sample && remote.status === 'disabled';

  const shareUrl = useMemo(() => {
    if (hashCard) return `${window.location.origin}/card#d=${encodeCard(hashCard)}`;
    if (record) return cardUrlOfCode(record.shortCode);
    return `${window.location.origin}/card/${sample?.id ?? ''}`;
  }, [hashCard, record, sample]);

  // 微信/浏览器默认分享卡片信息：动态设置页面标题与描述
  useEffect(() => {
    if (!member) return;
    const prevTitle = document.title;
    document.title = `${member.name} · ${member.title || '业务顾问'} | ${company.brandText}`;
    const meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? '';
    meta?.setAttribute(
      'content',
      `${company.fullName}专属业务经理 ${member.name}，联系电话 ${member.phone}`
    );
    return () => {
      document.title = prevTitle;
      meta?.setAttribute('content', prevDesc);
    };
  }, [member]);

  // /card 页面禁止搜索引擎收录（隐私保护）
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const shareText = useMemo(() => {
    if (!member) return '';
    const sampleTag = isSample ? '（示例）' : '';
    return `【${company.brandText}】${member.name}（${member.title}）\n电话：${member.phone}${sampleTag}\n微信号：${member.wechat || '同手机号'}\n点击名片，了解中聚人力：${shareUrl}\n—— ${company.fullName}`;
  }, [member, isSample, shareUrl]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2000);
  };

  const handleCopy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    showToast(ok ? msg : '复制失败，请手动复制');
  };

  const handlePoster = async () => {
    if (!member) return;
    setPosterBusy(true);
    try {
      const url = await generatePoster(
        member,
        qrWrapRef.current?.querySelector('canvas') ?? null
      );
      setPosterUrl(url);
    } catch {
      showToast('分享图生成失败，请重试');
    } finally {
      setPosterBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-100">
        <CardTopBar />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md animate-pulse rounded-3xl bg-white p-8 shadow-card">
            <div className="mx-auto h-24 w-24 rounded-full bg-neutral-200" />
            <div className="mx-auto mt-4 h-6 w-32 rounded-full bg-neutral-200" />
            <div className="mx-auto mt-3 h-4 w-48 rounded-full bg-neutral-100" />
            <div className="mx-auto mt-2 h-4 w-40 rounded-full bg-neutral-100" />
            <div className="mt-8 space-y-3">
              <div className="h-12 rounded-full bg-neutral-100" />
              <div className="h-12 rounded-full bg-neutral-100" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!member && remote.status === 'error') {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <CardTopBar />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="text-lg font-bold text-neutral-900">名片加载失败</p>
            <p className="mt-2 text-sm text-neutral-500">
              {remote.error || '网络异常'}，请检查网络后重试。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white"
            >
              重新加载
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (isDisabled) {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <CardTopBar />
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="text-lg font-bold text-neutral-900">该名片已停用</p>
            <p className="mt-2 text-sm text-neutral-500">
              如需服务，请拨打公司热线 {company.hotline}
            </p>
            <a
              href={`tel:${company.hotline}`}
              className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white"
            >
              拨打公司热线
            </a>
          </div>
        </main>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex min-h-screen flex-col bg-neutral-50">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-4 pt-16">
          <div className="rounded-2xl bg-white p-10 text-center shadow-card">
            <p className="text-lg font-bold text-neutral-900">未找到该名片</p>
            <p className="mt-2 text-sm text-neutral-500">
              名片链接可能已失效，请联系您的业务经理重新获取。
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white"
            >
              返回官网
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <CardTopBar />

      <main className="flex flex-1 items-start justify-center px-4 py-8 md:items-center md:py-12">
        <div className="w-full max-w-md">
          {/* 名片主体 */}
          <div className="relative overflow-hidden rounded-3xl bg-white shadow-card-hover">
            {/* 名片头部：品牌渐变（纯装饰带，不含文字，避免文字压在渐变与白色交界上） */}
            <div className="relative h-32 bg-brand-gradient">
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15" />
              <div className="pointer-events-none absolute -left-6 bottom-0 h-16 w-16 rounded-full bg-white/10" />
            </div>

            <div className="relative -mt-14 flex flex-col items-center px-6 pb-6">
              <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-4xl font-extrabold text-brand-500 shadow-card">
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  member.name.charAt(0)
                )}
              </span>
              <div className="mt-3 w-full rounded-2xl text-center">
                <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">
                  {member.name}
                </h1>
                <p className="mt-1 font-semibold text-brand-600">
                  {member.title}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {company.fullName} · {member.department}
                </p>
                {member.bio && (
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                    {member.bio}
                  </p>
                )}
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime/15 px-3 py-1 text-xs font-medium text-lime-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
                  您的专属业务经理
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="mt-6 space-y-3">
                <a
                  href={`tel:${member.phone}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3.5 text-base font-bold text-white shadow-card transition hover:bg-neutral-700"
                >
                  <Icon name="phone" className="h-5 w-5" />
                  一键拨打 {member.phone}
                </a>

                <button
                  type="button"
                  onClick={() => handleCopy(member.wechat || member.phone, '微信号已复制')}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 px-6 py-3.5 text-base font-bold text-neutral-800 transition hover:border-neutral-900"
                >
                  <Icon name="wechat" className="h-5 w-5 text-lime-600" />
                  复制微信号 {member.wechat || member.phone}
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIntroOpen((v) => !v)}
                    className="flex items-center justify-center gap-2 rounded-full bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Icon name="factory" className="h-4 w-4" />
                    公司介绍
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-full bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200"
                  >
                    <Icon name="share" className="h-4 w-4" />
                    分享名片
                  </button>
                </div>
              </div>

              {/* 公司介绍（可展开） */}
              {introOpen && (
                <div className="mt-5 rounded-2xl border border-neutral-100 bg-neutral-50 p-5 text-left">
                  <h2 className="text-base font-bold text-neutral-900">
                    {company.fullName}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    {company.intro}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {stats.slice(0, 4).map((s) => (
                      <div
                        key={s.label}
                        className="rounded-xl bg-white px-3 py-2 text-center shadow-card"
                      >
                        <p className="tnum text-lg font-extrabold text-brand-600">
                          {s.value}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {s.label}
                        </p>
                      </div>
                    ))}
                  </div>
                  <a
                    href={`tel:${company.hotline}`}
                    className="mt-4 flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-4 py-2.5 text-sm font-bold text-neutral-800"
                  >
                    <Icon name="phone" className="h-4 w-4" />
                    公司服务热线 {company.hotline}
                  </a>
                  <Link
                    to="/"
                    className="mt-2 block text-center text-xs font-medium text-neutral-400 underline-offset-4 hover:text-brand-600 hover:underline"
                  >
                    查看完整官网 →
                  </Link>
                </div>
              )}

              {/* 二维码（链接过长时降级为复制链接提示） */}
              <div className="mt-6 flex flex-col items-center rounded-2xl bg-neutral-50 p-5">
                {isQrSafe(shareUrl) ? (
                  <>
                    <div className="rounded-xl bg-white p-2.5 shadow-card">
                      <QRCodeSVG
                        value={shareUrl}
                        size={110}
                        fgColor="#171717"
                        bgColor="#ffffff"
                      />
                    </div>
                    <p className="mt-3 text-xs text-neutral-400">
                      扫码查看电子名片
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCopy(shareUrl, '名片链接已复制')}
                    className="flex w-full flex-col items-center gap-2 py-2"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-white">
                      <Icon name="copy" className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-semibold text-neutral-900">
                      点击复制名片链接
                    </span>
                    <span className="text-xs text-neutral-400">
                      名片信息较多，请复制链接后分享给好友
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 示例数据声明 */}
          {isSample && (
            <p className="mt-4 text-center text-xs text-neutral-400">
              注：本名片为示例数据，电话与微信号均为占位号码，请替换为真实联系方式。
            </p>
          )}
        </div>
      </main>

      <Footer />
      <BackToTop />

      {/* 分享弹层 */}
      {shareOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:items-center"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">分享名片</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setShareOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* 推荐：分享图（微信聊天中呈现为名片图，而非链接） */}
            <button
              type="button"
              onClick={handlePoster}
              disabled={posterBusy}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-neutral-900 p-4 text-left text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500">
                <Icon name="card" className="h-6 w-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">
                  {posterBusy ? '分享图生成中…' : '生成名片分享图（推荐）'}
                </span>
                <span className="block truncate text-xs text-neutral-400">
                  竖版海报含二维码，发到微信像卡片
                </span>
              </span>
              <Icon name="arrowUp" className="h-4 w-4 shrink-0 rotate-45" />
            </button>

            <div className="mb-5 flex items-start gap-3 rounded-xl bg-lime/10 p-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lime-600/90 text-white">
                <Icon name="wechat" className="h-4 w-4" />
              </span>
              <p className="text-xs leading-relaxed text-neutral-600">
                在微信内打开本页后，点右上角「···」选择转发，
                分享卡片将自动显示
                <span className="font-semibold text-neutral-900">
                  「{member.name} · {member.title || '业务顾问'}」
                </span>
              </p>
            </div>

            <div className="mb-5 flex justify-center">
              <div className="rounded-xl border border-neutral-100 p-3">
                {isQrSafe(shareUrl) ? (
                  <QRCodeSVG value={shareUrl} size={140} fgColor="#171717" />
                ) : (
                  <div className="flex h-[140px] w-[140px] flex-col items-center justify-center gap-1.5 rounded-lg bg-neutral-50 px-2 text-center">
                    <Icon name="share" className="h-6 w-6 text-brand-500" />
                    <p className="text-[11px] leading-snug text-neutral-500">
                      名片信息较多
                      <br />
                      请复制链接分享
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleCopy(shareUrl, '名片链接已复制')}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
              >
                <Icon name="copy" className="h-4 w-4" />
                复制名片链接
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopy(shareText, '分享文案已复制，快去粘贴给好友吧')
                }
                className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 px-5 py-3 text-sm font-bold text-neutral-800 transition hover:border-neutral-900"
              >
                <Icon name="share" className="h-4 w-4" />
                复制分享文案（含联系方式）
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享图弹层 */}
      {posterUrl && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPosterUrl(null)}
        >
          <div
            className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-neutral-900">名片分享图</h3>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => setPosterUrl(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            <img
              src={posterUrl}
              alt="名片分享图"
              className="w-full rounded-xl border border-neutral-100"
            />
            <p className="mt-3 text-center text-xs leading-relaxed text-neutral-500">
              手机端：长按图片保存到相册，再转发给客户
              <br />
              电脑端：右键图片另存为
            </p>
            <a
              href={posterUrl}
              download={`中聚名片-${member.name}.png`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
            >
              <Icon name="check" className="h-4 w-4 text-lime-400" />
              下载图片
            </a>
          </div>
        </div>
      )}

      {/* 隐藏二维码 canvas（供分享海报绘制） */}
      <div ref={qrWrapRef} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
        <QRCodeCanvas
          value={shareUrl}
          size={440}
          fgColor="#171717"
          bgColor="#ffffff"
        />
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white shadow-lg">
          <span className="flex items-center gap-2">
            <Icon name="check" className="h-4 w-4 text-lime-400" />
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}
