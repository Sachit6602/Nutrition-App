// Terms of Service and Privacy Policy, served at /terms and /privacy.
// TERMS_VERSION is stored with each account at sign-up (backend auth.js); bump both when the documents change.
import { ArrowLeftIcon, LeafIcon } from '@phosphor-icons/react';

export const TERMS_VERSION = '2026-11-04';
const EFFECTIVE = '4 November 2026';
const CONTACT = 'sachit.exe@gmail.com';
const REPO = 'https://github.com/Sachit6602/Nutrition-App';

const Mail = () => <a className="font-medium text-accent underline-offset-2 hover:underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>;

const H = ({ id, children }) => <h2 id={id} className="scroll-mt-24 pt-4 text-xl font-semibold tracking-tight">{children}</h2>;

function Privacy() {
  return (
    <>
      <p>
        This policy explains what Healthy Diet Tracker (&ldquo;we&rdquo;, &ldquo;the app&rdquo;) collects, why, who it is shared with,
        and the rights you have under India&rsquo;s Digital Personal Data Protection Act, 2023 (DPDP Act). We act as the Data Fiduciary
        for the personal data you give the app.
      </p>

      <H id="collect">What we collect</H>
      <ul>
        <li><b>Account:</b> your email address, and your password stored only as a salted PBKDF2 hash (we never see or store the password itself).</li>
        <li><b>Profile and health information:</b> age, sex, height, weight, activity level, goal, optional calorie target, allergies, diet type and food preferences.</li>
        <li><b>Logs:</b> foods you log (names, calories, macros, servings, dates), steps and activity, and saved foods.</li>
        <li><b>Photos:</b> a food photo you upload is sent to your AI provider for analysis. If you then log that food, a compressed copy of the photo is saved with the entry.</li>
        <li><b>Your AI provider key:</b> encrypted with AES-256-GCM before it is stored. We only ever show its last 4 characters.</li>
        <li><b>Coach history:</b> the most recent coach request and response, kept to help diagnose problems.</li>
        <li><b>Technical data:</b> one essential sign-in cookie, and short-lived server logs (request method and path). Our host, Cloudflare, processes your IP address to deliver the site, protect it, and limit repeated sign-in attempts.</li>
      </ul>
      <p>We do not use advertising, analytics or tracking cookies, and we do not sell or rent your data.</p>

      <H id="why">Why we use it, and your consent</H>
      <p>
        We process your data only to run the app for you: calculating your daily targets, showing your history and insights,
        and generating meal plans, coaching and photo estimates when you ask for them. Our legal basis is the consent you give
        when you create an account. You can withdraw it at any time by deleting your account (Profile &rarr; Delete account);
        that does not affect processing done before you withdrew.
      </p>

      <H id="share">Who receives your data</H>
      <ul>
        <li>
          <b>Cloudflare</b> hosts the app and its database (Cloudflare Workers and D1). The database is located in Western Europe,
          so your data is processed outside India, as the DPDP Act allows for countries it has not restricted.
        </li>
        <li>
          <b>The AI provider you choose</b> (for example OpenAI, Anthropic, Google, OpenRouter, Groq, Perplexity, xAI, Mistral or DeepSeek)
          receives the content of each AI request you make: your targets, allergies and preferences, summaries of your recent logs, and any
          photo you upload. Requests are made with your own key, so the provider&rsquo;s terms and privacy policy apply to that data and to
          any charges.
        </li>
        <li>Authorities, if the law requires us to disclose data.</li>
      </ul>

      <H id="keep">How long we keep it</H>
      <p>
        We keep your data while your account exists. Sign-in sessions expire after 7 days. When you delete your account, your account, profile,
        logs, photos, saved foods and AI key are removed from the live database immediately. Our database provider keeps short-term recovery
        backups, so deleted data can remain in those for up to 30 days before it is gone for good.
      </p>

      <H id="rights">Your rights</H>
      <p>Under the DPDP Act you can:</p>
      <ul>
        <li>ask for a summary of the personal data we hold about you and who it has been shared with;</li>
        <li>correct or update it (most of it you can edit directly in your profile and logs);</li>
        <li>erase it, using Delete account in your profile, or by emailing us;</li>
        <li>nominate someone to exercise these rights for you if you die or become unable to;</li>
        <li>raise a grievance with us, and if you are not satisfied with our response, complain to the Data Protection Board of India.</li>
      </ul>
      <p>For any of these, or a grievance, email <Mail />. We aim to reply within 30 days.</p>

      <H id="kids">Children</H>
      <p>The app is only for people aged 18 or over. We do not knowingly collect data from children; if you believe a child has signed up, email us and we will delete the account.</p>

      <H id="security">Security</H>
      <p>
        Data travels over HTTPS. Passwords are hashed, AI keys are encrypted, sign-in tokens are stored only as hashes, and sign-in attempts are rate-limited.
        No system is perfectly secure; if a breach affects your data, we will tell you and the Data Protection Board as the law requires.
      </p>

      <H id="changes">Changes and contact</H>
      <p>
        If we change this policy we will update the date at the top, and ask for your agreement again where the law requires it.
        Questions: <Mail />.
      </p>
    </>
  );
}

function Terms() {
  return (
    <>
      <p>
        These terms govern your use of Healthy Diet Tracker (&ldquo;the app&rdquo;). By creating an account you agree to them and to the{' '}
        <a className="font-medium text-accent underline-offset-2 hover:underline" href="/privacy">Privacy Policy</a>.
      </p>

      <H id="eligibility">Who can use it</H>
      <p>You must be 18 or older. You are responsible for your account and for keeping your password safe; tell us at <Mail /> if you think someone else has used it.</p>

      <H id="medical">Not medical advice</H>
      <p>
        The app gives general nutrition information. Calorie and macro targets are estimates from standard formulas, and meal plans, coaching and
        photo estimates are generated by AI and can be wrong. Nothing in the app is medical, dietary or allergy advice. Talk to a doctor or registered
        dietitian before changing your diet, especially if you are pregnant, have a medical condition or an eating disorder, and always check
        ingredients yourself if you have an allergy.
      </p>

      <H id="keys">Your AI provider key</H>
      <p>
        AI features run on an API key you add from a provider of your choice. You are responsible for that provider&rsquo;s charges and for following
        its terms. Only add keys you are allowed to use; consumer chat subscriptions (for example a Claude Pro or Max login token) cannot be used with
        third-party apps and will be rejected.
      </p>

      <H id="use">Acceptable use</H>
      <p>
        Do not misuse the app: no attempts to break in or overload it, access other people&rsquo;s data, reverse its security, or use it for anything
        unlawful. We may suspend or delete accounts that do.
      </p>

      <H id="content">Your content</H>
      <p>
        What you log stays yours. You let us store and process it only to provide the app to you, as described in the Privacy Policy. The app&rsquo;s
        source code is published at <a className="font-medium text-accent underline-offset-2 hover:underline" href={REPO} target="_blank" rel="noopener noreferrer">github.com/Sachit6602/Nutrition-App</a>.
      </p>

      <H id="service">Availability</H>
      <p>
        The app is provided &ldquo;as is&rdquo;, without warranties, and may change, pause or stop. To the extent the law allows, we are not liable for
        indirect losses, or for decisions made based on the app&rsquo;s estimates or AI output.
      </p>

      <H id="ending">Ending your account</H>
      <p>You can delete your account at any time in Profile &rarr; Delete account. We may close accounts that break these terms.</p>

      <H id="law">Law and contact</H>
      <p>
        These terms are governed by the laws of India, and the courts of India have jurisdiction. If we change them we will update the date at the top
        and tell you in the app. Questions: <Mail />.
      </p>
    </>
  );
}

export default function Legal({ page, onBack }) {
  const privacy = page === 'privacy';
  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <a href="/" onClick={(e) => { e.preventDefault(); onBack(); }} className="btn-quiet -ml-3 px-3">
            <ArrowLeftIcon size={18} aria-hidden="true" />Back
          </a>
          <span className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-2">
            <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-ink"><LeafIcon size={16} weight="fill" aria-hidden="true" /></span>
            Healthy Diet Tracker
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="mt-2 text-sm text-ink-2">Effective {EFFECTIVE}</p>
        <article className="legal mt-8 max-w-[68ch] space-y-4 text-[15px] leading-relaxed text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {privacy ? <Privacy /> : <Terms />}
        </article>
        <p className="mt-12 border-t border-line pt-6 text-sm text-ink-2">
          {privacy ? <a className="font-medium text-accent hover:underline" href="/terms">Terms of Service</a> : <a className="font-medium text-accent hover:underline" href="/privacy">Privacy Policy</a>}
        </p>
      </main>
    </div>
  );
}
