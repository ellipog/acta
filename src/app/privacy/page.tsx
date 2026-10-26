import type { Metadata } from "next";
import Link from "next/link";
import { Fill, LegalPage } from "@/components/legal-page";
import { operator } from "@/lib/legal";
import { siteHost } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Privacy policy · Acta",
  description: "What Acta collects, why, who handles it and how to get it deleted.",
};

const data: [string, string, string, string][] = [
  [
    "Your account: email address, name, profile picture and how you sign in",
    "To create your account, sign you in and show who did what",
    "Contract",
    "Until you delete your account",
  ],
  [
    "What you put in Acta: boards, tasks, comments, files and settings",
    "To provide the service",
    "Contract",
    "Until you or the workspace owner deletes it",
  ],
  [
    "Public roadmap activity: votes, and ideas visitors send, with a name if they give one",
    "To run public roadmaps for the boards that turn them on",
    "Legitimate interest of the board’s owner",
    "Until the owner or sender deletes it",
  ],
  [
    "Site analytics: pages viewed, the site you came from, campaign tags, country, device type, browser and system",
    "To see which pages are used and make Acta better",
    "Legitimate interest",
    "13 months, then deleted",
  ],
  [
    "Security logs kept by our database provider, including IP addresses at sign-in",
    "To keep accounts safe and stop abuse",
    "Legitimate interest",
    "A limited time, set by the provider",
  ],
];

const processors: [string, string, string][] = [
  ["Supabase", "Database, sign-in and file storage", "EU (Frankfurt, Germany)"],
  ["Vercel", "Hosting and delivering the site", "Worldwide, from the region nearest you"],
  ["Google", "Only if you choose to sign in with Google", "Worldwide"],
  ["GitHub", "Only if you choose to sign in with GitHub", "Worldwide"],
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          This explains what Acta collects, why, who handles it for us, and what you can ask us to do with it. It
          applies to {siteHost} and the public roadmaps people publish on it.
        </p>
      }
      summary={[
        "We collect what’s needed to run Acta, and nothing to sell or to advertise with.",
        "Our analytics are our own. They use no cookies and never store your IP address.",
        "The only cookie is the one that keeps you signed in.",
        "You can delete your account yourself, any time, from your account page.",
      ]}
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <>
              <p>
                Acta is run by <Fill value={operator.name} />, organisation number <Fill value={operator.orgNumber} />,{" "}
                <Fill value={operator.address} />. For your account and our site analytics, we are the data controller
                under the GDPR.
              </p>
              <p>
                When you use Acta in a workspace that belongs to an organisation, that organisation decides what goes
                into it. For that content we act as its processor and follow its instructions. Enterprise customers can
                sign a data processing agreement with us.
              </p>
            </>
          ),
        },
        {
          id: "what",
          title: "What we collect and why",
          body: (
            <>
              <div className="overflow-x-auto border border-line">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead className="bg-sunken font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    <tr>
                      <th className="px-3 py-2 font-normal">What</th>
                      <th className="px-3 py-2 font-normal">Why</th>
                      <th className="px-3 py-2 font-normal">Legal basis</th>
                      <th className="px-3 py-2 font-normal">Kept for</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row[0]} className="border-t border-line align-top">
                        {row.map((cell, i) => (
                          <td key={i} className={i === 0 ? "px-3 py-2.5 text-ink" : "px-3 py-2.5"}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                “Contract” means we need it to give you the service you signed up for (GDPR article 6(1)(b)).
                “Legitimate interest” means we have a good reason that doesn’t override your rights (article 6(1)(f)),
                and you can object to it.
              </p>
            </>
          ),
        },
        {
          id: "analytics",
          title: "How our analytics work",
          body: (
            <>
              <p>
                We built our own analytics instead of using an outside service, so the data never leaves the providers
                listed below. When you open a page, we record the page, the site that sent you, any campaign tags in the
                link, your country, and your device type, browser and system.
              </p>
              <p>
                To count visitors without cookies, we combine your IP address and browser details with a random value
                that is replaced every day, and store only a scrambled result. We can’t turn that back into your IP
                address, and the same visitor looks different the next day. Your IP address itself is never stored.
              </p>
              <p>We record nothing on our admin pages or the sign-in links themselves.</p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies and local storage",
          body: (
            <>
              <p>
                We set one kind of cookie: the sign-in cookie that keeps you logged in. It’s only set when you sign in,
                only on {siteHost}, and you can’t use Acta’s account features without it. Because it’s strictly
                necessary, we don’t need to ask first, so there’s no cookie banner.
              </p>
              <p>
                Your browser’s local storage holds a few choices on your own device: light or dark theme, how you’ve
                arranged a view, and the demo board. None of it is sent to us.
              </p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Who handles it for us",
          body: (
            <>
              <p>We never sell personal data. These providers process it on our behalf, under contracts with us:</p>
              <div className="overflow-x-auto border border-line">
                <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
                  <tbody>
                    {processors.map(([name, role, where]) => (
                      <tr key={name} className="border-t border-line align-top first:border-t-0">
                        <td className="px-3 py-2.5 font-medium text-ink">{name}</td>
                        <td className="px-3 py-2.5">{role}</td>
                        <td className="px-3 py-2.5">{where}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Some of these companies are based in the United States. Where data leaves the EU and EEA, we rely on the
                EU Standard Contractual Clauses and, where the provider is certified, the EU–US Data Privacy Framework.
              </p>
              <p>
                We’ll add new providers, such as one for sending email or for Enterprise billing, to this list before we
                start using them.
              </p>
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>You can ask us to:</p>
              <ul>
                <li>
                  <strong>See</strong> the personal data we have about you, and get a copy you can take elsewhere.
                </li>
                <li>
                  <strong>Correct</strong> it. You can change your name yourself on your{" "}
                  <Link href="/account">account page</Link>.
                </li>
                <li>
                  <strong>Delete</strong> it. Deleting your account from the account page removes your account and
                  profile straight away.
                </li>
                <li>
                  <strong>Object to</strong> or <strong>limit</strong> how we use it.
                </li>
              </ul>
              <p>
                Write to <Fill value={operator.email} /> and we’ll answer within a month. If you think we’ve handled
                your data wrongly, you can complain to the Norwegian Data Protection Authority,{" "}
                <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer">
                  Datatilsynet
                </a>
                , or to the authority where you live.
              </p>
            </>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: (
            <p>Acta is a tool for work and isn’t meant for children under 13. We don’t knowingly collect their data.</p>
          ),
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: (
            <p>
              When we change this policy we’ll update the date at the top. If a change matters for how we use your data,
              we’ll tell you by email or in Acta before it takes effect.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Questions about privacy go to <Fill value={operator.email} />, or by post to{" "}
              <Fill value={operator.name} />
              , <Fill value={operator.address} />.
            </p>
          ),
        },
      ]}
    />
  );
}
