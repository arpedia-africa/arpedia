import type { ReactNode } from 'react';
import { SUPPORT_EMAIL } from './site';

/**
 * Bundled policy text, from the v25 site with the changes listed in the PR. It is what people see
 * until staff publish a real version in the console (Settings, Policies), and whenever the api
 * Worker cannot be reached.
 */

const Mail = ({ subject }: { subject?: string }) => (
  <a href={`mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>
    {SUPPORT_EMAIL}
  </a>
);

const Summary = () => (
  <p className="callout">
    This is a short version. The full policy will appear here as soon as it is published. Questions until
    then? Write to <Mail />.
  </p>
);

const Privacy = () => (
  <>
    <p>
      This policy explains what personal data Arpedia (operated from Nigeria) collects when you use our app
      and website, how we use it, who we share it with, and the choices you have. We aim to handle your data
      in line with the Nigeria Data Protection Act 2023 and similar laws.
    </p>

    <h2>1. What we collect</h2>
    <ul>
      <li>
        <strong>Account data:</strong> your email address, display name, profile photo (if you add one), and
        the sign-in method you use (email, Google, or Sign in with Apple). If you use Apple&apos;s private
        relay email, we only see the relay address.
      </li>
      <li>
        <strong>Reading data:</strong> your library, reading progress, bookmarks, highlights and notes, and
        your plan status and reading credits.
      </li>
      <li>
        <strong>Community content:</strong> reviews, paragraph discussions, club and reading room posts,
        direct messages to authors, and reports or blocks you make.
      </li>
      <li>
        <strong>Author data:</strong> for authors, uploaded manuscripts, covers, earnings balances, and payout
        details you provide.
      </li>
      <li>
        <strong>Payment data:</strong> App Store and Google Play purchases are handled by Apple and Google and
        reported to us through RevenueCat (we receive your plan, status and a purchase identifier, not your
        card details). Web payments go through Flutterwave, which handles your card or bank details; we keep
        the payment reference, amount and status.
      </li>
      <li>
        <strong>Device data:</strong> push notification tokens, app version, device type and operating system,
        and technical logs needed to keep the service working and secure.
      </li>
    </ul>
    <p>
      We use Sentry to find crashes and errors, and PostHog to understand how the app is used. We do not use
      advertising trackers, and we do not sell your data.
    </p>

    <h2>2. How we use it</h2>
    <ul>
      <li>
        To provide the service: sign you in, sync your library and progress, show your plan and credits, and
        run community features.
      </li>
      <li>To process payments, credits and author earnings.</li>
      <li>To send notifications you have enabled, such as replies, room activity and new chapters.</li>
      <li>
        To keep Arpedia safe: handle reports, moderate content, prevent fraud and enforce our{' '}
        <a href="/legal/terms">Terms</a>.
      </li>
      <li>To meet legal obligations, such as tax and accounting records.</li>
    </ul>

    <h2>3. Who we share it with</h2>
    <p>We use a small set of service providers that process data on our behalf:</p>
    <ul>
      <li>
        <strong>Supabase</strong> - database and sign-in (PostgreSQL).
      </li>
      <li>
        <strong>Cloudflare</strong> - our servers, live chat, and R2 storage for book files, covers and
        images.
      </li>
      <li>
        <strong>Firebase Cloud Messaging (Google)</strong> - delivering push notifications.
      </li>
      <li>
        <strong>Resend</strong> - sending our emails.
      </li>
      <li>
        <strong>Sentry and PostHog</strong> - error reports and app usage.
      </li>
      <li>
        <strong>RevenueCat, Apple and Google</strong> - in-app subscription purchases.
      </li>
      <li>
        <strong>Flutterwave</strong> - web payments.
      </li>
      <li>
        <strong>Google and Apple</strong> - if you choose Google sign-in or Sign in with Apple.
      </li>
    </ul>
    <p>
      What you post in public places, such as reviews, discussions and reading rooms, is visible to other
      members along with your display name and photo. Direct messages to authors are visible to you and the
      author. We may also disclose data where the law requires it or to protect people&apos;s safety. Your
      data may be processed in countries outside Nigeria where these providers operate; we rely on their
      contractual safeguards.
    </p>

    <h2>4. How long we keep it</h2>
    <p>
      We keep your data while your account is active. When you delete your account we remove or anonymise your
      personal data as described below. Some records, such as payment and earnings records, are kept for as
      long as the law requires.
    </p>

    <h2>5. Account deletion</h2>
    <p>
      You can delete your account in the app: <strong>Profile, then Settings, then Delete account</strong>.
      You can also email <Mail /> from your account email. Full steps are on our{' '}
      <a href="/legal/delete-account">account deletion page</a>. Your profile and messages are hidden straight
      away and your personal data is erased within 7 days. Reviews and discussion comments you made are kept
      but shown as from a &quot;Former reader&quot;. Payment and tax records are kept for 6 years. Active
      subscriptions bought through the App Store or Google Play must be cancelled in those stores - deleting
      your account does not cancel them.
    </p>

    <h2>6. Your rights</h2>
    <p>
      You can ask to access, correct, export or delete your personal data, to object to or restrict certain
      uses, and to withdraw consent where we rely on it (for example, turn off notifications in your device
      settings). Email <Mail />; we will respond within a reasonable time. You may also complain to the
      Nigeria Data Protection Commission.
    </p>

    <h2>7. Security</h2>
    <p>
      Data is encrypted in transit, access to production systems is restricted, and database access is
      controlled with row-level security. No system is perfectly secure, so please use a strong password and
      keep your device up to date.
    </p>

    <h2>8. Children</h2>
    <p>
      Arpedia is not directed to children under 13 and we do not knowingly collect their personal data. If you
      think a child under 13 has given us information, contact us and we will delete it.
    </p>

    <h2>9. Changes</h2>
    <p>
      We may update this policy. The date at the top shows the latest version, and we will notify you in the
      app or by email about material changes.
    </p>

    <h2>10. Contact</h2>
    <p>
      Arpedia, Nigeria. <Mail />
    </p>
  </>
);

const Terms = () => (
  <>
    <p>
      These terms govern your use of Arpedia, a reading app and community for books and African stories,
      operated from Nigeria (&quot;Arpedia&quot;, &quot;we&quot;, &quot;us&quot;). By creating an account or
      using the app you agree to them. If you do not agree, please do not use Arpedia.
    </p>

    <h2>1. Your account</h2>
    <ul>
      <li>
        You must be at least 13 years old to use Arpedia (see Children below). Where the law of your country
        sets a higher age, that age applies.
      </li>
      <li>
        You can sign in with email, Google, or Sign in with Apple. Keep your sign-in details safe; you are
        responsible for activity on your account.
      </li>
      <li>Give us accurate information and keep it up to date. One person, one account.</li>
    </ul>

    <h2>2. Plans, billing and reading credits</h2>
    <ul>
      <li>
        A paid plan (monthly, quarterly or yearly) gives you reading credits on every renewal. You use credits
        to unlock books, either the whole book at once or chapter by chapter as you read. Every book has a
        free preview of its first 10%. Prices are shown in the app and on our website, in Nigerian naira.
      </li>
      <li>
        One credit is worth ₦3. A book costs half a credit for every standard page (250 words), rounded up,
        and the price is shown before you unlock.
      </li>
      <li>
        In the iOS and Android apps, subscriptions are purchased and billed by the Apple App Store or Google
        Play (through RevenueCat). Renewals, cancellations and refunds for those purchases are handled in your
        App Store or Google Play account settings, under their policies.
      </li>
      <li>
        On the web, payments are processed by Flutterwave. Web purchases are one-off payments for the plan
        period you select unless the checkout says otherwise.
      </li>
      <li>
        Credits are not cash, cannot be transferred or withdrawn, and have the use-by rules shown in the app:
        unused plan credits roll over for one period, up to one plan&apos;s worth, and expire after that.
        Top-up credits (for subscribers) stay while your account is open. Books you have unlocked stay in your
        library.
      </li>
      <li>
        Unless the law requires otherwise or a store policy says otherwise, payments are non-refundable once a
        plan period has started. If something went wrong with a payment, write to <Mail /> with your payment
        reference and we will look into it.
      </li>
      <li>We may change prices or plans. Changes never reduce a period you have already paid for.</li>
    </ul>

    <h2>3. Licence to read</h2>
    <p>
      Books on Arpedia are licensed to you, not sold. You get a personal, non-transferable licence to read the
      books you have unlocked, and the free previews, in the app. You must not copy, download, redistribute,
      scrape, screen-record for sharing, or try to remove protections from any book.
    </p>

    <h2>4. Community content</h2>
    <p>
      Arpedia lets you post reviews, paragraph discussions and notes, take part in clubs and reading rooms,
      and message authors directly. You keep ownership of what you write, and you give us a worldwide,
      non-exclusive licence to host, display and distribute it inside Arpedia so the features work. You are
      responsible for what you post. You must not post content that is:
    </p>
    <ul>
      <li>unlawful, threatening, harassing, hateful, or sexually explicit;</li>
      <li>spam, advertising, or impersonation of another person;</li>
      <li>
        an infringement of someone else&apos;s copyright or privacy, or a spoiler dump presented to harm
        others&apos; experience;
      </li>
      <li>an attempt to disrupt the service or other members.</li>
    </ul>
    <p>
      You can report any review, comment, room or message from inside the app, and you can block other
      members. We review reports, and we may remove content, limit features, or suspend or close accounts that
      break these terms. Serious cases may be reported to the authorities.
    </p>

    <h2>5. Authors and earnings</h2>
    <p>
      Authors who publish on Arpedia confirm that they own or control the rights to what they upload and that
      it does not infringe anyone else&apos;s rights. Every upload is checked before it goes live and we may
      decline or remove a book. Authors earn a fixed ₦1.60 for every credit readers spend on their books, paid
      monthly under the Author Agreement shown to authors in the app. Earnings may be held or adjusted where
      there is a rights dispute, fraud, or a legal requirement. Rights holders who believe their work is on
      Arpedia without permission should follow our <a href="/legal/copyright">copyright notice process</a>.
    </p>

    <h2>6. Acceptable use</h2>
    <p>
      Do not misuse the app: no reverse engineering, automated scraping, credential sharing, circumventing
      payment or credit systems, or attempting to access other people&apos;s data.
    </p>

    <h2>7. Availability and changes</h2>
    <p>
      We work to keep Arpedia available but do not promise uninterrupted service. We may update the app,
      change features, or retire a book from the library (for example at an author&apos;s or rights
      holder&apos;s request). We may update these terms; when we make material changes we will tell you in the
      app or by email, and continuing to use Arpedia after that means you accept them.
    </p>

    <h2>8. Ending your account</h2>
    <p>
      You can delete your account at any time in the app (Profile, then Settings, then Delete account) or by
      following the steps on our <a href="/legal/delete-account">account deletion page</a>. We may suspend or
      close accounts that break these terms.
    </p>

    <h2>9. Liability</h2>
    <p>
      Arpedia is provided &quot;as is&quot;. To the extent the law allows, we are not liable for indirect or
      consequential loss, and our total liability for any claim is limited to the amount you paid us in the 12
      months before the claim. Nothing here limits rights you have under law that cannot be excluded.
    </p>

    <h2>10. Governing law</h2>
    <p>
      These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Nigeria have
      jurisdiction, without removing any consumer protection you have under the law of the country where you
      live.
    </p>

    <h2>11. Children</h2>
    <p>
      Arpedia is not directed to children under 13 and we do not knowingly allow them to create accounts. If
      you believe a child under 13 has an account, email us and we will remove it.
    </p>

    <h2>12. Contact</h2>
    <p>
      Questions about these terms: <Mail />. See also our <a href="/legal/privacy">Privacy Policy</a>.
    </p>
  </>
);

const Copyright = () => (
  <>
    <p>
      Arpedia respects authors and publishers. Books are published only after review, and authors confirm they
      hold the rights to what they upload. If you believe a book, cover, review, discussion post or other
      content on Arpedia infringes your copyright, tell us and we will investigate promptly.
    </p>

    <h2>How to send a notice</h2>
    <p>
      Email <Mail subject="Copyright claim" /> with the subject &quot;Copyright claim&quot; and include:
    </p>
    <ol>
      <li>Your full name, organisation (if any), address, phone number and email.</li>
      <li>
        A description of the copyrighted work you say has been infringed, with proof that you own it or are
        authorised to act for the owner.
      </li>
      <li>
        Where the material appears on Arpedia: the book title and author, and for posts, the book and the
        chapter or room, or a link or screenshot.
      </li>
      <li>
        A statement that you have a good-faith belief the use is not authorised by the copyright owner, its
        agent, or the law.
      </li>
      <li>
        A statement that the information in your notice is accurate and that you are the owner or authorised
        to act on the owner&apos;s behalf.
      </li>
      <li>Your signature (typed full name is fine).</li>
    </ol>

    <h2>What happens next</h2>
    <ul>
      <li>
        We acknowledge your notice and review it. We may remove or disable access to the material while we do.
      </li>
      <li>
        We tell the uploader (author or member) about the claim and give them a chance to respond. Earnings on
        the disputed book may be held while the claim is open.
      </li>
      <li>
        If the uploader disputes the claim with a good-faith explanation that they hold the rights, we may
        share it with you so the two of you can resolve it.
      </li>
      <li>Accounts that repeatedly infringe are suspended or closed.</li>
    </ul>

    <h2>Counter-notice</h2>
    <p>
      If your content was removed and you believe that was a mistake, email the same address with the subject
      &quot;Counter-notice&quot;, identify the removed material, explain why you hold the rights or have
      permission, and give your contact details. We will review it and may restore the content.
    </p>

    <p className="callout">
      Knowingly sending a false claim can have legal consequences. If you are unsure whether something
      infringes, consider getting legal advice first.
    </p>
  </>
);

const CommunityGuidelines = () => (
  <>
    <Summary />
    <p>
      Arpedia lets you post reviews, paragraph discussions and notes, take part in clubs and reading rooms,
      and message authors directly. You keep ownership of what you write. You are responsible for what you
      post. Please do not post content that is:
    </p>
    <ul>
      <li>unlawful, threatening, harassing, hateful, or sexually explicit;</li>
      <li>spam, advertising, or impersonation of another person;</li>
      <li>
        an infringement of someone else&apos;s copyright or privacy, or a spoiler dump presented to harm
        others&apos; experience;
      </li>
      <li>an attempt to disrupt the service or other members.</li>
    </ul>
    <p>
      You can report any review, comment, room or message from inside the app, and you can block other
      members. We review reports, and we may remove content, limit features, or suspend or close accounts that
      break these rules. Serious cases may be reported to the authorities.
    </p>
    <p>
      See also our <a href="/legal/terms">Terms of Service</a>.
    </p>
  </>
);

const AuthorAgreement = () => (
  <>
    <Summary />
    <p>
      Authors who publish on Arpedia confirm that they own or control the rights to what they upload and that
      it does not infringe anyone else&apos;s rights. Every upload is checked before it goes live and we may
      decline or remove a book.
    </p>
    <p>
      Authors earn a fixed ₦1.60 for every credit readers spend on their books, paid monthly. For example, a
      book priced at 125 credits earns ₦200 each time a reader unlocks it in full. Earnings may be held or
      adjusted where there is a rights dispute, fraud, or a legal requirement.
    </p>
    <p>
      Rights holders who believe their work is on Arpedia without permission can use our{' '}
      <a href="/legal/copyright">copyright notice process</a>. Authors can write to{' '}
      <a href="mailto:authors@arpedia.africa">authors@arpedia.africa</a>.
    </p>
  </>
);

const Refunds = () => (
  <>
    <Summary />
    <ul>
      <li>
        In the iOS and Android apps, subscriptions are purchased and billed by the Apple App Store or Google
        Play. Renewals, cancellations and refunds for those purchases are handled by Apple or Google, in your
        account settings with them, under their policies.
      </li>
      <li>
        On the web, payments are processed by Flutterwave. Web purchases are one-off payments for the plan
        period you select unless the checkout says otherwise.
      </li>
      <li>
        Unless the law requires otherwise or a store policy says otherwise, payments are non-refundable once a
        plan period has started. If something went wrong with a payment, write to <Mail /> with your payment
        reference and we will look into it.
      </li>
      <li>
        Credits already spent on books stay spent. Deleting your account does not cancel a store subscription.
      </li>
    </ul>
  </>
);

/** What is deleted and kept, from flow 10. The steps themselves are always shown above this. */
const DeleteAccount = () => (
  <>
    <h2>What is deleted</h2>
    <p>Your profile and messages are hidden straight away, and your personal data is erased within 7 days:</p>
    <ul>
      <li>Your name, email, phone number, birthday, photo, bio and interests.</li>
      <li>Your reading history, highlights, notes, library and unlocked books.</li>
      <li>Your direct messages, push notification tokens and devices.</li>
      <li>Any unused reading credits. These cannot be restored or refunded after deletion.</li>
    </ul>

    <h2>What may be kept</h2>
    <ul>
      <li>Payment and tax records, for 6 years, without a link to your profile where possible.</li>
      <li>Your reviews and discussion comments, shown as from a &quot;Former reader&quot;.</li>
      <li>Reports you made, with your name removed.</li>
    </ul>
    <p>
      Authors with earnings waiting cannot delete until the next payout is complete. We will delete the
      account after that.
    </p>

    <h2>Subscriptions</h2>
    <p className="callout">
      Deleting your account does not cancel a subscription bought through the Apple App Store or Google Play.
      Cancel it in your App Store or Google Play subscription settings first to avoid further charges. Web
      subscriptions are cancelled when the account is deleted.
    </p>

    <p>
      More about how we handle data is in our <a href="/legal/privacy">Privacy Policy</a>.
    </p>
  </>
);

export const BUNDLED: Record<string, { updated?: string; body: ReactNode }> = {
  terms: { updated: '27 November 2026', body: <Terms /> },
  privacy: { updated: '27 November 2026', body: <Privacy /> },
  copyright: { body: <Copyright /> },
  'community-guidelines': { body: <CommunityGuidelines /> },
  'author-agreement': { body: <AuthorAgreement /> },
  refunds: { body: <Refunds /> },
  'delete-account': { body: <DeleteAccount /> },
};
