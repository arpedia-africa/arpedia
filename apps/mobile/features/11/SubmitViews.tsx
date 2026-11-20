import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import {
  Btn,
  Callout,
  Card,
  Chip,
  Field,
  IconButton,
  KeyValue,
  Link,
  Meter,
  OnHero,
  Petals,
  Press,
  Text,
  useBottomInset,
  useTheme,
  type CalloutTone,
} from '@arpedia/ui';
import { HeroSub, HeroTitle } from '../01/parts';
import { AgreeRow, LabelBlock, SubHero, Timeline } from './parts';

// Guided submit, 5 steps: s-studio-submit, s-studio-processing, s-studio-chapters, s-studio-preview,
// s-studio-submitted. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-studio-submit s-studio-processing s-studio-chapters s-studio-preview s-studio-submitted --css`).

export type SourceType = 'docx' | 'epub' | 'pdf';

export const SUBMIT_GENRES = ['African stories', 'Fiction', 'Romance', 'History', 'Mystery', 'Non-fiction'];
export const MAX_GENRES = 3;

/** `.hero.sub-hero` with "Step N of 5" on the right and the `.st-flow` track under the sub. */
function StepBand({
  step,
  title,
  sub,
  onBack,
}: {
  step: 1 | 2 | 3 | 4;
  title: string;
  sub: string;
  onBack: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <SubHero
      title={title}
      sub={sub}
      onBack={onBack}
      action={
        <Text size={12} weight={700} color="onOrg" tabular oneLine style={{ lineHeight: s(12) * 1.4 }}>
          {`Step ${step} of 5`}
        </Text>
      }
    >
      {/* .st-flow: 4px track, night fill = step / 5, margin-top 10 */}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 5, now: step }}
        style={{
          height: s(4),
          borderRadius: s(4),
          backgroundColor: 'rgba(26,17,0,0.18)',
          overflow: 'hidden',
          marginTop: s(10),
        }}
      >
        <View
          style={{
            width: `${(step / 5) * 100}%`,
            height: '100%',
            borderRadius: s(4),
            backgroundColor: c.night,
          }}
        />
      </View>
    </SubHero>
  );
}

/** `.foot.flat`: the pinned foot without its top rule. */
export function FlatFoot({ children }: { children: ReactNode }) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  return (
    <View
      style={{
        paddingTop: s(12),
        paddingHorizontal: s(16),
        paddingBottom: bottom,
        backgroundColor: c.white,
        gap: s(8),
      }}
    >
      {children}
    </View>
  );
}

/** `.foot.flat > .btn.btn-p.block`: Continue, Looks right, Submit for review, Back to My books. */
export function StepFoot({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <FlatFoot>
      <Btn label={label} block onPress={onPress} disabled={disabled} loading={loading} />
    </FlatFoot>
  );
}

/** `.option`: 56 min, radius 14, 1px line; picked = 2px inset org ring on tint-2. */
function SourceOption({
  title,
  sub,
  badge,
  on,
  onPress,
}: {
  title: string;
  sub: string;
  badge?: string;
  on: boolean;
  onPress: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        minHeight: s(56),
        borderRadius: s(14),
        backgroundColor: on ? c.orgTint2 : c.white,
        borderWidth: bw(1),
        borderColor: on ? 'transparent' : c.line,
        paddingVertical: s(14) - bw(1),
        paddingHorizontal: s(16) - bw(1),
      }}
    >
      {on ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -bw(1),
            left: -bw(1),
            right: -bw(1),
            bottom: -bw(1),
            borderRadius: s(14),
            borderWidth: s(2),
            borderColor: c.org,
          }}
        />
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: s(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: s(8) }}>
          <Text size={15.5} weight={700} oneLine>
            {title}
          </Text>
          {badge ? (
            // .st-badge: 22 high night pill, gold 11/700, 6px after the title's 8px gap
            <View
              style={{
                minHeight: s(22),
                paddingHorizontal: s(8),
                borderRadius: 999,
                backgroundColor: c.night,
                justifyContent: 'center',
                marginLeft: s(6),
              }}
            >
              <Text size={11} weight={700} color="#FFD27A" oneLine>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text size={13} color="ink2" style={{ lineHeight: s(13) * 1.45 }}>
          {sub}
        </Text>
      </View>
    </Press>
  );
}

/** `.drop`: 2px dashed line, radius 14, padding 18; title 15/600 and a 12px line. */
function Drop({
  title,
  sub,
  onPress,
  error,
}: {
  title: string;
  sub: string;
  onPress: () => void;
  error?: boolean;
}) {
  const { c, s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        borderWidth: s(2),
        borderStyle: 'dashed',
        borderColor: error ? c.err : c.line,
        borderRadius: s(14),
        padding: s(18) - s(2),
        backgroundColor: c.white,
        gap: s(4),
      }}
    >
      <Text size={15} weight={600} color="ink2" style={{ lineHeight: s(15) * 1.3 }}>
        {title}
      </Text>
      <Text size={12} color="ink2" style={{ lineHeight: s(12) * 1.4 }}>
        {sub}
      </Text>
    </Press>
  );
}

/** `.card.card--pad > .h12`: file name (one line), size line, remove button. */
function FileCard({ name, line, onRemove }: { name: string; line: string; onRemove?: () => void }) {
  const { c, s } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
        <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
          <Text size={15} weight={600} ellipsis style={{ lineHeight: s(15) * 1.3 }}>
            {name}
          </Text>
          <Text size={12} color="ink3" oneLine style={{ lineHeight: s(12) * 1.4 }}>
            {line}
          </Text>
        </View>
        {onRemove ? (
          <IconButton
            icon="x"
            label="Remove file"
            onPress={onRemove}
            color={c.ink}
            style={{ margin: -s(6) }}
          />
        ) : null}
      </View>
    </Card>
  );
}

const ErrorLine = ({ children }: { children?: string }) =>
  children ? (
    <Text size={12} weight={500} color="err">
      {children}
    </Text>
  ) : null;

// ─── 1 · s-studio-submit ────────────────────────────────────────────────────
export interface SubmitValues {
  source: SourceType;
  title: string;
  subtitle: string;
  genres: string[];
  description: string;
}

export type SubmitErrors = Partial<Record<keyof SubmitValues | 'file' | 'cover' | 'form', string>>;

export function SubmitUploadView({
  values,
  file,
  cover,
  errors,
  onChange,
  onPickFile,
  onRemoveFile,
  onPickCover,
  onRemoveCover,
  onBack,
}: {
  values: SubmitValues;
  /** Picked manuscript: name and "2.1 MB · uploaded". */
  file: { name: string; line: string } | null;
  cover: { name: string; line: string } | null;
  errors: SubmitErrors;
  onChange: (v: Partial<SubmitValues>) => void;
  onPickFile: () => void;
  onRemoveFile: () => void;
  onPickCover: () => void;
  onRemoveCover: () => void;
  onBack: () => void;
}) {
  const { s } = useTheme();
  const toggle = (g: string) =>
    onChange({
      genres: values.genres.includes(g)
        ? values.genres.filter((x) => x !== g)
        : values.genres.length < MAX_GENRES
          ? [...values.genres, g]
          : values.genres,
    });
  return (
    <>
      <StepBand
        step={1}
        title="Upload your book"
        sub="Word (.docx) works best. We format it for you."
        onBack={onBack}
      />
      <View style={{ paddingTop: s(20), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(16) }}>
        {errors.form ? <Callout tone="err">{errors.form}</Callout> : null}
        <LabelBlock label="Manuscript">
          <View style={{ gap: s(8) }} accessibilityRole="radiogroup">
            <SourceOption
              title="Word file (.docx)"
              badge="Recommended"
              sub="Fastest. Chapters, quotes and italics come through cleanly."
              on={values.source === 'docx'}
              onPress={() => onChange({ source: 'docx' })}
            />
            <SourceOption
              title="EPUB"
              sub="Fine if it is already an ebook."
              on={values.source === 'epub'}
              onPress={() => onChange({ source: 'epub' })}
            />
            <SourceOption
              title="PDF"
              sub="Allowed, but slower."
              on={values.source === 'pdf'}
              onPress={() => onChange({ source: 'pdf' })}
            />
          </View>
          <Callout tone="warn">
            PDFs take longer and are often sent back. Upload the Word file if you have it.
          </Callout>
          {file ? (
            <FileCard name={file.name} line={file.line} onRemove={onRemoveFile} />
          ) : (
            <Drop
              title="Choose your file"
              sub={
                values.source === 'pdf'
                  ? 'PDF, up to 100 MB.'
                  : `${values.source === 'docx' ? 'Word' : 'EPUB'} file, up to 50 MB.`
              }
              onPress={onPickFile}
              error={!!errors.file}
            />
          )}
          <ErrorLine>{errors.file}</ErrorLine>
        </LabelBlock>
        <LabelBlock label="Cover">
          {cover ? (
            <FileCard name={cover.name} line={cover.line} onRemove={onRemoveCover} />
          ) : (
            <Drop
              title="Add cover image"
              sub="JPG or PNG. Best size is 1600 × 2560 pixels, portrait."
              onPress={onPickCover}
              error={!!errors.cover}
            />
          )}
          <ErrorLine>{errors.cover}</ErrorLine>
        </LabelBlock>
        <Field
          label="Title"
          value={values.title}
          onChangeText={(title) => onChange({ title })}
          error={errors.title}
          maxLength={200}
          autoCapitalize="words"
        />
        <Field
          label="Subtitle (optional)"
          placeholder="A line under the title"
          value={values.subtitle}
          onChangeText={(subtitle) => onChange({ subtitle })}
          maxLength={200}
        />
        <LabelBlock label="Genres (pick up to 3)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }} accessibilityRole="list">
            {SUBMIT_GENRES.map((g) => (
              <Chip
                key={g}
                label={g}
                state={values.genres.includes(g) ? 'sel' : 'off'}
                onPress={() => toggle(g)}
              />
            ))}
          </View>
          <ErrorLine>{errors.genres}</ErrorLine>
        </LabelBlock>
        <Field
          label="Description"
          placeholder="Two or three sentences readers see first"
          value={values.description}
          onChangeText={(description) => onChange({ description })}
          error={errors.description}
          maxLength={5000}
          rows={3}
        />
      </View>
    </>
  );
}

// ─── 2 · s-studio-processing ────────────────────────────────────────────────
export type ProcState = 'done' | 'now' | 'todo';

/** `.st-proc`: 14px discs (ring, green when done, orange with a halo now); 15px labels, gap 14. */
function ProcList({ steps }: { steps: { label: string; state: ProcState }[] }) {
  const { c, s } = useTheme();
  return (
    <View style={{ gap: s(14) }} accessibilityRole="list">
      {steps.map((st) => (
        <View
          key={st.label}
          style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}
          accessibilityLabel={`${st.label}, ${st.state === 'done' ? 'done' : st.state === 'now' ? 'working' : 'waiting'}`}
        >
          <View
            style={{
              width: s(14),
              height: s(14),
              borderRadius: 999,
              ...(st.state === 'done'
                ? { backgroundColor: c.ok }
                : st.state === 'now'
                  ? { backgroundColor: c.org, borderWidth: 0 }
                  : { borderWidth: s(2), borderColor: c.line }),
            }}
          >
            {st.state === 'now' ? (
              <View
                style={{
                  position: 'absolute',
                  top: -s(4),
                  left: -s(4),
                  right: -s(4),
                  bottom: -s(4),
                  borderRadius: 999,
                  borderWidth: s(4),
                  borderColor: c.orgTint,
                }}
              />
            ) : null}
          </View>
          <Text
            size={15}
            weight={st.state === 'now' ? 700 : 400}
            color={st.state === 'todo' ? 'ink3' : 'ink'}
            oneLine
            style={{ flex: 1 }}
          >
            {st.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SubmitProcessingView({
  sub,
  steps,
  progress,
  note,
  callout,
  onBack,
}: {
  sub: string;
  steps: { label: string; state: ProcState }[];
  /** 0–1 */
  progress: number;
  note: string;
  callout?: { tone: CalloutTone; text: string } | null;
  onBack: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <StepBand step={2} title="Getting your book ready" sub={sub} onBack={onBack} />
      <View style={{ paddingTop: s(24), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(24) }}>
        {callout ? <Callout tone={callout.tone}>{callout.text}</Callout> : null}
        <ProcList steps={steps} />
        <Meter value={progress} />
        <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
          {note}
        </Text>
      </View>
    </>
  );
}

export function SubmitProcessingFoot({
  ready,
  onReady,
  onLeave,
}: {
  ready: boolean;
  onReady: () => void;
  onLeave: () => void;
}) {
  return (
    <FlatFoot>
      <Btn
        label={ready ? 'Chapters are ready' : 'Getting your chapters…'}
        block
        disabled={!ready}
        onPress={onReady}
      />
      {/* .link.t-center: centred in the foot column */}
      <View style={{ alignItems: 'center' }}>
        <Link label="Leave and notify me" onPress={onLeave} />
      </View>
    </FlatFoot>
  );
}

// ─── 3 · s-studio-chapters ──────────────────────────────────────────────────
export interface ChapterRow {
  ord: number;
  title: string | null;
  words: number;
  canMerge: boolean;
}

/** `.st-lnk`: 13/700 org-ink text button, padding 6 4. */
function StLink({ label, onPress, a11y }: { label: string; onPress: () => void; a11y: string }) {
  const { s } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={{ top: 6, bottom: 6 }}
      style={{ paddingVertical: s(6), paddingHorizontal: s(4) }}
    >
      <Text size={13} weight={700} color="orgInk" oneLine>
        {label}
      </Text>
    </Press>
  );
}

export function SubmitChaptersView({
  sub,
  flags,
  chapters,
  totals,
  note,
  onRename,
  onMerge,
  onBack,
}: {
  sub: string;
  flags: { tone: CalloutTone; text: string }[];
  chapters: ChapterRow[];
  /** `.t-xs.t-muted.t-center` under the list ("Showing 7 of 22…"); the app lists every chapter. */
  note?: string;
  totals: { words: string; pages: string; price: string };
  onRename: (ord: number) => void;
  onMerge: (ord: number) => void;
  onBack: () => void;
}) {
  const { c, s, bw } = useTheme();
  return (
    <>
      <StepBand step={3} title="Check your chapters" sub={sub} onBack={onBack} />
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(16) }}>
        {flags.length ? (
          <View style={{ gap: s(8) }}>
            {flags.map((f) => (
              <Callout key={f.text} tone={f.tone}>
                {f.text}
              </Callout>
            ))}
          </View>
        ) : null}
        <Card>
          {chapters.map((ch, i) => (
            <View
              key={ch.ord}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(10),
                paddingVertical: s(10),
                ...(i < chapters.length - 1 ? { borderBottomWidth: bw(1), borderBottomColor: c.line } : null),
              }}
            >
              <Text size={13} weight={800} color="ink3" tabular oneLine style={{ width: s(26) }}>
                {String(i + 1)}
              </Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size={14.5} weight={600} ellipsis>
                  {ch.title ?? 'No title'}
                </Text>
                <Text size={12} color="ink3" tabular oneLine>
                  {`${ch.words.toLocaleString('en-NG')} words`}
                </Text>
              </View>
              <StLink
                label={ch.title ? 'Rename' : 'Add title'}
                a11y={ch.title ? `Rename chapter ${i + 1}` : `Add a title to chapter ${i + 1}`}
                onPress={() => onRename(ch.ord)}
              />
              {ch.canMerge ? (
                <StLink
                  label="Merge up"
                  a11y={`Merge chapter ${i + 1} into chapter ${i}`}
                  onPress={() => onMerge(ch.ord)}
                />
              ) : null}
            </View>
          ))}
        </Card>
        {note ? (
          <Text size={12} color="ink3" center style={{ lineHeight: s(12) * 1.4 }}>
            {note}
          </Text>
        ) : null}
        <KeyValue
          rows={[
            { k: 'Total length', v: totals.words },
            { k: 'Standard pages (250 words each)', v: totals.pages },
            { k: 'Readers pay', v: totals.price, total: true },
          ]}
        />
        <Text size={13.5} color="ink2" style={{ lineHeight: s(13.5) * 1.45 }}>
          Price is set by length, not by you: half a credit per page, rounded up. Readers see the first 10%
          free, then unlock the whole book or pay as they read, chapter by chapter. Either way the total is
          the same.
        </Text>
      </View>
    </>
  );
}

// ─── 4 · s-studio-preview ───────────────────────────────────────────────────
export interface PreviewPage {
  label: string;
  title?: string;
  paras: string[];
  /** The free preview ends on this page. */
  end?: string;
}

/** `.st-pg`: paper card 74% wide, radius 16, padding 18 18 14, min 250; reading font 14/1.6. */
function PageCard({ page, width }: { page: PreviewPage; width: number }) {
  const { c, s } = useTheme();
  return (
    <View
      style={{
        width,
        minHeight: s(250),
        backgroundColor: '#FBF6EC',
        borderRadius: s(16),
        paddingTop: s(18),
        paddingHorizontal: s(18),
        paddingBottom: s(14),
        borderWidth: 1,
        borderColor: c.line,
        gap: s(8),
      }}
    >
      <Text
        size={11}
        weight={700}
        color="ink3"
        oneLine
        style={{ letterSpacing: s(11) * 0.04, textTransform: 'uppercase' }}
      >
        {page.label}
      </Text>
      {page.title ? (
        <Text variant="h3" color="#2a2622" ellipsis>
          {page.title}
        </Text>
      ) : null}
      {page.paras.map((p, i) => (
        <Text key={i} family="reading" size={14} color="#2a2622" style={{ lineHeight: s(14) * 1.6 }}>
          {p}
        </Text>
      ))}
      {page.end ? (
        <View
          style={{
            marginTop: 'auto',
            paddingTop: s(10),
            borderTopWidth: s(2),
            borderStyle: 'dashed',
            borderTopColor: c.acc,
          }}
        >
          <Text size={12.5} weight={700} color="orgInk">
            {page.end}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function SubmitPreviewView({
  pages,
  readiness,
  readinessLabel,
  checklist,
  price,
  earn,
  agreed,
  onAgree,
  blockers,
  onBack,
}: {
  pages: PreviewPage[] | null;
  /** 0–100 */
  readiness: number;
  readinessLabel: string;
  checklist: { k: string; v: string }[];
  /** "62,400 words → 250 pages", "125 credits (₦375)" */
  price: { k: string; v: string };
  /** "₦200" */
  earn: string;
  agreed: boolean;
  onAgree: (v: boolean) => void;
  blockers?: string | null;
  onBack: () => void;
}) {
  const { s } = useTheme();
  const { width } = useWindowDimensions();
  const pageW = Math.round((width - s(32)) * 0.74);
  return (
    <>
      <StepBand
        step={4}
        title="Preview on a phone"
        sub="Swipe to see how readers will see it."
        onBack={onBack}
      />
      <View style={{ paddingTop: s(16), paddingHorizontal: s(16), paddingBottom: s(28), gap: s(16) }}>
        {pages ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={pageW + s(12)}
            decelerationRate="fast"
            style={{ marginHorizontal: -s(16) }}
            contentContainerStyle={{
              paddingTop: s(4),
              paddingHorizontal: s(16),
              paddingBottom: s(8),
              gap: s(12),
            }}
          >
            {pages.map((p) => (
              <PageCard key={p.label} page={p} width={pageW} />
            ))}
          </ScrollView>
        ) : null}
        <Card style={{ gap: s(8) }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: s(8) }}>
            <Text variant="display" size={34} tabular oneLine style={{ letterSpacing: -s(34) * 0.02 }}>
              {`${readiness}%`}
            </Text>
            <Text size={15} weight={600} oneLine style={{ flexShrink: 1 }}>
              {readinessLabel}
            </Text>
          </View>
          <Meter value={readiness / 100} />
        </Card>
        <View style={{ gap: s(8) }} accessibilityRole="list">
          {checklist.map((r) => (
            <View key={r.k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: s(8) }}>
              <Text size={14} style={{ flex: 1 }}>
                {r.k}
              </Text>
              <Text size={14} color="ink3" style={{ textAlign: 'right' }}>
                {r.v}
              </Text>
            </View>
          ))}
        </View>
        <KeyValue
          rows={[
            { k: price.k, v: price.v },
            { k: 'You earn per full read', v: earn, total: true },
          ]}
        />
        {blockers ? <Callout tone="warn">{blockers}</Callout> : null}
        <AgreeRow value={agreed} onChange={onAgree}>
          I own the rights to this book and agree to the Arpedia author terms.
        </AgreeRow>
      </View>
    </>
  );
}

// ─── 5 · s-studio-submitted ─────────────────────────────────────────────────
export function SubmitDoneView({
  title,
  sub,
  price,
  earn,
  submittedOn,
  onClose,
}: {
  title: string;
  sub: string;
  price: { k: string; v: string };
  /** "₦1.60 a credit · ₦200 a full read" */
  earn: string;
  /** "12 November" */
  submittedOn: string;
  onClose: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <>
      {/* .hero.hero--fill: grows to fill, body sits at the bottom (padding 4 16 28) */}
      <OnHero.Provider value>
        <View style={{ flexGrow: 1, backgroundColor: c.org, overflow: 'hidden' }}>
          <Petals size={s(260)} style={{ right: s(-110), top: s(-90) }} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: s(52),
              paddingLeft: s(16),
              paddingRight: s(6),
            }}
          >
            <View style={{ flex: 1 }} />
            <IconButton icon="x" label="Close" onPress={onClose} color={c.onOrg} />
          </View>
          <View
            style={{
              marginTop: 'auto',
              paddingTop: s(4),
              paddingHorizontal: s(16),
              paddingBottom: s(28),
              gap: s(12),
            }}
          >
            <HeroTitle size={36}>{title}</HeroTitle>
            <HeroSub>{sub}</HeroSub>
          </View>
        </View>
      </OnHero.Provider>
      <View style={{ paddingTop: s(24), paddingHorizontal: s(16), paddingBottom: s(28) }}>
        <KeyValue
          rows={[
            { k: price.k, v: price.v },
            { k: 'You earn', v: earn },
          ]}
        />
        <Text size={13} weight={600} oneLine style={{ paddingTop: s(16) }}>
          What happens next
        </Text>
        <View style={{ paddingTop: s(8) }}>
          <Timeline
            steps={[
              { title: 'Submitted', sub: submittedOn, done: true },
              { title: 'Review', sub: 'Our team reads it and checks the formatting' },
              {
                title: 'Approved, or sent back with a list',
                sub: 'If sent back, you get a short list of fixes',
              },
              { title: 'Published', sub: 'Your followers are notified' },
            ]}
          />
        </View>
      </View>
    </>
  );
}
