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
        and the rights we give you. These follow India&rsquo;s Digital Personal Data Protection Act, 2023 (DPDP Act). Most of the Act&rsquo;s
        rights and duties are not in force yet and are due to start on 13 May 2027, but we honour them now. We act as the Data Fiduciary
        for the personal data you give the app.
      </p>

      <H id="collect">What we collect</H>
      <ul>
        <li><b>Account:</b> your email address, and your password stored only as a salted PBKDF2 hash (we never see or store the password itself).</li>
        <li><b>Profile and health information:</b> age, sex, height, weight, activity level, goal, optional calorie target, allergies, diet type and food preferences.</li>
        <li><b>Logs:</b> foods you log (names, calories, macros, servings, dates), steps and activity, and saved foods.</li>
        <li><b>Photos:</b> when you choose a food photo, your browser shrinks it and sends it to your AI provider to estimate what&rsquo;s in it. We don&rsquo;t store the photo; only the food details you choose to log are saved.</li>
        <li><b>Your AI provider key:</b> encrypted with AES-256-GCM before it is stored. We only ever show its last 4 characters.</li>
        <li>
          <b>Latest AI request:</b> a copy of your most recent AI request and your provider&rsquo;s full reply. It can be a meal plan, recipe analysis
          or coach request, and includes what was sent: your targets, allergies, diet type and preferences, plus any meal request you typed, recipe
          link you entered or recent food totals. Only the latest one is kept, each new request replaces it, and we keep it only to help diagnose problems.
        </li>
        <li>
          <b>Technical data:</b> one essential sign-in cookie, and server logs that our host, Cloudflare, keeps for up to 7 days. They record each
          request&rsquo;s method and path, details Cloudflare adds such as the time and approximate location, and any error messages. If an AI reply
          can&rsquo;t be read, the log can include part of that reply, which may mention your targets, allergies or food preferences. Cloudflare also
          processes your IP address to deliver the site, protect it, and limit repeated sign-in attempts.
        </li>
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
          receives the content of each AI request you make: your daily targets and goal, allergies, diet type and preferences, anything you
          type into a request (such as a meal request, recipe search or recipe link), your daily calorie, protein and step totals for coaching,
          and any photo you upload. Most of these providers process data outside India, including in the United States. Requests are made with
          your own key, so the provider&rsquo;s terms and privacy policy apply to that data and to any charges.
        </li>
        <li>
          <b>Recipe websites:</b> recipe pictures suggested by the AI load directly from the websites that host them, so those websites receive
          your IP address and browser details when a recipe is shown. If you open an original recipe link, that website&rsquo;s own privacy policy applies.
        </li>
        <li>Authorities, if the law requires us to disclose data.</li>
      </ul>

      <H id="keep">How long we keep it</H>
      <p>
        We keep your data while your account exists. Sign-in sessions expire after 7 days. When you delete your account, your account, profile,
        logs, saved foods, latest AI request and AI key are removed from the live database immediately. Our database provider keeps short-term
        recovery backups, so deleted data can remain in those for up to 30 days before it is gone for good. Server logs are deleted automatically
        within 7 days; deleting your account does not remove them sooner.
      </p>

      <H id="rights">Your rights</H>
      <p>You can do the following now. Once the relevant parts of the DPDP Act are in force, these will also be your legal rights under it:</p>
      <ul>
        <li>ask for a summary of the personal data we hold about you and who it has been shared with;</li>
        <li>correct or update it (most of it you can edit directly in your profile and logs);</li>
        <li>erase it, using Delete account in your profile, or by emailing us;</li>
        <li>nominate someone to exercise these rights for you if you die or become unable to;</li>
        <li>raise a grievance with us. Once the DPDP Act&rsquo;s complaint provisions are in force, if you are not satisfied with our response, you can also complain to the Data Protection Board of India.</li>
      </ul>
      <p>
        To use any of these rights, to nominate someone, or to raise a grievance, email <Mail /> from the email address on your account, which is how we
        confirm it is you. For a nomination, include the nominee&rsquo;s name and email address. We will reply within 30 days. If you are not satisfied
        with our reply, you can file a complaint with the Data Protection Board of India through its official website.
      </p>

      <H id="kids">Children</H>
      <p>The app is only for people aged 18 or over. We do not knowingly collect data from children; if you believe a child has signed up, email us and we will delete the account.</p>

      <H id="security">Security</H>
      <p>
        Data travels over HTTPS. Passwords are hashed, AI keys are encrypted, sign-in tokens are stored only as hashes, and sign-in attempts are rate-limited.
        No system is perfectly secure. If a breach affects your data, we will tell you promptly, and we will tell the Data Protection Board once the law requires it.
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
