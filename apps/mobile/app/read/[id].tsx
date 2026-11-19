// Flow 04 · the reader (s-reader, s-reader-chrome, s-reader-select, s-preview-end, s-reader-chapter,
// s-reader-unlocked, s-reader-dark). The book renders in a local WebView with no network; this
// screen owns the chrome around it, the gate cards in the page flow and the selection toolbar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { percentToParagraph, timeLeftLabel } from '@arpedia/core';
import { placeToolbar, type HighlightColor } from '@arpedia/reader';
import { readerHtml } from '@arpedia/reader/html';
import { EmptyState, useTheme, useToast } from '@arpedia/ui';
import { useBookPage, useOnline } from '../../features/03/book';
import { UnlockSheet } from '../../features/03/UnlockSheet';
import type { UnlockMode } from '../../features/03/UnlockViews';
import {
  ChapterCard,
  PreviewEndCard,
  ReaderChrome,
  ReaderFoot,
  ReaderSkeleton,
  ReaderTop,
  SELBAR_HEIGHT,
  SelectionBar,
  UnlockedToast,
  readerInk,
} from '../../features/04/ReaderViews';
import { chapterNumber, useReader } from '../../features/04/useReader';

const TOAST_MS = 8000;
const CHROME_IDLE_MS = 5000;
const OTHER_COLORS: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple', 'peach'];

export default function ReaderScreen() {
  const { id, cfi } = useLocalSearchParams<{ id: string; cfi?: string }>();
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const online = useOnline();

  // Measured card heights: the page leaves exactly this much room at a gate (rules 52–53).
  const [cardH, setCardH] = useState({ preview: s(330), chapter: s(400) });
  const [autoUnlock, setAutoUnlockLocal] = useState(true);
  const gateRoom = useMemo(
    () => ({ preview: cardH.preview + s(16), chapter: autoUnlock ? 0 : cardH.chapter + s(16) }),
    [cardH, autoUnlock, s],
  );
  const r = useReader(id, { gateRoom, startCfi: cfi });
  useEffect(() => setAutoUnlockLocal(r.settings.auto_unlock), [r.settings.auto_unlock]);

  const [chrome, setChrome] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [sheet, setSheet] = useState<UnlockMode | 'short' | null>(null);
  const [pageH, setPageH] = useState(0);
  const book = useBookPage(id);

  const back = useCallback(() => {
    void r.syncNow();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/book/[id]', params: { id } });
  }, [r, id]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (r.selection) {
        r.clearSelection();
        return true;
      }
      if (chrome) {
        setChrome(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [r, chrome]);

  // Controls hide after 5 s idle, on the next page turn, or on tap (rule 20).
  useEffect(() => {
    if (!chrome || scrub != null) return;
    const t = setTimeout(() => setChrome(false), CHROME_IDLE_MS);
    return () => clearTimeout(t);
  }, [chrome, scrub, r.loc?.cfi]);
  const lastCfi = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastCfi.current && r.loc?.cfi !== lastCfi.current) setChrome(false);
    lastCfi.current = r.loc?.cfi;
  }, [r.loc?.cfi]);

  useEffect(() => {
    if (!r.toast) return;
    const t = setTimeout(r.clearToast, TOAST_MS);
    return () => clearTimeout(t);
  }, [r.toast, r.clearToast]);
  useEffect(() => {
    if (!r.notice) return;
    toast({ message: r.notice });
    r.clearNotice();
  }, [r.notice, r, toast]);
  useEffect(() => {
    if (r.lowFor) {
      setSheet('short');
    }
  }, [r.lowFor]);

  const st = r.state;
  const theme = r.settings.theme;
  const ink = readerInk(theme);
  const chapter = st?.chapters.find((c) => c.chapter_uid === r.loc?.chapter_uid) ?? null;
  const chapterNo = st && chapter ? chapterNumber(st, chapter.chapter_uid) : 0;
  const chapterCount = st?.chapters.filter((c) => c.kind === 'chapter').length ?? 0;
  const gate = r.loc?.at_gate ?? null;
  const gateChapter = gate ? st?.chapters.find((c) => c.chapter_uid === gate.chapter_uid) : null;
  const previewPct =
    st && st.revision.words > 0 && r.manifest?.preview_cut ? r.manifest.preview_cut.percent : 10;
  const perChapter =
    st && st.chapters.some((c) => c.price_credits > 0)
      ? Math.round(
          st.chapters.filter((c) => c.price_credits > 0).reduce((a, c) => a + c.price_credits, 0) /
            st.chapters.filter((c) => c.price_credits > 0).length,
        )
      : 0;

  const sub = !st
    ? ''
    : gate?.kind === 'preview'
      ? 'Free preview'
      : gate?.kind === 'chapter' && !autoUnlock
        ? 'Pay as you read'
        : chapter
          ? chapter.kind === 'chapter'
            ? `Chapter ${chapterNo} · ${chapter.title}`
            : chapter.title
          : '';

  const footRight = !r.loc
    ? ''
    : gate?.kind === 'chapter' && !autoUnlock && gateChapter
      ? `End of chapter ${Math.max(1, chapterNumber(st!, gateChapter.chapter_uid) - 1)}`
      : timeLeftLabel(r.loc.words_left_in_chapter);

  // ─── Selection toolbar placement (rule 32) ────────────────────────────────
  const sel = r.selection;
  const placement = useMemo(() => {
    if (!sel || !pageH) return null;
    const w = s(375) - s(24);
    return placeToolbar({
      rects: sel.rects,
      toolbar: { w, h: s(SELBAR_HEIGHT) },
      viewport: { w: s(375), h: pageH },
      headerBottom: 0,
      bottomLimit: pageH,
      margin: s(12),
    });
  }, [sel, pageH, s]);

  const colors = useMemo(
    () =>
      [r.settings.highlight_color, ...OTHER_COLORS.filter((c) => c !== r.settings.highlight_color)].slice(
        0,
        3,
      ),
    [r.settings.highlight_color],
  );

  const soon = () => toast({ message: 'Coming soon' });

  // ─── States ───────────────────────────────────────────────────────────────
  const body = () => {
    if (r.q.isError && !st) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: ink.page }}>
          <EmptyState
            title="This book didn’t open"
            body={
              online
                ? 'Something went wrong on our side. Try again.'
                : 'You’re offline. Connect and try again.'
            }
            action={{ label: 'Try again', onPress: r.retry }}
          />
        </View>
      );
    }
    if (r.phase === 'offline') {
      return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: ink.page }}>
          <EmptyState
            title="Connect to open this book"
            body="It isn’t downloaded on this phone yet. Connect once and it opens offline after."
            action={{ label: 'Try again', onPress: r.retry }}
          />
        </View>
      );
    }
    if (r.phase === 'error') {
      return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: ink.page }}>
          <EmptyState
            title="This book couldn't be opened"
            body="Try again. If it keeps happening, report it and we'll fix the book."
            action={{ label: 'Try again', onPress: r.retry }}
          />
        </View>
      );
    }
    return (
      <View
        style={{ flex: 1, backgroundColor: ink.page }}
        onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
      >
        {r.phase === 'ready' ? (
          <WebView
            ref={(w) => {
              r.web.current = w;
            }}
            source={{ html: readerHtml }}
            originWhitelist={['about:*', 'blob:*', 'data:*']}
            onShouldStartLoadWithRequest={(req) => /^(about|blob|data):/.test(req.url)}
            onMessage={(e) =>
              void r.onMessage(e.nativeEvent.data, {
                onTap: (zone) => {
                  if (zone !== 'center') return;
                  if (r.selection) return r.clearSelection();
                  setChrome((v) => !v);
                },
                onMarker: () => soon(),
                onAnnotation: () => soon(),
              })
            }
            javaScriptEnabled
            domStorageEnabled={false}
            cacheEnabled={false}
            cacheMode="LOAD_NO_CACHE"
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            incognito
            setSupportMultipleWindows={false}
            menuItems={[]}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            textZoom={100}
            style={{ flex: 1, backgroundColor: ink.page }}
            containerStyle={{ backgroundColor: ink.page }}
          />
        ) : null}
        {r.phase !== 'ready' || !r.loc ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
            <ReaderSkeleton theme={theme} />
          </View>
        ) : null}

        {st ? (
          <PreviewEndCard
            top={gate?.kind === 'preview' ? (r.loc?.gate_top ?? null) : null}
            onLayout={(h) => setCardH((v) => (Math.abs(v.preview - h) > 1 ? { ...v, preview: h } : v))}
            previewPercent={previewPct}
            author={st.book.author.name ?? 'the author'}
            pages={st.revision.pages}
            price={st.price}
            balance={st.balance}
            perChapter={perChapter}
            onUnlockAll={() => setSheet('all')}
            onPayGo={() => setSheet('paygo')}
            onNotNow={back}
          />
        ) : null}
        {st && gateChapter ? (
          <ChapterCard
            top={gate?.kind === 'chapter' && !autoUnlock ? (r.loc?.gate_top ?? null) : null}
            onLayout={(h) => setCardH((v) => (Math.abs(v.chapter - h) > 1 ? { ...v, chapter: h } : v))}
            number={chapterNumber(st, gateChapter.chapter_uid)}
            title={gateChapter.title}
            price={gateChapter.price_credits}
            paid={st.paid_credits}
            total={st.price}
            balance={st.balance}
            remaining={st.remaining}
            busy={r.charging === gateChapter.chapter_uid}
            offline={!online}
            autoUnlock={autoUnlock}
            onUnlock={() => void r.unlockChapter(gateChapter.chapter_uid, 'tap')}
            onPayRest={() => setSheet('all')}
            onAuto={(v) => {
              setAutoUnlockLocal(v);
              void r.changeSetting('auto_unlock', v);
            }}
          />
        ) : null}

        {sel && placement ? (
          <SelectionBar
            y={placement.y}
            placement={placement.kind}
            arrowX={
              placement.kind === 'docked'
                ? null
                : Math.min(
                    s(375) - s(24) - s(16),
                    Math.max(
                      s(16),
                      (Math.min(...sel.rects.map((q) => q.x)) +
                        Math.max(...sel.rects.map((q) => q.x + q.w))) /
                        2 -
                        s(12),
                    ),
                  )
            }
            colors={colors}
            current={r.settings.highlight_color}
            onColor={(c) => void r.highlight(c)}
            onNote={soon}
            onDiscuss={soon}
            onClub={soon}
            onShare={soon}
          />
        ) : null}
      </View>
    );
  };

  const toastBottom = s(64) + insets.bottom;
  return (
    <View style={{ flex: 1, backgroundColor: ink.page, paddingTop: insets.top }}>
      <StatusBar style={ink.dark ? 'light' : 'dark'} />
      <ReaderTop
        theme={theme}
        title={st?.book.title ?? book.data?.book.title ?? ''}
        sub={sub}
        onBack={back}
        onBookmark={soon}
        onMore={soon}
      />
      {body()}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: ink.page }}>
        <ReaderFoot theme={theme} percent={r.loc?.percent ?? st?.position?.percent ?? 0} right={footRight} />
      </View>
      {chrome && r.loc && st ? (
        <ReaderChrome
          percent={r.loc.percent}
          page={r.loc.page}
          pages={st.revision.pages}
          chapter={chapterNo}
          chapters={chapterCount}
          bottomInset={insets.bottom}
          onScrub={(p) => {
            setScrub(p);
            if (p == null || !r.manifest) return null;
            const at = percentToParagraph(r.manifest, p);
            const c = at && st.chapters.find((x) => x.chapter_uid === at.chapter_uid);
            return c
              ? `${Math.floor(p)}% · ${c.kind === 'chapter' ? `Chapter ${chapterNumber(st, c.chapter_uid)}` : c.title}`
              : `${Math.floor(p)}%`;
          }}
          onRelease={(p) => r.send({ type: 'goTo', payload: { percent: p } })}
          actions={[
            { icon: 'list', label: 'Chapters', onPress: soon },
            {
              icon: 'moon',
              label: 'Night',
              onPress: () => void r.changeSetting('theme', theme === 'dark' ? 'light' : 'dark'),
            },
            { icon: 'chat', label: 'Notes', onPress: soon },
            { icon: 'cog', label: 'Settings', onPress: soon },
            { icon: 'users', label: 'Room', onPress: soon },
          ]}
        />
      ) : null}
      {r.toast ? (
        <UnlockedToast
          bottom={toastBottom}
          text={`Chapter ${r.toast.ord} unlocked · ${r.toast.spent} credits`}
          onUndo={r.toast.ledger_id && Date.now() < r.toast.undo_until ? () => void r.undo() : undefined}
        />
      ) : null}
      {book.data ? (
        <UnlockSheet
          book={book.data}
          open={sheet}
          need={r.lowFor ? (st?.chapters.find((c) => c.chapter_uid === r.lowFor)?.price_credits ?? 0) : 0}
          onClose={() => {
            setSheet(null);
            r.clearLow();
            void r.refresh();
          }}
          onRead={() => setSheet(null)}
          onPlans={soon}
          onBuyPack={soon}
        />
      ) : null}
    </View>
  );
}
