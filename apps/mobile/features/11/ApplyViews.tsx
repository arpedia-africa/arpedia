import { View } from 'react-native';
import {
  Btn,
  Callout,
  Card,
  Chip,
  Field,
  IconButton,
  KeyValue,
  Press,
  Text,
  useBottomInset,
  useTheme,
  type KeyValueRow,
} from '@arpedia/ui';
import { OnbSheet } from '../01/parts';
import { Foot } from '../01/StepViews';
import { CATEGORIES } from './application';
import { AgreeRow, LabelBlock, LowHero, SavedLine, StSteps, StepHero, SubHero, Timeline } from './parts';

// s-become-author, s-apply … s-apply-4, s-apply-sent. Pure views for the routes and tools/parity
// (`node tools/screen.mjs s-become-author s-apply s-apply-2 s-apply-3 s-apply-4 s-apply-sent --css`).

export const BIO_MAX = 300;

// ─── s-become-author ────────────────────────────────────────────────────────
export function BecomeAuthorView({ onBack, notice }: { onBack?: () => void; notice?: string | null }) {
  const { s } = useTheme();
  return (
    <>
      <SubHero
        title="Share your stories with Arpedia readers."
        sub="Author access is reviewed so readers can trust every publishing profile."
        onBack={onBack}
      />
      <OnbSheet>
        {/* .sub-pad.v16.body-end: padding 22 20 24 (+28 end), gap 16 */}
        <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(28), gap: s(16) }}>
          {notice ? <Callout tone="info">{notice}</Callout> : null}
          <Text size={13} weight={600} oneLine>
            How it works
          </Text>
          <StSteps
            items={[
              {
                title: 'Complete your author profile',
                sub: 'Name, pen name, a short bio and a writing sample.',
              },
              {
                title: 'Arpedia reviews your application',
                sub: 'About 3 days. You get a notification either way.',
              },
              {
                title: 'Publish books and build your community',
                sub: 'Your club opens the day you’re approved.',
              },
            ]}
          />
          <Callout tone="brand">
            <Text size={13.5} weight={700}>
              You earn ₦1.60 for every credit readers spend on your books.
            </Text>{' '}
            A 250-page book is 125 credits, so each full read pays you ₦200.
          </Callout>
          <Callout tone="quiet">
            Have ready: a short bio, a writing sample (up to 10 pages) and your bank details for payouts.
            About 10 minutes.
          </Callout>
        </View>
      </OnbSheet>
    </>
  );
}

export function BecomeAuthorFoot({
  label,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Foot>
      <Btn label={label} block disabled={disabled} loading={loading} onPress={onPress} />
    </Foot>
  );
}

// ─── Steps 1–3 ──────────────────────────────────────────────────────────────
export interface Step1Values {
  legal_name: string;
  email: string;
  dob: string;
  state: string;
  phone: string;
  pen_name: string;
  social_handle: string;
}
export type Step1Errors = Partial<Record<keyof Step1Values, string>>;

/** The number pad has no "/": digits typed into the date of birth become "DD / MM / YYYY". */
export function typeDob(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join(' / ');
}

/** `.form.body-end` inside the sheet: padding 22 20 24, gap 16 (+28 end). */
function Form({ children, question }: { children: React.ReactNode; question?: string | null }) {
  const { s } = useTheme();
  return (
    <OnbSheet>
      <View style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24) + s(28), gap: s(16) }}>
        {question ? (
          <Callout tone="warn">
            <Text size={13.5} weight={700}>
              Our editor asked:
            </Text>{' '}
            {question}
          </Callout>
        ) : null}
        {children}
      </View>
    </OnbSheet>
  );
}

export function Apply1View({
  values,
  errors,
  saved,
  question,
  onChange,
  onBlur,
  onBack,
}: {
  values: Step1Values;
  errors: Step1Errors;
  saved: string;
  question?: string | null;
  onChange: (v: Partial<Step1Values>) => void;
  onBlur?: (f: keyof Step1Values) => void;
  onBack?: () => void;
}) {
  return (
    <>
      <StepHero
        step={1}
        title="Your author profile"
        sub="Tell us how readers should know you."
        onBack={onBack}
      />
      <Form question={question}>
        <Field
          label="Full name"
          value={values.legal_name}
          onChangeText={(legal_name) => onChange({ legal_name })}
          onBlur={() => onBlur?.('legal_name')}
          error={errors.legal_name}
          hint="For contracts and payouts. Never shown publicly."
          autoCapitalize="words"
          autoComplete="name"
          maxLength={80}
        />
        <Field
          label="Email address"
          value={values.email}
          onChangeText={(email) => onChange({ email })}
          onBlur={() => onBlur?.('email')}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          maxLength={254}
        />
        {/* Open question 3 default: date of birth and state are asked here (never public). */}
        <Field
          label="Date of birth"
          placeholder="DD / MM / YYYY"
          value={values.dob}
          onChangeText={(dob) => onChange({ dob: typeDob(dob) })}
          onBlur={() => onBlur?.('dob')}
          error={errors.dob}
          hint="Authors must be 18 or older. Never shown publicly."
          keyboardType="number-pad"
          maxLength={14}
        />
        <Field
          label="State"
          placeholder="Where you live, e.g. Enugu"
          value={values.state}
          onChangeText={(state) => onChange({ state })}
          onBlur={() => onBlur?.('state')}
          error={errors.state}
          autoCapitalize="words"
          maxLength={40}
        />
        <Field
          label="Phone number (optional)"
          placeholder="803 000 0000"
          value={values.phone}
          onChangeText={(phone) => onChange({ phone })}
          onBlur={() => onBlur?.('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          leading={
            <Text weight={600} color="ink2" oneLine>
              +234
            </Text>
          }
        />
        <Field
          label="Pen name (optional)"
          placeholder="Name shown to readers"
          value={values.pen_name}
          onChangeText={(pen_name) => onChange({ pen_name })}
          maxLength={60}
        />
        <Field
          label="Social media handle (optional)"
          placeholder="yourhandle"
          value={values.social_handle}
          onChangeText={(social_handle) => onChange({ social_handle: social_handle.replace(/^@+/, '') })}
          autoCapitalize="none"
          maxLength={80}
          leading={
            <Text weight={600} color="ink2" oneLine>
              @
            </Text>
          }
        />
        <SavedLine label={saved} />
      </Form>
    </>
  );
}

export function Apply2View({
  categories,
  bio,
  experience,
  errors,
  saved,
  question,
  onToggle,
  onBio,
  onExperience,
  onBack,
}: {
  categories: string[];
  bio: string;
  experience: string;
  errors: { categories?: string; bio?: string };
  saved: string;
  question?: string | null;
  onToggle: (c: string) => void;
  onBio: (v: string) => void;
  onExperience: (v: string) => void;
  onBack?: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <StepHero
        step={2}
        title="Your writing"
        sub="What you write and who you are as a writer."
        onBack={onBack}
      />
      <Form question={question}>
        <LabelBlock label="What do you write?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }} accessibilityRole="list">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                state={categories.includes(c) ? 'sel' : 'off'}
                onPress={() => onToggle(c)}
              />
            ))}
          </View>
          {errors.categories ? (
            <Text size={12} weight={500} color="err">
              {errors.categories}
            </Text>
          ) : null}
        </LabelBlock>
        <Field
          label="Short bio"
          value={bio}
          onChangeText={onBio}
          rows={3}
          maxLength={BIO_MAX}
          error={errors.bio}
          hint={`${bio.length} / ${BIO_MAX} · shown on your author page`}
        />
        <Field
          label="Writing experience"
          placeholder="Books, columns, blogs, competitions"
          value={experience}
          onChangeText={onExperience}
          maxLength={2000}
        />
        <SavedLine label={saved} />
      </Form>
    </>
  );
}

export function Apply3View({
  file,
  uploading,
  sampleText,
  error,
  saved,
  question,
  onPick,
  onRemove,
  onText,
  onBack,
}: {
  file: { name: string; meta: string } | null;
  uploading?: boolean;
  sampleText: string;
  error?: string | null;
  saved: string;
  question?: string | null;
  onPick: () => void;
  onRemove: () => void;
  onText: (v: string) => void;
  onBack?: () => void;
}) {
  const { c, s } = useTheme();
  return (
    <>
      <StepHero step={3} title="Writing sample" sub="Up to 10 pages of your best work." onBack={onBack} />
      <Form question={question}>
        {file ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
              <View style={{ flex: 1, minWidth: 0, gap: s(4) }}>
                <Text size={15} weight={600} numberOfLines={1} ellipsizeMode="middle">
                  {file.name}
                </Text>
                <Text size={12} color="ink3" oneLine>
                  {file.meta}
                </Text>
              </View>
              <IconButton icon="x" label="Remove file" onPress={onRemove} color={c.ink} />
            </View>
          </Card>
        ) : (
          <Btn
            label={uploading ? 'Checking your file…' : 'Upload a file (.docx or .pdf)'}
            variant="g"
            icon="upload"
            block
            loading={uploading}
            onPress={onPick}
          />
        )}
        {error ? (
          <Text size={12} weight={500} color="err" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <OrLine label="or paste text" />
        <Field
          label="Sample text"
          placeholder="Paste a chapter or a few pages"
          value={sampleText}
          onChangeText={onText}
          rows={5}
          maxLength={30000}
        />
        <SavedLine label={saved} />
      </Form>
    </>
  );
}

/** `.divider-or` with its own words. */
function OrLine({ label }: { label: string }) {
  const { c, s } = useTheme();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
      {line}
      <Text size={12} color="ink3" oneLine>
        {label}
      </Text>
      {line}
    </View>
  );
}

/** Steps 1–3 foot: Continue, then Save draft and Cancel side by side. */
export function ApplyFoot({
  onContinue,
  onSave,
  onCancel,
  saving,
  canContinue = true,
}: {
  onContinue: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  canContinue?: boolean;
}) {
  const { s } = useTheme();
  return (
    <Foot>
      <Btn label="Continue" iconAfter="arrow" block onPress={onContinue} disabled={!canContinue} />
      <View style={{ flexDirection: 'row', gap: s(8) }}>
        <View style={{ flex: 1 }}>
          <Btn label="Save draft" variant="g" block onPress={onSave} loading={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Btn label="Cancel" variant="g" icon="x" block onPress={onCancel} />
        </View>
      </View>
    </Foot>
  );
}

// ─── s-apply-4 ──────────────────────────────────────────────────────────────
export function Apply4View({
  rows,
  agree,
  missing,
  onAgree,
  onBack,
}: {
  rows: KeyValueRow[];
  agree: boolean;
  /** What still blocks Send, in plain words. */
  missing?: string | null;
  onAgree: (v: boolean) => void;
  onBack?: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <StepHero
        step={4}
        title="Review and send"
        sub="Check everything once. You can edit it later."
        onBack={onBack}
      />
      <OnbSheet>
        <View
          style={{ paddingTop: s(22), paddingHorizontal: s(20), paddingBottom: s(24) + s(28), gap: s(16) }}
        >
          <KeyValue rows={rows} />
          <AgreeRow value={agree} onChange={onAgree}>
            I own the rights to what I publish, and I agree to the Arpedia author terms: I earn ₦1.60 for
            every credit readers spend on my books.
          </AgreeRow>
          {missing ? <Callout tone="warn">{missing}</Callout> : null}
        </View>
      </OnbSheet>
    </>
  );
}

export function Apply4Foot({
  canSend,
  sending,
  offline,
  error,
  onSend,
  onEdit,
}: {
  canSend: boolean;
  sending?: boolean;
  offline?: boolean;
  error?: string | null;
  onSend: () => void;
  onEdit: () => void;
}) {
  const { s } = useTheme();
  return (
    <Foot>
      {error ? (
        <Text size={12} weight={500} color="err" center accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <Btn
        label={offline ? 'Connect to send' : 'Send application'}
        block
        disabled={!canSend || offline}
        loading={sending}
        onPress={onSend}
      />
      {/* .link.t-center */}
      <Press
        onPress={onEdit}
        accessibilityRole="link"
        pressScale={1}
        style={{ alignItems: 'center', paddingVertical: s(6) }}
      >
        <Text weight={600} color="orgInk" oneLine>
          Edit details
        </Text>
      </Press>
    </Foot>
  );
}

// ─── s-apply-sent ───────────────────────────────────────────────────────────
export function ApplySentView({
  replyBy,
  sentOn,
  onClose,
}: {
  replyBy: string;
  sentOn: string;
  onClose?: () => void;
}) {
  const { s } = useTheme();
  return (
    <>
      <LowHero
        title="Application received"
        sub={`We’ll reply by ${replyBy}. You’ll get a notification either way.`}
        onClose={onClose}
      />
      <View style={{ paddingTop: s(24), paddingHorizontal: s(16), paddingBottom: s(28) }}>
        <Timeline
          steps={[
            { title: 'Sent', sub: sentOn, done: true },
            { title: 'Editor review', sub: 'About 3 days' },
            { title: 'Author Studio opens', sub: 'Submit your first book' },
          ]}
        />
      </View>
    </>
  );
}

export function ApplySentFoot({ onStudio }: { onStudio: () => void }) {
  const { c, s } = useTheme();
  const bottom = useBottomInset(26);
  // .foot.flat: no top rule
  return (
    <View
      style={{ paddingTop: s(12), paddingHorizontal: s(16), paddingBottom: bottom, backgroundColor: c.white }}
    >
      <Btn label="Preview Author Studio" variant="g" block onPress={onStudio} />
    </View>
  );
}
