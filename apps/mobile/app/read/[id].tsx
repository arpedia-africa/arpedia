// Flow 04 · the reader (s-reader, s-reader-chrome, s-reader-select, s-preview-end, s-reader-chapter,
// s-reader-unlocked, s-reader-dark). The book renders in a local WebView with no network; this
// screen owns the chrome around it, the gate cards in the page flow and the selection toolbar.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Share, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { percentToParagraph, timeLeftLabel } from '@arpedia/core';
import { placeToolbar, type HighlightColor, type Rect, type SelectionDetail } from '@arpedia/reader';
import { readerHtml } from '@arpedia/reader/html';
import { Btn, EmptyState, useTheme, useToast } from '@arpedia/ui';
import { bookKey, useBookPage, useOnline } from '../../features/03/book';
import { useBookDiscussion } from '../../features/03/discussion';
import { rpcError, UnlockSheet } from '../../features/03/UnlockSheet';
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
  chapterLabel as chapterName,
  readerInk,
} from '../../features/04/ReaderViews';
import { DiscussSheet, NoteDialog, NotesSheet, type AnnotRowModel } from '../../features/04/AnnotationSheets';
import { useTrack } from '../../features/04/analytics';
import { usePassageThread } from '../../features/04/passage';
import { postQuote, quoteFor, useShareToClub } from '../../features/04/ShareClubSheet';
import { useInbox } from '../../features/06/data';
import { ChapterLowSheet, PayRestSheet } from '../../features/04/PaySheets';
import {
  ChaptersSheet,
  ReaderMenuSheet,
  ReportProblemSheet,
  SearchSheet,
  SettingsSheet,
  type ChapterRowModel,
} from '../../features/04/ReaderSheets';
import { chapterNumber, useReader } from '../../features/04/useReader';
import { useBuyPack } from '../../features/09/buyPack';
import { useFlag } from '../../features/16/config';

const READER_ORIGIN = 'https://reader.arpedia.invalid/';
const TOAST_MS = 8000;
const CHROME_IDLE_MS = 5000;
const DELETE_UNDO_MS = 5000;
const HINT_KEY = 'reader.hint.seen';
const OTHER_COLORS: HighlightColor[] = ['yellow', 'green', 'pink', 'blue', 'purple', 'peach'];

export default function ReaderScreen() {
  const { id, cfi, from } = useLocalSearchParams<{ id: string; cfi?: string; from?: string }>();
  const track = useTrack();
  const { s } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const online = useOnline();

  // Measured card heights: the page leaves exactly this much room at a gate (rules 52–53).
  const [cardH, setCardH] = useState({ preview: s(330), chapter: s(400) });
  const [autoUnlock, setAutoUnlockLocal] = useState(true);
  // Pay as you read chosen (or already paying): the preview cut becomes a chapter gate (rules 52–54).
  const [payGo, setPayGo] = useState(false);
  const gateRoom = useMemo(() => {
    const chapter = autoUnlock ? 0 : cardH.chapter + s(16);
    return { preview: payGo ? chapter : cardH.preview + s(16), chapter };
  }, [cardH, autoUnlock, payGo, s]);
  // Flow 16 rule 27: with Paragraph discussions off there are no markers and no Discuss button.
  const discussions = useFlag('paragraph_discussions', true);
  const r = useReader(id, { gateRoom, startCfi: cfi, payGo, source: from, discussions });
  useEffect(() => setAutoUnlockLocal(r.settings.auto_unlock), [r.settings.auto_unlock]);
  useEffect(() => {
    if ((r.state?.paid_credits ?? 0) > 0) setPayGo(true);
  }, [r.state?.paid_credits]);

  const [chrome, setChrome] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [sheet, setSheet] = useState<UnlockMode | 'short' | null>(null);
  const [pageH, setPageH] = useState(0);
  const [panel, setPanel] = useState<
    'chapters' | 'settings' | 'menu' | 'report' | 'notes' | 'note' | 'discuss' | 'search' | 'payrest' | null
  >(null);
  // A tap on an existing highlight opens its menu where it sits (rule 36).
  const [menuFor, setMenuFor] = useState<{ clientId: string; rect: Rect } | null>(null);
  const [reporting, setReporting] = useState<'idle' | 'busy' | 'failed'>('idle');
  // The note dialog works on a snapshot: a fresh selection, or an existing highlight (rule 36).
  const [noteFor, setNoteFor] = useState<{ sel: SelectionDetail } | { clientId: string } | null>(null);
  const [discussFor, setDiscussFor] = useState<{ para: string; quote: string | null } | null>(null);
  const thread = usePassageThread(id, panel === 'discuss' ? (discussFor?.para ?? null) : null);
  const book = useBookPage(id);
  // Top-ups from the reader's low-balance sheets (rule 60): nothing is spent automatically.
  const pack = useBuyPack([bookKey(id)]);

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
    if (lastCfi.current && r.loc?.cfi !== lastCfi.current) {
      setChrome(false);
      setMenuFor(null);
    }
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
  // First run: a one-line hint, once per phone (States: First run).
  const hasPage = r.loc != null;
  useEffect(() => {
    if (!hasPage) return;
    void AsyncStorage.getItem(HINT_KEY)
      .then((seen) => {
        if (seen) return;
        toast({ message: 'Tap the middle for controls' });
        return AsyncStorage.setItem(HINT_KEY, '1');
      })
      .catch(() => undefined);
  }, [hasPage, toast]);

  // Another device is ahead (rule 67): offer it; Stay is the default, so the toast just goes.
  useEffect(() => {
    const e = r.elsewhere;
    if (!e) return;
    toast({
      message: `Continue from ${e.percent}%?${e.device ? ` (on ${e.device})` : ''}`,
      undoLabel: 'Go',
      duration: 8000,
      onUndo: () => r.goTo(e.start),
    });
    r.clearElsewhere();
  }, [r.elsewhere, r, toast]);

  const st = r.state;
  const share = useShareToClub(st);
  const theme = r.settings.theme;
  const ink = readerInk(theme);
  const chapter = st?.chapters.find((c) => c.chapter_uid === r.loc?.chapter_uid) ?? null;
  const chapterNo = st && chapter ? chapterNumber(st, chapter.chapter_uid) : 0;
  const chapterCount = st?.chapters.filter((c) => c.kind === 'chapter').length ?? 0;
  const gate = r.loc?.at_gate ?? null;
  const gateChapter = gate ? st?.chapters.find((c) => c.chapter_uid === gate.chapter_uid) : null;
  const previewGate = gate?.kind === 'preview' && !payGo;
  const chapterGate = gate?.kind === 'chapter' || (gate?.kind === 'preview' && payGo);
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
    : previewGate
      ? 'Free preview'
      : chapterGate && !autoUnlock
        ? 'Pay as you read'
        : chapter
          ? chapter.kind === 'chapter'
            ? chapterName(chapterNo, chapter.title)
            : chapter.title
          : '';

  const footRight = !r.loc
    ? ''
    : gate?.kind === 'chapter' && !autoUnlock && gateChapter
      ? `End of chapter ${Math.max(1, chapterNumber(st!, gateChapter.chapter_uid) - 1)}`
      : timeLeftLabel(r.loc.words_left_in_chapter);

  // Screenshots and the recents preview are blocked on paid chapters, allowed in the free preview
  // (rule 74, Q54).
  const paidPage = !!chapter && chapter.price_credits > 0 && r.access[chapter.chapter_uid] === 'unlocked';
  useEffect(() => {
    if (!paidPage) return;
    void ScreenCapture.preventScreenCaptureAsync('reader').catch(() => undefined);
    return () => void ScreenCapture.allowScreenCaptureAsync('reader').catch(() => undefined);
  }, [paidPage]);

  // The last page of the last chapter opens the finish screen once per opening (rule 68).
  const finished = useRef(false);
  useEffect(() => {
    if (!r.loc?.at_last_page_of_book || finished.current) return;
    finished.current = true;
    void r.syncNow();
    router.push({ pathname: '/read/end/[id]', params: { id } });
  }, [r.loc?.at_last_page_of_book, r, id]);

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

  // Flow 04 analytics for what the reader sees: the preview end, a chapter card, the toolbar.
  const seenPreview = useRef(false);
  useEffect(() => {
    if (!previewGate || seenPreview.current) return;
    seenPreview.current = true;
    track('preview_end_seen');
  }, [previewGate, track]);
  const cardChapter = st && gateChapter && chapterGate && !autoUnlock ? gateChapter : null;
  const seenCard = useRef<string | null>(null);
  useEffect(() => {
    if (!st || !cardChapter || seenCard.current === cardChapter.chapter_uid) return;
    seenCard.current = cardChapter.chapter_uid;
    track('chapter_card_seen', {
      chapter_ord: chapterNumber(st, cardChapter.chapter_uid),
      price: cardChapter.price_credits,
    });
  }, [st, cardChapter, track]);
  const placementKind = placement?.kind;
  useEffect(() => {
    if (sel && placementKind) track('selection_toolbar_shown', { placement: placementKind });
  }, [sel, placementKind, track]);

  const menuAnnotation = menuFor ? r.annotations.find((a) => a.client_id === menuFor.clientId) : null;
  const menuPlacement = useMemo(() => {
    if (!menuFor || !pageH) return null;
    return placeToolbar({
      rects: [menuFor.rect],
      toolbar: { w: s(375) - s(24), h: s(SELBAR_HEIGHT) },
      viewport: { w: s(375), h: pageH },
      headerBottom: 0,
      bottomLimit: pageH,
      margin: s(12),
    });
  }, [menuFor, pageH, s]);
  const deleteAnnotation = async (clientId: string) => {
    setMenuFor(null);
    const restore = await r.removeAnnotation(clientId);
    if (restore) toast({ message: 'Highlight deleted', onUndo: restore, duration: DELETE_UNDO_MS });
  };

  const colors = useMemo(
    () =>
      [r.settings.highlight_color, ...OTHER_COLORS.filter((c) => c !== r.settings.highlight_color)].slice(
        0,
        3,
      ),
    [r.settings.highlight_color],
  );

  // The book room is the chat of the club reading this book (s-channel, flow 06); with no club it
  // lives in Community.
  const room = useBookDiscussion(id);
  // Rule 39: the Note switch names the book's club, only when the reader is a member of it.
  const myGroups = useInbox('groups');
  const bookClub = room.data?.club;
  const noteClub =
    bookClub && (myGroups.data ?? []).some((g) => g.group_id === bookClub.id) ? bookClub : null;
  const toRoom = () => {
    const club = room.data?.club;
    if (club) router.push({ pathname: '/chat/[id]', params: { id: club.id } });
    else router.push('/community');
  };
  const shareBook = () => {
    if (!st) return;
    const by = st.book.author.name ? ` by ${st.book.author.name}` : '';
    void Share.share({ message: `${st.book.title}${by}, on Arpedia` });
  };
  const openPanel = (p: typeof panel) => {
    setChrome(false);
    setPanel(p);
  };

  // ─── Chapters sheet rows (rule 23) ────────────────────────────────────────
  const readPct = Math.floor(r.loc?.percent ?? st?.position?.percent ?? 0);
  const chapterRows = useMemo<ChapterRowModel[]>(() => {
    if (!st) return [];
    const total = Math.max(1, st.revision.words);
    const here = r.loc?.percent;
    const furthest = Math.max(st.position?.max_percent ?? 0, here ?? 0);
    return st.chapters.map((c) => {
      const start = (c.words_before / total) * 100;
      const end = ((c.words_before + c.words) / total) * 100;
      const current = c.chapter_uid === r.loc?.chapter_uid;
      const locked = (r.access[c.chapter_uid] ?? c.access) === 'locked' && c.price_credits > 0;
      return {
        key: c.chapter_uid,
        number: c.kind === 'chapter' ? chapterNumber(st, c.chapter_uid) : null,
        title: c.title,
        state: current ? 'current' : locked ? 'locked' : end <= furthest + 0.01 ? 'read' : 'none',
        through:
          current && here != null && end > start
            ? Math.min(1, Math.max(0, (here - start) / (end - start)))
            : undefined,
        price: c.price_credits,
      };
    });
  }, [st, r.loc, r.access]);
  const chapterLabel = (uid: string | null) => {
    const c = uid && st ? st.chapters.find((x) => x.chapter_uid === uid) : null;
    if (!c || !st) return null;
    return c.kind === 'chapter' ? chapterName(chapterNumber(st, c.chapter_uid), c.title) : c.title;
  };

  // ─── Notes sheet rows (rule 42) ───────────────────────────────────────────
  const notesRows = useMemo(() => {
    const out: Record<'highlight' | 'note' | 'bookmark', AnnotRowModel[]> = {
      highlight: [],
      note: [],
      bookmark: [],
    };
    for (const a of r.annotations) {
      out[a.kind].push({
        id: a.client_id,
        label: chapterLabel(a.chapter_uid),
        excerpt: a.quote,
        color: a.kind === 'bookmark' ? null : a.color,
        note: a.kind === 'note' ? a.note_text : null,
        scope: a.kind === 'note' ? 'Private' : null,
        unsaved: r.unsaved.has(a.client_id),
      });
    }
    return out;
    // chapterLabel reads st, which the deps cover.
  }, [r.annotations, r.unsaved, st]);
  const openAnnotation = (clientId: string) => {
    const a = r.annotations.find((x) => x.client_id === clientId);
    setPanel(null);
    if (!a) return;
    const locked = a.chapter_uid && (r.access[a.chapter_uid] ?? 'locked') === 'locked';
    // A row in a chapter that is locked now opens that chapter's first page and its card (rule 42).
    r.goTo(locked && a.chapter_uid ? { chapter_uid: a.chapter_uid } : { cfi: a.cfi_range });
  };

  const noteAnnotation =
    noteFor && 'clientId' in noteFor ? r.annotations.find((a) => a.client_id === noteFor.clientId) : null;
  const noteSel = noteFor && 'sel' in noteFor ? noteFor.sel : null;
  const startNote = () => {
    if (!sel) return;
    setNoteFor({ sel });
    setPanel('note');
  };
  const startDiscuss = (para: string | null, quote: string | null) => {
    if (!para) return;
    setDiscussFor({ para, quote });
    thread.dropPending();
    setChrome(false);
    setPanel('discuss');
  };
  const threadData = thread.q.data;
  const threadChapter =
    st && threadData?.chapter_ord != null ? st.chapters.find((c) => c.ord === threadData.chapter_ord) : null;
  const threadChapterNo = st && threadChapter ? chapterNumber(st, threadChapter.chapter_uid) : null;
  const threadCount = (threadData?.count ?? 0) + thread.pending.length;
  // One discussion_opened per opening, once the thread's count is known.
  const seenThread = useRef<string | null>(null);
  useEffect(() => {
    if (panel !== 'discuss' || !discussFor || !threadData || seenThread.current === discussFor.para) return;
    seenThread.current = discussFor.para;
    track('discussion_opened', { count: threadData.count });
  }, [panel, discussFor, threadData, track]);
  useEffect(() => {
    if (panel !== 'discuss') seenThread.current = null;
  }, [panel]);

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
    if (r.phase === 'expired') {
      // Rule 71: the download's 7 days ran out; the free preview still opens.
      return (
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: ink.page }}>
          <EmptyState
            title="Connect to refresh"
            body="This download needs a quick check online. Connect and it opens again."
            action={{ label: 'Try again', onPress: r.retry }}
          />
          <Btn
            label="Read the preview"
            variant="g"
            size="md"
            style={{ alignSelf: 'center' }}
            onPress={r.readPreview}
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
          {st ? (
            <Btn
              label="Report a problem"
              variant="g"
              size="md"
              style={{ alignSelf: 'center' }}
              onPress={() => {
                setReporting('idle');
                setPanel('report');
              }}
            />
          ) : null}
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
            // A real (never fetched) origin: foliate's blob: section frames must be same-origin with
            // the page, which an opaque about:blank origin isn't. CSP blocks every network request.
            source={{ html: readerHtml, baseUrl: READER_ORIGIN }}
            originWhitelist={[READER_ORIGIN + '*', 'about:*', 'blob:*', 'data:*']}
            onShouldStartLoadWithRequest={(req) =>
              req.url.startsWith(READER_ORIGIN) || /^(about|blob|data):/.test(req.url)
            }
            onMessage={(e) =>
              void r.onMessage(e.nativeEvent.data, {
                onTap: (zone) => {
                  if (zone !== 'center') return;
                  if (menuFor) return setMenuFor(null);
                  if (r.selection) return r.clearSelection();
                  setChrome((v) => !v);
                },
                onMarker: (para) => discussions && startDiscuss(para, null),
                onAnnotation: (aid, rect) => {
                  // Tap on a highlight: colour, note, discuss, delete (rule 36).
                  const a = r.annotations.find((x) => x.id === aid);
                  if (!a || a.kind === 'bookmark') return;
                  r.clearSelection();
                  setChrome(false);
                  setMenuFor({ clientId: a.client_id, rect });
                },
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
            top={previewGate ? (r.loc?.gate_top ?? null) : null}
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
            top={chapterGate && !autoUnlock ? (r.loc?.gate_top ?? null) : null}
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
            onPayRest={() => {
              track('pay_rest', { left: st.remaining });
              if (st.paid_credits > 0) setPanel('payrest');
              else setSheet('all');
            }}
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
            onNote={startNote}
            onDiscuss={
              discussions
                ? () => {
                    const quote = sel.text.slice(0, 500);
                    r.clearSelection();
                    startDiscuss(sel.para_id_start, quote);
                  }
                : undefined
            }
            onClub={() => (share.start(sel), r.clearSelection())}
            onShare={() => {
              const quote = sel.text.slice(0, 500);
              const title = st?.book.title;
              r.clearSelection();
              void Share.share({ message: title ? `“${quote}” · ${title}, on Arpedia` : `“${quote}”` });
            }}
          />
        ) : null}
        {menuAnnotation && menuPlacement && menuFor ? (
          <SelectionBar
            y={menuPlacement.y}
            placement={menuPlacement.kind}
            arrowX={
              menuPlacement.kind === 'docked'
                ? null
                : Math.min(
                    s(375) - s(24) - s(16),
                    Math.max(s(16), menuFor.rect.x + menuFor.rect.w / 2 - s(12)),
                  )
            }
            colors={[menuAnnotation.color, ...OTHER_COLORS.filter((c) => c !== menuAnnotation.color)].slice(
              0,
              3,
            )}
            current={menuAnnotation.color}
            onColor={(c) => {
              setMenuFor(null);
              void r.recolor(menuAnnotation.client_id, c);
            }}
            onNote={() => {
              setMenuFor(null);
              setNoteFor({ clientId: menuAnnotation.client_id });
              setPanel('note');
            }}
            onDiscuss={
              discussions
                ? () => {
                    setMenuFor(null);
                    startDiscuss(menuAnnotation.start_para_id, menuAnnotation.quote);
                  }
                : undefined
            }
            onDelete={() => void deleteAnnotation(menuAnnotation.client_id)}
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
        onBookmark={r.loc ? () => void r.toggleBookmark() : undefined}
        bookmarked={!!r.pageBookmark}
        onMore={() => openPanel('menu')}
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
            { icon: 'list', label: 'Chapters', onPress: () => openPanel('chapters') },
            {
              icon: 'moon',
              label: 'Night',
              onPress: () => void r.changeSetting('theme', theme === 'dark' ? 'light' : 'dark'),
            },
            { icon: 'chat', label: 'Notes', onPress: () => openPanel('notes') },
            { icon: 'cog', label: 'Settings', onPress: () => openPanel('settings') },
            { icon: 'users', label: 'Room', onPress: toRoom },
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
      {st ? (
        <>
          <ChaptersSheet
            open={panel === 'chapters'}
            onClose={() => setPanel(null)}
            sub={`Chapter ${chapterNo} of ${chapterCount} · ${readPct}% read`}
            chapters={chapterRows}
            bookmarks={r.bookmarks.map((b) => ({
              id: b.client_id,
              title: chapterLabel(b.chapter_uid) ?? 'Bookmark',
              sub: b.quote ?? undefined,
            }))}
            bookmarked={!!r.pageBookmark}
            onChapter={(uid) => {
              setPanel(null);
              // A locked chapter opens on its first page with its card; it never charges (rule 23).
              r.goTo({ chapter_uid: uid });
            }}
            onBookmark={(cid) => {
              const b = r.bookmarks.find((x) => x.client_id === cid);
              setPanel(null);
              if (b) r.goTo({ cfi: b.cfi_range });
            }}
            onToggleBookmark={() => void r.toggleBookmark()}
          />
          <SettingsSheet
            open={panel === 'settings'}
            onClose={() => setPanel(null)}
            settings={r.settings}
            onChange={(k, v) => {
              if (k === 'auto_unlock') setAutoUnlockLocal(v as boolean);
              void r.changeSetting(k, v);
            }}
          />
          <ReaderMenuSheet
            open={panel === 'menu'}
            onClose={() => setPanel(null)}
            title={st.book.title}
            sub={`${st.book.author.name ?? 'Unknown author'} · ${readPct}% read`}
            items={[
              {
                key: 'about',
                title: 'About this ebook',
                chevron: true,
                onPress: () => {
                  setPanel(null);
                  router.push({ pathname: '/book/[id]/about', params: { id } });
                },
              },
              { key: 'search', title: 'Search in book', chevron: true, onPress: () => setPanel('search') },
              { key: 'room', title: 'Book room', chevron: true, onPress: toRoom },
              { key: 'share', title: 'Share this book', chevron: true, onPress: shareBook },
              {
                key: 'report',
                title: 'Report a problem with this book',
                sub: 'Missing pages, wrong chapter, broken text',
                onPress: () => {
                  setReporting('idle');
                  setPanel('report');
                },
              },
            ]}
          />
          <ReportProblemSheet
            open={panel === 'report'}
            onClose={() => setPanel(null)}
            busy={reporting === 'busy'}
            failed={reporting === 'failed'}
            onSend={(note) => {
              setReporting('busy');
              r.reportProblem(note).then(
                () => {
                  setReporting('idle');
                  setPanel(null);
                  toast({ message: 'Thanks. We’ll check it.' });
                },
                () => setReporting('failed'),
              );
            }}
          />
          <SearchSheet
            open={panel === 'search'}
            onClose={() => setPanel(null)}
            onSearch={r.runSearch}
            result={r.search}
            label={chapterLabel}
            onHit={(hit) => {
              setPanel(null);
              r.goTo({ cfi: hit });
            }}
          />
          <PayRestSheet
            st={st}
            open={panel === 'payrest'}
            onClose={() => setPanel(null)}
            onPaid={(res) => {
              setPanel(null);
              void r.afterBookUnlocked();
              toast({
                message:
                  res.status === 'already_unlocked'
                    ? 'You already have this book. Nothing was charged.'
                    : `Whole book unlocked · ${res.balance.toLocaleString('en-NG')} credits left`,
              });
            }}
            onShort={() => {
              setPanel(null);
              setSheet('short');
            }}
          />
          <ChapterLowSheet
            st={st}
            chapterUid={r.lowFor}
            onClose={() => {
              r.clearLow();
              void r.refresh();
            }}
            // Back on page 1 of the chapter with the new balance once the credits land.
            onTopUp={(p) =>
              void pack.buy(p).then((ok) => {
                if (!ok) return;
                r.clearLow();
                void r.refresh();
              })
            }
            onLibrary={() => {
              r.clearLow();
              void r.syncNow();
              router.replace('/(tabs)/library');
            }}
          />
          <NotesSheet
            open={panel === 'notes'}
            onClose={() => setPanel(null)}
            rows={notesRows}
            onRow={openAnnotation}
          />
          <NoteDialog
            open={panel === 'note' && !!(noteSel || noteAnnotation)}
            onClose={() => setPanel(null)}
            sub={chapterLabel(noteSel?.chapter_uid ?? noteAnnotation?.chapter_uid ?? null) ?? st.book.title}
            quote={(noteSel?.text ?? noteAnnotation?.quote ?? '').slice(0, 500)}
            color={noteAnnotation?.color ?? r.settings.highlight_color}
            initial={noteAnnotation?.note_text ?? ''}
            club={noteClub?.name ?? null}
            onSave={(text, share) => {
              setPanel(null);
              const group = share && noteClub ? noteClub.id : null;
              if (noteAnnotation) void r.editNote(noteAnnotation.client_id, text, group);
              else if (noteSel) void r.highlight(r.settings.highlight_color, text, noteSel, group);
              // Rule 39: a shared note posts to the club as a quote card (rule 56), the note as its message.
              const q =
                group &&
                (noteSel
                  ? quoteFor(st, noteSel.chapter_uid, noteSel.cfi_range, noteSel.text)
                  : noteAnnotation &&
                    quoteFor(
                      st,
                      noteAnnotation.chapter_uid,
                      noteAnnotation.cfi_range,
                      noteAnnotation.quote ?? '',
                    ));
              if (group && q) postQuote(group, q, text);
            }}
          />
          <DiscussSheet
            open={panel === 'discuss'}
            onClose={() => setPanel(null)}
            title={threadData ? `${threadCount} ${threadCount === 1 ? 'comment' : 'comments'}` : 'Discussion'}
            sub={threadChapterNo ? `On this passage in chapter ${threadChapterNo}` : 'On this passage'}
            quote={discussFor?.quote ?? null}
            quoteSrc={threadChapterNo ? `${st.book.title} · Ch. ${threadChapterNo}` : st.book.title}
            comments={[...(threadData?.comments ?? []), ...thread.pending]}
            loading={thread.q.isPending}
            error={thread.q.isError && !threadData ? rpcError(thread.q.error).code : null}
            onRetryLoad={() => void thread.q.refetch()}
            onSend={(body) => void thread.post(body, discussFor?.quote ?? null)}
            onRetry={(c) => void thread.post(c.body ?? '', discussFor?.quote ?? null, c.id)}
            onReact={(c, k) => void thread.react(c, k)}
          />
          {share.element}
        </>
      ) : null}
      {book.data ? (
        <UnlockSheet
          book={book.data}
          open={sheet}
          need={st?.remaining ?? 0}
          onClose={() => {
            setSheet(null);
            void r.refresh();
          }}
          onRead={() => {
            if (sheet === 'paygo') setPayGo(true);
            setSheet(null);
          }}
          onPlans={() => router.push('/plan')}
          onBuyPack={(p) => void pack.buy(p)}
        />
      ) : null}
    </View>
  );
}
