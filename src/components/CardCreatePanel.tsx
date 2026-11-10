import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import Icon from './Icon';
import { company } from '../data/company';
import { copyText } from '../utils/clipboard';
import { loadMyCards, type StoredCard } from '../utils/cardCodec';
import { migrateLegacyCards } from '../utils/cardService';
import { getRecoveryCode } from '../utils/cardAuth';
import {
  cardUrlOfCode,
  createCardAsync,
  DAILY_GEN_LIMIT,
  IS_SERVER_MODE,
  listMyCardsAsync,
  fetchEditableCardAsync,
  fetchQuotaAsync,
  updateCardAsync,
  removeCardAsync,
  todayGenCount,
  type CardRecord,
  type Quota,
} from '../utils/cardStore';
import { generatePoster } from '../utils/poster';

const emptyForm = {
  name: '',
  title: '',
  department: '',
  phone: '',
  wechat: '',
  bio: '',
};

/** 通用输入框样式 */
const inputCls =
  'w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-400';

/** 字段长度限制（与服务端契约一致） */
const LIMITS = { name: 12, title: 20, department: 20, wechat: 30, bio: 60 };

/**
 * 名片生成面板（无门禁、无顶栏，供控制台与独立页复用）
 * 业务人员填写信息 → 生成短链名片（/card/短码）→ 分享给客户
 */
export function CardCreatePanel() {
  const [form, setForm] = useState(emptyForm);
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [generated, setGenerated] = useState<{ url: string; record: CardRecord } | null>(null);
  const [myCards, setMyCards] = useState<CardRecord[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      setMyCards(await listMyCardsAsync());
    } catch (err) {
      setError(err instanceof Error ? err.message : '名片加载失败，请重试');
    }
    setQuota(await fetchQuotaAsync());
  }, []);
  const editCard = useCallback(async (code: string) => {
    const result = await fetchEditableCardAsync(code);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const card = result.record;
    setForm({
      name: card.name,
      title: card.title,
      department: card.department,
      phone: card.phone,
      wechat: card.wechat,
      bio: card.bio,
    });
    setAvatar(card.avatar || undefined);
    setEditingCode(code);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 旧版名片迁移到短码存储（幂等；仅本地模式需要）
  useEffect(() => {
    if (!IS_SERVER_MODE) {
      const legacy: StoredCard[] = loadMyCards();
      migrateLegacyCards(legacy);
    }
    void refresh();
    const code = new URLSearchParams(window.location.search).get('edit');
    if (code) void editCard(code);
  }, [refresh, editCard]);

  // /create 禁止搜索引擎收录
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2200);
  };

  const setField =
    (key: keyof typeof emptyForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const val = e.target.value;
      setForm((f) => ({ ...f, [key]: val.slice(0, LIMITS[key as keyof typeof LIMITS]) }));
    };

  /** 头像上传：canvas 压缩为 180px JPEG，控制存储体积 */
  const handleAvatar = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('请选择 10MB 以内的 JPEG 或 PNG 照片');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('照片读取失败，请重新选择');
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        if (img.width * img.height > 24000000) {
          setError('照片尺寸过大，请先缩小');
          return;
        }
        const canvas = document.createElement('canvas');
        const size = 180;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        setAvatar(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => setError('图片格式无效，请重新选择');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = async () => {
    if (generating) return;
    setError('');
    const card = {
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
      wechat: form.wechat.trim(),
      title: form.title.trim() || '业务顾问',
      department: form.department.trim() || '业务部',
      bio: form.bio.trim(),
      avatar,
    };
    setGenerating(true);
    try {
      const result = editingCode
        ? await updateCardAsync(editingCode, card)
        : await createCardAsync(card);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGenerated({ url: cardUrlOfCode(result.record.shortCode), record: result.record });
      await refresh();
      showToast(
        editingCode
          ? '名片已更新，原链接和二维码继续有效'
          : IS_SERVER_MODE
            ? '专属名片已生成'
            : '本地预览已保存'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    showToast(ok ? msg : '复制失败，请手动复制');
  };

  /** 保存分享图：Canvas 绘制竖版海报（微信里像卡片而非链接） */
  const handlePoster = async (record: CardRecord) => {
    setPosterBusy(true);
    try {
      const url = await generatePoster(record, qrWrapRef.current?.querySelector('canvas') ?? null);
      setPosterUrl(url);
    } catch {
      showToast('分享图生成失败，请重试');
    } finally {
      setPosterBusy(false);
    }
  };

  const genCount = quota?.used ?? (IS_SERVER_MODE ? null : todayGenCount());
  const genLimit = quota?.limit ?? DAILY_GEN_LIMIT;

  return (
    <>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900 md:text-3xl">
            {editingCode ? '编辑专属名片' : '生成我的专属名片'}
          </h1>
          <p className="mt-2 text-sm text-neutral-500 md:text-base">
            {IS_SERVER_MODE
              ? '联系方式与照片将对名片访问者公开，请确认资料准确并已获本人同意'
              : '当前为本地预览模式；正式分享需启用服务端模式'}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 左侧：表单 */}
          <div className="rounded-3xl bg-white p-6 shadow-card md:p-8">
            <h2 className="mb-5 text-lg font-bold text-neutral-900">名片信息</h2>

            {/* 头像上传 */}
            <div className="mb-5 flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-2xl font-bold text-brand-500">
                {avatar ? (
                  <img src={avatar} alt="头像" className="h-full w-full object-cover" />
                ) : (
                  form.name.charAt(0) || '?'
                )}
              </span>
              <label className="cursor-pointer rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-neutral-900">
                上传形象照（可选）
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={handleAvatar}
                />
              </label>
              {avatar && (
                <button
                  type="button"
                  onClick={() => setAvatar(undefined)}
                  className="text-sm text-neutral-400 hover:text-neutral-600"
                >
                  移除
                </button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-700">
                  姓名 <em className="not-italic text-brand-500">*</em>
                </span>
                <input
                  value={form.name}
                  onChange={setField('name')}
                  placeholder="如：王经理"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-700">职位</span>
                <input
                  value={form.title}
                  onChange={setField('title')}
                  placeholder="如：业务一部经理"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-700">
                  手机号 <em className="not-italic text-brand-500">*</em>
                </span>
                <input
                  value={form.phone}
                  onChange={setField('phone')}
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 位手机号"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-neutral-700">微信号</span>
                <input
                  value={form.wechat}
                  onChange={setField('wechat')}
                  placeholder="客户将一键复制"
                  className={inputCls}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium text-neutral-700">所属部门</span>
                <input
                  value={form.department}
                  onChange={setField('department')}
                  placeholder="如：业务一部"
                  className={inputCls}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-neutral-700">
                  一句话介绍
                  <span className="text-xs text-neutral-300">
                    {form.bio.length}/{LIMITS.bio}
                  </span>
                </span>
                <textarea
                  value={form.bio}
                  onChange={setField('bio')}
                  rows={2}
                  placeholder="如：专注制造业用工解决方案，7 年行业服务经验"
                  className={`${inputCls} resize-none`}
                />
              </label>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 py-3.5 text-base font-bold text-white shadow-card transition hover:bg-neutral-700 disabled:opacity-60"
            >
              <Icon name="card" className="h-5 w-5" />
              {generating
                ? '保存中…'
                : editingCode
                  ? '保存修改'
                  : IS_SERVER_MODE
                    ? '生成专属名片'
                    : '保存本地预览'}
            </button>
            <p className="mt-3 text-center text-xs text-neutral-400">
              {IS_SERVER_MODE
                ? '名片存储在服务器，短链可在任意设备打开'
                : '仅当前浏览器可预览，链接不能跨设备分享'}
              （{genCount === null ? '配额加载中' : `今日 ${genCount}/${genLimit} 张`}）
            </p>
            {editingCode && (
              <button
                type="button"
                onClick={() => {
                  setEditingCode(null);
                  setForm(emptyForm);
                  setAvatar(undefined);
                  setGenerated(null);
                }}
                className="mt-3 w-full text-sm text-brand-600"
              >
                改为创建新名片
              </button>
            )}
            {IS_SERVER_MODE && (
              <details className="mt-4 text-xs text-neutral-500">
                <summary className="cursor-pointer">跨设备恢复我的名片</summary>
                <p className="mt-2">
                  保存恢复码，在其他设备登录时填写即可找回本设备创建的名片。恢复码需与登录口令一起使用，请妥善保存。
                </p>
                <button
                  type="button"
                  className="mt-2 text-brand-600"
                  onClick={() => {
                    try {
                      void handleCopy(getRecoveryCode(), '恢复码已复制，请保存在私有位置');
                    } catch {
                      setError('浏览器存储不可用');
                    }
                  }}
                >
                  复制恢复码
                </button>
              </details>
            )}
          </div>

          {/* 右侧：实时预览 + 生成结果 */}
          <div className="space-y-6">
            {/* 实时预览（正常文档流，无叠压遮挡） */}
            <div className="overflow-hidden rounded-3xl bg-white shadow-card">
              <div className="relative h-32 bg-brand-gradient">
                <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
                <div className="pointer-events-none absolute -left-6 bottom-0 h-16 w-16 rounded-full bg-white/10" />
              </div>
              <div className="relative -mt-14 flex flex-col items-center px-6 pb-6">
                <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-white text-3xl font-extrabold text-brand-500 shadow-card">
                  {avatar ? (
                    <img src={avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    form.name.charAt(0) || '聚'
                  )}
                </span>
                <p className="mt-3 text-xl font-extrabold text-neutral-900">
                  {form.name || '您的姓名'}
                </p>
                <p className="mt-1 font-semibold text-brand-600">{form.title || '业务顾问'}</p>
                <p className="mt-1 text-sm text-neutral-400">
                  {company.fullName} · {form.department || '业务部'}
                </p>
                {form.bio.trim() && (
                  <p className="mt-2 line-clamp-2 text-center text-sm leading-relaxed text-neutral-600">
                    {form.bio}
                  </p>
                )}
              </div>
            </div>

            {/* 生成结果 */}
            {generated && (
              <div className="rounded-3xl bg-white p-6 shadow-card md:p-8">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-neutral-900">
                  <Icon name="check" className="h-5 w-5 text-lime-600" />
                  名片已生成
                </h2>
                {!IS_SERVER_MODE ? (
                  <p className="text-sm text-neutral-500">
                    本地预览已保存。
                    <a className="text-brand-600" href={generated.url}>
                      在本浏览器中预览
                    </a>
                    ；启用服务端后才能生成可分享名片。
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="shrink-0 rounded-xl border border-neutral-100 bg-white p-3">
                      <QRCodeSVG value={generated.url} size={128} fgColor="#171717" />
                    </div>
                    <div className="w-full space-y-3">
                      <input
                        readOnly
                        value={generated.url}
                        onFocus={(e) => e.target.select()}
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handlePoster(generated.record)}
                          disabled={posterBusy}
                          className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                        >
                          <Icon name="card" className="h-4 w-4" />
                          {posterBusy ? '生成中…' : '保存分享图'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(generated.url, '名片链接已复制')}
                          className="flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-neutral-300 px-4 py-2.5 text-sm font-bold text-neutral-800 transition hover:border-neutral-900"
                        >
                          <Icon name="copy" className="h-4 w-4" />
                          复制链接
                        </button>
                      </div>
                      <a
                        href={generated.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-center text-sm font-medium text-brand-600 underline-offset-4 hover:underline"
                      >
                        打开名片预览 →
                      </a>
                    </div>
                  </div>
                )}
                {IS_SERVER_MODE && (
                  <p className="mt-4 text-xs leading-relaxed text-neutral-400">
                    推荐：点「保存分享图」把海报发给客户，微信里展示为一张名片图；
                    链接为备用方式。微信内打开名片页转发时，卡片标题会自动显示您的姓名与职位。
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 我的名片 */}
        {myCards.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-4 text-lg font-bold text-neutral-900">
              我的名片（{IS_SERVER_MODE ? '可使用恢复码在其他设备找回' : '仅保存在本机'}）
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myCards.map((c) => (
                <div
                  key={c.shortCode}
                  className={`flex items-center gap-4 rounded-2xl bg-white p-5 shadow-card ${
                    c.status === 'disabled' ? 'opacity-60' : ''
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-lg font-bold text-white">
                    {c.avatar ? (
                      <img src={c.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.name.charAt(0)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-neutral-900">
                      {c.status === 'disabled' ? '该名片已停用' : `${c.name} · ${c.title}`}
                    </p>
                    <p className="tnum truncate text-xs text-neutral-400">/card/{c.shortCode}</p>
                    {IS_SERVER_MODE && !c.permissions?.edit && (
                      <p className="mt-1 text-xs text-neutral-400">
                        历史名片请联系管理员分配恢复码归属
                      </p>
                    )}
                    <div className="mt-2 flex gap-3 text-xs font-medium text-brand-600">
                      {c.status !== 'disabled' && (
                        <>
                          <a href={cardUrlOfCode(c.shortCode)} target="_blank" rel="noreferrer">
                            打开
                          </a>
                          <button
                            type="button"
                            onClick={() => handleCopy(cardUrlOfCode(c.shortCode), '名片链接已复制')}
                          >
                            复制链接
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => void editCard(c.shortCode)}
                        disabled={IS_SERVER_MODE && !c.permissions?.edit}
                        className="disabled:opacity-40"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        disabled={IS_SERVER_MODE && !c.permissions?.delete}
                        onClick={async () => {
                          if (!window.confirm(`确定删除「${c.name}」的名片吗？`)) return;
                          const ok = await removeCardAsync(c.shortCode);
                          if (ok) await refresh();
                          showToast(ok ? '名片已删除' : '删除失败，请重试');
                        }}
                        className="text-neutral-400 hover:text-red-500 disabled:opacity-40"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* 隐藏二维码 canvas（供分享海报绘制） */}
      {generated && IS_SERVER_MODE && (
        <div ref={qrWrapRef} className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden>
          <QRCodeCanvas value={generated.url} size={440} fgColor="#171717" bgColor="#ffffff" />
        </div>
      )}

      {/* 分享图弹层 */}
      {posterUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
              download={`中聚名片-${generated?.record.name ?? '分享图'}.png`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-bold text-white"
            >
              <Icon name="check" className="h-4 w-4 text-lime-400" />
              下载图片
            </a>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white shadow-lg">
          <span className="flex items-center gap-2">
            <Icon name="check" className="h-4 w-4 text-lime-400" />
            {toast}
          </span>
        </div>
      )}
    </>
  );
}
